<script setup lang="ts">
import type { ProductRow } from '@/api/product';
import { useLookup } from '@/api/useLookup';

/**
 * Picks one of the customer's products for an order line; archived products are left out (the
 * selected one is kept, so a saved line still shows it). A pick by the user also emits the product
 * with its purchase price.
 */
type LineProductOption = Pick<
   ProductRow,
   'id' | 'sku' | 'display_name' | 'status' | 'purchase_price' | 'purchase_currency'
>;

const props = defineProps<{ customerId?: string | null }>();
const model = defineModel<string | null>();
const emit = defineEmits<{ pick: [product: LineProductOption | null] }>();

const { data: products } = useLookup<LineProductOption>(
   'product',
   () => ({
      select: 'id, sku, display_name, status, purchase_price, purchase_currency',
      order: 'sku',
      in: { column: 'customer_id', values: [props.customerId] }
   }),
   () => !!props.customerId
);

const options = computed(() =>
   (products.value ?? [])
      .filter((product) => product.status !== 'archived' || product.id === model.value)
      .map((product) => ({
         value: product.id,
         label: [product.sku, product.display_name].filter(Boolean).join(' — ')
      }))
);

const onChange = ({ value }: { value: string | null }) =>
   emit('pick', products.value?.find((product) => product.id === value) ?? null);
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
      @change="onChange"
   />
</template>
