<script setup lang="ts">
import { useLookup } from '@/api/useLookup';

type CustomerOption = Pick<Tables['customer']['Row'], 'id' | 'code' | 'display_name' | 'status'>;

/** Picks a customer by id. */
const props = defineProps<{
   /** Leaves out closed customers (the selected one is kept, so a saved record still shows it). */
   hideClosed?: boolean;
}>();
const model = defineModel<string | null>();

const { data: customers } = useLookup<CustomerOption>('customer', {
   select: 'id, code, display_name, status',
   order: 'code'
});

const options = computed(() =>
   (customers.value ?? [])
      .filter(
         (customer) =>
            !props.hideClosed || customer.status !== 'closed' || customer.id === model.value
      )
      .map((customer) => ({
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
