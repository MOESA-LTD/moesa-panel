// amazon-listing: one cell's Amazon listing. Every action is POST { action, ... } and needs
// insert on listing_submission (each one spends the customer's grant or writes state).
//
//   check        { cell_id }                   -> { missing, match, state }
//                match = { asin, restricted, reasons, checked_at } | null (no connected account)
//   validate     { cell_id }                   -> { status, issues }
//   publish      { cell_id }                   -> { cell, submission }  409 listing_in_progress
//   delete       { cell_id }                   -> { cell, submission }
//   status       { cell_id }                   -> { cell, submission }
//   publish_bulk { product_ids (1..10), country } -> { results, remaining }
//
// Reads and what is the user's act (listing_begin_submission, listing_parent_cell) run with the
// caller's JWT (RLS scopes the reads, the RPCs check the permission inside, the audit records the
// user). The service role (_shared/serviceRole.ts) reads the account's token, marks a revoked
// grant, copies the images and writes Amazon's outcome (apply, set_state, settle_removal: 046
// grants them to the service role only), passing the caller as p_actor so the audit names them.
// A submission is written by listing_begin_submission with created_by = the caller,
// under the cell's row lock, before Amazon is called (the cell is then submitted, so a run
// that dies leaves a row the poll settles). A publish is refused while the cell's latest
// submission is accepted or processing. The check writes its state only over the cell version it
// read (a publish or removal meanwhile wins). A SKU Amazon does not have yet is created with
// putListingsItem and its initial availability; an existing one (production: getListingsItem;
// sandbox, whose canned GET knows every SKU: the panel's own done submission) is updated with
// patchListingsItem, replacing only the attributes the panel owns, never the seller's stock.
// VALIDATION_PREVIEW runs only on the validate action; validate copies the images too (storage
// only, idempotent) so the preview sees the URLs a publish would send. `status` wraps
// _shared/listingStatus.ts, which amazon-poll imports directly. publish_bulk stops starting
// products after BULK_BUDGET_MS and answers the rest in `remaining` for the next call.
import {
   AmazonError,
   type AmazonEnv,
   amazonEnv,
   type Deps,
   deploymentUrl,
   marketplaceFor,
   type SpapiCall,
   spapiClient
} from '../_shared/amazon.ts';
import { type AmazonAccount, amazonAccountFor, withRevocation } from '../_shared/amazonAccount.ts';
import { type Requirement, withAuthorization } from '../_shared/auth.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import { type SupabaseClient, z } from '../_shared/deps.ts';
import { errorResponse, HttpError, json, serve } from '../_shared/http.ts';
import {
   type AmazonSchema,
   type Attributes,
   type MissingField,
   missingAttributes,
   type PropertyGroups
} from '../_shared/listingCompleteness.ts';
import {
   applySubmission,
   type ListingState,
   loadListingCell,
   loadSubmission,
   refreshListingStatus,
   setListingState,
   type SubmissionHead,
   type SubmissionStatus,
   submissionsOf
} from '../_shared/listingStatus.ts';
import { type ServiceRole, serviceRole } from '../_shared/serviceRole.ts';
import { supabaseClient, supabaseService } from '../_shared/supabaseClient.ts';
import { type DefinitionRow, pickDefinition } from '../amazon-schema/schema.ts';
import {
   type AmazonIssue,
   buildListingBody,
   catalogAsin,
   type CellContext,
   copyListingImages,
   deleteListingsItem,
   hasError,
   type ListingBody,
   listingExists,
   type ListingPatch,
   listingPatch,
   type ListingSubmissionRow,
   listingRestrictions,
   type MarketCellRow,
   mediaRefs,
   parseSubmission,
   patchListingsItem,
   type ProductRow,
   providedFor,
   putListingsItem,
   requireLanguageTag,
   skuFor,
   withNewItemAvailability
} from './listing.ts';

type Db = SupabaseClient<Database>;

/** Every action: the check and the status spend the customer's grant and write state too. */
const WRITE: Requirement = [['insert', 'listing_submission']];
/** The static sandbox serves the VALIDATION_PREVIEW mock only on its NA host, for this marketplace. */
const SANDBOX_PREVIEW_MARKETPLACE = 'ATVPDKIKX0DER';
/** Products per publish_bulk call. */
export const BULK_MAX = 10;
/** No new product of a publish_bulk call is started after this long (the rest are `remaining`). */
export const BULK_BUDGET_MS = 60_000;

