<script setup lang="ts">
import { purchaseOrderResource } from '@/api/purchaseOrder';
import PurchaseOrderCard from './PurchaseOrderCard.vue';
import { PO_CARD_TABS, type PurchaseOrderCardTab } from './usePurchaseOrderForm';

// The purchase order card. Lines, documents and the rest belong to a saved order, so their tabs
// open once the general tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
   /** A new order's customer and project, from a project's link (the route's query). */
   customer_id?: string | null;
   project_id?: string | null;
}>();

const route = useRoute();

// A new order gets its id when saved, while the dialog keeps its route.
const orderId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (orderId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the card reuses the cached query.
const { suspense } = purchaseOrderResource.useOne(orderId);
if (orderId.value) await suspense();

const fromRoute = (): PurchaseOrderCardTab =>
   PO_CARD_TABS.find(
      (key) => route.name === `ops-purchase-order-manage-${key}` || props.tab === key
   ) ?? 'general';

// Kept here, so the tab stays open when the card is re-created for a saved order.
const activeTab = ref<PurchaseOrderCardTab>(orderId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id re-creates the card under the saved order.
const onSaved = (id: string) => (orderId.value = id);
</script>

<template>
   <div class="card p-0">
      <!-- Keyed on the id: a saved new order gets a form (and draft) of its own. -->
      <PurchaseOrderCard
         :key="orderId ?? 'new'"
         :id="orderId"
         :link="{ customerId: props.customer_id, projectId: props.project_id }"
         v-model:tab="activeTab"
         @saved="onSaved($event.id)"
      />
   </div>
</template>
