<script setup lang="ts">
import { productResource } from '@/api/product';
import Cost from './tabs/Cost.vue';
import Dimensions from './tabs/Dimensions.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';

// The product card. Dimensions, cost and documents belong to a saved product, so their tabs open
// once the general tab has saved it. The general, dimensions and cost tabs edit the same row, so
// only the open one is mounted (see useProductForm).
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();

// A new product gets its id when saved, while the dialog keeps its route.
const productId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (productId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the tabs reuse the cached query.
const { data: product, suspense } = productResource.useOne(productId);
if (productId.value) await suspense();

const TABS = ['general', 'dimensions', 'cost', 'documents'] as const;
type TabKey = (typeof TABS)[number];

const fromRoute = (): TabKey =>
   TABS.find((key) => route.name === `ops-product-manage-${key}` || props.tab === key) ?? 'general';

const activeTab = ref<TabKey>(productId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id unlocks the other tabs.
const onSaved = (id: string) => (productId.value = id);

const title = computed(() =>
   product.value
      ? [product.value.sku, product.value.display_name].filter(Boolean).join(' — ')
      : null
);
</script>

<template>
   <div class="card p-0">
      <h2 v-if="title" class="m-4 mb-0 text-xl font-semibold" v-text="title" />
      <Tabs v-model:value="activeTab">
         <TabList>
            <Tab v-for="key in TABS" :key :value="key" :disabled="key !== 'general' && !productId">
               {{ $t(`ops.product.tabs.${key}`) }}
            </Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="general">
               <General
                  v-if="activeTab === 'general'"
                  :id="productId"
                  @saved="onSaved($event.id)"
               />
            </TabPanel>
            <TabPanel value="dimensions">
               <Dimensions v-if="productId && activeTab === 'dimensions'" :id="productId" />
            </TabPanel>
            <TabPanel value="cost">
               <Cost v-if="productId && activeTab === 'cost'" :id="productId" />
            </TabPanel>
            <TabPanel value="documents">
               <Documents v-if="productId && activeTab === 'documents'" :id="productId" />
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
