<script setup lang="ts">
import {
   INCIDENT_ENTITY_TYPES,
   INCIDENT_FAMILIES,
   INCIDENT_PARTIES,
   INCIDENT_SEVERITIES,
   customerNoticeState,
   incidentSeverityHints,
   incidentTypesOf,
   useIncidentEntityOptions,
   type IncidentEntityType,
   type IncidentFamily
} from '@/api/incident';
import { useMemberOptions } from '@/api/project';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useAbility } from '@casl/vue';
import dayjs from 'dayjs';
import { injectIncidentForm } from '../useIncidentForm';

// S17 A and B in the card's shared form. Opening (the first 15 minutes): the customer and the
// family (on a new incident only), the Y10 card, severity, what happened and what was done at
// once, and the linked record. Classification: the owner, the parties, when management and the
// customer were told. Below, the gates this incident rolled back.
const form = injectIncidentForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const { t } = useI18n();
const ability = useAbility();

const id = computed(() => values.value.id ?? null);
const row = computed(() => form.row.value ?? null);

// --- opening ---

/** The family's Y10 cards, labelled with their heading. */
const typeOptions = computed(() =>
   values.value.family
      ? incidentTypesOf(values.value.family).map((code) => ({
           value: code,
           label: `${code} — ${t(`ops.incident.types.${code}`)}`
        }))
      : []
);

/** Another family drops the card of the old one. */
const setFamily = (family: IncidentFamily | null) => {
   values.value.family = family;
   if (
      values.value.incident_type &&
      !typeOptions.value.some(({ value }) => value === values.value.incident_type)
   )
      values.value.incident_type = null;
};

/** Lowering an S1 or S2 needs management (035); the database refuses it otherwise. */
const severityHint = computed(() => {
   const from = row.value?.severity;
   const to = values.value.severity;
   if (!from || !to) return null;
   const [hint] = incidentSeverityHints(from, to, ability.can('update', 'tenant'));
   return hint ? t(`errors.${hint}`) : null;
});

const TEXT_FIELDS = ['current_state', 'immediate_action'] as const;

// The linked record is one of the customer's; its kind comes first.
const entityOptions = useIncidentEntityOptions(() => ({
   entityType: (values.value.entity_type ?? null) as IncidentEntityType | null,
   customerId: values.value.customer_id ?? null
}));

const setEntityType = (entityType: string | string[] | null | undefined) => {
   values.value.entity_type = (entityType || null) as IncidentEntityType | null;
   values.value.entity_id = null;
};

// --- classification ---

const memberOptions = useMemberOptions();

const NOTICE_SEVERITY = { late: 'danger', due: 'warn', done: 'success' } as const;
const notice = computed(() => {
   if (!row.value) return null;
   const state = customerNoticeState(row.value, new Date());
   return state === 'none' ? null : { state, severity: NOTICE_SEVERITY[state] };
});

const INSTANT_FIELDS = ['opened_at', 'management_notified_at'] as const;

const time = (value: string | null | undefined) =>
   value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';

const rolledBackGates = computed(() => row.value?.project_gate ?? []);
</script>

