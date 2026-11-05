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
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

export type TransferStep = 'target' | 'report' | 'result';

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
   const { data: options, isLoading: optionsLoading } = useTransferOptions(sourceTenant);
   const { mutateAsync: rehearseTransfer, isPending: rehearsing } = useRehearseTransfer();
   const { mutateAsync: runTransfer, isPending: running } = useRunTransfer();

   const step = ref<TransferStep>('target');
   const target = ref<string | null>(null);
   const mode = ref<TransferMode>('copy');
   const decisions = ref<TransferDecisions>({});
   const report = ref<TransferReport | null>(null);
   const transfer = ref<TransferRow | null>(null);

   const snapshot = () =>
      JSON.stringify({ target: target.value, mode: mode.value, decisions: decisions.value });
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
         if (step.value === 'report') step.value = 'target';
      },
      { flush: 'sync' }
   );

   const stale = computed(() => rehearsedWith.value !== null && rehearsedWith.value !== snapshot());

   /** A move that would leave links in the source: the server refuses it (transfer_product_in_use). */
   const moveBlocked = computed(
      () => mode.value === 'move' && !!report.value && report.value.left_behind.length > 0
   );

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
      const result = await rehearseTransfer(args());
      report.value = result;
      rehearsedWith.value = asked;
      step.value = 'report';
   };

   const run = async () => {
      if (!canRun.value || !report.value) throw new Error('The transfer is not ready to run');
      const row = await runTransfer({ args: args(), reportHash: report.value.report_hash });
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
