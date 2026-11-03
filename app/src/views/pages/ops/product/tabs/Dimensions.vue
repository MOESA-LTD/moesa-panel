<script setup lang="ts">
import { injectProductForm } from '../useProductForm';

// Dimensions and weights of the product, from unit to pallet. Dimensions are free text (e.g.
// 120x80x40); weights and quantities are numbers.
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } =
   injectProductForm();

const SECTIONS = [
   {
      key: 'unit',
      texts: ['unit_dims_mm'],
      numbers: [{ field: 'unit_net_g', digits: 2 }]
   },
   {
      key: 'pack',
      texts: ['pack_dims_mm'],
      numbers: [
         { field: 'pack_qty', digits: 0 },
         { field: 'pack_gross_g', digits: 2 }
      ]
   },
   {
      key: 'carton',
      texts: ['carton_dims_mm'],
      numbers: [
         { field: 'carton_pack_qty', digits: 0 },
         { field: 'carton_net_kg', digits: 3 },
         { field: 'carton_gross_kg', digits: 3 }
      ]
   },
   {
      key: 'pallet',
      texts: ['pallet_type', 'lot_rule'],
      numbers: [{ field: 'pallet_carton_qty', digits: 0 }]
   }
] as const;
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
      <FormBox
         v-for="section in SECTIONS"
         :key="section.key"
         :legend="$t(`ops.product.sections.${section.key}`)"
         class="!flex-auto"
      >
         <FormField
            v-for="{ field, digits } in section.numbers"
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
            v-for="field in section.texts"
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
