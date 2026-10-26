<script setup lang="ts">
import {
   productRepository,
   productSchema,
   toProductFormValues,
   toProductPayload,
   useProduct,
   useSaveProduct,
   type Product
} from '@/api/product';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new product. */
   data?: Partial<Product> | null;
   /** Category names (joined with "|") a new product is created in, e.g. from a stock list. */
   category?: string | null;
}>();

const categoryNames = props.category?.split('|').filter(Boolean) ?? [];
const presetCategories =
   !props.id && categoryNames.length ? await productRepository.categoriesByName(categoryNames) : [];

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready } = useUpsertForm({
   id: () => props.id ?? props.data?.id,
   prefill: () => ({ ...props.data, categories: presetCategories }),
   useRow: useProduct,
   useSaveRow: useSaveProduct,
   subject: 'product',
   schema: productSchema,
   toFormValues: toProductFormValues,
   toPayload: toProductPayload,
   // Products without a tenant are shared catalogue entries and cannot be edited.
   lockRow: (product) => !product.tenant_id
});
await ready;
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :readonly
      >
         <FormField
            class="flex-[0.8]"
            :readonly
            fluid
            :error="errors.display_name"
            :label="$t('fields.name')"
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.display_name" />
            </template>
         </FormField>
         <FormField
            class="flex-[0.8]"
            :disabled="readonly"
            fluid
            :error="errors.brand"
            :label="$t('fields.brand')"
         >
            <template #default="slotProps">
               <SelectProductBrand v-bind="slotProps" v-model="values.brand" editable />
            </template>
         </FormField>
         <FormField
            class="flex-[0.8]"
            :readonly
            fluid
            :error="errors.categories"
            :label="$t('fields.categories')"
         >
            <template #default="slotProps">
               <SelectProductCategory
                  v-bind="slotProps"
                  v-model="values.categories"
                  :disabled="readonly || !!category"
                  :option-value="null"
               />
            </template>
         </FormField>
         <FormField
            class="!flex-auto !max-w-full w-full h-fit"
            :readonly
            fluid
            :error="errors.details"
            :label="$t('fields.details')"
         >
            <template #default="slotProps">
               <Editor v-bind="slotProps" v-model="values.details" />
            </template>
         </FormField>
      </FormBox>
   </div>
</template>
