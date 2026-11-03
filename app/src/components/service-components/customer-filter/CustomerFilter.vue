<script setup lang="ts">
export type CustomerOption = { id: string; code: string; display_name: string };

// Picks the customer the operations lists are narrowed to; cleared, it shows all customers.
defineProps<{ options: CustomerOption[] }>();
const customerId = defineModel<string | null>({ default: null });

const optionLabel = (option: CustomerOption) => `${option.code} — ${option.display_name}`;
</script>

<template>
   <Select
      v-model="customerId"
      :options="options"
      :option-label="optionLabel"
      option-value="id"
      show-clear
      filter
      :placeholder="$t('ops.customer_filter.all')"
   />
</template>
