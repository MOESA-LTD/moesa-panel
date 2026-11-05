<script setup lang="ts">
import {
   asIdMap,
   idMapCsv,
   transferRecordCount,
   useTransfer,
   type TransferReport,
   type TransferRow
} from '@/api/transfer';
import TransferFilesNotice from '@/components/service-components/transfer/TransferFilesNotice.vue';
import dayjs from 'dayjs';

// The run's result: how many records it wrote (the report's count, as the confirm said), its ID map to download and its files. The row is
// read again as the target tenant (it belongs to the target), so a retried file copy shows here.
const props = defineProps<{
   transfer: TransferRow;
   report: TransferReport;
   /** The target tenant, which the transfer row belongs to. */
   target: string;
}>();

const { data: current } = useTransfer(
   () => props.transfer.id,
   () => props.target
);
const row = computed(() => current.value ?? props.transfer);

const idMap = computed(() => asIdMap(row.value.id_map));
const count = computed(() => transferRecordCount(props.report));

const downloadIdMap = () => {
   // With a byte order mark, so spreadsheets read the file as UTF-8 (as the product export).
   const blob = new Blob([String.fromCharCode(0xfeff), idMapCsv(idMap.value)], {
      type: 'text/csv;charset=utf-8'
   });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = `transfer_${props.report.customer.code}_${dayjs().format('YYYYMMDD')}.csv`;
   link.click();
   URL.revokeObjectURL(url);
};
</script>

<template>
   <div class="flex flex-col gap-4">
      <Message severity="success" data-done>
         {{ $t('ops.transfer.result.done', { count }) }}
      </Message>
      <div>
         <Button
            :label="$t('ops.transfer.result.id_map')"
            :icon="PrimeIcons.DOWNLOAD"
            variant="outlined"
            data-id-map
            @click="downloadIdMap"
         />
      </div>
      <TransferFilesNotice :transfer="row" />
   </div>
</template>
