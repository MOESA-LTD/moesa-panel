<script setup lang="ts">
import PurchaseOrderTable from '@/components/service-components/purchase-order-table/PurchaseOrderTable.vue';

// Every purchase order of the customer the lists are filtered by (every customer's when none is).
// A new order is added from the menu's context menu.
</script>

<template>
   <section class="flex flex-col gap-4 p-4">
      <h2 class="m-0 text-xl font-semibold">{{ $t('ops.purchase_order.title') }}</h2>
      <PurchaseOrderTable />
   </section>
</template>
