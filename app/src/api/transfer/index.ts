import { forTenant } from '@/api/formTenant';
import { MEDIA_BUCKET } from '@/api/media';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { serializeCsv } from '@/lib/csv/serialize';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

// --- types ---

export type TransferMode = 'copy' | 'move';

/** The decisions a conflict may offer (042, private.transfer_report). */
export const TRANSFER_ACTIONS = ['map', 'new_code', 'clear_gtin', 'skip', 'demote'] as const;
export type TransferAction = (typeof TRANSFER_ACTIONS)[number];

/**
 * The conflicts the rehearsal reports (042). A kind the app does not know yet is read as
 * 'unknown', so a newer database does not break the report.
 */
export const TRANSFER_CONFLICT_KINDS = [
   'customer_code',
   'supplier_code',
   'code',
   'sku',
   'gtin',
   'customer_contact',
   'customer_warehouse',
   'customer_brand',
   'platform_account',
   'market_cell',
   'document_version',
   'media_link'
] as const;
export type TransferConflictKind = (typeof TRANSFER_CONFLICT_KINDS)[number] | 'unknown';

export type TransferDecision = { action: TransferAction; target_id?: string; code?: string };
/** Keyed by the conflict's key (`<table>:<source_id>`). */
export type TransferDecisions = Record<string, TransferDecision>;

const isTransferAction = (action: string): action is TransferAction =>
   (TRANSFER_ACTIONS as readonly string[]).includes(action);

const conflictSchema = z.object({
   key: z.string(),
   kind: z.enum([...TRANSFER_CONFLICT_KINDS, 'unknown']).catch('unknown'),
   table: z.string(),
   source_id: z.string(),
   label: z.string().nullable(),
   existing_id: z.string().nullable(),
   // An action the app does not know is dropped: it cannot be offered.
   actions: z.array(z.string()).transform((actions) => actions.filter(isTransferAction)),
   // Only on a conflict that offers skip: what the skip drops with the row, {table: count}.
   skip_drops: z.record(z.string(), z.number()).optional(),
   // On a customer or supplier code conflict: the typed new code, which another package row of the
   // table keeps (the run refuses it, so the conflict is unresolved).
   taken_code: z.string().optional()
});
export type TransferConflict = z.infer<typeof conflictSchema>;

export const transferReportSchema = z.object({
   customer: z.object({ id: z.string(), code: z.string(), display_name: z.string() }),
   path: z.enum(['cheap', 'copy']),
   mode: z.enum(['copy', 'move']),
   counts: z.record(z.string(), z.number()),
   conflicts: z.array(conflictSchema),
   // The users of a user column who are not members of the target (Call 7).
   users: z.array(
      z.object({
         user_id: z.string(),
         display_name: z.string().nullable(),
         columns: z.array(z.string()),
         rows: z.number()
      })
   ),
   // A row referring across the package boundary; source_id is null for a table without id. The
   // referred row: its table (refers_to), id, and label when it is a package row.
   left_behind: z.array(
      z.object({
         table: z.string(),
         source_id: z.string().nullable(),
         column: z.string(),
         label: z.string().nullable(),
         refers_to: z.string(),
         refers_to_id: z.string(),
         refers_to_label: z.string().nullable()
      })
   ),
   // The products the target's settings would hold back (Call 10); rule 'spec_sheet_required'.
   settings_gaps: z.array(
      z.object({
         rule: z.string(),
         table: z.string(),
         source_id: z.string(),
         label: z.string().nullable()
      })
   ),
   /** How many files (media and thumbnails) the run copies. */
   files: z.number(),
   /** How many conflicts have no valid decision. */
   unresolved: z.number(),
   report_hash: z.string()
});
export type TransferReport = z.infer<typeof transferReportSchema>;

export type TransferRow = Tables['transfer']['Row'];
export type TransferFile = { media_id: string; from: string; to: string; keep_source: boolean };
/** {table: {source id: target id}}. */
export type TransferIdMap = Record<string, Record<string, string>>;

export type TransferOptions = {
   source_writable: boolean;
   targets: { id: string; display_name: string; same_company: boolean; refusal: string | null }[];
};

export type TransferArgs = {
   source_tenant: string;
   target_tenant: string;
   customer_id: string;
   mode: TransferMode;
   decisions: TransferDecisions;
   product_ids: string[] | null;
};

