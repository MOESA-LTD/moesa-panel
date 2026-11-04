<script setup lang="ts">
import { shipmentResource } from '@/api/shipment';

// The shipment's photos and files (loading, seals, damage...), in the shipment's own tenant and
// offered from its customer's library. The shipment comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: shipment } = shipmentResource.useOne(() => props.id);
</script>

<template>
   <EntityMedia
      v-if="shipment"
      entityType="shipment"
      :entityId="id"
      :customerId="shipment.customer_id"
      :tenantId="shipment.tenant_id"
   />
</template>
