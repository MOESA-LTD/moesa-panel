<script setup lang="ts">
import StockTable from '../StockTable.vue';
</script>
<template>
   <StockTable
      category="device"
      i18n-key="device"
      state-key="device"
      :fields="['display_name', 'serial_number', 'unit_cost', 'vendor', 'stocked_at']"
   />
</template>
