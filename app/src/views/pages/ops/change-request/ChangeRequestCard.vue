<script setup lang="ts">
import {
   changeRequestStatusHints,
   nextChangeRequestStatuses,
   useSetChangeRequestStatus,
   type ChangeRequestCard,
   type ChangeRequestStatus
} from '@/api/changeRequest';
import Decision from './tabs/Decision.vue';
import Documents from './tabs/Documents.vue';
import General from './tabs/General.vue';
import Impact from './tabs/Impact.vue';
import {
   CHANGE_REQUEST_CARD_TABS,
   CHANGE_REQUEST_FORM,
   isDecisionOverdue,
   tabForField,
   useChangeRequestForm,
   type ChangeRequestCardTab,
   type ChangeRequestPrefill
} from './useChangeRequestForm';

// The change request card: a header (code, title, status, decision date, the status actions) and
// the tabs around its one form, which the request, impact and decision tabs share. The decision
// (the customer's written approval is a document of the request) and the documents belong to a
// saved request. Manage re-creates the card when a new request is saved, so the form goes on under
// its id.
const props = defineProps<{
   id: string | null;
   /** A new request's customer and project, when a link names them. */
   prefill?: ChangeRequestPrefill;
}>();
const emit = defineEmits<{ saved: [cr: ChangeRequestCard] }>();

const activeTab = defineModel<ChangeRequestCardTab>('tab', { default: 'general' });

const form = useChangeRequestForm(
   () => props.id,
   (cr) => emit('saved', cr),
   props.prefill
);
await form.ready;

/** Saves; when a field is invalid, opens the tab that shows the first one. */
const submit = async () => {
   await form.save();
   const [first] = Object.keys(form.errors.value);
   if (first) activeTab.value = tabForField(first.split('.')[0]!);
};

provide(CHANGE_REQUEST_FORM, { ...form, submit });

const cr = computed(() => form.row.value ?? null);

// --- status actions ---

// No move while the form has unsaved edits: saved afterwards, they would overwrite what the move
// set (MOESA's approval, the closing date).
const { isDirty } = form;

const { t } = useI18n();
const { mutateAsync: setStatus } = useSetChangeRequestStatus();

const nextStatuses = computed(() => (cr.value ? nextChangeRequestStatuses(cr.value.status) : []));

// The database decides each move (037); these only warn in the confirmation: the data each move
// needs, as the guard would refuse it.
const statusWarnings = computed(() => {
   const warnings: Partial<Record<ChangeRequestStatus, string>> = {};
   const row = cr.value;
   if (!row) return warnings;
   for (const status of nextStatuses.value) {
      const hints = changeRequestStatusHints(row, status, row.project?.project_gate ?? []);
      if (hints.length) warnings[status] = hints.map((code) => t(`errors.${code}`)).join('; ');
   }
   return warnings;
});

const changeStatus = (status: string) =>
   setStatus({ id: cr.value!.id, status: status as ChangeRequestStatus });

const STATUS_SEVERITY: Record<ChangeRequestStatus, string> = {
   open: 'info',
   approved: 'success',
   rejected: 'secondary',
   applied: 'secondary'
};

const overdue = computed(() => !!cr.value && isDecisionOverdue(cr.value));

const title = computed(() =>
   cr.value ? [cr.value.code, cr.value.title].filter(Boolean).join(' — ') : null
);
</script>

<template>
   <div v-if="cr" class="m-4 mb-0 flex flex-wrap items-center gap-2">
      <h2 class="m-0 text-xl font-semibold" v-text="title" />
      <Tag
         :value="$t(`ops.change_request.status.${cr.status}`)"
         :severity="STATUS_SEVERITY[cr.status]"
      />
      <Tag
         v-if="cr.decision_due_on && cr.status === 'open'"
         data-test="decision-due"
         :severity="overdue ? 'danger' : 'secondary'"
         :value="
            overdue
               ? `${$t('ops.change_request.overdue')} · ${cr.decision_due_on}`
               : `${$t('ops.change_request.fields.decision_due_on')} ${cr.decision_due_on}`
         "
      />
      <span class="ms-auto flex flex-wrap gap-2">
         <StatusActions
            v-if="$can('update', 'change_request')"
            :current="cr.status"
            :next="nextStatuses"
            i18nPrefix="ops.change_request.status"
            glossary="change_request_status"
            :warnings="statusWarnings"
            :disabled="isDirty"
            :onChange="changeStatus"
         />
         <small
            v-if="isDirty && $can('update', 'change_request')"
            class="self-center text-muted-color"
            data-test="status-dirty-hint"
            v-text="$t('ops.status_actions.dirty_hint')"
         />
      </span>
   </div>
   <Tabs v-model:value="activeTab">
      <TabList>
         <Tab
            v-for="key in CHANGE_REQUEST_CARD_TABS"
            :key
            :value="key"
            :disabled="(key === 'decision' || key === 'documents') && !id"
         >
            {{ $t(`ops.change_request.tabs.${key}`) }}
         </Tab>
      </TabList>
      <TabPanels>
         <TabPanel value="general">
            <General />
         </TabPanel>
         <TabPanel value="impact">
            <Impact />
         </TabPanel>
         <TabPanel value="decision">
            <Decision v-if="id" />
         </TabPanel>
         <TabPanel value="documents">
            <Documents v-if="id && activeTab === 'documents'" :id />
         </TabPanel>
      </TabPanels>
   </Tabs>
</template>
