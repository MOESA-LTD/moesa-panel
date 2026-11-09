<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import {
   SUPPLIER_STATUSES,
   supplierResource,
   supplierSchema,
   toSupplierFormValues,
   toSupplierPayload,
   type SupplierRow
} from '@/api/supplier';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('supplier');

const props = defineProps<{ id?: string | null }>();
const emit = defineEmits<{ saved: [supplier: SupplierRow] }>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      useRow: supplierResource.useOne,
      useSaveRow: supplierResource.useSave,
      subject: 'supplier',
      schema: supplierSchema,
      toFormValues: toSupplierFormValues,
      toPayload: toSupplierPayload,
      onSaved: (supplier) => emit('saved', supplier)
   });
await ready;

const WEBSITE_PLACEHOLDER = 'https://example.com';

const TERMS = [
   'payment_terms',
   'storage_fee_rule',
   'late_payment_penalty',
   'cancellation_rule'
] as const;
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
      <FormBox :legend="$t('ops.supplier.sections.general')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.supplier.fields.code')"
            :error="errors.code"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.code" placeholder="CN1" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.fields.status')"
            :error="errors.status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="SUPPLIER_STATUSES"
               glossary="supplier_status"
               i18n-prefix="ops.supplier.status"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.fields.country')"
            :error="errors.country"
            :readonly
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="values.country" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.fields.city')"
            :error="errors.city"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.city" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.fields.website')"
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

      <FormBox :legend="$t('ops.supplier.sections.capability')" class="!flex-auto">
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.supplier.fields.product_groups')"
            :error="errors.product_groups"
            :readonly
            v-slot="slotProps"
         >
            <!-- Free text: each entry is added with Enter. -->
            <AutoComplete
               v-bind="slotProps"
               v-model="values.product_groups"
               multiple
               :typeahead="false"
            />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.supplier.fields.capacity_note')"
            :error="errors.capacity_note"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.capacity_note" auto-resize rows="2" />
         </FormField>
         <FormField
            field="rating"
            fluid
            :label="$t('ops.supplier.fields.rating')"
            :error="errors.rating"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.rating" :min="1" :max="5" />
         </FormField>
         <FormField
            field="last_audit_on"
            fluid
            :label="$t('ops.supplier.fields.last_audit_on')"
            :error="errors.last_audit_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.last_audit_on || null"
               @update:model-value="values.last_audit_on = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.supplier.sections.terms')" class="!flex-auto">
         <FormField
            field="default_incoterm"
            fluid
            :label="$t('ops.supplier.fields.default_incoterm')"
            :error="errors.default_incoterm"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.default_incoterm" placeholder="FOB" />
         </FormField>
         <FormField
            field="deposit_rate"
            fluid
            :label="$t('ops.supplier.fields.deposit_rate')"
            :error="errors.deposit_rate"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values.deposit_rate"
               :min="0"
               :max="100"
               :max-fraction-digits="2"
               suffix=" %"
            />
         </FormField>
         <FormField
            field="damage_notice_hours"
            fluid
            :label="$t('ops.supplier.fields.damage_notice_hours')"
            :error="errors.damage_notice_hours"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber v-bind="slotProps" v-model="values.damage_notice_hours" :min="0" />
         </FormField>
         <FormField
            v-for="term in TERMS"
            :field="term"
            :key="term"
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t(`ops.supplier.fields.${term}`)"
            :error="errors[term]"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values[term]" auto-resize rows="2" />
         </FormField>
      </FormBox>

      <FormField
         field="notes"
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.supplier.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
