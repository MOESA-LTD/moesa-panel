<script setup lang="ts">
import {
   INCOTERMS,
   PO_LOCKED_FIELDS,
   supplierDefaults,
   useEntityDocumentOptions
} from '@/api/purchaseOrder';
import ProjectSelect from '../ProjectSelect.vue';
import { injectPurchaseOrderForm, useOrderLocked } from '../usePurchaseOrderForm';

// The order's parties and terms, in the card's shared form. The customer and the supplier are
// chosen on a new order only; the terms are fixed from pi_approved on (PO_LOCKED_FIELDS).
const form = injectPurchaseOrderForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const { t } = useI18n();

const id = computed(() => values.value.id ?? null);
const locked = useOrderLocked(form);

const isLocked = (field: string) =>
   locked.value && (PO_LOCKED_FIELDS as readonly string[]).includes(field);
const lockHint = (field: string) =>
   isLocked(field) ? t('ops.purchase_order.locked_hint') : undefined;

const packingOptions = useEntityDocumentOptions(() => ({
   entityType: 'purchase_order',
   entityId: id.value
}));

/** A picked supplier's incoterm and deposit fill the terms the order has none of yet. */
const applySupplier = (
   supplier: Parameters<typeof supplierDefaults>[0] | null | undefined
): void => {
   if (!supplier) return;
   const defaults = supplierDefaults(supplier);
   if (!values.value.incoterm && defaults.incoterm) values.value.incoterm = defaults.incoterm;
   if (
      (values.value.deposit_rate === null || values.value.deposit_rate === undefined) &&
      defaults.deposit_rate !== null
   )
      values.value.deposit_rate = defaults.deposit_rate;
};
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
         :label="$t('ops.purchase_order.fields.customer')"
         :error="errors.customer_id"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <!-- The project and the lines' products are the customer's. -->
         <SelectCustomer
            v-bind="slotProps"
            v-model="values.customer_id"
            :disabled="!!id"
            hideClosed
            @change="values.project_id = null"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.supplier')"
         :error="errors.supplier_id"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <SelectSupplier
            v-bind="slotProps"
            v-model="values.supplier_id"
            :disabled="!!id"
            @pick="applySupplier"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.project')"
         :error="errors.project_id"
         :readonly
         v-slot="slotProps"
      >
         <ProjectSelect
            v-bind="slotProps"
            v-model="values.project_id"
            :customerId="values.customer_id"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.currency')"
         :error="errors.currency"
         :readonly
         v-tooltip.top="lockHint('currency')"
         v-slot="slotProps"
      >
         <SelectCurrency
            v-bind="slotProps"
            v-model="values.currency"
            data-field="currency"
            :disabled="isLocked('currency')"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.incoterm')"
         :error="errors.incoterm"
         :readonly
         v-tooltip.top="lockHint('incoterm')"
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.incoterm"
            :values="INCOTERMS"
            data-field="incoterm"
            :disabled="isLocked('incoterm')"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.incoterm_place')"
         :error="errors.incoterm_place"
         :readonly
         v-tooltip.top="lockHint('incoterm_place')"
         v-slot="slotProps"
      >
         <InputText
            v-bind="slotProps"
            v-model="values.incoterm_place"
            data-field="incoterm_place"
            :disabled="isLocked('incoterm_place')"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.deposit_rate')"
         :error="errors.deposit_rate"
         :readonly
         v-tooltip.top="lockHint('deposit_rate')"
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            v-model="values.deposit_rate"
            data-field="deposit_rate"
            :min="0"
            :max="100"
            :maxFractionDigits="2"
            suffix=" %"
            :disabled="isLocked('deposit_rate')"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.ready_on')"
         :error="errors.ready_on"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            data-field="ready_on"
            :model-value="values.ready_on || null"
            @update:model-value="values.ready_on = $event as Date | null"
            date-format="yy-mm-dd"
            show-icon
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.tolerance_pct')"
         :error="errors.tolerance_pct"
         :readonly
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            v-model="values.tolerance_pct"
            :min="0"
            :max="100"
            :maxFractionDigits="2"
            suffix=" %"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.penalty_rule')"
         :error="errors.penalty_rule"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values.penalty_rule" />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.purchase_order.fields.packing_instruction')"
         :error="errors.packing_instruction_document_id"
         :readonly
         v-slot="slotProps"
      >
         <!-- One of the order's own documents (Documents tab), so only once it is saved. -->
         <Select
            v-bind="slotProps"
            v-model="values.packing_instruction_document_id"
            :options="packingOptions"
            option-value="value"
            option-label="label"
            showClear
            :disabled="!id"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.purchase_order.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
