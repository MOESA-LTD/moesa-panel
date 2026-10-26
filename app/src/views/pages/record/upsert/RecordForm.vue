<script setup lang="ts">
import { PAYMENT_TYPES, RECORD_STATUSES, RECORD_TYPES } from '@/constants/form/record';
import Collection from '@/lib/Collection';
import { Form } from '@/lib/Form';
import StockUpsert from '@/views/pages/stock/Upsert.vue';
import { RecordUpsertFormData } from './index.vue';

defineProps({
   readonly: {
      type: Boolean,
      required: false
   }
});

const form = inject('recordForm', Form.create<RecordUpsertFormData>({}));

const stockTableProps = Collection.create({
   from: 'stock_view',
   select: '*,product(category:product_category(display_name))',
   filters: {
      global: {
         value: null,
         matchMode: FilterMatchMode.CONTAINS
      },
      'product.category.display_name': {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }]
      },
      display_name: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
      },
      brand: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
      },
      barcode: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
      },
      serial_number: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
      },
      unit_cost: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
         dataType: 'decimal'
      },
      quantity: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
         dataType: 'numeric'
      },
      available_quantity: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
         dataType: 'numeric'
      },
      vendor: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
      },
      stocked_at: {
         operator: FilterOperator.AND,
         constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }],
         dataType: 'date'
      }
   },
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
   frozenValue: [form.stock],
   selection: [form.stock],
   onRowSelect: ({ data }: { data: RecordUpsertFormData['stock'] }) => {
      form._set('stock_id', data?.id);
      form._set('stock', data);
      stockTableProps.selection = [form.stock];
      stockTableProps.frozenValue = [form.stock];
   }
});

const availableQuantity = inject('availableQuantity', 0);

const calcFinancials = (total: number, discountPercentage: number, taxPercentage: number) => {
   const d = discountPercentage * 0.01;
   const t = taxPercentage * 0.01;

   if (1 - d <= 0) return;

   const effectiveMultiplier = (1 - d) * (1 + t);
   const new_bid = total / effectiveMultiplier;
   const new_bid_discount = new_bid * d;
   const new_tax = (new_bid - new_bid_discount) * t;

   form._merge({
      bid: _toNumber(new_bid?.toFixed?.(2)) || 0,
      bid_discount: _toNumber(new_bid_discount?.toFixed?.(2)) || 0,
      tax: _toNumber(new_tax?.toFixed?.(2)) || 0
   });
};

const total_bid = computed({
   get: () => form.bid - form.bid_discount + form.tax,
   set: (value) => calcFinancials(value, discount.value, tax.value)
});

const discount = computed({
   get: () => {
      if (!form.bid) return 0;
      return (form.bid_discount / form.bid) * 100 || 0;
   },
   set: (value) => calcFinancials(total_bid.value, value, tax.value)
});

const tax = computed({
   get: () => {
      const base = form.bid - form.bid_discount;
      if (base <= 0) return 0;
      return (form.tax / base) * 100 || 0;
   },
   set: (value) => calcFinancials(total_bid.value, discount.value, value)
});
</script>

