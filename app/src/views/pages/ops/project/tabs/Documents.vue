<script setup lang="ts">
import { projectResource } from '@/api/project';

// The project's documents, named after its code. The project comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: project } = projectResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="project"
      entityType="project"
      :entityId="id"
      :code="project.code ?? ''"
      :customerId="project.customer_id"
   />
</template>
