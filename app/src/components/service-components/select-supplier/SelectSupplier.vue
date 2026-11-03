<script setup lang="ts">
import { useLookup } from '@/api/useLookup';

/** Picks a supplier by id; suppliers are shared, so every customer's forms see them all. */
type SupplierOption = Pick<Tables['supplier']['Row'], 'id' | 'code' | 'display_name'>;

const model = defineModel<string | null>();

const { data: suppliers } = useLookup<SupplierOption>('supplier', {
   select: 'id, code, display_name',
   order: 'code'
});

const options = computed(() =>
   (suppliers.value ?? []).map((supplier) => ({
      value: supplier.id,
      label: `${supplier.code} — ${supplier.display_name}`
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
      :placeholder="$t('ops.supplier.select')"
   />
</template>
