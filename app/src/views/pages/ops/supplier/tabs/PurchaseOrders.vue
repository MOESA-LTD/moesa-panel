<script setup lang="ts">
// The supplier's purchase order history (M2), read-only here; each order opens its own card.
const props = defineProps<{ id: string }>();
</script>

<template>
   <PurchaseOrderTable :filters="{ supplierId: props.id }" />
</template>
