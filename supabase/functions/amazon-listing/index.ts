// amazon-listing: one cell's Amazon listing. Every action is POST { action, ... }.
//
//   check        { cell_id }                   -> { missing, match, state }       select market_cell
//   validate     { cell_id }                   -> { status, issues }              insert listing_submission
//   publish      { cell_id }                   -> { cell, submission }            insert listing_submission
//   delete       { cell_id }                   -> { cell, submission }            insert listing_submission
//   status       { cell_id }                   -> { cell, submission }            select market_cell
//   publish_bulk { product_ids, country }      -> { results }                     insert listing_submission
//
// Reads, RPCs and storage use the service client, always scoped by the caller's tenant; the
// submission row is inserted with the caller's client (RLS, created_by). VALIDATION_PREVIEW runs
// only on the validate action; validate copies the images too (storage only, idempotent) so the
// preview sees the URLs a publish would send. `status` wraps _shared/listingStatus.ts, which
// amazon-poll imports directly.
import {
   AmazonError,
   type AmazonEnv,
   amazonEnv,
   type Deps,
   marketplaceFor,
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
   type SubmissionHead,
   type SubmissionStatus,
   submissionsOf
} from '../_shared/listingStatus.ts';
import { supabaseAdmin, supabaseClient } from '../_shared/supabaseClient.ts';
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
   type ListingSubmissionRow,
   listingRestrictions,
   type MarketCellRow,
   mediaRefs,
   parseSubmission,
   type ProductRow,
   putListingsItem,
   requireLanguageTag,
   serverProvided,
   skuFor
} from './listing.ts';

type Db = SupabaseClient<Database>;

const READ: Requirement = [['select', 'market_cell']];
const WRITE: Requirement = [['insert', 'listing_submission']];
/** The static sandbox serves the VALIDATION_PREVIEW mock only on its NA host, for this marketplace. */
const SANDBOX_PREVIEW_MARKETPLACE = 'ATVPDKIKX0DER';
const BULK_MAX = 50;

