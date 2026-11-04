<script setup lang="ts">
import { incidentResource } from '@/api/incident';
import IncidentCard from './IncidentCard.vue';
import { INCIDENT_CARD_TABS, type IncidentCardTab } from './useIncidentForm';

// The incident card. The log, deadlines, closure, documents and media belong to a saved incident,
// so their tabs open once the general tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
   /** A new incident's customer and linked record, from a project's link (the route's query). */
   customer_id?: string | null;
   entity_type?: string | null;
   entity_id?: string | null;
}>();

const route = useRoute();

// A new incident gets its id when saved, while the dialog keeps its route.
const incidentId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (incidentId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the card reuses the cached query.
const { suspense } = incidentResource.useOne(incidentId);
if (incidentId.value) await suspense();

const fromRoute = (): IncidentCardTab =>
   INCIDENT_CARD_TABS.find(
      (key) => route.name === `ops-incident-manage-${key}` || props.tab === key
   ) ?? 'general';

// Kept here, so the tab stays open when the card is re-created for a saved incident.
const activeTab = ref<IncidentCardTab>(incidentId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id re-creates the card under the saved incident.
const onSaved = (id: string) => (incidentId.value = id);
</script>

<template>
   <div class="card p-0">
      <!-- Keyed on the id: a saved new incident gets a form (and draft) of its own. -->
      <IncidentCard
         :key="incidentId ?? 'new'"
         :id="incidentId"
         :prefill="{
            customer_id: props.customer_id,
            entity_type: props.entity_type,
            entity_id: props.entity_id
         }"
         v-model:tab="activeTab"
         @saved="onSaved($event.id)"
      />
   </div>
</template>