// --- narrowing of the Json columns ---

export const transferIdMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
export const transferFilesSchema = z.array(
   z.object({ media_id: z.string(), from: z.string(), to: z.string(), keep_source: z.boolean() })
);

/** The transfer's id_map; a malformed column throws a ZodError instead of being read silently. */
export const asIdMap = (json: Json): TransferIdMap => transferIdMapSchema.parse(json);

/** The transfer's files; a malformed column throws a ZodError. */
export const asTransferFiles = (json: Json): TransferFile[] => transferFilesSchema.parse(json);

/**
 * The rehearsal's report (or a transfer's report column). Unknown conflict kinds and actions do
 * not fail it (see conflictSchema); a report of another shape throws a ZodError.
 */
export const asTransferReport = (json: Json): TransferReport => transferReportSchema.parse(json);

/**
 * How many records a transfer writes: the sum of the report's counts, which leave out skipped and
 * mapped rows (042). The confirm and the result both show it; the ID map has no entry for a table
 * without ids, and holds the mapped rows, so it does not count them.
 */
export const transferRecordCount = (report: Pick<TransferReport, 'counts'>): number =>
   Object.values(report.counts).reduce((sum, count) => sum + count, 0);

// --- requests ---

/**
 * The targets of a transfer out of `sourceTenant`. Given the customer, a refusal about it comes
 * too (transfer_files_pending: an earlier transfer into it still copies files).
 */
export async function fetchTransferOptions(
   sourceTenant: string,
   customerId: string | null = null
): Promise<TransferOptions> {
   // The generated Args type has no null for the defaulted parameter; null is its default.
   const { data } = await supabase
      .rpc('transfer_options', { source_tenant: sourceTenant, customer_id: customerId as string })
      .throwOnError();
   return data as TransferOptions;
}

// The generated Args type has no null for the defaulted parameters; null is their default.
const transferCall = (args: TransferArgs, dryRun: boolean, reportHash: string | null) =>
   supabase
      .rpc('transfer_customer', {
         source_tenant: args.source_tenant,
         target_tenant: args.target_tenant,
         customer_id: args.customer_id,
         mode: args.mode,
         decisions: args.decisions as Json,
         dry_run: dryRun,
         report_hash: reportHash as string,
         product_ids: args.product_ids as string[]
      })
      .throwOnError();

/** The dry run: the report, nothing written. */
export async function rehearseTransfer(args: TransferArgs): Promise<TransferReport> {
   const { data } = await transferCall(args, true, null);
   return asTransferReport(data);
}

/** The run, refused unless `reportHash` is the hash of the report the run would build now. */
export async function runTransfer(args: TransferArgs, reportHash: string): Promise<TransferRow> {
   const { data } = await transferCall(args, false, reportHash);
   return data as unknown as TransferRow;
}

const REMOVE_BATCH = 1000;

/** Storage's answer when the target object is there already (409 Duplicate). */
const alreadyExists = (error: { message?: string; statusCode?: string | number }) =>
   /already exists/i.test(error.message ?? '') || String(error.statusCode) === '409';

/**
 * Copies the transfer's files to their target paths, then checks them (transfer_check_files).
 * While the files are pending it copies every entry, afterwards only the missing ones. A failed
 * copy is logged, never thrown: the check lists it in missing_files and a retry copies it again.
 * Only a move whose files are all there ('done') removes the sources, and only those not shared
 * with the source (keep_source false); a failed removal leaves an unreachable object, logged.
 */
export async function copyTransferFiles(transfer: TransferRow): Promise<TransferRow> {
   const files = asTransferFiles(transfer.files);
   const missing = new Set(transfer.missing_files);
   const toCopy =
      transfer.files_status === 'pending' ? files : files.filter(({ to }) => missing.has(to));
   const bucket = supabase.storage.from(MEDIA_BUCKET);

   const failed: { file: TransferFile; error: unknown }[] = [];
   for (const file of toCopy) {
      if (file.from === file.to) continue;
      try {
         const { error } = await bucket.copy(file.from, file.to);
         if (error && !alreadyExists(error)) failed.push({ file, error });
      } catch (error) {
         failed.push({ file, error });
      }
   }
   if (failed.length) console.warn('Transfer files not copied', transfer.id, failed);

   const { data } = await supabase
      .rpc('transfer_check_files', { transfer_id: transfer.id })
      .throwOnError();
   const checked = data as TransferRow;

   if (checked.mode === 'move' && checked.files_status === 'done') {
      const sources = files
         .filter(({ keep_source, from, to }) => !keep_source && from !== to)
         .map(({ from }) => from);
      // Storage deletes at most 1000 objects per request.
      for (let start = 0; start < sources.length; start += REMOVE_BATCH) {
         try {
            const { error } = await bucket.remove(sources.slice(start, start + REMOVE_BATCH));
            if (error) console.warn('Transfer source files left in storage', transfer.id, error);
         } catch (error) {
            console.warn('Transfer source files left in storage', transfer.id, error);
         }
      }
   }

   return checked;
}

