<script setup lang="ts">
import { useProjectOperations } from '@/api/project';

// The shipments of the project's purchase orders (read-only here; each opens its own card).
// Without orders the table shows that there are none, never every shipment.
const props = defineProps<{ id: string }>();

const { purchaseOrderIds } = useProjectOperations(() => props.id);
</script>

<template>
   <ShipmentTable :filters="{ purchaseOrderIds }" />
</template>
