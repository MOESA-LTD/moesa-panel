<script setup lang="ts">
import {
   INCIDENT_DEADLINE_DEFAULTS,
   INCIDENT_DEADLINE_KINDS,
   incidentDeadlineResource,
   incidentDeadlineSchema,
   toIncidentDeadlineFormValues,
   toIncidentDeadlinePayload,
   type IncidentDeadlineKind
} from '@/api/incident';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from an incident's deadlines (Y10 §4): a new deadline belongs to the route's
// incident. For the damage notice, the carrier claim, the platform escalation and the document
// request an empty due time is calculated from the incident's opening (035).
const props = defineProps<{
   id?: string | null;
   incidentId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ incident_id: props.incidentId ?? undefined }),
      useRow: incidentDeadlineResource.useOne,
      useSaveRow: incidentDeadlineResource.useSave,
      subject: 'incident_deadline',
      schema: incidentDeadlineSchema,
      toFormValues: toIncidentDeadlineFormValues,
      // Every add dialog shares one draft, so a new deadline takes the incident from the route.
      toPayload: (data) =>
         toIncidentDeadlinePayload(
            data.id || !props.incidentId ? data : { ...data, incident_id: props.incidentId }
         )
   });
await ready;

const DEFAULTED: readonly IncidentDeadlineKind[] = INCIDENT_DEADLINE_DEFAULTS;
const calculated = computed(
   () => !values.value.due_at && !!values.value.kind && DEFAULTED.includes(values.value.kind)
);

const INSTANT_FIELDS = ['due_at', 'met_at'] as const;
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField
            fluid
            :label="$t('ops.incident.deadline.fields.kind')"
            :error="errors.kind"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.kind"
               :values="INCIDENT_DEADLINE_KINDS"
               i18n-prefix="ops.incident.deadline_kind"
               glossary="incident_deadline_kind"
               data-field="kind"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.incident.deadline.fields.label')"
            :error="errors.label"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.label" />
         </FormField>
         <FormField
            v-for="field in INSTANT_FIELDS"
            :key="field"
            fluid
            :label="$t(`ops.incident.deadline.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values[field] || null"
               @update:model-value="values[field] = $event as Date | null"
               date-format="yy-mm-dd"
               showTime
               hourFormat="24"
               show-icon
            />
            <small
               v-if="field === 'due_at' && calculated"
               class="text-muted-color"
               data-test="due-calculated"
            >
               {{ $t('ops.incident.deadline.calculated') }}
            </small>
         </FormField>
      </FormBox>
   </div>
</template>
