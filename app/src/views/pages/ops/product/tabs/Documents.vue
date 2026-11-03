<script setup lang="ts">
import { productResource } from '@/api/product';

// The product's documents (spec sheet, compliance...), named after its SKU. The product comes from
// the card's cached query.
const props = defineProps<{ id: string }>();

const { data: product } = productResource.useOne(() => props.id);
</script>

<template>
   <EntityDocuments
      v-if="product"
      entityType="product"
      :entityId="id"
      :code="product.sku"
      :customerId="product.customer_id"
   />
</template>
