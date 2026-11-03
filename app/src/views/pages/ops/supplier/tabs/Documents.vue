<script setup lang="ts">
import { supplierResource } from '@/api/supplier';

// The supplier's documents, named after its code. The supplier comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: supplier } = supplierResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments v-if="supplier" entityType="supplier" :entityId="id" :code="supplier.code" />
</template>
