<script setup>
import { useLookup } from '@/api/useLookup';

const props = defineProps({
   category: {
      type: String,
      default: null,
      required: false
   },
   showEdit: {
      type: Boolean,
      default: true
   },
   showAdd: {
      type: Boolean,
      default: true
   },
   select: {
      type: String,
      default: 'id,display_name, categories:product_category!inner(id,display_name)'
   }
});

defineOptions({
   inheritAttrs: false
});

const modelValue = defineModel('modelValue');

const categories = computed(() => props.category?.split?.('|').filter(Boolean) || []);

const { data: products, suspense } = useLookup('product', () => ({
   select: props.select,
   order: 'display_name',
   in: { column: 'product_category.display_name', values: categories.value }
}));
await suspense();
</script>

<template>
   <InputGroup :class="$attrs.class">
      <Select
         :filter="true"
         :options="products ?? []"
         option-label="display_name"
         option-value="id"
         v-bind="_omit($attrs, ['class'])"
         v-model:model-value="modelValue"
         :placeholder="$t('product.select_product')"
      />
      <InputGroupAddon
         v-if="showEdit && $can('read', 'product') && (!!modelValue?.id || !!modelValue)"
      >
         <RouterLink
            :to="{
               name: 'product-edit',
               params: { id: modelValue?.id || modelValue },
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button size="small" severity="info" :icon="PrimeIcons.PENCIL" @click="navigate" />
         </RouterLink>
      </InputGroupAddon>
      <InputGroupAddon v-if="showAdd && $can('create', 'product')">
         <RouterLink
            :to="{
               name: 'product-add',
               params: { category },
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button size="small" severity="success" :icon="PrimeIcons.PLUS" @click="navigate" />
         </RouterLink>
      </InputGroupAddon>
   </InputGroup>
</template>
