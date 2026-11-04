<script setup lang="ts">
import {
   purchaseOrderUpdateResource,
   purchaseOrderUpdateSchema,
   toPurchaseOrderUpdateFormValues,
   toPurchaseOrderUpdatePayload
} from '@/api/purchaseOrder';
import { useUpsertForm } from '@/composables/useUpsertForm';
import dayjs from 'dayjs';

// Opened as a dialog from an order's production log: a new entry belongs to the route's order.
// Its author is set by the database (created_by).
const props = defineProps<{
   id?: string | null;
   purchaseOrderId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({
         purchase_order_id: props.purchaseOrderId ?? undefined,
         // Today, as the user's calendar has it.
         happened_on: dayjs().format('YYYY-MM-DD')
      }),
      useRow: purchaseOrderUpdateResource.useOne,
      useSaveRow: purchaseOrderUpdateResource.useSave,
      subject: 'purchase_order_update',
      schema: purchaseOrderUpdateSchema,
      toFormValues: toPurchaseOrderUpdateFormValues,
      // Every add dialog shares one draft, so a new entry takes the order from the route.
      toPayload: (data) =>
         toPurchaseOrderUpdatePayload(
            data.id || !props.purchaseOrderId
               ? data
               : { ...data, purchase_order_id: props.purchaseOrderId }
         )
   });
await ready;
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField
            fluid
            :label="$t('ops.purchase_order.production.fields.happened_on')"
            :error="errors.happened_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.happened_on || null"
               @update:model-value="values.happened_on = $event as Date"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.purchase_order.production.fields.note')"
            :error="errors.note"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.note" auto-resize rows="4" />
         </FormField>
      </FormBox>
   </div>
</template>
