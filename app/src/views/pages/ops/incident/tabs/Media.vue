<script setup lang="ts">
import { incidentResource } from '@/api/incident';

// The incident's photos and files, in the incident's own tenant and offered from its customer's
// library. The incident comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: incident } = incidentResource.useOne(() => props.id);
</script>

<template>
   <EntityMedia
      v-if="incident"
      entityType="incident"
      :entityId="id"
      :customerId="incident.customer_id"
      :tenantId="incident.tenant_id"
   />
</template>