export type HandlerDeps = {
   /** fetch / now / sleep for the SP-API client. */
   amazon: Partial<Deps>;
   env: () => AmazonEnv;
   /** The caller's client (the user's JWT, so RLS applies): every read and the 046 RPCs. */
   db: (req: Request) => Db;
   /** What only the service role may do (token, revoked grant, images, Amazon's outcome), for the user. */
   service: (userId: string) => ServiceRole;
   authorize: (
      req: Request,
      required: Requirement,
      run: (context: { tenantId: string; userId: string }) => Promise<Response>
   ) => Promise<Response>;
   /**
    * The public base URL of the project (PUBLIC_SUPABASE_URL): Amazon fetches the images there.
    * Required in production (_shared/amazon.ts deploymentUrl).
    */
   publicUrl: (env: AmazonEnv) => string;
};

const cellId = z.string().uuid();

const body = z.discriminatedUnion('action', [
   z.object({ action: z.literal('check'), cell_id: cellId }),
   z.object({ action: z.literal('validate'), cell_id: cellId }),
   z.object({ action: z.literal('publish'), cell_id: cellId }),
   z.object({ action: z.literal('delete'), cell_id: cellId }),
   z.object({ action: z.literal('status'), cell_id: cellId }),
   z.object({
      action: z.literal('publish_bulk'),
      product_ids: z.array(z.string().uuid()).min(1).max(BULK_MAX),
      country: z.string().trim().toUpperCase().length(2)
   })
]);

type Run = {
   d: HandlerDeps;
   tenantId: string;
   userId: string;
   env: AmazonEnv;
   db: Db;
   service: ServiceRole;
};

// --- Loading -------------------------------------------------------------------------------------

const loadProduct = async (db: Db, tenantId: string, id: string): Promise<ProductRow> => {
   const { data, error } = await db
      .from('product')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
   if (error) throw error;
   if (!data) throw new HttpError(404, 'listing_cell_not_found');
   return data;
};

/** The cell, its product, the variation family (R7), marketplace, language (D5) and SKU. */
const loadContext = async (db: Db, tenantId: string, id: string): Promise<CellContext> => {
   const cell = await loadListingCell(db, tenantId, id);
   const { marketplaceId } = marketplaceFor(cell.country);
   const languageTag = requireLanguageTag(cell.country, cell.listing_language);
   const product = await loadProduct(db, tenantId, cell.product_id);
   if (!product.amazon_product_type) throw new HttpError(422, 'listing_product_type_missing');

   const parent = product.parent_id ? await loadProduct(db, tenantId, product.parent_id) : null;
   let parentCell: MarketCellRow | null = null;
   if (parent) {
      const { data, error } = await db
         .from('market_cell')
         .select('*')
         .eq('tenant_id', tenantId)
         .eq('product_id', parent.id)
         .eq('platform_id', 'amazon')
         .eq('country', cell.country)
         .maybeSingle();
      if (error) throw error;
      parentCell = data;
   }
   const { data: children, error } = await db
      .from('product')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('parent_id', product.id);
   if (error) throw error;

   return {
      cell,
      product,
      parent,
      parentCell,
      children: children ?? [],
      marketplaceId,
      languageTag,
      currency: cell.currency,
      sku: skuFor(cell, product)
   };
};

const attributesOf = (product: ProductRow): Attributes =>
   (product.listing_attributes ?? {}) as unknown as Attributes;

/** The cached definition of the product type for the cell (sandbox: the R3 fixture serves all). */
const loadDefinition = async (run: Run, ctx: CellContext): Promise<DefinitionRow> => {
   const productType = ctx.product.amazon_product_type as string;
   const { data, error } = await run.db
      .from('amazon_product_type_definition')
      .select('*')
      .eq('product_type', productType);
   if (error) throw error;
   const row = pickDefinition(
      (data ?? []) as unknown as DefinitionRow[],
      { marketplaceId: ctx.marketplaceId, productType, locale: ctx.languageTag },
      run.env.env === 'sandbox'
   );
   if (!row) throw new HttpError(404, 'amazon_schema_missing');
   return row;
};

/**
 * The required attributes still missing; what the server fills and what the product card provides
 * count as filled (a parent sends no identifier and no offer, R7).
 */
