<script setup lang="ts">
import { useLookup } from '@/api/useLookup';
import type { ProductRow } from '@/api/product';

/** Picks the parent of a variant among the same customer's other products. */
type ProductOption = Pick<ProductRow, 'id' | 'sku' | 'display_name'>;

const props = defineProps<{ customerId?: string | null; productId?: string | null }>();
const model = defineModel<string | null>();

const { data: products } = useLookup<ProductOption>(
   'product',
   () => ({
      select: 'id, sku, display_name',
      order: 'sku',
      in: { column: 'customer_id', values: [props.customerId] }
   }),
   () => !!props.customerId
);

const options = computed(() =>
   (products.value ?? [])
      .filter((product) => product.id !== props.productId)
      .map((product) => ({
         value: product.id,
         label: [product.sku, product.display_name].filter(Boolean).join(' — ')
      }))
);
</script>
<template>
   <Select
      v-model="model"
      :options
      option-value="value"
      option-label="label"
      filter
      showClear
      :placeholder="$t('ops.product.select')"
   />
</template>
