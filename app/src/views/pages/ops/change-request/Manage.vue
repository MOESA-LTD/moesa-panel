<script setup lang="ts">
import { changeRequestResource } from '@/api/changeRequest';
import ChangeRequestCard from './ChangeRequestCard.vue';
import { CHANGE_REQUEST_CARD_TABS, type ChangeRequestCardTab } from './useChangeRequestForm';

// The change request card. The decision and the documents belong to a saved request, so their
// tabs open once the request tab has saved it.
const props = defineProps<{
   id?: string | null;
   /** The tab opened first (the route's tab segment). */
   tab?: string | null;
   /** A new request's customer and project, from a link (the route's query). */
   customer_id?: string | null;
   project_id?: string | null;
}>();

const route = useRoute();

// A new request gets its id when saved, while the dialog keeps its route.
const changeRequestId = ref(props.id || null);
watch(
   () => props.id,
   (id) => (changeRequestId.value = id || null)
);

// Loaded here so the route's Suspense waits for it; the card reuses the cached query.
const { suspense } = changeRequestResource.useOne(changeRequestId);
if (changeRequestId.value) await suspense();

const fromRoute = (): ChangeRequestCardTab =>
   CHANGE_REQUEST_CARD_TABS.find(
      (key) => route.name === `ops-change-request-manage-${key}` || props.tab === key
   ) ?? 'general';

// Kept here, so the tab stays open when the card is re-created for a saved request.
const activeTab = ref<ChangeRequestCardTab>(changeRequestId.value ? fromRoute() : 'general');

// The URL deliberately stays on the "new" route: inside a dialog, navigating would stack a second
// dialog (see dialogBeforeEach). The local id re-creates the card under the saved request.
const onSaved = (id: string) => (changeRequestId.value = id);
</script>

<template>
   <div class="card p-0">
      <!-- Keyed on the id: a saved new request gets a form (and draft) of its own. -->
      <ChangeRequestCard
         :key="changeRequestId ?? 'new'"
         :id="changeRequestId"
         :prefill="{ customer_id: props.customer_id, project_id: props.project_id }"
         v-model:tab="activeTab"
         @saved="onSaved($event.id)"
      />
   </div>
</template>
