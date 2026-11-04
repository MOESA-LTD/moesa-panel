<script setup lang="ts">
import {
   SHIPMENT_STATUS_SEVERITY,
   nextShipmentStatuses,
   useSetShipmentStatus,
   useShipmentOverview,
   type ShipmentCard,
   type ShipmentStatus
} from '@/api/shipment';
import Acceptance from './tabs/Acceptance.vue';
import Dates from './tabs/Dates.vue';
import Documents from './tabs/Documents.vue';
import Events from './tabs/Events.vue';
import General from './tabs/General.vue';
import Media from './tabs/Media.vue';
import Orders from './tabs/Orders.vue';
import {
   SHIPMENT_CARD_TABS,
   SHIPMENT_FORM,
   SHIPMENT_OVERVIEW,
   receiptStatus,
   shipmentStatusWarnings,
   tabForField,
   useShipmentDocuments,
   useShipmentForm,
   type ShipmentCardTab
} from './useShipmentForm';

// The shipment card: a header (code, customer, status, the status actions) and the tabs around its
// one form, which the general, dates and acceptance tabs share. The other tabs belong to a saved
// shipment. Manage re-creates the card when a new shipment is saved, so the form goes on under its
// id.
const props = defineProps<{ id: string | null }>();
const emit = defineEmits<{ saved: [shipment: ShipmentCard] }>();
defineSlots<{
   /** Next to the status: what may be done with the shipment (StatusActions). */
   actions?: (props: { shipment: ShipmentCard }) => unknown;
}>();

const activeTab = defineModel<ShipmentCardTab>('tab', { default: 'general' });

const form = useShipmentForm(
   () => props.id,
   (shipment) => emit('saved', shipment)
);
await form.ready;

/** Saves; when a field is invalid, opens the tab that shows the first one. */
const submit = async () => {
   await form.save();
   const [first] = Object.keys(form.errors.value);
   if (first) activeTab.value = tabForField(first.split('.')[0]!);
};

provide(SHIPMENT_FORM, { ...form, submit });

// Loaded once for every tab: the orders' codes, what each status needs, the missing PSIs.
const { data: overview } = useShipmentOverview(() => props.id);
provide(SHIPMENT_OVERVIEW, overview);

const shipment = computed(() => form.row.value ?? null);

// --- status actions ---

// No move while the form has unsaved edits: saved afterwards, they would overwrite what the move
// set (e.g. the dispute deadline of a delivered shipment).
const { isDirty } = form;

const { t } = useI18n();
const { mutateAsync: setStatus } = useSetShipmentStatus();
const documents = useShipmentDocuments(() => props.id);

const nextStatuses = computed(() =>
   shipment.value ? nextShipmentStatuses(shipment.value.status) : []
);

// The database decides each move (031); these only warn in the confirmation: the data a move
// needs, and on loading the orders without an approved PSI (K3).
const statusWarnings = computed(() =>
   shipmentStatusWarnings(
      nextStatuses.value,
      overview.value,
      receiptStatus(documents.value),
      (key, named) => t(key, named ?? {})
   )
);

const changeStatus = (status: string) =>
   setStatus({ id: shipment.value!.id, status: status as ShipmentStatus });
const title = computed(() =>
   shipment.value
      ? [shipment.value.code, shipment.value.customer?.code].filter(Boolean).join(' — ')
      : null
);
</script>

<template>
   <div v-if="shipment" class="m-4 mb-0 flex flex-wrap items-center gap-2">
      <h2 class="m-0 text-xl font-semibold" v-text="title" />
      <Tag
         :value="$t(`ops.shipment.status.${shipment.status}`)"
         :severity="SHIPMENT_STATUS_SEVERITY[shipment.status]"
      />
      <span class="ms-auto flex flex-wrap gap-2">
         <slot name="actions" :shipment>
            <StatusActions
               v-if="$can('update', 'shipment')"
               :current="shipment.status"
               :next="nextStatuses"
               i18nPrefix="ops.shipment.status"
               glossary="shipment_status"
               :warnings="statusWarnings"
               :disabled="isDirty"
               :onChange="changeStatus"
            />
            <small
               v-if="isDirty && $can('update', 'shipment')"
               class="self-center text-muted-color"
               data-test="status-dirty-hint"
               v-text="$t('ops.status_actions.dirty_hint')"
            />
         </slot>
      </span>
   </div>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab
            v-for="key in SHIPMENT_CARD_TABS"
            :key
            :value="key"
            :disabled="key !== 'general' && !id"
         >
            {{ $t(`ops.shipment.tabs.${key}`) }}
         </Tab>
      </TabList>
      <TabPanels>
         <TabPanel value="general">
            <General />
         </TabPanel>
         <TabPanel value="dates">
            <Dates v-if="id" />
         </TabPanel>
         <TabPanel value="orders">
            <Orders v-if="id" />
         </TabPanel>
         <TabPanel value="events">
            <Events v-if="id && activeTab === 'events'" />
         </TabPanel>
         <TabPanel value="acceptance">
            <Acceptance v-if="id" @openTab="activeTab = $event" />
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
