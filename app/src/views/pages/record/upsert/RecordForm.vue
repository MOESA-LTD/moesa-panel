<script setup lang="ts">
import type { RecordStock } from '@/api/record';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { PAYMENT_TYPES, RECORD_STATUSES, RECORD_TYPES } from '@/constants/form/record';
import StockUpsert from '@/views/pages/stock/Upsert.vue';
import { useRecordForm } from './recordFormContext';

defineProps({
   readonly: {
      type: Boolean,
      required: false
   }
});

const { values, errors, availableQuantity } = useRecordForm();

const stock = computed(() => values.value.stock);
const isDevice = computed(() =>
   stock.value?.product?.category?.some((category) => category.display_name === 'device')
);

const stockTableProps = reactive({
   from: 'stock_view',
   select: '*,product(category:product_category(id,display_name))',
   filters: createFilters({
      'product.category.display_name': {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }]
      },
      display_name: 'text',
      brand: 'text',
      barcode: 'text',
      serial_number: 'text',
      unit_cost: 'decimal',
      quantity: 'numeric',
      available_quantity: 'numeric',
      vendor: 'text',
      stocked_at: 'date'
   }),
   columns: [
      {
         field: 'display_name',
         sortable: true,
         header: i18n.t('stock.table.headers.product'),
         sortOrder: { value: -1 }
      },
      {
         field: 'unit_cost',
         sortable: true,
         header: i18n.t('stock.table.headers.unit_cost')
      },
      {
         field: 'vendor',
         sortable: true,
         header: i18n.t('stock.table.headers.vendor')
      },
      {
         field: 'stocked_at',
         sortable: true,
         header: i18n.t('stock.table.headers.stocked_at'),
         sortOrder: { value: -1 }
      },
      {
         field: 'available_quantity',
         sortable: true,
         header: i18n.t('stock.table.headers.available_quantity')
      }
   ],
   selectionMode: 'single',
   frozenValue: computed(() => (stock.value ? [stock.value] : [])),
   selection: computed(() => (stock.value ? [stock.value] : [])),
   onRowSelect: ({ data }: { data: RecordStock }) => {
      values.value.stock_id = data?.id ?? '';
      values.value.stock = data;
   }
});

/** Derives bid, discount and tax from a total, discount % and tax %. */
const calcFinancials = (total: number, discountPercentage: number, taxPercentage: number) => {
   const d = discountPercentage * 0.01;
   const t = taxPercentage * 0.01;

   if (1 - d <= 0) return;

   const effectiveMultiplier = (1 - d) * (1 + t);
   const newBid = total / effectiveMultiplier;
   const newDiscount = newBid * d;
   const newTax = (newBid - newDiscount) * t;

   Object.assign(values.value, {
      bid: _round(newBid, 2) || 0,
      bid_discount: _round(newDiscount, 2) || 0,
      tax: _round(newTax, 2) || 0
   });
};

const totalBid = computed({
   get: () => values.value.bid - values.value.bid_discount + values.value.tax,
   set: (value: number) => calcFinancials(value, discount.value, tax.value)
});

const discount = computed({
   get: () => {
      if (!values.value.bid) return 0;
      return (values.value.bid_discount / values.value.bid) * 100 || 0;
   },
   set: (value: number) => calcFinancials(totalBid.value, value, tax.value)
});

const tax = computed({
   get: () => {
      const base = values.value.bid - values.value.bid_discount;
      if (base <= 0) return 0;
      return (values.value.tax / base) * 100 || 0;
   },
   set: (value: number) => calcFinancials(totalBid.value, discount.value, value)
});
</script>

