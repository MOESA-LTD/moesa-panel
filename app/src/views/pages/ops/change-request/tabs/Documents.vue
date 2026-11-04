<script setup lang="ts">
import { changeRequestResource } from '@/api/changeRequest';

// The request's documents (the customer's written approval among them), named after its code. The
// request comes from the card's cached query; a saved request always has its code (set by the
// database).
const props = defineProps<{ id: string }>();

const { data: cr } = changeRequestResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="cr?.code"
      entityType="change_request"
      :entityId="id"
      :code="cr.code"
      :customerId="cr.customer_id"
   />
</template>