<template>
   <span class="contents">
      <FormBox :legend="$t('record.information')" class="!flex-auto">
         <FormField
            :label="$t('fields.record_type')"
            :error="form?._errors?.first('record_type')"
            fluid
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               option-label="label"
               option-value="value"
               :options="RECORD_TYPES"
               v-model="form.record_type"
            />
         </FormField>
         <FormField
            :label="$t('fields.stock_id')"
            :error="form?._errors?.first('stock_id')"
            fluid
            :readonly
         >
            <SelectResource
               :placeholder="form.stock?.display_name"
               :table-props="stockTableProps._data"
            >
               <template #header>
                  <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
                     <KeywordSearchInput v-model="stockTableProps._data.filters.global.value" />
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
            v-if="form.stock?.product?.category?.find?.((c) => c.display_name === 'device')"
            :error="form?._errors?.first(`attributes.device_side`)"
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
               :model-value="form._get(`attributes.device_side`)"
               @value-change="form._set(`attributes.device_side`, $event)"
            />
         </FormField>
         <FormField
            :label="$t('fields.record_status')"
            :error="form?._errors?.first('record_status')"
            fluid
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               option-label="label"
               option-value="value"
               :options="_get(RECORD_STATUSES, form.record_type)"
               v-model="form.record_status"
            />
         </FormField>
         <FormField
            fluid
            :error="form?._errors?.first('client_id')"
            :label="$t('fields.client_id')"
            v-slot="slotProps"
         >
            <SelectClient v-bind="slotProps" v-model="form.client_id" />
         </FormField>
      </FormBox>
      <FormBox :legend="$t('record.financial')" class="!flex-auto">
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('quantity')"
            :label="$t('fields.quantity')"
            v-slot="slotProps"
            :disabled="!availableQuantity"
         >
            <InputNumber
               v-bind="slotProps"
               :model-value="form.quantity"
               @value-change="form._set(`quantity`, $event?.toFixed?.(2))"
               :max-fraction-digits="form.stock?.unit_type === 'pcs' ? 0 : 2"
               :min="0"
               :max="availableQuantity"
               :suffix="` / ${availableQuantity || 0} ${form.stock?.unit_type}`"
               :step="form.stock?.unit_type === 'pcs' ? 1 : 0.01"
               showButtons
            />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('payment_type')"
            :label="$t('fields.payment_type')"
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               :options="PAYMENT_TYPES"
               option-label="label"
               option-value="value"
               v-model="form.payment_type"
            />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('currency_code')"
            :label="$t('fields.currency_code')"
            v-slot="slotProps"
         >
            <SelectCurrency v-bind="slotProps" v-model="form.currency_code" />
         </FormField>
         <span class="form_box !flex-auto">
            <FormField
               :readonly
               fluid
               v-if="form.record_type === 'repair'"
               :error="form?._errors?.first(`attributes.repair_fee`)"
               :label="$t('fields.repair_fee')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  :model-value="_get(form, `attributes.repair_fee`)"
                  @value-change="form._set(`attributes.repair_fee`, $event)"
                  :mode="form.currency_code ? 'currency' : 'decimal'"
                  :currency="form.currency_code || undefined"
                  :max-fraction-digits="2"
                  :min="0"
                  :step="0.01"
                  showButtons
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('bid')"
               :label="$t('fields.bid')"
            >
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="form.bid"
                     :mode="form.currency_code ? 'currency' : 'decimal'"
                     :currency="form.currency_code || undefined"
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
               :error="form?._errors?.first('bid_discount')"
               :label="$t('fields.bid_discount')"
            >
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➖ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputGroup>
                     <InputNumber
                        v-bind="slotProps"
                        :model-value="form.bid_discount"
                        @value-change="calcFinancials(total_bid, ($event / form.bid) * 100, tax)"
                        :max-fraction-digits="2"
                        :min="0"
                        :max="form.bid"
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
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('tax')"
               :label="$t('fields.tax')"
            >
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputGroup>
                     <InputNumber
                        v-bind="slotProps"
                        :model-value="form.tax"
                        @value-change="
                           calcFinancials(
                              total_bid,
                              discount,
                              ($event / (form.bid - form.bid_discount)) * 100
                           )
                        "
                        :max-fraction-digits="2"
                        :min="0"
                        :max="form.bid"
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
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('total_bid')"
               :label="$t('fields.total_bid')"
            >
               <template #label="slotProps">
                  <label v-bind="slotProps" v-text="`🟰  ${slotProps.label}`" />
               </template>
               <template #default="slotProps">
                  <InputNumber
                     v-bind="slotProps"
                     v-model="total_bid"
                     :max-fraction-digits="2"
                     :mode="form.currency_code ? 'currency' : 'decimal'"
                     :currency="form.currency_code || undefined"
                     :min="0"
                     :step="0.01"
                     showButtons
                  />
               </template>
            </FormField>
         </span>

         <span v-if="form.record_type === 'sale'" class="form_box !flex-auto">
            <FormField
               :label="$t('fields.insurance_type')"
               :error="form?._errors?.first('attributes.insurance_type')"
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
                  v-model="form.attributes.insurance_type"
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('attributes.insurance_contribution')"
               :label="$t('fields.insurance_contribution')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  v-model="form.attributes.insurance_contribution"
                  :max-fraction-digits="2"
                  :min="0"
                  showButtons
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('attributes.client_insurance_contribution')"
               :label="$t('fields.client_insurance_contribution')"
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  v-model="form.attributes.client_insurance_contribution"
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
         :error="form?._errors?.first('details')"
         :label="$t('fields.details')"
         v-slot="slotProps"
         class="!flex-auto !max-w-full w-full h-fit"
      >
         <Editor v-bind="slotProps" v-model="form.details" />
      </FormField>
   </span>
</template>