<template>
   <FormBox
      @submit="submit"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
   >
      <h3 class="m-0 w-full text-base font-semibold">
         {{ $t('ops.incident.sections.opening') }}
      </h3>
      <FormField
         fluid
         :label="$t('ops.incident.fields.customer')"
         :error="errors.customer_id"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <SelectCustomer
            v-bind="slotProps"
            v-model="values.customer_id"
            :disabled="!!id"
            hideClosed
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.family')"
         :error="errors.family"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            :model-value="values.family"
            @update:model-value="setFamily(($event as IncidentFamily) || null)"
            :values="INCIDENT_FAMILIES"
            i18n-prefix="ops.incident.family"
            glossary="incident_family"
            :disabled="!!id"
            data-field="family"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.incident_type')"
         term="Y10"
         :error="errors.incident_type"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.incident_type"
            :options="typeOptions"
            option-value="value"
            option-label="label"
            showClear
            filter
            :disabled="!values.family"
            data-field="incident_type"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.severity')"
         :error="errors.severity"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.severity"
            :values="INCIDENT_SEVERITIES"
            i18n-prefix="ops.incident.severity"
            glossary="incident_severity"
            data-field="severity"
         />
         <small
            v-if="severityHint"
            class="text-orange-600"
            data-test="severity-hint"
            v-text="severityHint"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.title')"
         :error="errors.title"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values.title" />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.incident.fields.what_happened')"
         :error="errors.what_happened"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.what_happened" auto-resize rows="3" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.reported_by')"
         :error="errors.reported_by"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values.reported_by" />
         <small class="text-muted-color">{{ $t('ops.incident.contact_hint') }}</small>
      </FormField>
      <FormField
         v-for="field in TEXT_FIELDS"
         :key="field"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t(`ops.incident.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values[field]" auto-resize rows="2" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.entity_type')"
         :error="errors.entity_type"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            :model-value="values.entity_type"
            @update:model-value="setEntityType"
            :values="INCIDENT_ENTITY_TYPES"
            i18n-prefix="ops.document.entity"
            showClear
            data-field="entity_type"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.entity')"
         :error="errors.entity_id"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.entity_id"
            :options="entityOptions"
            option-value="value"
            option-label="label"
            showClear
            filter
            :disabled="!values.entity_type"
            data-field="entity_id"
         />
      </FormField>

      <h3 class="m-0 w-full text-base font-semibold">
         {{ $t('ops.incident.sections.classification') }}
      </h3>
      <FormField
         fluid
         :label="$t('ops.incident.fields.owner')"
         :error="errors.owner_id"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.owner_id"
            :options="memberOptions"
            option-value="value"
            option-label="label"
            showClear
            filter
            data-field="owner_id"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.affected_parties')"
         :error="errors.affected_parties"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.affected_parties"
            :values="INCIDENT_PARTIES"
            multiple
            i18n-prefix="ops.incident.party"
            glossary="incident_party"
            data-field="affected_parties"
         />
      </FormField>
      <FormField
         v-for="field in INSTANT_FIELDS"
         :key="field"
         fluid
         :label="$t(`ops.incident.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            :model-value="values[field] || null"
            @update:model-value="values[field] = ($event as Date | null) ?? null"
            date-format="yy-mm-dd"
            showTime
            hourFormat="24"
            show-icon
         />
      </FormField>
      <div class="flex flex-col gap-2">
         <span class="text-muted-color">{{
            $t('ops.incident.fields.customer_notice_due_at')
         }}</span>
         <span class="flex items-center gap-2" data-test="customer-notice-due">
            {{ time(row?.customer_notice_due_at) }}
            <Tag
               v-if="notice"
               :severity="notice.severity"
               :value="$t(`ops.incident.notice.${notice.state}`)"
            />
         </span>
      </div>
      <FormField
         fluid
         :label="$t('ops.incident.fields.customer_notified_at')"
         :error="errors.customer_notified_at"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            :model-value="values.customer_notified_at || null"
            @update:model-value="values.customer_notified_at = ($event as Date | null) ?? null"
            date-format="yy-mm-dd"
            showTime
            hourFormat="24"
            show-icon
         />
      </FormField>
   </FormBox>

   <div v-if="rolledBackGates.length" class="m-4 flex flex-col gap-2" data-test="rolled-back-gates">
      <span class="font-semibold">{{ $t('ops.incident.rolled_back_gates') }}</span>
      <span class="flex flex-wrap gap-2">
         <CustomLink
            v-for="gate in rolledBackGates"
            :key="gate.id"
            :to="{
               name: 'ops-project-manage',
               params: { id: gate.project_id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }"
         >
            <template #default="{ navigate }">
               <Button
                  variant="link"
                  :label="$t(`ops.project.gate.${gate.code}`)"
                  @click="navigate"
               />
            </template>
         </CustomLink>
      </span>
   </div>
</template>
