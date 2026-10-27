<script setup lang="ts">
import {
   stockSchema,
   toStockFormValues,
   toStockPayload,
   useSaveStock,
   useStock,
   type StockWithProduct
} from '@/api/stock';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new stock row. */
   data?: Partial<StockWithProduct> | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id ?? props.data?.id,
      prefill: () => props.data,
      useRow: useStock,
      useSaveRow: useSaveStock,
      subject: 'stock',
      schema: stockSchema,
      toFormValues: toStockFormValues,
      toPayload: toStockPayload
   });
await ready;

const productCategories = computed(() =>
   (values.value.product as StockWithProduct['product'])?.category
      ?.map((category) => category.display_name)
      .join('|')
);

/** Derives the unit amounts from a total, discount % and tax %. */
const calcFinancials = (
   total: number,
   quantity: number,
   discountPercentage: number,
   taxPercentage: number
) => {
   const d = discountPercentage * 0.01;
   const t = taxPercentage * 0.01;
   const q = quantity;

   if (1 - d <= 0 || q <= 0) return;

   const effectiveMultiplier = (1 - d) * (1 + t);
   const newCost = total / (effectiveMultiplier * q);
   const newDiscount = newCost * d;
   const newTax = (newCost - newDiscount) * t;

   Object.assign(values.value, {
      unit_cost: _round(newCost, 2),
      unit_discount: _round(newDiscount, 2),
      unit_tax: _round(newTax, 2)
   });
};

// The quantity input may be cleared while editing; the amounts treat that as zero.
const quantity = computed(() => values.value.quantity ?? 0);

const totalCost = computed({
   get: () =>
      (values.value.unit_cost - values.value.unit_discount + values.value.unit_tax) *
      quantity.value,
   set: (value: number) => calcFinancials(value, quantity.value, discount.value, tax.value)
});

const discount = computed({
   get: () => {
      if (!values.value.unit_cost) return 0;
      return (values.value.unit_discount / values.value.unit_cost) * 100 || 0;
   },
   set: (value: number) => calcFinancials(totalCost.value, quantity.value, value, tax.value)
});

