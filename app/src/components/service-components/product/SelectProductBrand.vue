<script setup>
import Collection from '@/lib/Collection';
const props = defineProps({
   select: {
      type: String,
      default: '*'
   }
});
defineEmits(['brand']);

const useProductBrands = () => {
   const productBrands = Collection.create([]);
   const fetchProductBrands = async () => {
      const { data } = await supabase.from('product_brands').select(props.select);
      productBrands._setDefaults(data)._reset();
   };
   return {
      productBrands,
      fetchProductBrands
   };
};

const { productBrands, fetchProductBrands } = useProductBrands();
await fetchProductBrands();

onMounted(() => emitter.on('product-update', fetchProductBrands));
onUnmounted(() => emitter.off('product-update', fetchProductBrands));
</script>

<template>
   <Select
      :filter="true"
      :options="productBrands._data"
      option-label="display_name"
      option-value="display_name"
      @value-change="
         $emit(
            'brand',
            productBrands._data.find(
               (brand) => _get(brand, $attrs.optionValue || 'display_name') == $event
            )
         )
      "
      :placeholder="$t('input.select_or_write')"
   />
</template>
