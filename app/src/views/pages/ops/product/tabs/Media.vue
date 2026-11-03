<script setup lang="ts">
import { productResource } from '@/api/product';

// The product's images and files, in the product's own tenant and offered from its customer's
// library. The product comes from the card's cached query.
const props = defineProps<{ id: string }>();

const { data: product } = productResource.useOne(() => props.id);
</script>

<template>
   <EntityMedia
      v-if="product"
      entityType="product"
      :entityId="id"
      :customerId="product.customer_id"
      :tenantId="product.tenant_id"
   />
</template>
