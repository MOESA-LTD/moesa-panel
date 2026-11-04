<script setup lang="ts">
import { purchaseOrderResource } from '@/api/purchaseOrder';

// The order's documents (PI, packing instructions...), named after its code. The order comes from
// the card's cached query; a saved order always has its code (set by the database).
const props = defineProps<{ id: string }>();

const { data: order } = purchaseOrderResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="order?.code"
      entityType="purchase_order"
      :entityId="id"
      :code="order.code"
      :customerId="order.customer_id"
   />
</template>
