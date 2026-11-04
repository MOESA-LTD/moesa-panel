<script setup lang="ts">
import { COST_PAYERS } from '@/api/incident';
import { injectChangeRequestForm } from '../useChangeRequestForm';

// S08 D in the card's shared form: what the change costs and who pays, how many days it delays,
// what it does to quality or compliance and to stock or the listing, and the other documents it
// touches (the affected one is picked on the request tab).
const form = injectChangeRequestForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const NOTES = ['quality_impact', 'listing_impact', 'other_documents'] as const;
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
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.change_request.fields.cost_impact')"
         :error="errors.cost_impact"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.cost_impact" auto-resize rows="2" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.cost_payer')"
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
            data-field="cost_payer"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.change_request.fields.delay_days')"
         :error="errors.delay_days"
         :readonly
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            :model-value="typeof values.delay_days === 'number' ? values.delay_days : null"
            @update:model-value="values.delay_days = $event"
            :min="0"
            data-field="delay_days"
         />
      </FormField>
      <FormField
         v-for="field in NOTES"
         :key="field"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t(`ops.change_request.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values[field]" auto-resize rows="2" />
      </FormField>
   </FormBox>
</template>
