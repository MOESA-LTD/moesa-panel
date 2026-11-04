<script setup lang="ts">
import {
   PAYMENT_KINDS,
   PAYMENT_PAYERS,
   purchaseOrderPaymentResource,
   purchaseOrderPaymentSchema,
   purchaseOrderResource,
   toPurchaseOrderPaymentFormValues,
   toPurchaseOrderPaymentPayload
} from '@/api/purchaseOrder';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from an order's payments: a new payment belongs to the route's order and
// starts in its currency. Its paid date is what the deposit and balance gates look at.
const props = defineProps<{
   id?: string | null;
   purchaseOrderId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft, row } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ purchase_order_id: props.purchaseOrderId ?? undefined }),
      useRow: purchaseOrderPaymentResource.useOne,
      useSaveRow: purchaseOrderPaymentResource.useSave,
      subject: 'purchase_order_payment',
      schema: purchaseOrderPaymentSchema,
      toFormValues: toPurchaseOrderPaymentFormValues,
      // Every add dialog shares one draft, so a new payment takes the order from the route.
      toPayload: (data) =>
         toPurchaseOrderPaymentPayload(
            data.id || !props.purchaseOrderId
               ? data
               : { ...data, purchase_order_id: props.purchaseOrderId }
         )
   });

const orderId = computed(() => props.purchaseOrderId ?? row.value?.purchase_order_id ?? null);
const { data: order, suspense } = purchaseOrderResource.useOne(orderId);

await ready;
if (orderId.value) await suspense();

// A new payment is in the order's currency unless one was chosen.
if (!props.id && !values.value.currency && order.value?.currency)
   values.value.currency = order.value.currency;

const setDate = (field: 'planned_on' | 'paid_on', value: unknown) =>
   (values.value[field] = (value as Date | null) ?? null);
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
            :label="$t('ops.purchase_order.payment.fields.kind')"
            :error="errors.kind"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.kind"
               :values="PAYMENT_KINDS"
               i18n-prefix="ops.purchase_order.payment.kind"
               glossary="payment_kind"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.payment.fields.amount')"
            :error="errors.amount"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values.amount"
               :min="0"
               :minFractionDigits="2"
               :maxFractionDigits="2"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.currency')"
            :error="errors.currency"
            :readonly
            v-slot="slotProps"
         >
            <SelectCurrency v-bind="slotProps" v-model="values.currency" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.payment.fields.planned_on')"
            :error="errors.planned_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.planned_on || null"
               @update:model-value="setDate('planned_on', $event)"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.payment.fields.paid_on')"
            :error="errors.paid_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.paid_on || null"
               @update:model-value="setDate('paid_on', $event)"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.payment.fields.paid_by')"
            :error="errors.paid_by"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.paid_by"
               :values="PAYMENT_PAYERS"
               i18n-prefix="ops.purchase_order.payment.payer"
            />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.purchase_order.fields.notes')"
            :error="errors.notes"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
         </FormField>
      </FormBox>
   </div>
</template>
