<script setup lang="ts">
import { productResource } from '@/api/product';
import ProductCard from './ProductCard.vue';
import { PRODUCT_CARD_TABS, type ProductCardTab } from './useProductForm';

// The product card. Dimensions, cost and documents belong to a saved product, so their tabs open
// once the general tab has saved it.
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

// Loaded here so the route's Suspense waits for it; the card reuses the cached query.
const { data: product, suspense } = productResource.useOne(productId);
if (productId.value) await suspense();

const fromRoute = (): ProductCardTab =>
   PRODUCT_CARD_TABS.find(
      (key) => route.name === `ops-product-manage-${key}` || props.tab === key
   ) ?? 'general';

// Kept here, so the tab stays open when the card is re-created for a saved product.
const activeTab = ref<ProductCardTab>(productId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id re-creates the card under the saved product.
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
      <!-- Keyed on the id: a saved new product gets a form (and draft) of its own. -->
      <ProductCard
         :key="productId ?? 'new'"
         :id="productId"
         v-model:tab="activeTab"
         @saved="onSaved($event.id)"
      />
   </div>
</template>
