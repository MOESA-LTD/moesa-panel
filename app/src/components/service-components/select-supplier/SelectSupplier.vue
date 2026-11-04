<script setup lang="ts">
import { useLookup } from '@/api/useLookup';

/**
 * Picks a supplier by id; suppliers are shared, so every customer's forms see them all. A pick by
 * the user also emits the supplier with its order defaults (incoterm, deposit rate).
 */
type SupplierOption = Pick<
   Tables['supplier']['Row'],
   'id' | 'code' | 'display_name' | 'default_incoterm' | 'deposit_rate'
>;

const model = defineModel<string | null>();
const emit = defineEmits<{ pick: [supplier: SupplierOption | null] }>();

const { data: suppliers } = useLookup<SupplierOption>('supplier', {
   select: 'id, code, display_name, default_incoterm, deposit_rate',
   order: 'code'
});

const options = computed(() =>
   (suppliers.value ?? []).map((supplier) => ({
      value: supplier.id,
      label: `${supplier.code} — ${supplier.display_name}`
   }))
);

const onChange = ({ value }: { value: string | null }) =>
   emit('pick', suppliers.value?.find((supplier) => supplier.id === value) ?? null);
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
      @change="onChange"
   />
</template>
