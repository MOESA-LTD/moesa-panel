<script setup lang="ts">
import { useRetryTransferFiles, type TransferRow } from '@/api/transfer';
import { transferErrorText } from '@/views/pages/ops/transfer/useTransferWizard';

// The file status of a transfer (its files are copied after the run): pending, partly copied or
// done, with a retry of the copy until every file is there.
const props = defineProps<{
   transfer: TransferRow;
   /** Says what the notice is about, where the transfer itself is not on screen. */
   heading?: boolean;
}>();

const { t } = useI18n();
const { mutateAsync: retryFiles, isPending: retrying } = useRetryTransferFiles();

const done = computed(() => props.transfer.files_status === 'done');

const statusText = computed(() => {
   const status = props.transfer.files_status;
   if (status === 'partial') {
      const count = props.transfer.missing_files.length;
      return t('ops.transfer.files.partial', { count }, count);
   }
   return t(`ops.transfer.files.${status === 'done' ? 'done' : 'pending'}`);
});

/** The text of the last failed retry; cleared by the next one. */
const error = ref<string | null>(null);

const retry = async () => {
   error.value = null;
   try {
      await retryFiles(props.transfer);
   } catch (failure) {
      // Shown here; rethrown for the app's error toast.
      error.value = transferErrorText(failure);
      throw failure;
   }
};
</script>

<template>
   <Message :severity="done ? 'success' : 'warn'">
      <div class="flex flex-col gap-2">
         <span v-if="heading" class="font-semibold" data-files-heading>
            {{ $t('ops.transfer.files.notice') }}
         </span>
         <span data-files-status>{{ statusText }}</span>
         <span v-if="!done" data-retry>
            <Button
               :label="$t('ops.transfer.files.retry')"
               :icon="PrimeIcons.REFRESH"
               size="small"
               outlined
               :loading="retrying"
               @click="retry"
            />
         </span>
         <small v-if="error" class="text-red-500" data-files-error>{{ error }}</small>
      </div>
   </Message>
</template>
