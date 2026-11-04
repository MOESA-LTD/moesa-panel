<script setup lang="ts">
import { glossaryKey, type GlossaryEnum } from '@/api/glossary';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

// The statuses a record may move to, one button each, cancelling last. Each move is confirmed
// first, with the status's warning when there is one. The database decides: a refused move shows
// its rule (errors.<code>) as a toast. Used by purchase orders and shipments.
const props = defineProps<{
   /** The record's status now. */
   current: string;
   /** Where it may go next (e.g. nextPurchaseOrderStatuses). */
   next: readonly string[];
   /** Where the status labels are: `${i18nPrefix}.${status}`. */
   i18nPrefix: string;
   /** The glossary enum of the statuses: each button shows the status's line as a tooltip. */
   glossary?: GlossaryEnum;
   /** A warning shown in the confirmation of a status, e.g. a missing PSI before the balance. */
   warnings?: Partial<Record<string, string>>;
   /**
    * Offers no move, e.g. while the card has unsaved edits: a move reloads the record, and saving
    * the stale form afterwards would overwrite what the database set. The card says why.
    */
   disabled?: boolean;
   /** Makes the move; a rejection is the database's refusal. */
   onChange: (status: string) => Promise<unknown>;
}>();

const { t, te } = useI18n();
const confirm = useConfirm();
const toast = useToast();

// One dialog per instance, apart from the app's own (ungrouped) confirmations.
const group = `status-actions-${useId()}`;

const statuses = computed(() => [
   ...props.next.filter((status) => status !== 'cancelled'),
   ...props.next.filter((status) => status === 'cancelled')
]);

const statusLabel = (status: string) => t(`${props.i18nPrefix}.${status}`);

const tip = (status: string) => {
   if (!props.glossary) return undefined;
   const key = glossaryKey(props.glossary, status);
   return te(key) ? t(key) : undefined;
};

const busy = ref(false);
/** The status the open dialog is for. */
const target = ref<string | null>(null);
const warning = computed(() => (target.value ? props.warnings?.[target.value] : undefined));

const change = async (status: string) => {
   busy.value = true;
   try {
      await props.onChange(status);
   } catch (error) {
      // The rule the database refused it by, e.g. errors.po_lines_required.
      return appErrorHandler(error);
   } finally {
      busy.value = false;
   }
   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: statusLabel(status),
      detail: t('status_actions.done')
   });
};

const ask = (status: string) => {
   target.value = status;
   confirm.require({
      group,
      header: statusLabel(props.current),
      message: t('status_actions.confirm', { status: statusLabel(status) }),
      acceptProps: {
         label: statusLabel(status),
         severity: status === 'cancelled' ? 'danger' : undefined,
         outlined: true
      },
      rejectProps: { label: t('action.no'), severity: 'secondary', outlined: true },
      accept: () => change(status)
   });
};
</script>

<template>
   <Button
      v-for="status in statuses"
      :key="status"
      v-tooltip.top="tip(status)"
      :data-status="status"
      :label="statusLabel(status)"
      :severity="status === 'cancelled' ? 'danger' : undefined"
      :variant="status === 'cancelled' ? 'text' : 'outlined'"
      :loading="busy && target === status"
      :disabled="busy || disabled"
      size="small"
      @click="ask(status)"
   />
   <ConfirmDialog :group :draggable="false">
      <template #message="{ message }">
         <div class="flex flex-col gap-3">
            <span>{{ message.message }}</span>
            <Message v-if="warning" severity="warn" data-test="status-warning">
               {{ warning }}
            </Message>
         </div>
      </template>
   </ConfirmDialog>
</template>
