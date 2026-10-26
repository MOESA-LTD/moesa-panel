<script setup>
import { useLookup } from '@/api/useLookup';
import { PRODUCT_CATEGORY_PROPS } from '@/constants/form/product';

const props = defineProps({
   select: {
      type: String,
      default: '*'
   }
});

const { data: categories, suspense } = useLookup('product_category', () => ({
   select: props.select,
   order: 'display_name'
}));
await suspense();
</script>

<template>
   <MultiSelect
      :filter="true"
      :options="categories ?? []"
      option-label="display_name"
      option-value="display_name"
      display="chip"
      :placeholder="$t('product.category.select_category')"
   >
      <template #value="{ value }">
         <Tag
            v-for="category in value"
            :value="$t(`fields.${_snakeCase(category?.display_name) || category || ''}`)"
            :key="category"
            v-bind="PRODUCT_CATEGORY_PROPS[category?.display_name || category]"
         />
      </template>
      <template #option="{ option }">
         <Tag
            :value="$t(`fields.${_snakeCase(option?.display_name) || option || ''}`)"
            v-bind="PRODUCT_CATEGORY_PROPS[option?.display_name || option]"
         />
      </template>
   </MultiSelect>
</template>
