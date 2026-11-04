<script setup lang="ts">
// The product's purchase orders and shipments (M3), read-only: the card's one form stays in the
// general, dimensions and cost tabs. Each order or shipment opens its own card.
const props = defineProps<{ id: string }>();
</script>

<template>
   <div class="flex flex-col gap-4">
      <section v-if="$can('read', 'purchase_order')" data-test="product-orders">
         <h3 class="m-0 mb-2 text-lg font-semibold">{{ $t('ops.purchase_order.title') }}</h3>
         <PurchaseOrderTable :filters="{ productId: props.id }" />
      </section>
      <section v-if="$can('read', 'shipment')" data-test="product-shipments">
         <h3 class="m-0 mb-2 text-lg font-semibold">{{ $t('ops.shipment.title') }}</h3>
         <ShipmentTable :filters="{ productId: props.id }" />
      </section>
   </div>
</template>