<template>
   <span class="contents">
      <FormBox :legend="$t('record.information')" class="!flex-auto">
         <FormField
            :label="$t('fields.record_type')"
            :error="errors.record_type"
            fluid
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               option-label="label"
               option-value="value"
               :options="RECORD_TYPES"
               v-model="values.record_type"
            />
         </FormField>
         <FormField :label="$t('fields.stock_id')" :error="errors.stock_id" fluid :readonly>
            <SelectResource :placeholder="stock?.display_name" :table-props="stockTableProps">
               <template #header>
                  <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
                     <KeywordSearchInput v-model="stockTableProps.filters.global.value" />
                     <CustomLink
                        v-if="$can('create', 'stock')"
                        :to="{ name: 'stock-add' }"
                        v-slot="{ navigate }"
                     >
                        <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                     </CustomLink>
                  </span>
               </template>
               <template #expansion="{ data }">
                  <StockUpsert v-if="data" :id="data.id" />
               </template>
            </SelectResource>
         </FormField>
         <FormField
            :label="$t('fields.device_side')"
            v-if="isDevice"
            :error="errors['attributes.device_side']"
            :readonly
            fluid
            v-slot="slotProps"
         >
            <SelectButton
               :options="[
                  { value: 'left', label: $t('fields.left') },
                  { value: 'both', label: $t('fields.both') },
                  { value: 'right', label: $t('fields.right') }
               ]"
               :allow-empty="false"
               option-value="value"
               option-label="label"
               v-bind="slotProps"
               class="!min-w-fit"
               v-model="values.attributes.device_side"
            />
         </FormField>
         <FormField
            :label="$t('fields.record_status')"
            :error="errors.record_status"
            fluid
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               option-label="label"
               option-value="value"
               :options="_get(RECORD_STATUSES, values.record_type ?? '')"
               v-model="values.record_status"
            />
         </FormField>
         <FormField
            fluid
            :error="errors.client_id"
            :label="$t('fields.client_id')"
            v-slot="slotProps"
         >
            <SelectClient v-bind="slotProps" v-model="values.client_id" />
         </FormField>
      </FormBox>
      <FormBox :legend="$t('record.financial')" class="!flex-auto">
         <FormField
            :readonly
            fluid
            :error="errors.quantity"
            :label="$t('fields.quantity')"
            v-slot="slotProps"
            :disabled="!availableQuantity"
         >
            <InputNumber
               v-bind="slotProps"
               :model-value="values.quantity"
               @value-change="values.quantity = _isNil($event) ? null : _round($event, 2)"
               :max-fraction-digits="stock?.unit_type === 'pcs' ? 0 : 2"
               :min="0"
               :max="availableQuantity"
               :suffix="` / ${availableQuantity || 0} ${stock?.unit_type}`"
               :step="stock?.unit_type === 'pcs' ? 1 : 0.01"
               showButtons
            />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.payment_type"
            :label="$t('fields.payment_type')"
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               :options="PAYMENT_TYPES"
               option-label="label"
               option-value="value"
               v-model="values.payment_type"
            />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.currency_code"
            :label="$t('fields.currency_code')"
            v-slot="slotProps"
         >
            <SelectCurrency v-bind="slotProps" v-model="values.currency_code" />
         </FormField>
         <span class="form_box !flex-auto">
            <FormField
               :readonly
               fluid
               v-if="values.record_type === 'repair'"
               :error="errors['attributes.repair_fee']"
               :label="$t('fields.repair_fee')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  v-model="values.attributes.repair_fee"
                  :mode="values.currency_code ? 'currency' : 'decimal'"
                  :currency="values.currency_code || undefined"
                  :max-fraction-digits="2"
                  :min="0"
                  :step="0.01"
                  showButtons
               />
            </FormField>
            <FormField :readonly fluid :error="errors.bid" :label="$t('fields.bid')">
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="values.bid"
                     :mode="values.currency_code ? 'currency' : 'decimal'"
                     :currency="values.currency_code || undefined"
                     :max-fraction-digits="2"
                     :min="0"
                     :step="0.01"
                     showButtons
                  />
               </template>
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.bid_discount"
               :label="$t('fields.bid_discount')"
            >
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➖ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputGroup>
                     <InputNumber
                        v-bind="slotProps"
                        :model-value="values.bid_discount"
                        @value-change="calcFinancials(totalBid, ($event / values.bid) * 100, tax)"
                        :max-fraction-digits="2"
                        :min="0"
                        :max="values.bid"
                        :step="0.01"
                        showButtons
                     />
                     <InputGroupAddon class="!p-0">
                        <InputNumber
                           v-model="discount"
                           class="!w-28"
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
            <FormField :readonly fluid :error="errors.tax" :label="$t('fields.tax')">
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputGroup>
                     <InputNumber
                        v-bind="slotProps"
                        :model-value="values.tax"
                        @value-change="
                           calcFinancials(
                              totalBid,
                              discount,
                              ($event / (values.bid - values.bid_discount)) * 100
                           )
                        "
                        :max-fraction-digits="2"
                        :min="0"
                        :max="values.bid"
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
            <FormField :readonly fluid :error="errors.total_bid" :label="$t('fields.total_bid')">
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`🟰  ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="totalBid"
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

         <span v-if="values.record_type === 'sale'" class="form_box !flex-auto">
            <FormField
               :label="$t('fields.insurance_type')"
               :error="errors['attributes.insurance_type']"
               fluid
               :readonly
               v-slot="slotProps"
            >
               <Select
                  v-bind="slotProps"
                  option-label="label"
                  option-value="value"
                  :options="[
                     { label: $t('fields.retired'), value: 'retired' },
                     { label: $t('fields.worker'), value: 'worker' },
                     { label: $t('fields.none'), value: null }
                  ]"
                  v-model="values.attributes.insurance_type"
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors['attributes.insurance_contribution']"
               :label="$t('fields.insurance_contribution')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  v-model="values.attributes.insurance_contribution"
                  :max-fraction-digits="2"
                  :min="0"
                  showButtons
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors['attributes.client_insurance_contribution']"
               :label="$t('fields.client_insurance_contribution')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  v-model="values.attributes.client_insurance_contribution"
                  :max-fraction-digits="2"
                  :min="0"
                  showButtons
               />
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
   </span>
</template>