export type HandlerDeps = {
   /** fetch / now / sleep for the SP-API client. */
   amazon: Partial<Deps>;
   env: () => AmazonEnv;
   /** The service-role client: reads (scoped by tenant), RPCs, storage, the Amazon account. */
   admin: () => Db;
   /** The caller's client: the listing_submission insert. */
   userDb: (req: Request) => Db;
   authorize: (
      req: Request,
      required: Requirement,
      run: (context: { tenantId: string; userId: string }) => Promise<Response>
   ) => Promise<Response>;
   /** The public base URL of the project (PUBLIC_SUPABASE_URL): Amazon fetches the images there. */
   publicUrl: string;
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

type Run = { req: Request; d: HandlerDeps; tenantId: string; env: AmazonEnv; admin: Db };

// --- Loading -------------------------------------------------------------------------------------

const loadProduct = async (admin: Db, tenantId: string, id: string): Promise<ProductRow> => {
   const { data, error } = await admin
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
const loadContext = async (admin: Db, tenantId: string, id: string): Promise<CellContext> => {
   const cell = await loadListingCell(admin, tenantId, id);
   const { marketplaceId } = marketplaceFor(cell.country);
   const languageTag = requireLanguageTag(cell.country, cell.listing_language);
   const product = await loadProduct(admin, tenantId, cell.product_id);
   if (!product.amazon_product_type) throw new HttpError(422, 'listing_product_type_missing');

   const parent = product.parent_id ? await loadProduct(admin, tenantId, product.parent_id) : null;
   let parentCell: MarketCellRow | null = null;
   if (parent) {
      const { data, error } = await admin
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
   const { data: children, error } = await admin
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
   const { data, error } = await run.admin
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

/** The required attributes still missing; a parent sends no identifier and no offer (R7). */
const missingFor = (definition: DefinitionRow, ctx: CellContext): MissingField[] => {
   const provided = serverProvided(ctx.product, ctx.cell, { isParent: ctx.children.length > 0 });
   return missingAttributes(
      definition.schema as AmazonSchema,
      definition.property_groups as PropertyGroups,
      attributesOf(ctx.product),
      { marketplaceId: ctx.marketplaceId, languageTag: ctx.languageTag, provided }
   );
};

/** N2: a cell whose customer account is not connected is treated as draft. */
const accountOrNull = async (run: Run, ctx: CellContext): Promise<AmazonAccount | null> => {
   try {
      return await amazonAccountFor(run.admin, ctx.cell.customer_id, run.tenantId, run.env);
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

const setState = async (run: Run, cell: string, state: ListingState, match: Json | null) => {
   const { error } = await run.admin.rpc('listing_set_state', {
      p_cell_id: cell,
      p_listing_state: state,
      p_listing_match: match as Json
   });
   if (error) throw error;
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

const insertSubmission = async (
   run: Run,
   ctx: SubmissionTarget,
   kind: Database['public']['Enums']['listing_submission_kind'],
   payload: ListingBody | Record<string, never>
) => {
   const { data, error } = await run.d
      .userDb(run.req)
      .from('listing_submission')
      .insert({
         tenant_id: run.tenantId,
         cell_id: ctx.cell.id,
         kind,
         sku: ctx.sku,
         marketplace_id: ctx.marketplaceId,
         payload: payload as unknown as Json
      })
      .select()
      .single();
   if (error) throw error;
   return data as ListingSubmissionRow;
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
   const ctx = await loadContext(run.admin, run.tenantId, id);
   const missing = missingFor(await loadDefinition(run, ctx), ctx);
   const current = ctx.cell.listing_state;
   const keep = current !== null && JOURNEY.includes(current);

   const account = await accountOrNull(run, ctx);
   if (!account) {
      const state: ListingState = keep ? (current as ListingState) : 'draft';
      await setState(run, ctx.cell.id, state, null);
      return json({ missing, match: null, state });
   }

   const sandbox = run.env.env === 'sandbox';
   const call = amazonCall(run, account);
   const match = await withRevocation(run.admin, account.id, async () => {
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
   const checkedAt = new Date((run.d.amazon.now ?? Date.now)()).toISOString();
   await setState(run, ctx.cell.id, state, { ...match, checked_at: checkedAt });
   return json({ missing, match, state });
};

/** The product's images copied to listing-images: their public URLs by media id (R5). */
const copyImages = (run: Run, ctx: CellContext) =>
   copyListingImages(
      run.admin,
      run.tenantId,
      mediaRefs(attributesOf(ctx.product)),
      run.d.publicUrl,
      run.env.env
   );

const bodyFor = (ctx: CellContext, imageUrls: Record<string, string>) =>
   buildListingBody(ctx, attributesOf(ctx.product), imageUrls, matchedAsinOf(ctx.cell));

const requireAccount = async (run: Run, ctx: CellContext) =>
   amazonAccountFor(run.admin, ctx.cell.customer_id, run.tenantId, run.env);

const validate = async (run: Run, id: string) => {
   const ctx = await loadContext(run.admin, run.tenantId, id);
   const account = await requireAccount(run, ctx);
   const listingBody = bodyFor(ctx, await copyImages(run, ctx));
   const sandbox = run.env.env === 'sandbox';
   const call = amazonCall(run, account, true);
   const resp = await withRevocation(run.admin, account.id, () =>
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

const publishCell = async (run: Run, id: string, asParent = false): Promise<Published> => {
   // 1. Refusals: incomplete, then not connected.
   const ctx = await loadContext(run.admin, run.tenantId, id);
   const missing = missingFor(await loadDefinition(run, ctx), ctx);
   if (missing.length) throw new HttpError(422, 'listing_incomplete', missing);
   const account = await requireAccount(run, ctx);

   // 2. Images (a missing image or a non-public URL refuses before anything is written).
   const imageUrls = await copyImages(run, ctx);

   // 3. A child needs its parent's cell (created when missing) and the parent listed first (R7).
   if (ctx.parent && !asParent) {
      const { data: parentCellId, error } = await run.admin.rpc('listing_parent_cell', {
         p_cell_id: ctx.cell.id
      });
      if (error) throw error;
      if (parentCellId) {
         const parentSubs = await submissionsOf(run.admin, run.tenantId, parentCellId);
         // A parent Amazon took (accepted, still processing, or done) is not sent again.
         if (!isListed(parentSubs, ['done', 'accepted', 'processing']))
            await publishCell(run, parentCellId, true);
         ctx.parentCell = await loadListingCell(run.admin, run.tenantId, parentCellId);
      }
   }

   // The body (with the parent's SKU for a child) is what the submission stores and Amazon gets.
   const listingBody = bodyFor(ctx, imageUrls);

   // 4. The submission, as the caller.
   const kind = isListed(await submissionsOf(run.admin, run.tenantId, ctx.cell.id), ['done'])
      ? 'update'
      : 'create';
   const submission = await insertSubmission(run, ctx, kind, listingBody);

   // 5. Amazon; 6. any failure after the insert fails the submission and puts the cell in issues.
   try {
      const call = amazonCall(run, account);
      const resp = await withRevocation(run.admin, account.id, () =>
         putListingsItem(call, account.sellerId, ctx.sku, ctx.marketplaceId, listingBody)
      );
      const parsed = parseSubmission(resp);
      const state: ListingState =
         parsed.status === 'invalid' || hasError(parsed.issues) ? 'issues' : 'submitted';
      const cell = await applySubmission(
         run.admin,
         submission.id,
         parsed.status,
         parsed.submissionId ?? null,
         parsed.issues,
         state,
         null
      );
      return { cell, submission: await loadSubmission(run.admin, run.tenantId, submission.id) };
   } catch (error) {
      try {
         await applySubmission(
            run.admin,
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
   const cell = await loadListingCell(run.admin, run.tenantId, id);
   const { marketplaceId } = marketplaceFor(cell.country);
   const product = await loadProduct(run.admin, run.tenantId, cell.product_id);
   return { cell, marketplaceId, sku: skuFor(cell, product) };
};

const remove = async (run: Run, id: string): Promise<Response> => {
   const ctx = await loadDeleteTarget(run, id);
   const account = await amazonAccountFor(run.admin, ctx.cell.customer_id, run.tenantId, run.env);
   const submission = await insertSubmission(run, ctx, 'delete', {});

   // A delete must not walk the business status (listing_apply_submission would): the
   // submission is settled directly and the cell goes back to draft.
   const settle = async (patch: {
      status: SubmissionStatus;
      amazon_submission_id?: string | null;
      issues: AmazonIssue[];
   }) => {
      const { error } = await run.admin
         .from('listing_submission')
         .update({ ...patch, issues: patch.issues as unknown as Json })
         .eq('id', submission.id)
         .eq('tenant_id', run.tenantId);
      if (error) throw error;
   };

   let parsed: ReturnType<typeof parseSubmission>;
   try {
      const call = amazonCall(run, account);
      parsed = parseSubmission(
         await withRevocation(run.admin, account.id, () =>
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
   if (parsed.status === 'accepted') await setState(run, ctx.cell.id, 'draft', null);
   return json({
      cell: await loadListingCell(run.admin, run.tenantId, ctx.cell.id),
      submission: await loadSubmission(run.admin, run.tenantId, submission.id)
   });
};

/** The cell's latest create/update as Amazon reports it now (_shared/listingStatus.ts). */
const status = async (run: Run, id: string): Promise<Response> =>
   json(
      await refreshListingStatus(
         { admin: run.admin, env: run.env, amazon: run.d.amazon },
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
   const results: BulkResult[] = [];
   for (const productId of productIds) {
      const { data: found, error } = await run.admin
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
   return json({ results });
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

   const start = (tenantId: string): Run => ({ req, d, tenantId, env: d.env(), admin: d.admin() });

   const required = q.action === 'check' || q.action === 'status' ? READ : WRITE;
   return d.authorize(req, required, async ({ tenantId }) => {
      const run = start(tenantId);
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
      admin: supabaseAdmin,
      userDb: supabaseClient,
      authorize: withAuthorization,
      publicUrl: Deno.env.get('PUBLIC_SUPABASE_URL') ?? 'http://127.0.0.1:54321',
      ...deps
   };
   try {
      return await route(req, d);
   } catch (error) {
      return toResponse(error);
   }
}

if (import.meta.main) serve((req) => handler(req));
