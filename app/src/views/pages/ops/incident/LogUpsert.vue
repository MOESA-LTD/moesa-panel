<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import {
   COST_PAYERS,
   incidentResource,
   incidentLogResource,
   incidentLogSchema,
   toIncidentLogFormValues,
   toIncidentLogPayload
} from '@/api/incident';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('incident_log');

// Opened as a dialog from an incident's log (S17 C): a new line belongs to the route's incident
// and is logged now. A cost has its amount, currency and payer together; a cost charged to the
// customer needs the customer's written approval (Y10 §3).
const props = defineProps<{
   id?: string | null;
   incidentId?: string | null;
}>();

// The incident's own tenant (the card's query, already loaded behind the dialog): a new line goes
// there, which may be another of the branches shown than the active one.
const { data: incident } = incidentResource.useOne(() => (props.id ? null : props.incidentId));

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ incident_id: props.incidentId ?? undefined }),
      useRow: incidentLogResource.useOne,
      useSaveRow: incidentLogResource.useSave,
      subject: 'incident_log',
      schema: incidentLogSchema,
      toFormValues: toIncidentLogFormValues,
      // Every add dialog shares one draft, so a new line takes the incident from the route.
      toPayload: (data) =>
         data.id || !props.incidentId
            ? toIncidentLogPayload(data)
            : {
                 ...toIncidentLogPayload({ ...data, incident_id: props.incidentId }),
                 tenant_id: incident.value?.tenant_id
              }
   });
await ready;

const TEXT_FIELDS = ['counterparty', 'decision'] as const;
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
            :label="$t('ops.incident.log.fields.logged_at')"
            :error="errors.logged_at"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.logged_at || null"
               @update:model-value="values.logged_at = $event as Date"
               date-format="yy-mm-dd"
               showTime
               hourFormat="24"
               show-icon
            />
         </FormField>
         <FormField
            field="note"
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.incident.log.fields.note')"
            :error="errors.note"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.note" auto-resize rows="3" />
         </FormField>
         <FormField
            v-for="field in TEXT_FIELDS"
            :field="field"
            :key="field"
            fluid
            :label="$t(`ops.incident.log.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
            <small v-if="field === 'counterparty'" class="text-muted-color">
               {{ $t('ops.incident.contact_hint') }}
            </small>
         </FormField>
         <FormField
            field="cost_amount"
            fluid
            :label="$t('ops.incident.log.fields.cost_amount')"
            :error="errors.cost_amount"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               :model-value="typeof values.cost_amount === 'number' ? values.cost_amount : null"
               @update:model-value="values.cost_amount = $event"
               :min="0"
               :maxFractionDigits="2"
            />
         </FormField>
         <FormField
            field="cost_currency"
            fluid
            :label="$t('ops.incident.log.fields.cost_currency')"
            :error="errors.cost_currency"
            :readonly
            v-slot="slotProps"
         >
            <SelectCurrency v-bind="slotProps" v-model="values.cost_currency" showClear />
         </FormField>
         <FormField
            field="cost_payer"
            fluid
            :label="$t('ops.incident.log.fields.cost_payer')"
            :error="errors.cost_payer"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.cost_payer"
               :values="COST_PAYERS"
               i18n-prefix="ops.incident.cost_payer"
               glossary="cost_payer"
               showClear
            />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.customer_approved"
               inputId="incident-log-customer-approved"
               :disabled="readonly"
            />
            <label for="incident-log-customer-approved">
               {{ $t('ops.incident.log.fields.customer_approved') }}
            </label>
         </span>
      </FormBox>
   </div>
</template>