const missingFor = (definition: DefinitionRow, ctx: CellContext): MissingField[] => {
   const schema = definition.schema as AmazonSchema;
   const provided = Object.keys(providedFor(ctx, schema).sources);
   return missingAttributes(
      schema,
      definition.property_groups as PropertyGroups,
      attributesOf(ctx.product),
      { marketplaceId: ctx.marketplaceId, languageTag: ctx.languageTag, provided }
   );
};

/** N2: a cell whose customer account is not connected is treated as draft. */
const accountOrNull = async (run: Run, ctx: CellContext): Promise<AmazonAccount | null> => {
   try {
      return await amazonAccountFor(
         run.db,
         run.service,
         ctx.cell.customer_id,
         run.tenantId,
         run.env
      );
   } catch (error) {
      if (error instanceof HttpError && error.message === 'amazon_not_connected') return null;
      throw error;
   }
};

/** The latest submission that settled the listing's existence: a create/update or a delete. */
const latestSettled = (subs: SubmissionHead[], statuses: SubmissionStatus[]) =>
   subs.find((s) => statuses.includes(s.status));

/** The listing exists on Amazon (as far as the panel knows) after a done create or update. */
const isListed = (subs: SubmissionHead[], statuses: SubmissionStatus[]) => {
   const latest = latestSettled(subs, statuses);
   return !!latest && latest.kind !== 'delete';
};

/** The issue stored when a submission fails on our side or Amazon's: the error code, no secrets. */
const failureIssue = (error: unknown): AmazonIssue => {
   const code =
      error instanceof AmazonError
         ? error.code
         : error instanceof HttpError
           ? error.message
           : 'internal_error';
   const amazonMessage =
      error instanceof AmazonError && Array.isArray(error.details)
         ? (error.details as Array<{ message?: unknown }>)
              .map((e) => (typeof e?.message === 'string' ? e.message : ''))
              .filter(Boolean)
              .join('; ')
         : '';
   return { code, message: amazonMessage || code, severity: 'ERROR', attributeNames: [] };
};

type SubmissionTarget = { cell: { id: string }; sku: string; marketplaceId: string };

const IN_FLIGHT: SubmissionStatus[] = ['accepted', 'processing'];

/** 409 listing_in_progress while the cell's latest submission (not a removal) is in flight. */
const refuseInFlight = (subs: SubmissionHead[]) => {
   const latest = subs[0];
   if (latest && latest.kind !== 'delete' && IN_FLIGHT.includes(latest.status))
      throw new HttpError(409, 'listing_in_progress');
};

/**
 * 046's listing_begin_submission, as the caller (created_by): the submission row, written before
 * Amazon is called, and for a create or update the cell in submitted. It refuses a second one in
 * flight under the cell's row lock (409 listing_in_progress).
 */
const beginSubmission = async (
   run: Run,
   ctx: SubmissionTarget,
   kind: Database['public']['Enums']['listing_submission_kind'],
   payload: ListingBody | ListingPatch | Record<string, never>
) => {
   const { data, error } = await run.db.rpc('listing_begin_submission', {
      p_cell_id: ctx.cell.id,
      p_kind: kind,
      p_sku: ctx.sku,
      p_marketplace_id: ctx.marketplaceId,
      p_payload: payload as unknown as Json
   });
   if (error?.message === 'listing_in_progress') throw new HttpError(409, 'listing_in_progress');
   if (error) throw error;
   return data as unknown as ListingSubmissionRow;
};

const amazonCall = (run: Run, account: AmazonAccount, sandboxNa = false) =>
   spapiClient(
      account.refreshToken,
      run.env,
      run.d.amazon,
      sandboxNa && run.env.env === 'sandbox' ? { sandboxRegionOverride: 'na' } : {}
   );

const matchedAsinOf = (cell: MarketCellRow): string | null => {
   const match = cell.listing_match as { asin?: unknown } | null;
   return typeof match?.asin === 'string' && match.asin ? match.asin : null;
};

// --- Actions -------------------------------------------------------------------------------------

const JOURNEY: ListingState[] = ['submitted', 'live', 'issues'];

