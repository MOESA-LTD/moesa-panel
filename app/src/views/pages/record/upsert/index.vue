<script setup lang="ts">
import {
   createRecordSchema,
   toRecordFormValues,
   toRecordPayload,
   useRecord,
   useSaveRecord,
   type RecordStock,
   type RecordWithRelations
} from '@/api/record';
import { useUpsertForm } from '@/composables/useUpsertForm';
import AssembleForm from './AssembleForm.vue';
import RecordForm from './RecordForm.vue';
import { provideRecordForm } from './recordFormContext';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new record. */
   data?: Partial<RecordWithRelations> | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, row, draft } =
   useUpsertForm({
      id: () => props.id ?? props.data?.id,
      prefill: () => props.data,
      useRow: useRecord,
      useSaveRow: useSaveRecord,
      subject: 'record',
      // Limits depend on the selected stock.
      schema: () =>
         createRecordSchema({
            maxQuantity: availableQuantity.value,
            unitType: selectedStock.value?.unit_type
         }),
      toFormValues: toRecordFormValues,
      toPayload: toRecordPayload
   });
await ready;

const selectedStock = computed(() => values.value.stock as RecordStock | undefined);

/** Stock still available, plus what this record already uses when it keeps the same stock. */
const availableQuantity = computed(() => {
   const stock = selectedStock.value;
   const ownQuantity =
      stock?.id && stock.id === row.value?.stock_id ? Number(row.value?.quantity ?? 0) : 0;
   const quantity = _round(Number(stock?.available_quantity ?? 0) + ownQuantity, 2);
   return stock?.unit_type === 'pcs' ? Math.floor(quantity) : quantity;
});

provideRecordForm({ values, errors, availableQuantity });
</script>
<template>
   <div class="card p-0">
      <Tabs value="record" class="w-full">
         <TabList>
            <Tab value="record">{{ $t('record.tab.record') }}</Tab>
            <Tab value="earmold">{{ $t('record.tab.ear_device') }}</Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="record">
               <FormBox
                  @reset="() => reset()"
                  :dirty="isDirty"
                  :submitting="isSubmitting"
                  :draft
                  :readonly
                  @submit="save"
               >
                  <RecordForm :readonly />
               </FormBox>
            </TabPanel>
            <TabPanel value="earmold">
               <FormBox
                  @reset="() => reset()"
                  :dirty="isDirty"
                  :submitting="isSubmitting"
                  :readonly
                  @submit="save"
               >
                  <AssembleForm :readonly />
               </FormBox>
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
