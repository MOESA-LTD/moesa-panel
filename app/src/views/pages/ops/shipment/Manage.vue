<script setup lang="ts">
import { shipmentResource } from '@/api/shipment';
import ShipmentCard from './ShipmentCard.vue';
import { SHIPMENT_CARD_TABS, type ShipmentCardTab } from './useShipmentForm';

// The shipment card. Orders, events, documents and the rest belong to a saved shipment, so their
// tabs open once the general tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
}>();

const route = useRoute();

// A new shipment gets its id when saved, while the dialog keeps its route.
const shipmentId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (shipmentId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the card reuses the cached query.
const { suspense } = shipmentResource.useOne(shipmentId);
if (shipmentId.value) await suspense();

const fromRoute = (): ShipmentCardTab =>
   SHIPMENT_CARD_TABS.find(
      (key) => route.name === `ops-shipment-manage-${key}` || props.tab === key
   ) ?? 'general';

// Kept here, so the tab stays open when the card is re-created for a saved shipment.
const activeTab = ref<ShipmentCardTab>(shipmentId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id re-creates the card under the saved shipment.
const onSaved = (id: string) => (shipmentId.value = id);
</script>

<template>
   <div class="card p-0">
      <!-- Keyed on the id: a saved new shipment gets a form (and draft) of its own. -->
      <ShipmentCard
         :key="shipmentId ?? 'new'"
         :id="shipmentId"
         v-model:tab="activeTab"
         @saved="onSaved($event.id)"
      />
   </div>
</template>