const check = async (run: Run, id: string) => {
   const ctx = await loadContext(run.db, run.tenantId, id);
   const missing = missingFor(await loadDefinition(run, ctx), ctx);
   const current = ctx.cell.listing_state;
   const keep = current !== null && JOURNEY.includes(current);

   // The state is written only over the version read here: a publish or a removal that ran while
   // Amazon was asked wins, and the answer reports the state that is stored.
   const version = ctx.cell.updated_at;

   const account = await accountOrNull(run, ctx);
   if (!account) {
      const state: ListingState = keep ? (current as ListingState) : 'draft';
      const row = await setListingState(run.service, ctx.cell.id, state, null, version);
      return json({ missing, match: null, state: row.listing_state ?? state });
   }

   const sandbox = run.env.env === 'sandbox';
   const call = amazonCall(run, account);
   const match = await withRevocation(run.service, account.id, async () => {
      // The static sandbox has no EAN catalogue answer: there every product is new.
      const gtin = ctx.product.gtin?.trim();
      const asin = !sandbox && gtin ? await catalogAsin(call, gtin, ctx.marketplaceId) : null;
      const restriction = asin
         ? await listingRestrictions(call, asin, account.sellerId, ctx.marketplaceId, sandbox)
         : { restricted: false, reasons: [] };
      return { asin, ...restriction };
   });

   const state: ListingState = keep
      ? (current as ListingState)
      : missing.length
        ? 'draft'
        : 'ready';
   const checked = {
      ...match,
      checked_at: new Date((run.d.amazon.now ?? Date.now)()).toISOString()
   };
   const row = await setListingState(run.service, ctx.cell.id, state, checked, version);
   return json({ missing, match: checked, state: row.listing_state ?? state });
};

/** The product's images copied to listing-images: their public URLs by media id (R5). */
const copyImages = (run: Run, ctx: CellContext) =>
   copyListingImages(
      run.db,
      run.service.storage,
      run.tenantId,
      mediaRefs(attributesOf(ctx.product)),
      run.d.publicUrl(run.env),
      run.env.env
   );

const bodyFor = (ctx: CellContext, imageUrls: Record<string, string>, definition: DefinitionRow) =>
   buildListingBody(
      ctx,
      attributesOf(ctx.product),
      imageUrls,
      matchedAsinOf(ctx.cell),
      definition.schema as AmazonSchema
   );

const requireAccount = async (run: Run, ctx: CellContext) =>
   amazonAccountFor(run.db, run.service, ctx.cell.customer_id, run.tenantId, run.env);

const validate = async (run: Run, id: string) => {
   const ctx = await loadContext(run.db, run.tenantId, id);
   const definition = await loadDefinition(run, ctx);
   const account = await requireAccount(run, ctx);
   const listingBody = bodyFor(ctx, await copyImages(run, ctx), definition);
   const sandbox = run.env.env === 'sandbox';
   const call = amazonCall(run, account, true);
   const resp = await withRevocation(run.service, account.id, () =>
      putListingsItem(
         call,
         account.sellerId,
         ctx.sku,
         sandbox ? SANDBOX_PREVIEW_MARKETPLACE : ctx.marketplaceId,
         listingBody,
         'VALIDATION_PREVIEW'
      )
   );
   const parsed = parseSubmission(resp);
   const status = resp.status === 'INVALID' || hasError(parsed.issues) ? 'INVALID' : 'VALID';
   return json({ status, issues: parsed.issues });
};

type Published = { cell: MarketCellRow; submission: ListingSubmissionRow };

/**
 * Whether Amazon has the cell's SKU already. Production asks Amazon; the static sandbox answers
 * its canned item for every SKU, so there the panel's own done create or update decides.
 */
const skuExists = async (
   run: Run,
   call: SpapiCall,
   account: AmazonAccount,
   ctx: CellContext,
   subs: SubmissionHead[]
) =>
   run.env.env === 'sandbox'
      ? isListed(subs, ['done'])
      : await withRevocation(run.service, account.id, () =>
           listingExists(call, account.sellerId, ctx.sku, ctx.marketplaceId)
        );

