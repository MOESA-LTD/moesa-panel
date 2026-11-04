<script setup lang="ts">
import {
   defaultUnitPrice,
   purchaseOrderLineResource,
   purchaseOrderLineSchema,
   purchaseOrderResource,
   toPurchaseOrderLineFormValues,
   toPurchaseOrderLinePayload,
   useEntityDocumentOptions
} from '@/api/purchaseOrder';
import { useUpsertForm } from '@/composables/useUpsertForm';
import ProductSelect from './ProductSelect.vue';

// Opened as a dialog from an order's lines: a new line belongs to the route's order and goes last.
// The product is one of the order's customer's, and its spec sheet one of its signed or approved
// versions, the newest preselected.
const props = defineProps<{
   id?: string | null;
   purchaseOrderId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft, row } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ purchase_order_id: props.purchaseOrderId ?? undefined }),
      useRow: purchaseOrderLineResource.useOne,
      useSaveRow: purchaseOrderLineResource.useSave,
      subject: 'purchase_order_line',
      schema: purchaseOrderLineSchema,
      toFormValues: toPurchaseOrderLineFormValues,
      // Every add dialog shares one draft, so a new line takes the order from the route.
      toPayload: (data) =>
         toPurchaseOrderLinePayload(
            data.id || !props.purchaseOrderId
               ? data
               : { ...data, purchase_order_id: props.purchaseOrderId, position: nextPosition() }
         )
   });

// The order: its customer's products, its currency and its lines (the card's cached query).
const orderId = computed(() => props.purchaseOrderId ?? row.value?.purchase_order_id ?? null);
const { data: order, suspense } = purchaseOrderResource.useOne(orderId);

await ready;
if (orderId.value) await suspense();

const nextPosition = () =>
   Math.max(0, ...(order.value?.purchase_order_line ?? []).map((line) => line.position)) + 1;

// A new line, or a line whose product was changed here, gets the newest spec sheet preselected; a
// saved line keeps what it has.
const preselectSpec = ref(!props.id);

/** A picked product's purchase price, in the order's currency, fills an empty unit price. */
const onProductPicked = (product: Parameters<typeof defaultUnitPrice>[0] | null) => {
   values.value.spec_document_id = null;
   preselectSpec.value = true;
   if (!product || !order.value) return;
   if (values.value.unit_price === null || values.value.unit_price === undefined)
      values.value.unit_price = defaultUnitPrice(product, order.value.currency);
};

const specOptions = useEntityDocumentOptions(() => ({
   entityType: 'product',
   entityId: values.value.product_id ?? null,
   type: 'spec_sheet',
   statuses: ['signed', 'approved']
}));

// The newest version is listed first.
watch(
   specOptions,
   (options) => {
      if (preselectSpec.value && !values.value.spec_document_id && options[0])
         values.value.spec_document_id = options[0].value;
   },
   { immediate: true }
);
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
            :label="$t('ops.purchase_order.fields.product')"
            :error="errors.product_id"
            :readonly
            v-slot="slotProps"
         >
            <ProductSelect
               v-bind="slotProps"
               v-model="values.product_id"
               :customerId="order?.customer_id"
               @pick="onProductPicked"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.spec_document')"
            :error="errors.spec_document_id"
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.spec_document_id"
               :options="specOptions"
               option-value="value"
               option-label="label"
               showClear
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.quantity')"
            :error="errors.quantity"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.quantity" :min="1" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.unit_price')"
            :error="errors.unit_price"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values.unit_price"
               :min="0"
               :minFractionDigits="2"
               :maxFractionDigits="4"
               :suffix="order?.currency ? ` ${order.currency}` : undefined"
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
