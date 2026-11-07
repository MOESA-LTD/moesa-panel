// The status of a submitted Amazon listing: getListingsItem, the listing state derived from it,
// and refreshListingStatus, which applies that state to the submission and its cell. Used by
// amazon-listing (the `status` action) and amazon-poll (imported, never over HTTP).
import { AmazonError, type AmazonEnv, type Deps, type SpapiCall, spapiClient } from './amazon.ts';
import { amazonAccountFor, withRevocation } from './amazonAccount.ts';
import type { Database, Json } from './database.types.ts';
import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';
import type { ServiceRole } from './serviceRole.ts';

type Db = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
export type MarketCellRow = Tables['market_cell']['Row'];
export type ListingSubmissionRow = Tables['listing_submission']['Row'];
export type ListingState = Database['public']['Enums']['listing_state'];
export type SubmissionStatus = Database['public']['Enums']['listing_submission_status'];

export const LISTINGS_ITEMS = '/listings/2021-08-01/items';

export const listingItemPath = (sellerId: string, sku: string) =>
   `${LISTINGS_ITEMS}/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`;

// --- Issues and the derived state ----------------------------------------------------------------

export type AmazonIssue = {
   code: string;
   message: string;
   severity: 'ERROR' | 'WARNING' | 'INFO';
   attributeNames: string[];
   categories?: string[];
};

type RawIssue = {
   code?: unknown;
   message?: unknown;
   severity?: unknown;
   attributeNames?: unknown;
   categories?: unknown;
   marketplaceIds?: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
   typeof value === 'object' && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] =>
   Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Amazon's issue in the stored shape; `attributeNames` defaults to [] (the sandbox's 18027). */
export function toIssue(raw: unknown): AmazonIssue {
   const issue = (isObject(raw) ? raw : {}) as RawIssue;
   const severity =
      issue.severity === 'WARNING' || issue.severity === 'INFO' ? issue.severity : 'ERROR';
   const out: AmazonIssue = {
      code: String(issue.code ?? ''),
      message: String(issue.message ?? ''),
      severity,
      attributeNames: strings(issue.attributeNames)
   };
   if (Array.isArray(issue.categories)) out.categories = strings(issue.categories);
   return out;
}

export const hasError = (issues: readonly AmazonIssue[]) =>
   issues.some((issue) => issue.severity === 'ERROR');

export type ItemSummary = { marketplaceId: string; asin?: string; status?: string[] };

export type DerivedState = {
   state: 'live' | 'issues' | 'submitted';
   asin: string | null;
   issues: AmazonIssue[];
};

/**
 * The listing state from getListingsItem: issues of the marketplace (sandbox: all, its canned
 * answers are US-only) with an ERROR give `issues`; else a BUYABLE or DISCOVERABLE summary of the
 * marketplace (sandbox: the first) gives `live`; else the listing is still `submitted`.
 */
export function deriveListingState(
   item: { summaries?: ItemSummary[]; issues?: unknown[] },
   marketplaceId: string,
   sandbox: boolean
): DerivedState {
   const issues = (item.issues ?? [])
      .filter((raw) => {
         if (sandbox) return true;
         const ids = (isObject(raw) ? raw : {}).marketplaceIds;
         return !Array.isArray(ids) || ids.includes(marketplaceId);
      })
      .map(toIssue);
   const summaries = item.summaries ?? [];
   const summary = sandbox
      ? summaries[0]
      : summaries.find((entry) => entry.marketplaceId === marketplaceId);
   const asin = summary?.asin ?? null;

   if (hasError(issues)) return { state: 'issues', asin, issues };
   const status = summary?.status ?? [];
   if (summary && (status.includes('BUYABLE') || status.includes('DISCOVERABLE')))
      return { state: 'live', asin, issues };
   return { state: 'submitted', asin, issues };
}

/** getListingsItem with summaries and issues. */
export function getListingsItem(
   call: SpapiCall,
   sellerId: string,
   sku: string,
   marketplaceId: string
): Promise<{ summaries?: ItemSummary[]; issues?: unknown[] }> {
   return call({
      method: 'GET',
      path: listingItemPath(sellerId, sku),
      query: { marketplaceIds: marketplaceId, includedData: ['summaries', 'issues'] }
   });
}

// --- Rows ----------------------------------------------------------------------------------------
// `db` is the caller's client: the user's in amazon-listing (RLS scopes every read), the labelled
// service client in amazon-poll (no user). The tenant filters state the intent; RLS is the guard
// on the user path. Amazon's outcome (apply, set_state) is written by the service role only
// (OutcomeWriter), for the triggering user (p_actor).

