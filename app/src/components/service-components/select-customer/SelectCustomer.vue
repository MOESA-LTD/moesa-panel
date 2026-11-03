<script setup lang="ts">
import { useCustomerOptions } from '@/store/customerFilter/useCustomerOptions';

/** Picks a customer by id. */
const model = defineModel<string | null>();

const { data: customers } = useCustomerOptions();

const options = computed(() =>
   (customers.value ?? []).map((customer) => ({
      value: customer.id,
      label: `${customer.code} — ${customer.display_name}`
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
      :placeholder="$t('ops.customer.select')"
   />
</template>
