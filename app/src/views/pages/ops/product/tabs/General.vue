<script setup lang="ts">
import { COMPLIANCE_STATUSES, PRODUCT_STATUSES } from '@/api/product';
import ParentSelect from '../ParentSelect.vue';
import { injectProductForm } from '../useProductForm';

// Identity, supplier and compliance of the product, in the card's shared form.
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } =
   injectProductForm();

const id = computed(() => values.value.id);

const IDENTITY = ['variant_label', 'category', 'brand', 'gs1_prefix_owner'] as const;
const SUPPLIER = ['supplier_product_code', 'manufacturer_art_no'] as const;
const COMPLIANCE = ['hs_code', 'eu_responsible_person', 'golden_sample_locations'] as const;
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
      <FormBox :legend="$t('ops.product.sections.identity')" class="!flex-auto">
         <!-- The SKU is unique within its customer, and the parent and documents belong to it. -->
         <FormField
            fluid
            :label="$t('ops.product.fields.customer_id')"
            :error="errors.customer_id"
            :readonly="readonly || !!id"
            v-slot="slotProps"
         >
            <!-- The parent is one of the customer's products. -->
            <SelectCustomer
               v-bind="slotProps"
               v-model="values.customer_id"
               :disabled="!!id"
               @change="values.parent_id = null"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.sku')"
            :error="errors.sku"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.sku" placeholder="THO-MOP40-2P" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.gtin')"
            :error="errors.gtin"
            :readonly
            v-slot="slotProps"
         >
            <InputText
               v-bind="slotProps"
               v-model="values.gtin"
               inputmode="numeric"
               maxlength="14"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.status')"
            :error="errors.status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.status"
               :values="PRODUCT_STATUSES"
               glossary="product_status"
               i18n-prefix="ops.product.status"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.parent_id')"
            :error="errors.parent_id"
            :readonly
            v-slot="slotProps"
         >
            <ParentSelect
               v-bind="slotProps"
               v-model="values.parent_id"
               :customerId="values.customer_id"
               :productId="id"
            />
         </FormField>
         <FormField
            v-for="field in IDENTITY"
            :key="field"
            fluid
            :label="$t(`ops.product.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.product.sections.supplier')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.product.fields.supplier_id')"
            :error="errors.supplier_id"
            :readonly
            v-slot="slotProps"
         >
            <SelectSupplier v-bind="slotProps" v-model="values.supplier_id" />
         </FormField>
         <FormField
            v-for="field in SUPPLIER"
            :key="field"
            fluid
            :label="$t(`ops.product.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.product.sections.compliance')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.product.fields.compliance_status')"
            :error="errors.compliance_status"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.compliance_status"
               :values="COMPLIANCE_STATUSES"
               i18n-prefix="ops.product.compliance_status"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.origin_country')"
            :error="errors.origin_country"
            :readonly
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="values.origin_country" showClear />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.golden_sample_on')"
            :error="errors.golden_sample_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.golden_sample_on || null"
               @update:model-value="values.golden_sample_on = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            v-for="field in COMPLIANCE"
            :key="field"
            fluid
            :label="$t(`ops.product.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.is_hazmat"
               inputId="product-is-hazmat"
               :disabled="readonly"
            />
            <label for="product-is-hazmat">{{ $t('ops.product.fields.is_hazmat') }}</label>
         </span>
      </FormBox>

      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.product.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