const publishCell = async (run: Run, id: string, asParent = false): Promise<Published> => {
   // 1. Refusals: incomplete, in flight, then not connected.
   const ctx = await loadContext(run.db, run.tenantId, id);
   const definition = await loadDefinition(run, ctx);
   const missing = missingFor(definition, ctx);
   if (missing.length) throw new HttpError(422, 'listing_incomplete', missing);
   refuseInFlight(await submissionsOf(run.db, run.tenantId, ctx.cell.id));
   const account = await requireAccount(run, ctx);

   // 2. Images (a missing image or a non-public URL refuses before anything is written).
   const imageUrls = await copyImages(run, ctx);

   // 3. A child needs its parent's cell (created when missing) and the parent listed first (R7).
   if (ctx.parent && !asParent) {
      const { data: parentCellId, error } = await run.db.rpc('listing_parent_cell', {
         p_cell_id: ctx.cell.id
      });
      if (error) throw error;
      if (parentCellId) {
         const parentSubs = await submissionsOf(run.db, run.tenantId, parentCellId);
         // A parent Amazon took (accepted, still processing, or done) is not sent again.
         if (!isListed(parentSubs, ['done', 'accepted', 'processing']))
            await publishCell(run, parentCellId, true);
         ctx.parentCell = await loadListingCell(run.db, run.tenantId, parentCellId);
      }
   }

   // 4. A new SKU is created with its initial availability; an existing one is patched with the
   // attributes the panel owns (never the seller's stock). The request (with the parent's SKU for a
   // child) is what the submission stores and Amazon gets.
   const listingBody = bodyFor(ctx, imageUrls, definition);
   const call = amazonCall(run, account);
   const subs = await submissionsOf(run.db, run.tenantId, ctx.cell.id);
   const exists = await skuExists(run, call, account, ctx, subs);
   const request = exists ? listingPatch(listingBody) : withNewItemAvailability(listingBody, ctx);

   // 5. The submission (the cell goes submitted), as the caller, before Amazon is called.
   const submission = await beginSubmission(run, ctx, exists ? 'update' : 'create', request);

   // 6. Amazon; any failure after the submission fails it and puts the cell in issues.
   try {
      const resp = await withRevocation(run.service, account.id, () =>
         exists
            ? patchListingsItem(
                 call,
                 account.sellerId,
                 ctx.sku,
                 ctx.marketplaceId,
                 request as ListingPatch
              )
            : putListingsItem(
                 call,
                 account.sellerId,
                 ctx.sku,
                 ctx.marketplaceId,
                 request as ListingBody
              )
      );
      const parsed = parseSubmission(resp);
      const state: ListingState =
         parsed.status === 'invalid' || hasError(parsed.issues) ? 'issues' : 'submitted';
      const cell = await applySubmission(
         run.service,
         submission.id,
         parsed.status,
         parsed.submissionId ?? null,
         parsed.issues,
         state,
         null
      );
      return { cell, submission: await loadSubmission(run.db, run.tenantId, submission.id) };
   } catch (error) {
      try {
         await applySubmission(
            run.service,
            submission.id,
            'failed',
            null,
            [failureIssue(error)],
            'issues',
            null
         );
      } catch (applyError) {
         console.error('amazon-listing: could not fail the submission', applyError);
      }
      throw error;
   }
};

/** What a delete needs: the cell, its SKU and marketplace (no product type or language). */
const loadDeleteTarget = async (run: Run, id: string) => {
   const cell = await loadListingCell(run.db, run.tenantId, id);
   const { marketplaceId } = marketplaceFor(cell.country);
   const product = await loadProduct(run.db, run.tenantId, cell.product_id);
   return { cell, marketplaceId, sku: skuFor(cell, product) };
};

const remove = async (run: Run, id: string): Promise<Response> => {
   const ctx = await loadDeleteTarget(run, id);
   const account = await amazonAccountFor(
      run.db,
      run.service,
      ctx.cell.customer_id,
      run.tenantId,
      run.env
   );
   const submission = await beginSubmission(run, ctx, 'delete', {});

   // A delete must not walk the business status (listing_apply_submission would): the
   // submission is settled directly and the cell goes back to draft.
   const settle = async (patch: {
      status: SubmissionStatus;
      amazon_submission_id?: string | null;
      issues: AmazonIssue[];
   }) => {
      await run.service.settleRemoval({
         submissionId: submission.id,
         status: patch.status,
         amazonSubmissionId: patch.amazon_submission_id ?? null,
         issues: patch.issues as unknown as Json
      });
   };

   let parsed: ReturnType<typeof parseSubmission>;
   try {
      const call = amazonCall(run, account);
      parsed = parseSubmission(
         await withRevocation(run.service, account.id, () =>
            deleteListingsItem(call, account.sellerId, ctx.sku, ctx.marketplaceId)
         )
      );
   } catch (error) {
      await settle({ status: 'failed', issues: [failureIssue(error)] }).catch((e) =>
         console.error('amazon-listing: could not fail the submission', e)
      );
      throw error;
   }

   await settle({
      status: parsed.status === 'accepted' ? 'done' : 'invalid',
      amazon_submission_id: parsed.submissionId ?? null,
      issues: parsed.issues
   });
   // Draft again; leaving issues clears the cell's 'Amazon: ' open issue (046).
   if (parsed.status === 'accepted') await setListingState(run.service, ctx.cell.id, 'draft', null);
   return json({
      cell: await loadListingCell(run.db, run.tenantId, ctx.cell.id),
      submission: await loadSubmission(run.db, run.tenantId, submission.id)
   });
};

