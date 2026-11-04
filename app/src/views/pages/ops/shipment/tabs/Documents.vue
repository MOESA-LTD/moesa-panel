<script setup lang="ts">
import { shipmentResource } from '@/api/shipment';

// The shipment's documents (CI, packing list, B/L or CMR, certificates, the delivery receipt...),
// named after its code. The shipment comes from the card's cached query; a saved shipment always
// has its code (set by the database).
const props = defineProps<{ id: string }>();

const { data: shipment } = shipmentResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="shipment?.code"
      entityType="shipment"
      :entityId="id"
      :code="shipment.code"
      :customerId="shipment.customer_id"
   />
</template>
