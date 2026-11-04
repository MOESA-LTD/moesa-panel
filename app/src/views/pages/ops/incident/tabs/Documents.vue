<script setup lang="ts">
import { incidentResource } from '@/api/incident';

// The incident's documents (photos of the damage, the carrier's report, the platform's notice...),
// named after its code. The incident comes from the card's cached query; a saved incident always
// has its code (set by the database).
const props = defineProps<{ id: string }>();

const { data: incident } = incidentResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="incident?.code"
      entityType="incident"
      :entityId="id"
      :code="incident.code"
      :customerId="incident.customer_id"
   />
</template>