/** The cell's latest create/update as Amazon reports it now (_shared/listingStatus.ts). */
const status = async (run: Run, id: string): Promise<Response> =>
   json(
      await refreshListingStatus(
         { db: run.db, service: run.service, env: run.env, amazon: run.d.amazon },
         { tenantId: run.tenantId, cellId: id }
      )
   );

type BulkResult = {
   product_id: string;
   cell_id: string | null;
   result: 'submitted' | 'skipped_no_cell' | 'skipped_incomplete' | 'invalid' | 'error';
   code?: string;
};

const errorCode = (error: unknown) =>
   error instanceof AmazonError
      ? error.code
      : error instanceof HttpError
        ? error.message
        : 'internal_error';

const publishBulk = async (run: Run, productIds: string[], country: string) => {
   marketplaceFor(country);
   const now = run.d.amazon.now ?? Date.now;
   const started = now();
   const results: BulkResult[] = [];
   for (const [index, productId] of productIds.entries()) {
      // The first product always runs, so every call makes progress.
      if (index > 0 && now() - started >= BULK_BUDGET_MS)
         return json({ results, remaining: productIds.slice(index) });
      const { data: found, error } = await run.db
         .from('market_cell')
         .select('id')
         .eq('tenant_id', run.tenantId)
         .eq('product_id', productId)
         .eq('platform_id', 'amazon')
         .eq('country', country)
         .maybeSingle();
      if (error) throw error;
      if (!found) {
         results.push({ product_id: productId, cell_id: null, result: 'skipped_no_cell' });
         continue;
      }
      try {
         const { submission } = await publishCell(run, found.id);
         results.push({
            product_id: productId,
            cell_id: found.id,
            result: submission.status === 'invalid' ? 'invalid' : 'submitted'
         });
      } catch (error) {
         const code = errorCode(error);
         if (!(error instanceof AmazonError) && !(error instanceof HttpError))
            console.error(
               `amazon-listing bulk publish failed: ${code} ${String((error as { message?: unknown } | null)?.message ?? '')}`
            );
         results.push({
            product_id: productId,
            cell_id: found.id,
            result: code === 'listing_incomplete' ? 'skipped_incomplete' : 'error',
            code
         });
      }
   }
   return json({ results, remaining: [] });
};

// --- Routing -------------------------------------------------------------------------------------

const route = async (req: Request, d: HandlerDeps): Promise<Response> => {
   if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
   let raw: unknown;
   try {
      raw = await req.json();
   } catch {
      raw = undefined;
   }
   const q = body.parse(raw);

   return d.authorize(req, WRITE, async ({ tenantId, userId }) => {
      const run: Run = {
         d,
         tenantId,
         userId,
         env: d.env(),
         db: d.db(req),
         service: d.service(userId)
      };
      switch (q.action) {
         case 'check':
            return check(run, q.cell_id);
         case 'validate':
            return validate(run, q.cell_id);
         case 'publish':
            return json(await publishCell(run, q.cell_id));
         case 'delete':
            return remove(run, q.cell_id);
         case 'status':
            return status(run, q.cell_id);
         case 'publish_bulk':
            return publishBulk(run, q.product_ids, q.country);
      }
   });
};

/** Amazon's typed errors answer their own code and status (never a token: see _shared/amazon.ts). */
const toResponse = (error: unknown) =>
   errorResponse(
      error instanceof AmazonError ? new HttpError(error.status, error.code, error.details) : error
   );

export async function handler(req: Request, deps: Partial<HandlerDeps> = {}): Promise<Response> {
   const d: HandlerDeps = {
      amazon: {},
      env: () => amazonEnv(),
      db: supabaseClient,
      // The service role, for what no user may do; its writes are audited as this user.
      service: (userId) =>
         serviceRole(supabaseService({ role: 'amazon-listing', actorId: userId }), userId),
      authorize: withAuthorization,
      publicUrl: (env) => deploymentUrl('PUBLIC_SUPABASE_URL', env),
      ...deps
   };
   try {
      return await route(req, d);
   } catch (error) {
      return toResponse(error);
   }
}

if (import.meta.main) serve((req) => handler(req));
