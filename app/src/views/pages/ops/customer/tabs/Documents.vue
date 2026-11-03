<script setup lang="ts">
import { customerResource } from '@/api/customer';

// The customer's documents, named after its code. The customer comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: customer } = customerResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="customer"
      entityType="customer"
      :entityId="id"
      :code="customer.code"
      :customerId="customer.id"
   />
</template>
