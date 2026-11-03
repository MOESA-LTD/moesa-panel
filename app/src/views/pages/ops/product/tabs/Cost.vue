<script setup lang="ts">
import { PURCHASE_CURRENCIES } from '@/api/product';
import { injectProductForm } from '../useProductForm';

// What the product costs: the purchase from the supplier, the landed cost and the prices.
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } =
   injectProductForm();

const PRICES = [
   { field: 'landed_cost_eur', digits: 4 },
   { field: 'target_price_eur', digits: 2 },
   { field: 'moesa_price_eur', digits: 4 }
] as const;
const TEXTS = ['purchase_incoterm', 'price_list_version'] as const;
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
      <FormBox :legend="$t('ops.product.sections.purchase')" class="!flex-auto">
         <FormField
            fluid
            :label="$t('ops.product.fields.purchase_price')"
            :error="errors.purchase_price"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values.purchase_price"
               :min="0"
               :max-fraction-digits="4"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.purchase_currency')"
            :error="errors.purchase_currency"
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.purchase_currency"
               :options="[...PURCHASE_CURRENCIES]"
               showClear
            />
         </FormField>
      </FormBox>

      <FormBox :legend="$t('ops.product.sections.prices')" class="!flex-auto">
         <FormField
            v-for="{ field, digits } in PRICES"
            :key="field"
            fluid
            :label="$t(`ops.product.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values[field]"
               :min="0"
               :max-fraction-digits="digits"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.product.fields.landed_cost_on')"
            :error="errors.landed_cost_on"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.landed_cost_on || null"
               @update:model-value="values.landed_cost_on = $event as Date | null"
               date-format="yy-mm-dd"
               show-icon
            />
         </FormField>
         <FormField
            v-for="field in TEXTS"
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
   </FormBox>
</template>
