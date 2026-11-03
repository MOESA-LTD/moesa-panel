<script setup lang="ts">
import type { ProductRow } from '@/api/product';
import Cost from './tabs/Cost.vue';
import Dimensions from './tabs/Dimensions.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Media from './tabs/Media.vue';
import {
   PRODUCT_CARD_TABS,
   PRODUCT_FORM,
   tabForField,
   useProductForm,
   type ProductCardTab
} from './useProductForm';

// The product card's tabs around its one form, which the general, dimensions and cost tabs share.
// Manage re-creates the card when a new product is saved, so the form goes on under its id.
const props = defineProps<{ id: string | null }>();
const emit = defineEmits<{ saved: [product: ProductRow] }>();

const activeTab = defineModel<ProductCardTab>('tab', { default: 'general' });

const form = useProductForm(
   () => props.id,
   (product) => emit('saved', product)
);
await form.ready;

/** Saves; when a field is invalid, opens the tab that shows the first one. */
const submit = async () => {
   await form.save();
   const [first] = Object.keys(form.errors.value);
   if (first) activeTab.value = tabForField(first.split('.')[0]);
};

provide(PRODUCT_FORM, { ...form, submit });
</script>

<template>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab
            v-for="key in PRODUCT_CARD_TABS"
            :key
            :value="key"
            :disabled="key !== 'general' && !id"
         >
            {{ $t(`ops.product.tabs.${key}`) }}
         </Tab>
      </TabList>
      <TabPanels>
         <TabPanel value="general">
            <General />
         </TabPanel>
         <TabPanel value="dimensions">
            <Dimensions v-if="id" />
         </TabPanel>
         <TabPanel value="cost">
            <Cost v-if="id" />
         </TabPanel>
         <TabPanel value="documents">
            <Documents v-if="id && activeTab === 'documents'" :id />
         </TabPanel>
         <TabPanel value="media">
            <Media v-if="id && activeTab === 'media'" :id />
         </TabPanel>
      </TabPanels>
   </Tabs>
</template>
