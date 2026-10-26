<script setup>
import { useLookup } from '@/api/useLookup';

const props = defineProps({
   select: {
      type: String,
      default: '*'
   }
});
defineEmits(['brand']);

const { data: productBrands, suspense } = useLookup('product_brands', () => ({
   select: props.select,
   order: 'display_name'
}));
await suspense();
</script>

<template>
   <Select
      :filter="true"
      :options="productBrands ?? []"
      option-label="display_name"
      option-value="display_name"
      @value-change="
         $emit(
            'brand',
            (productBrands ?? []).find(
               (brand) => _get(brand, $attrs.optionValue || 'display_name') == $event
            )
         )
      "
      :placeholder="$t('input.select_or_write')"
   />
</template>