/** The tenant's `amazon` cell; anything else is 404 listing_cell_not_found. */
export async function loadListingCell(
   db: Db,
   tenantId: string,
   cellId: string
): Promise<MarketCellRow> {
   const { data, error } = await db
      .from('market_cell')
      .select('*')
      .eq('id', cellId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
   if (error) throw error;
   if (!data || data.platform_id !== 'amazon') throw new HttpError(404, 'listing_cell_not_found');
   return data;
}

/** The tenant's submission; a missing one is 404 listing_submission_not_found. */
export async function loadSubmission(
   db: Db,
   tenantId: string,
   submissionId: string
): Promise<ListingSubmissionRow> {
   const { data, error } = await db
      .from('listing_submission')
      .select('*')
      .eq('id', submissionId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
   if (error) throw error;
   if (!data) throw new HttpError(404, 'listing_submission_not_found');
   return data;
}

export type SubmissionHead = Pick<ListingSubmissionRow, 'id' | 'kind' | 'status' | 'created_at'>;

/** The cell's submissions, newest first. */
export async function submissionsOf(
   db: Db,
   tenantId: string,
   cellId: string
): Promise<SubmissionHead[]> {
   const { data, error } = await db
      .from('listing_submission')
      .select('id, kind, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('cell_id', cellId)
      .order('created_at', { ascending: false });
   if (error) throw error;
   return data ?? [];
}

/** The service role's outcome writes (046: Amazon's outcome is not a user's to write). */
export type OutcomeWriter = Pick<ServiceRole, 'applySubmission' | 'setListingState'>;

/**
 * 046's listing_apply_submission: the submission's status and issues, and, when it is the cell's
 * latest submission, the cell's state (R2 walk); an older submission's answer leaves the cell as is.
 */
export function applySubmission(
   service: OutcomeWriter,
   submissionId: string,
   status: SubmissionStatus,
   amazonSubmissionId: string | null,
   issues: AmazonIssue[],
   state: ListingState,
   asin: string | null
): Promise<MarketCellRow> {
   return service.applySubmission({
      submissionId,
      status,
      amazonSubmissionId,
      issues: issues as unknown as Json,
      state,
      asin
   });
}

/**
 * 046's listing_set_state: the cell's listing state (and match), written only when the cell is
 * still at `expectedUpdatedAt` (the version the caller read; null writes unconditionally).
 * Returns the cell as it is afterwards: the caller's state, or the newer one that won.
 */
export function setListingState(
   service: OutcomeWriter,
   cellId: string,
   state: ListingState,
   match: Json | null,
   expectedUpdatedAt: string | null = null
): Promise<MarketCellRow> {
   return service.setListingState({ cellId, state, match, expectedUpdatedAt });
}

// --- Refresh -------------------------------------------------------------------------------------

export type ListingStatusDeps = {
   /** The caller's client (see Rows above): reads and the 046 RPCs. */
   db: Db;
   /** The Amazon account's token, a revoked grant and Amazon's outcome. */
   service: Pick<ServiceRole, 'accountToken' | 'revokeAccount'> & OutcomeWriter;
   env: AmazonEnv;
   /** fetch / now / sleep for the SP-API client. */
   amazon?: Partial<Deps>;
};

export type ListingStatusTarget =
   | { tenantId: string; cellId: string; submissionId?: undefined }
   | { tenantId: string; submissionId: string; cellId?: undefined };

export type RefreshOptions = {
   /** The poll: a `done` submission is settled; it is returned unchanged without a call. */
   skipDone?: boolean;
};

/**
 * Asks Amazon for a submitted listing and applies the answer: `live` or `issues` make the
 * submission `done`, `submitted` (or Amazon's 404: not known yet) keeps it `processing`.
 * The target is a cell (its latest submission) or one submission. Returned unchanged without a
 * call: an `invalid` or `failed` submission (Amazon never took it), a cell whose latest
 * submission is a delete (a refresh never brings a removed listing back), and with `skipDone` a
 * `done` one. A `done` submission is never moved back to `processing`: Amazon's 404 for it means
 * the listing is gone (the cell goes to draft, the submission stays done), and an answer that is
 * neither live nor issues leaves it as it is.
 * Errors: 404 listing_cell_not_found / listing_submission_not_found, 409 amazon_not_connected /
 * amazon_connection_revoked (the account is marked revoked), the Amazon codes of _shared/amazon.ts.
 */
export async function refreshListingStatus(
   deps: ListingStatusDeps,
   target: ListingStatusTarget,
   options: RefreshOptions = {}
): Promise<{ cell: MarketCellRow; submission: ListingSubmissionRow }> {
   const { db, service, env, tenantId } = { ...deps, tenantId: target.tenantId };

   let submission: ListingSubmissionRow;
   if (target.submissionId !== undefined) {
      submission = await loadSubmission(db, tenantId, target.submissionId);
      if (submission.kind === 'delete') throw new HttpError(404, 'listing_submission_not_found');
   } else {
      await loadListingCell(db, tenantId, target.cellId);
      const latest = (await submissionsOf(db, tenantId, target.cellId))[0];
      if (!latest) throw new HttpError(404, 'listing_submission_not_found');
      submission = await loadSubmission(db, tenantId, latest.id);
   }
   const cell = await loadListingCell(db, tenantId, submission.cell_id);
   if (
      submission.kind === 'delete' ||
      submission.status === 'invalid' ||
      submission.status === 'failed' ||
      (options.skipDone && submission.status === 'done')
   )
      return { cell, submission };
   const done = submission.status === 'done';

   const account = await amazonAccountFor(db, service, cell.customer_id, tenantId, env);
   const call = spapiClient(account.refreshToken, env, deps.amazon ?? {});
   let derived: DerivedState;
   try {
      const item = await withRevocation(service, account.id, () =>
         getListingsItem(call, account.sellerId, submission.sku, submission.marketplace_id)
      );
      derived = deriveListingState(item, submission.marketplace_id, env.env === 'sandbox');
   } catch (error) {
      if (!(error instanceof AmazonError && error.code === 'amazon_not_found')) throw error;
      // A listing Amazon had (done) and no longer knows was removed: the cell is draft again.
      if (done) return { cell: await setListingState(service, cell.id, 'draft', null), submission };
      derived = { state: 'submitted', asin: null, issues: [] };
   }
   // Neither live nor issues for a settled submission: nothing new to say.
   if (done && derived.state === 'submitted') return { cell, submission };

   const updated = await applySubmission(
      service,
      submission.id,
      derived.state === 'submitted' ? 'processing' : 'done',
      null,
      derived.issues,
      derived.state,
      derived.asin
   );
   return { cell: updated, submission: await loadSubmission(db, tenantId, submission.id) };
}
