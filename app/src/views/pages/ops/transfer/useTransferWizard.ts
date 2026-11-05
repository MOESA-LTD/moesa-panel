import {
   useRehearseTransfer,
   useRunTransfer,
   useTransferOptions,
   type TransferArgs,
   type TransferDecision,
   type TransferDecisions,
   type TransferMode,
   type TransferReport,
   type TransferRow
} from '@/api/transfer';
import { NAMED_ERRORS } from '@/lib/form/postgrestErrors';
import i18n from '@plugins/i18n';
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

export type TransferStep = 'target' | 'report' | 'result';

/** JSON with every object's keys sorted, so the same decisions read the same in any order. */
const stableStringify = (value: unknown): string =>
   JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
         ? Object.fromEntries(
              Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
                 a < b ? -1 : a > b ? 1 : 0
              )
           )
         : item
   );

/** The text of a failed rehearsal or run: a named transfer error by its message, else as is. */
export const transferErrorText = (error: unknown): string => {
   const { message } = (error ?? {}) as { message?: string };
   const named = NAMED_ERRORS.find(({ name }) => message?.includes(name));
   if (named) return i18n.t(named.message);
   if (message && i18n.te(`errors.${message}`)) return i18n.t(`errors.${message}`);
   return message || i18n.t('errors.unknown');
};

export type TransferWizardOptions = {
   sourceTenant: MaybeRefOrGetter<string | null>;
   customerId: MaybeRefOrGetter<string | null>;
   /** The products to transfer; null transfers the whole customer. */
   productIds: MaybeRefOrGetter<string[] | null>;
};

/**
 * The state of the transfer dialog: the target and mode, the decisions on the conflicts and the
 * rehearsal's report. A run sends the hash of the last report, so it is offered only while the
 * report still describes what would run: no change since the rehearsal, no conflict left open,
 * and, in a move, nothing left behind (the server refuses that move).
 */
export function useTransferWizard({ sourceTenant, customerId, productIds }: TransferWizardOptions) {
   const { data: options, isLoading: optionsLoading } = useTransferOptions(
      sourceTenant,
      customerId
   );
   const { mutateAsync: rehearseTransfer, isPending: rehearsing } = useRehearseTransfer();
   const { mutateAsync: runTransfer, isPending: running } = useRunTransfer();

   const step = ref<TransferStep>('target');
   const target = ref<string | null>(null);
   const mode = ref<TransferMode>('copy');
   const decisions = ref<TransferDecisions>({});
   const report = ref<TransferReport | null>(null);
   const transfer = ref<TransferRow | null>(null);

   const snapshot = () =>
      stableStringify({ target: target.value, mode: mode.value, decisions: decisions.value });
   /** The text of the last failed rehearsal or run; cleared by the next attempt. */
   const error = ref<string | null>(null);
   /** What the last rehearsal was asked with; null before one. */
   const rehearsedWith = ref<string | null>(null);

   const sourceWritable = computed(() => options.value?.source_writable !== false);
   const targetOption = computed(
      () => options.value?.targets.find(({ id }) => id === target.value) ?? null
   );

   // A read-only source cannot lose its rows: only a copy.
   watch(
      [sourceWritable, mode],
      ([writable]) => {
         if (!writable && mode.value !== 'copy') mode.value = 'copy';
      },
      { immediate: true, flush: 'sync' }
   );

   // Another target or mode is another package: its conflicts, and so its decisions, differ.
   watch(
      [target, mode],
      () => {
         decisions.value = {};
         report.value = null;
         rehearsedWith.value = null;
         error.value = null;
         if (step.value === 'report') step.value = 'target';
      },
      { flush: 'sync' }
   );

   const stale = computed(() => rehearsedWith.value !== null && rehearsedWith.value !== snapshot());

   /** A move that would leave links in the source: the server refuses it (transfer_product_in_use). */
   const moveBlocked = computed(
      () => mode.value === 'move' && !!report.value && report.value.left_behind.length > 0
   );

   /**
    * The code conflicts given the same new code as another of their table. The rehearsal checks
    * each decision alone, so it reports them resolved; the run refuses them (transfer_code_invalid).
    */
   const duplicateCodes = computed(() => {
      const byCode = new Map<string, string[]>();
      for (const { key, kind, table } of report.value?.conflicts ?? []) {
         if (kind !== 'customer_code' && kind !== 'supplier_code') continue;
         const decision = decisions.value[key];
         if (decision?.action !== 'new_code' || !decision.code) continue;
         const group = `${table}:${decision.code}`;
         byCode.set(group, [...(byCode.get(group) ?? []), key]);
      }
      return new Set([...byCode.values()].filter((keys) => keys.length > 1).flat());
   });

   const canRehearse = computed(
      () =>
         !!toValue(sourceTenant) &&
         !!toValue(customerId) &&
         !!targetOption.value &&
         !targetOption.value.refusal &&
         !rehearsing.value &&
         !running.value
   );

   const canRun = computed(
      () =>
         !!report.value &&
         report.value.unresolved === 0 &&
         !stale.value &&
         !moveBlocked.value &&
         duplicateCodes.value.size === 0 &&
         !rehearsing.value &&
         !running.value
   );

   const decide = (key: string, decision: TransferDecision | null) => {
      const next = { ...decisions.value };
      if (decision) next[key] = decision;
      else delete next[key];
      decisions.value = next;
   };

   const args = (): TransferArgs => ({
      source_tenant: toValue(sourceTenant)!,
      target_tenant: target.value!,
      customer_id: toValue(customerId)!,
      mode: mode.value,
      decisions: decisions.value,
      product_ids: toValue(productIds)?.length ? [...toValue(productIds)!] : null
   });

   const rehearse = async () => {
      if (!canRehearse.value) return;
      const asked = snapshot();
      error.value = null;
      let result: TransferReport;
      try {
         result = await rehearseTransfer(args());
      } catch (failure) {
         // Shown in the dialog; rethrown for the app's error toast.
         error.value = transferErrorText(failure);
         throw failure;
      }
      report.value = result;
      rehearsedWith.value = asked;
      step.value = 'report';
   };

   const run = async () => {
      if (!canRun.value || !report.value) throw new Error('The transfer is not ready to run');
      error.value = null;
      let row: TransferRow;
      try {
         row = await runTransfer({ args: args(), reportHash: report.value.report_hash });
      } catch (failure) {
         error.value = transferErrorText(failure);
         throw failure;
      }
      transfer.value = row;
      step.value = 'result';
      return row;
   };

   return {
      options,
      optionsLoading,
      sourceWritable,
      targetOption,
      step,
      target,
      mode,
      decisions,
      report,
      transfer,
      stale,
      moveBlocked,
      duplicateCodes,
      error,
      canRehearse,
      canRun,
      rehearsing,
      running,
      decide,
      rehearse,
      run
   };
}

export type TransferWizard = ReturnType<typeof useTransferWizard>;
