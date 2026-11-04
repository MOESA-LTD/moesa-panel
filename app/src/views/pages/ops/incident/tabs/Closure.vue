<script setup lang="ts">
import { INCIDENT_OUTCOMES, INCIDENT_ROOT_CAUSES } from '@/api/incident';
import { injectIncidentForm } from '../useIncidentForm';

// S17 D in the card's shared form: the outcome, the root cause, the total impact, the lesson and
// the measure added to the guideline, and when the customer was told of the closure. An incident
// closes only with its outcome, root cause and preventive action (035); the closing date is the
// database's.
const form = injectIncidentForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const NOTES = ['root_cause_note', 'impact_note', 'lessons'] as const;
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
      <FormField
         fluid
         :label="$t('ops.incident.fields.outcome')"
         :error="errors.outcome"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.outcome"
            :values="INCIDENT_OUTCOMES"
            i18n-prefix="ops.incident.outcome"
            glossary="incident_outcome"
            showClear
            data-field="outcome"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.root_cause')"
         :error="errors.root_cause"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.root_cause"
            :values="INCIDENT_ROOT_CAUSES"
            i18n-prefix="ops.incident.root_cause"
            glossary="incident_root_cause"
            showClear
            data-field="root_cause"
         />
      </FormField>
      <FormField
         v-for="field in NOTES"
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
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.incident.fields.preventive_action')"
         :error="errors.preventive_action"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.preventive_action" auto-resize rows="2" />
         <small class="text-muted-color" data-test="preventive-hint">
            {{ $t('ops.incident.preventive_hint') }}
         </small>
      </FormField>
      <FormField
         fluid
         :label="$t('ops.incident.fields.customer_closure_notified_on')"
         :error="errors.customer_closure_notified_on"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            :model-value="values.customer_closure_notified_on || null"
            @update:model-value="values.customer_closure_notified_on = $event as Date | null"
            date-format="yy-mm-dd"
            show-icon
         />
      </FormField>
      <div class="flex flex-col gap-2">
         <span class="text-muted-color">{{ $t('ops.incident.fields.closed_on') }}</span>
         <span data-test="closed-on">{{ form.row.value?.closed_on ?? '—' }}</span>
      </div>
   </FormBox>
</template>
