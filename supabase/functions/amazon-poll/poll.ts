// The poll run: every cell in listing_state 'submitted' (all tenants, service role) is asked for
// its status through the shared refreshListingStatus, oldest check first, a few per run. A
// settled (done) latest submission is not asked again: such a cell (a variation parent showing its
// children's state) is only stamped to the back of the queue. A cell whose customer's account is
// not connected (a transferred cell, a revoked grant) is skipped and set to draft without an open
// issue (N2). Give-up applies only to the cell's latest submission still in flight (accepted or
// processing) that Amazon has not reported within POLL_GIVE_UP_HOURS: submission failed, cell
// issues.
import { type AmazonEnv, AmazonError, type Deps } from '../_shared/amazon.ts';
import { HttpError } from '../_shared/http.ts';
import { type ServiceRole, serviceRole } from '../_shared/serviceRole.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import {
   type AmazonIssue,
   applySubmission,
   type ListingStatusDeps,
   type ListingStatusTarget,
   refreshListingStatus,
   type RefreshOptions,
   setListingState,
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
   target: ListingStatusTarget,
   options?: RefreshOptions
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
   /** Cells set to draft because their customer's account is not connected (N2). */
   skipped: number;
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

/** The account cannot serve the cell: not connected, or its grant was revoked (N2). */
const disconnected = (error: unknown) =>
   error instanceof HttpError &&
   (error.message === 'amazon_not_connected' || error.message === 'amazon_connection_revoked');

/** Moves a cell to the back of the queue. */
const stamp = async (db: Db, cell: { id: string; tenant_id: string }, at: number) => {
   const { error } = await db
      .from('market_cell')
      .update({ listing_checked_at: new Date(at).toISOString() })
      .eq('id', cell.id)
      .eq('tenant_id', cell.tenant_id);
   if (error) throw error;
};

/** Throttling, Amazon 5xx and network errors pass by themselves; the rest (revoked...) will not. */
const transient = (error: unknown) => {
   if (error instanceof AmazonError) return error.status === 429 || error.status >= 500;
   return !(error instanceof HttpError);
};

/** Marks a submission failed and its cell `issues` (the RPC writes the open_issue from the issue). */
const giveUp = async (service: ServiceRole, submissionId: string) => {
   await applySubmission(service, submissionId, 'failed', null, [GIVE_UP_ISSUE], 'issues', null);
};

export async function pollSubmitted(
   deps: PollDeps,
   now: () => number = Date.now
): Promise<PollResult> {
   const { admin, env, amazon } = deps;
   const refresh = deps.refresh ?? refreshListingStatus;
   // No actor: the poll's writes keep its amazon-poll label.
   const service = serviceRole(admin);
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
   let skipped = 0;
   for (const cell of cells) {
      if (now() - started >= POLL_BUDGET_MS) break;
      try {
         const { cell: updated, submission } = await refresh(
            { db: admin, service, env, amazon },
            { tenantId: cell.tenant_id, cellId: cell.id },
            { skipDone: true }
         );
         if (
            updated.listing_state === 'submitted' &&
            submission.status === 'processing' &&
            stale(submission.created_at, now())
         ) {
            await giveUp(service, submission.id);
            givenUp += 1;
         } else if (updated.listing_state === 'submitted' && submission.status !== 'processing') {
            // Not asked (settled, or a removal): to the back of the queue, so it starves no one.
            await stamp(admin, cell, now());
         }
         polled += 1;
      } catch (error) {
         if (disconnected(error)) {
            try {
               await setListingState(service, cell.id, 'draft', null);
               skipped += 1;
               continue;
            } catch (inner) {
               error = inner;
            }
         }
         failed += 1;
         console.error(`amazon-poll failed: ${failedCode(error)}`);
         // The check stamp moves the cell to the back of the queue, so failing cells never starve the rest.
         try {
            await stamp(admin, cell, now());
         } catch (inner) {
            console.error(`amazon-poll stamp failed: ${failedCode(inner)}`);
         }
         // A cell that keeps failing for good must not wait forever either.
         if (transient(error)) continue;
         try {
            const latest = (await submissionsOf(admin, cell.tenant_id, cell.id))[0];
            if (
               latest &&
               latest.kind !== 'delete' &&
               (latest.status === 'processing' || latest.status === 'accepted') &&
               stale(latest.created_at, now())
            ) {
               await giveUp(service, latest.id);
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
      skipped,
      remaining: Math.max(0, total - polled - failed - skipped)
   };
}
