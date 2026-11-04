<script setup lang="ts">
import ShipmentTable from '@/components/service-components/shipment-table/ShipmentTable.vue';

// Every shipment of the customer the lists are filtered by (every customer's when none is).
// A new shipment is added from the menu's context menu.
</script>

<template>
   <section class="flex flex-col gap-4 p-4">
      <h2 class="m-0 text-xl font-semibold">{{ $t('ops.shipment.title') }}</h2>
      <ShipmentTable />
   </section>
</template>
