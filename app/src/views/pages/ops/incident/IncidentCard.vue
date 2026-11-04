<script setup lang="ts">
import {
   INCIDENT_SEVERITY_SEVERITY,
   incidentStatusHints,
   nextIncidentStatuses,
   useIncidentOverview,
   useSetIncidentStatus,
   type IncidentCard,
   type IncidentStatus
} from '@/api/incident';
import { useAbility } from '@casl/vue';
import Closure from './tabs/Closure.vue';
import Deadlines from './tabs/Deadlines.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Log from './tabs/Log.vue';
import Media from './tabs/Media.vue';
import {
   INCIDENT_CARD_TABS,
   INCIDENT_FORM,
   INCIDENT_OVERVIEW,
   tabForField,
   useIncidentForm,
   type IncidentCardTab,
   type IncidentPrefill
} from './useIncidentForm';

// The incident card: a header (code, title, severity, status, the status actions) and the tabs
// around its one form, which the general and closure tabs share. The log, deadlines, documents and
// media belong to a saved incident. Manage re-creates the card when a new incident is saved, so
// the form goes on under its id.
const props = defineProps<{
   id: string | null;
   /** A new incident's customer and linked record, when a link names them. */
   prefill?: IncidentPrefill;
}>();
const emit = defineEmits<{ saved: [incident: IncidentCard] }>();

const activeTab = defineModel<IncidentCardTab>('tab', { default: 'general' });

const form = useIncidentForm(
   () => props.id,
   (incident) => emit('saved', incident),
   props.prefill
);
await form.ready;

/** Saves; when a field is invalid, opens the tab that shows the first one. */
const submit = async () => {
   await form.save();
   const [first] = Object.keys(form.errors.value);
   if (first) activeTab.value = tabForField(first.split('.')[0]!);
};

provide(INCIDENT_FORM, { ...form, submit });

// Loaded once for every tab: the linked record's label, the next deadline, the repeat flag.
const { data: overview } = useIncidentOverview(() => props.id);
provide(INCIDENT_OVERVIEW, overview);

const incident = computed(() => form.row.value ?? null);

// --- status actions ---

// No move while the form has unsaved edits: saved afterwards, they would overwrite what the move
// set (the closing date and who closed it).
const { isDirty } = form;

const { t } = useI18n();
const ability = useAbility();
const { mutateAsync: setStatus } = useSetIncidentStatus();

/** Management (the right to update the tenant) closes an S1 and lowers an S1 or S2 (035). */
const isManagement = computed(() => ability.can('update', 'tenant'));

const nextStatuses = computed(() =>
   incident.value ? nextIncidentStatuses(incident.value.status) : []
);

// The database decides each move (035); these only warn in the confirmation: the data each move
// needs, as the guard would refuse it.
const statusWarnings = computed(() => {
   const warnings: Partial<Record<IncidentStatus, string>> = {};
   const row = incident.value;
   if (!row) return warnings;
   for (const status of nextStatuses.value) {
      const hints = incidentStatusHints(row, status, isManagement.value);
      if (hints.length) warnings[status] = hints.map((code) => t(`errors.${code}`)).join('; ');
   }
   return warnings;
});

const changeStatus = (status: string) =>
   setStatus({ id: incident.value!.id, status: status as IncidentStatus });

const title = computed(() =>
   incident.value ? [incident.value.code, incident.value.title].filter(Boolean).join(' — ') : null
);
</script>

<template>
   <div v-if="incident" class="m-4 mb-0 flex flex-wrap items-center gap-2">
      <h2 class="m-0 text-xl font-semibold" v-text="title" />
      <Tag
         :value="$t(`ops.incident.severity.${incident.severity}`)"
         :severity="INCIDENT_SEVERITY_SEVERITY[incident.severity]"
      />
      <Tag
         :value="$t(`ops.incident.status.${incident.status}`)"
         :severity="incident.status === 'closed' ? 'secondary' : 'info'"
      />
      <span class="ms-auto flex flex-wrap gap-2">
         <StatusActions
            v-if="$can('update', 'incident')"
            :current="incident.status"
            :next="nextStatuses"
            i18nPrefix="ops.incident.status"
            glossary="incident_status"
            :warnings="statusWarnings"
            :disabled="isDirty"
            :onChange="changeStatus"
         />
         <small
            v-if="isDirty && $can('update', 'incident')"
            class="self-center text-muted-color"
            data-test="status-dirty-hint"
            v-text="$t('ops.status_actions.dirty_hint')"
         />
      </span>
   </div>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab
            v-for="key in INCIDENT_CARD_TABS"
            :key
            :value="key"
            :disabled="key !== 'general' && !id"
         >
            {{ $t(`ops.incident.tabs.${key}`) }}
         </Tab>
      </TabList>
      <TabPanels>
         <TabPanel value="general">
            <General />
         </TabPanel>
         <TabPanel value="log">
            <Log v-if="id && activeTab === 'log'" />
         </TabPanel>
         <TabPanel value="deadlines">
            <Deadlines v-if="id && activeTab === 'deadlines'" />
         </TabPanel>
         <TabPanel value="closure">
            <Closure v-if="id" />
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
