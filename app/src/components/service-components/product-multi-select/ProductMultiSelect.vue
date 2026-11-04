<script setup lang="ts">
import type { ProductRow } from '@/api/product';
import { useLookup } from '@/api/useLookup';

/**
 * Picks several of the customer's products by id, labelled `SKU — name`; archived products are
 * left out unless already picked.
 */
type ProductOption = Pick<ProductRow, 'id' | 'sku' | 'display_name' | 'status'>;

const props = defineProps<{ customerId: string | null }>();
const model = defineModel<string[]>({ default: () => [] });

const { data: products } = useLookup<ProductOption>(
   'product',
   () => ({
      select: 'id, sku, display_name, status',
      order: 'sku',
      in: { column: 'customer_id', values: [props.customerId] }
   }),
   () => !!props.customerId
);

const options = computed(() =>
   (products.value ?? [])
      .filter((product) => product.status !== 'archived' || model.value.includes(product.id))
      .map((product) => ({
         value: product.id,
         label: [product.sku, product.display_name].filter(Boolean).join(' — ')
      }))
);
</script>

<template>
   <MultiSelect
      v-model="model"
      :options
      option-value="value"
      option-label="label"
      filter
      display="chip"
      :placeholder="$t('ops.product.select')"
   />
</template>
