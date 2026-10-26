<script setup>
import { useLookup } from '@/api/useLookup';

const props = defineProps({
   select: {
      type: String,
      default: '*',
      required: false
   }
});

const { data: vendors, suspense } = useLookup('stock_vendor', () => ({
   select: props.select,
   order: 'display_name'
}));
await suspense();
</script>

<template>
   <Select
      filter
      :options="vendors ?? []"
      option-label="display_name"
      option-value="display_name"
      editable
      :placeholder="$t('input.select_or_write')"
   />
</template>