const tax = computed({
   get: () => {
      const base = values.value.unit_cost - values.value.unit_discount;
      if (base <= 0) return 0;
      return (values.value.unit_tax / base) * 100 || 0;
   },
   set: (value: number) => calcFinancials(totalCost.value, quantity.value, discount.value, value)
});
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormBox class="!flex-auto" :legend="$t('stock.information')">
            <FormField
               :readonly
               fluid
               :error="errors.product_id"
               :label="$t('fields.product_id')"
               v-slot="slotProps"
            >
               <SelectProduct
                  v-bind="slotProps"
                  :category="productCategories || ($route.params.category as string)"
                  v-model="values.product_id"
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.vendor"
               :label="$t('fields.vendor')"
               v-slot="slotProps"
            >
               <SelectStockVendor v-bind="slotProps" v-model="values.vendor" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.stocked_at"
               :label="$t('fields.stocked_at')"
               v-slot="slotProps"
            >
               <DatePicker
                  :selectionMode="'single'"
                  v-bind="slotProps"
                  v-model="values.stocked_at"
                  showTime
                  hourFormat="24"
                  dateFormat="dd/mm/yy"
                  placeholder="dd/mm/yyyy"
               />
            </FormField>
            <span class="form_box !flex-auto">
               <FormField
                  :readonly
                  fluid
                  :error="errors.barcode"
                  :label="$t('fields.barcode')"
                  v-slot="slotProps"
               >
                  <InputText v-bind="slotProps" v-model="values.barcode" />
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="errors.serial_number"
                  :label="$t('fields.serial_number')"
                  v-slot="slotProps"
               >
                  <InputText v-bind="slotProps" v-model="values.serial_number" />
               </FormField>
            </span>
         </FormBox>

         <FormBox :legend="$t('stock.financial')" class="!flex-auto">
            <span class="form_box !flex-auto place-content-start">
               <FormField
                  :readonly
                  fluid
                  :error="errors.currency_code"
                  :label="$t('fields.currency')"
                  v-slot="slotProps"
               >
                  <SelectCurrency v-bind="slotProps" v-model="values.currency_code" />
               </FormField>
               <FormField :readonly fluid :error="errors.unit_cost" :label="$t('fields.unit_cost')">
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputNumber
                        v-bind="slotProps"
                        v-model="values.unit_cost"
                        :max-fraction-digits="2"
                        :mode="values.currency_code ? 'currency' : 'decimal'"
                        :currency="values.currency_code || undefined"
                        :min="values.unit_discount"
                        :step="0.01"
                        showButtons
                     />
                  </template>
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="errors.unit_discount"
                  :label="$t('fields.unit_discount')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➖ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           v-bind="slotProps"
                           v-model="values.unit_discount"
                           :max-fraction-digits="2"
                           :mode="values.currency_code ? 'currency' : 'decimal'"
                           :currency="values.currency_code || undefined"
                           :min="0"
                           :max="values.unit_cost"
                           :step="0.01"
                           showButtons
                        />
                        <InputGroupAddon class="!p-0">
                           <InputNumber
                              class="!w-28"
                              v-model="discount"
                              :max-fraction-digits="2"
                              :min="0"
                              :max="100"
                              :suffix="'%'"
                              :step="1"
                              showButtons
                           />
                        </InputGroupAddon>
                     </InputGroup>
                  </template>
               </FormField>
               <FormField :readonly fluid :error="errors.unit_tax" :label="$t('fields.unit_tax')">
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           v-bind="slotProps"
                           v-model="values.unit_tax"
                           :max-fraction-digits="2"
                           :mode="values.currency_code ? 'currency' : 'decimal'"
                           :currency="values.currency_code || undefined"
                           :min="0"
                           :max="values.unit_cost"
                           :step="0.01"
                           showButtons
                        />
                        <InputGroupAddon class="!p-0">
                           <InputNumber
                              class="!w-28"
                              v-model="tax"
                              :max-fraction-digits="2"
                              :min="0"
                              :max="100"
                              :suffix="'%'"
                              :step="1"
                              showButtons
                           />
                        </InputGroupAddon>
                     </InputGroup>
                  </template>
               </FormField>
               <FormField :readonly fluid :error="errors.quantity" :label="$t('fields.quantity')">
                  <template #label="slotProps">
                     <label
                        v-bind="slotProps"
                        v-text="`✖️ ${values.quantity} ${slotProps.label}`"
                     />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           :model-value="values.quantity"
                           @value-change="
                              values.quantity = _isNil($event) ? null : _round($event, 2)
                           "
                           showButtons
                           :min="0"
                           :step="values.unit_type === 'pcs' ? 1 : 0.1"
                           v-bind="slotProps"
                           input-class="!rounded-none"
                        />
                        <InputGroupAddon class="!p-0 !min-w-fit">
                           <SelectStockUnitType class="!border-0" v-model="values.unit_type" />
                        </InputGroupAddon>
                     </InputGroup>
                  </template>
               </FormField>
               <FormField :readonly fluid :label="$t('fields.total_cost')">
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`🟰  ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputNumber
                        v-bind="slotProps"
                        v-model="totalCost"
                        :max-fraction-digits="2"
                        :mode="values.currency_code ? 'currency' : 'decimal'"
                        :currency="values.currency_code || undefined"
                        :min="0"
                        :step="0.01"
                        showButtons
                     />
                  </template>
               </FormField>
            </span>
         </FormBox>
         <FormField
            :readonly
            fluid
            :error="errors.details"
            :label="$t('fields.details')"
            v-slot="slotProps"
            class="!flex-auto !max-w-full w-full h-fit"
         >
            <Editor
               v-bind="slotProps"
               :model-value="values.details ?? undefined"
               @update:model-value="values.details = $event"
            />
         </FormField>
      </FormBox>
   </div>
</template>
