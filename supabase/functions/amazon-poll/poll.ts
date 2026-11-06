// The poll run: every cell in listing_state 'submitted' (all tenants, service role) is asked for
// its status through the shared refreshListingStatus, oldest check first, a few per run. A cell
// Amazon has not reported within POLL_GIVE_UP_HOURS is given up: submission failed, cell issues.
import { type AmazonEnv, AmazonError, type Deps } from '../_shared/amazon.ts';
import { HttpError } from '../_shared/http.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import {
   type AmazonIssue,
   applySubmission,
   type ListingStatusDeps,
   type ListingStatusTarget,
   refreshListingStatus,
   submissionsOf
} from '../_shared/listingStatus.ts';

type Db = SupabaseClient<Database>;

export const POLL_GIVE_UP_HOURS = 24;
/** Cells per run: the shared client's rate bucket is per host, so the cap stays small. */
export const POLL_CAP = 20;
/** No new cell is started after this long, well inside the Edge Function wall-clock limit. */
export const POLL_BUDGET_MS = 100_000;

export type RefreshFn = (
   deps: ListingStatusDeps,
   target: ListingStatusTarget
) => Promise<{
   cell: { listing_state: string | null };
   submission: { id: string; status: string; created_at: string };
}>;

export type PollDeps = {
   admin: Db;
   env: AmazonEnv;
   amazon?: Partial<Deps>;
   /** Defaults to the shared refreshListingStatus. */
   refresh?: RefreshFn;
   cap?: number;
};

export type PollResult = {
   polled: number;
   failed: number;
   given_up: number;
   remaining: number;
};

const GIVE_UP_ISSUE: AmazonIssue = {
   code: 'amazon_poll_timeout',
   message: `Amazon did not report the listing within ${POLL_GIVE_UP_HOURS} hours.`,
   severity: 'ERROR',
   attributeNames: []
};

const stale = (createdAt: string, now: number) =>
   now - Date.parse(createdAt) > POLL_GIVE_UP_HOURS * 60 * 60 * 1000;

const failedCode = (error: unknown) => {
   if (error instanceof AmazonError) return error.code;
   if (error instanceof Error) return `${error.name} ${error.message}`;
   return 'internal_error';
};

/** Throttling, Amazon 5xx and network errors pass by themselves; the rest (revoked...) will not. */
const transient = (error: unknown) => {
   if (error instanceof AmazonError) return error.status === 429 || error.status >= 500;
   return !(error instanceof HttpError);
};

/** Marks a submission failed and its cell `issues` (the RPC writes the open_issue from the issue). */
const giveUp = async (db: Db, submissionId: string) => {
   await applySubmission(db, submissionId, 'failed', null, [GIVE_UP_ISSUE], 'issues', null);
};

export async function pollSubmitted(
   deps: PollDeps,
   now: () => number = Date.now
): Promise<PollResult> {
   const { admin, env, amazon } = deps;
   const refresh = deps.refresh ?? refreshListingStatus;
   const started = now();

   const { data, count, error } = await admin
      .from('market_cell')
      .select('id, tenant_id', { count: 'exact' })
      .eq('platform_id', 'amazon')
      .eq('listing_state', 'submitted')
      .order('listing_checked_at', { ascending: true, nullsFirst: true })
      .limit(deps.cap ?? POLL_CAP);
   if (error) throw error;
   const cells = data ?? [];
   const total = count ?? cells.length;

   let polled = 0;
   let failed = 0;
   let givenUp = 0;
   for (const cell of cells) {
      if (now() - started >= POLL_BUDGET_MS) break;
      try {
         const { cell: updated, submission } = await refresh(
            { admin, env, amazon },
            { tenantId: cell.tenant_id, cellId: cell.id }
         );
         if (
            updated.listing_state === 'submitted' &&
            submission.status === 'processing' &&
            stale(submission.created_at, now())
         ) {
            await giveUp(admin, submission.id);
            givenUp += 1;
         }
         polled += 1;
      } catch (error) {
         failed += 1;
         console.error(`amazon-poll failed: ${failedCode(error)}`);
         // The check stamp moves the cell to the back of the queue, so failing cells never starve the rest.
         try {
            const { error: stampError } = await admin
               .from('market_cell')
               .update({ listing_checked_at: new Date(now()).toISOString() })
               .eq('id', cell.id)
               .eq('tenant_id', cell.tenant_id);
            if (stampError) throw stampError;
         } catch (inner) {
            console.error(`amazon-poll stamp failed: ${failedCode(inner)}`);
         }
         // A cell that keeps failing for good (revoked account...) must not wait forever either.
         if (transient(error)) continue;
         try {
            const latest = (await submissionsOf(admin, cell.tenant_id, cell.id)).find(
               (s) => s.kind !== 'delete'
            );
            if (
               latest &&
               (latest.status === 'processing' || latest.status === 'accepted') &&
               stale(latest.created_at, now())
            ) {
               await giveUp(admin, latest.id);
               givenUp += 1;
            }
         } catch (inner) {
            console.error(`amazon-poll give-up failed: ${failedCode(inner)}`);
         }
      }
   }
   return {
      polled,
      failed,
      given_up: givenUp,
      remaining: Math.max(0, total - polled - failed)
   };
}
