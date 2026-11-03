<script setup lang="ts">
import { customerResource } from '@/api/customer';

// The customer's images and files (logos, evidence...), in the customer's own tenant. The customer
// comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: customer } = customerResource.useOne(() => props.id);
</script>

<template>
   <EntityMedia
      v-if="customer"
      entityType="customer"
      :entityId="id"
      :customerId="customer.id"
      :tenantId="customer.tenant_id"
   />
</template>
