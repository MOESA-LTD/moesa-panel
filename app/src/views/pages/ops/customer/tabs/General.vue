<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import {
   COMMERCIAL_MODELS,
   CUSTOMER_STATUSES,
   PACKAGES,
   customerResource,
   customerSchema,
   toCustomerFormValues,
   toCustomerPayload,
   type CustomerRow
} from '@/api/customer';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useAbility } from '@casl/vue';
import ContractDocumentSelect from '../ContractDocumentSelect.vue';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('customer');

const props = defineProps<{ id?: string | null }>();
const emit = defineEmits<{ saved: [customer: CustomerRow] }>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      useRow: customerResource.useOne,
      useSaveRow: customerResource.useSave,
      subject: 'customer',
      schema: customerSchema,
      toFormValues: toCustomerFormValues,
      toPayload: toCustomerPayload,
      onSaved: (customer) => emit('saved', customer)
   });
await ready;

const WEBSITE_PLACEHOLDER = 'https://example.com';

const DATES = ['contract_accepted_on', 'start_on'] as const;
const TERMS = ['extra_cost_rule', 'eu_responsible_person'] as const;

// The contract terms are management's: only those who may change the settings change them
// (customer_contract_restricted).
const CONTRACT_FIELDS: ReadonlySet<string> = new Set([
   'contract_accepted_on',
   'contract_document_id',
   'start_on',
   'deposit_rate',
   'extra_cost_rule',
   'restricted_drive_url'
]);
const ability = useAbility();
const contractLocked = (field: string) =>
   CONTRACT_FIELDS.has(field) && !ability.can('modify', 'setting');
</script>

<template>
   <FormBox
      @submit="save"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
   >
      <FormBox :legend="$t('ops.customer.sections.general')" class="!flex-auto">
         <!-- The code names documents and business codes, so it is fixed once saved. -->
         <FormField
            fluid
            :label="$t('ops.customer.fields.code')"
            :error="errors.code"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <InputText
               v-bind="slotProps"
               v-model="values.code"
               placeholder="THO"
               maxlength="3"
               :disabled="!!id"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.fields.status')"
            :error="errors.status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="CUSTOMER_STATUSES"
               glossary="customer_status"
               i18n-prefix="ops.customer.status"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.fields.country')"
            :error="errors.country"
            :readonly
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="values.country" showClear />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.fields.website')"
            :error="errors.website"
            :readonly
            v-slot="slotProps"
         >
            <InputText
               v-bind="slotProps"
               v-model="values.website"
               :placeholder="WEBSITE_PLACEHOLDER"
            />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.customer.sections.service')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.customer.fields.commercial_model')"
            :error="errors.commercial_model"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.commercial_model"
               :values="COMMERCIAL_MODELS"
               i18n-prefix="ops.customer.commercial_model"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.fields.packages')"
            :error="errors.packages"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.packages"
               :values="PACKAGES"
               glossary="package"
               multiple
            />
         </FormField>
         <FormField
            field="deposit_rate"
            fluid
            :label="$t('ops.customer.fields.deposit_rate')"
            :error="errors.deposit_rate"
            :readonly="readonly || contractLocked('deposit_rate')"
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               :disabled="contractLocked('deposit_rate')"
               v-model="values.deposit_rate"
               :min="0"
               :max="100"
               :max-fraction-digits="2"
               suffix=" %"
            />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.customer.sections.contract')" class="!flex-auto">
         <FormField
            v-for="date in DATES"
            :field="date"
            :key="date"
            fluid
            :label="$t(`ops.customer.fields.${date}`)"
            :error="errors[date]"
            :readonly="readonly || contractLocked(date)"
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :disabled="contractLocked(date)"
               :model-value="values[date] || null"
               @update:model-value="values[date] = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <!-- A new customer has no documents yet. -->
         <FormField
            field="contract_document_id"
            v-if="id"
            fluid
            :label="$t('ops.customer.fields.contract_document_id')"
            :error="errors.contract_document_id"
            :readonly="readonly || contractLocked('contract_document_id')"
            v-slot="slotProps"
         >
            <ContractDocumentSelect
               v-bind="slotProps"
               :disabled="contractLocked('contract_document_id')"
               v-model="values.contract_document_id"
               :customerId="id"
            />
         </FormField>
         <FormField
            field="restricted_drive_url"
            fluid
            :label="$t('ops.customer.fields.restricted_drive_url')"
            :error="errors.restricted_drive_url"
            :readonly="readonly || contractLocked('restricted_drive_url')"
            v-slot="slotProps"
         >
            <InputText
               v-bind="slotProps"
               v-model="values.restricted_drive_url"
               :disabled="contractLocked('restricted_drive_url')"
            />
         </FormField>
         <FormField
            v-for="term in TERMS"
            :field="term"
            :key="term"
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t(`ops.customer.fields.${term}`)"
            :error="errors[term]"
            :readonly="readonly || contractLocked(term)"
            v-slot="slotProps"
         >
            <Textarea
               v-bind="slotProps"
               v-model="values[term]"
               auto-resize
               rows="2"
               :disabled="contractLocked(term)"
            />
         </FormField>
      </FormBox>

      <FormField
         field="notes"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.customer.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
