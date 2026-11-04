<script setup lang="ts">
import { purchaseOrderResource } from '@/api/purchaseOrder';

// The order's images and files, in the order's own tenant and offered from its customer's library.
// The order comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: order } = purchaseOrderResource.useOne(() => props.id);
</script>

<template>
   <EntityMedia
      v-if="order"
      entityType="purchase_order"
      :entityId="id"
      :customerId="order.customer_id"
      :tenantId="order.tenant_id"
   />
</template>