/** The ID map as CSV: `table,source_id,target_id`, by table, then source id. No BOM. */
export function idMapCsv(idMap: TransferIdMap): string {
   const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
   const rows = Object.entries(idMap)
      .sort(([a], [b]) => byText(a, b))
      .flatMap(([table, ids]) =>
         Object.entries(ids)
            .sort(([a], [b]) => byText(a, b))
            .map(([sourceId, targetId]) => [table, sourceId, targetId])
      );
   return serializeCsv(['table', 'source_id', 'target_id'], rows);
}

// --- hooks ---

/** Marks stale every query reading any of the tenants (a key holds the tenants read, joined). */
const invalidateTenants = (queryClient: QueryClient, tenantIds: readonly string[]) =>
   queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
         queryKey[0] === 'tenant' &&
         typeof queryKey[1] === 'string' &&
         queryKey[1].split(',').some((id) => tenantIds.includes(id))
   });

/** The candidate targets of a transfer of `customerId` out of `sourceTenant`. */
export function useTransferOptions(
   sourceTenant: MaybeRefOrGetter<string | null>,
   customerId: MaybeRefOrGetter<string | null> = null
) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'transfer', {
            view: 'options',
            sourceTenant: toValue(sourceTenant),
            customerId: toValue(customerId)
         })
      ),
      queryFn: () => fetchTransferOptions(toValue(sourceTenant)!, toValue(customerId)),
      enabled: computed(() => !!toValue(sourceTenant))
   });
}

/** The dry run, as a mutation: each rehearsal is asked for, never cached. */
export function useRehearseTransfer() {
   return useMutation({ mutationFn: rehearseTransfer });
}

/**
 * The run, then the file copy. The run has committed once it returns, so a failed copy or check
 * returns the run's row (files pending; a retry copies them) instead of failing the mutation.
 * Both tenants' queries go stale.
 */
export function useRunTransfer() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ args, reportHash }: { args: TransferArgs; reportHash: string }) => {
         const transfer = await runTransfer(args, reportHash);
         try {
            return await copyTransferFiles(transfer);
         } catch (error) {
            console.warn('Transfer files not checked', transfer.id, error);
            return transfer;
         }
      },
      onSettled: (_data, _error, { args }) =>
         invalidateTenants(queryClient, [args.source_tenant, args.target_tenant])
   });
}

/** Copies the missing files of a transfer again and checks them. */
export function useRetryTransferFiles() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: copyTransferFiles,
      onSuccess: () => invalidateTables(queryClient, ['transfer'])
   });
}

/**
 * One transfer row. The row belongs to the target tenant (its tenant_id), which the tenants read
 * now (the source, where a transfer starts) usually leave out: it is read, and keyed, as the
 * target alone.
 */
export function useTransfer(
   id: MaybeRefOrGetter<string | null>,
   targetTenant: MaybeRefOrGetter<string | null>
) {
   return useQuery({
      queryKey: computed(() => queryKeys.detail(toValue(targetTenant), 'transfer', toValue(id))),
      queryFn: async ({ signal }) => {
         const { data } = await forTenant(
            supabase.from('transfer').select('*').eq('id', toValue(id)!).abortSignal(signal),
            toValue(targetTenant)
         )
            .maybeSingle()
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(id) && !!toValue(targetTenant))
   });
}

/** The transfers into a customer whose files are not all copied yet, newest first. */
export function usePendingTransfers(customerId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'transfer', {
            view: 'pending',
            customerId: toValue(customerId)
         })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('transfer')
            .select('*')
            .eq('target_customer_id', toValue(customerId)!)
            .neq('files_status', 'done')
            .order('created_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(customerId))
   });
}
