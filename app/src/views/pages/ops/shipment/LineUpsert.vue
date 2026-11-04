<script setup lang="ts">
import {
   remainingQuantity,
   shipmentLineResource,
   shipmentLineSchema,
   shipmentResource,
   toShipmentLineFormValues,
   toShipmentLinePayload,
   type ShipmentStatus
} from '@/api/shipment';
import { useLookup } from '@/api/useLookup';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a shipment's orders: a new line puts the route's order line (query
// purchaseOrderLineId) on the route's shipment. Its quantity starts at what may still be shipped
// of the order line, its tolerance included, less what the other shipments that are not cancelled
// carry (shipment_quantity_exceeds_po); then the cartons.
const props = defineProps<{
   id?: string | null;
   shipmentId?: string | null;
   purchaseOrderLineId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft, row } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({
         shipment_id: props.shipmentId ?? undefined,
         purchase_order_line_id: props.purchaseOrderLineId ?? undefined
      }),
      useRow: shipmentLineResource.useOne,
      useSaveRow: shipmentLineResource.useSave,
      subject: 'shipment_line',
      schema: shipmentLineSchema,
      toFormValues: toShipmentLineFormValues,
      // Every add dialog shares one draft, so a new line takes the shipment and the order line
      // from the route.
      toPayload: (data) =>
         toShipmentLinePayload(
            data.id || !props.shipmentId || !orderLine.value
               ? data
               : {
                    ...data,
                    shipment_id: props.shipmentId,
                    purchase_order_id: orderLine.value.order.id,
                    purchase_order_line_id: orderLine.value.line.id
                 }
         )
   });

// The shipment, with its orders and their lines (the card's cached query).
const shipmentId = computed(() => props.shipmentId ?? row.value?.shipment_id ?? null);
const { data: shipment, suspense } = shipmentResource.useOne(shipmentId);

await ready;

const lineId = computed(
   () => props.purchaseOrderLineId ?? values.value.purchase_order_line_id ?? null
);

/** The order line and its order, as the shipment card loaded them. */
const orderLine = computed(() => {
   for (const { purchase_order: order } of shipment.value?.shipment_purchase_order ?? []) {
      const line = order?.purchase_order_line.find(({ id }) => id === lineId.value);
      if (order && line) return { order, line };
   }
   return null;
});

// Every add dialog shares one draft. A draft left from another order line keeps nothing of it.
const isNew = !props.id;
if (isNew && props.shipmentId && props.purchaseOrderLineId) {
   if (
      values.value.purchase_order_line_id &&
      values.value.purchase_order_line_id !== props.purchaseOrderLineId
   ) {
      values.value.quantity = null;
      values.value.carton_count = null;
   }
   values.value.shipment_id = props.shipmentId;
   values.value.purchase_order_line_id = props.purchaseOrderLineId;
}
if (shipmentId.value) await suspense();
if (isNew && orderLine.value) values.value.purchase_order_id = orderLine.value.order.id;

type ShippedLine = {
   quantity: number;
   shipment_id: string;
   shipment: { status: ShipmentStatus } | null;
};

const { data: shipped } = useLookup<ShippedLine>(
   'shipment_line',
   () => ({
      select: 'quantity, shipment_id, shipment!shipment_line_shipment_fkey(status)',
      in: { column: 'purchase_order_line_id', values: lineId.value ? [lineId.value] : [] }
   }),
   () => !!lineId.value
);

/** What may still go on this shipment; null until the other shipments are known. */
const remaining = computed(() => {
   if (!orderLine.value || !shipped.value) return null;
   const elsewhere = shipped.value
      .filter(
         (line) => line.shipment_id !== shipmentId.value && line.shipment?.status !== 'cancelled'
      )
      .reduce((sum, line) => sum + line.quantity, 0);
   return remainingQuantity(
      orderLine.value.line.quantity,
      orderLine.value.order.tolerance_pct,
      elsewhere
   );
});

// A new line starts at what remains; a quantity already typed (or restored) is kept.
watch(
   remaining,
   (count) => {
      if (
         isNew &&
         count !== null &&
         (values.value.quantity === null || values.value.quantity === undefined)
      )
         values.value.quantity = count;
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
         <p v-if="orderLine" class="m-0 w-full" data-test="order-line">
            <span class="font-semibold">{{ orderLine.order.code }}</span>
            · {{ orderLine.line.product?.sku }} {{ orderLine.line.product?.display_name }} ·
            {{ $t('ops.shipment.fields.ordered') }}: {{ orderLine.line.quantity }}
         </p>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.quantity')"
            :error="errors.quantity"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.quantity" :min="1" />
            <small v-if="remaining !== null" class="text-muted-color" data-test="remaining">
               {{ $t('ops.shipment.remaining', { count: remaining }) }}
            </small>
         </FormField>
         <FormField
            fluid
            :label="$t('ops.shipment.fields.carton_count')"
            :error="errors.carton_count"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.carton_count" :min="0" />
         </FormField>
      </FormBox>
   </div>
</template>
