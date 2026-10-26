<script setup>
import { useFormReadonly } from '@/composables/useFormReadonly';
import { Form } from '@/lib/Form';
import { useToast } from 'primevue';
/**
 * @typedef {Tables['stock']['Row']} Data
 * @type {{ id: Data['id'], data: Data }} */
const props = defineProps({
   id: {
      type: String,
      default: null,
      required: false
   },
   data: {
      type: Object,
      default: null,
      required: false
   }
});

const { t, te } = useI18n();
const toast = useToast();

/**
 * @type {Data}
 */
const initialFormData = {
   id: undefined,
   product_id: null,
   serial_number: null,
   barcode: null,
   unit_type: 'pcs',
   unit_cost: 0,
   unit_discount: 0,
   unit_tax: 0,
   stocked_at: new Date(Date.now()),
   quantity: 0,
   currency_code: 'TRY',
   vendor: null,
   details: null,
   product: undefined
};

/**@type {[keyof Data]} */
const fields = _keys(initialFormData);

/**@type {Data & Form<Data>} */
const form = Form.create({
   data: _defaults(_pick(props.data, fields), initialFormData),
   rules: {
      product_id: 'required',
      unit_cost: 'required|min:0',
      unit_discount: 'required|lte:unit_cost',
      quantity: 'required|min:1',
      unit_type: 'required',
      currency_code: 'required'
   },
   useDialogForm: false
});

const staticRules = form._rules || {};
form._setRules(
   computed(() => {
      return {
         ...staticRules,
         quantity: `required|min:1${+!!form.serial_number ? '|max:1' : ''}`
      };
   })
);

const readonly = useFormReadonly('stock', () => form.id);

if (props.id) {
   await supabase
      .from('stock_view')
      .select('*, product:product!inner(category:product_category!inner(id,display_name))')
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._setDefaults(_pick(data, fields))._reset());
}

if (props.id || props.data?.id) {
   const updateCallback = (data) => {
      if (props?.data?.id) {
         return;
      }
      if (data?.id === form.id) {
         form._setDefaults(_pick({ ...form._data, ...data }, fields))._reset();
      }
   };
   onMounted(() => emitter.on('stock-update', updateCallback));
   onUnmounted(() => emitter.off('stock-update', updateCallback));
}

const calcFinancials = (total, quantity, discountPercentage, taxPercentage) => {
   const d = discountPercentage * 0.01;
   const t = taxPercentage * 0.01;
   const q = quantity;

   if (1 - d <= 0 || q <= 0) return;

   const effectiveMultiplier = (1 - d) * (1 + t);
   const new_cost = total / (effectiveMultiplier * q);
   const new_discount = new_cost * d;
   const new_tax = (new_cost - new_discount) * t;

   form._merge({
      unit_cost: _toNumber(new_cost?.toFixed?.(2) || 0),
      unit_discount: _toNumber(new_discount?.toFixed?.(2) || 0),
      unit_tax: _toNumber(new_tax?.toFixed?.(2) || 0)
   });
};

const total_cost = computed({
   get: () => (form.unit_cost - form.unit_discount + form.unit_tax) * form.quantity,
   set: (value) => calcFinancials(value, form.quantity, discount.value, tax.value)
});

const discount = computed({
   get: () => {
      if (!form.unit_cost) return 0;
      return (form.unit_discount / form.unit_cost) * 100 || 0;
   },
   set: (value) => calcFinancials(total_cost.value, form.quantity, value, tax.value)
});

const tax = computed({
   get: () => {
      const base = form.unit_cost - form.unit_discount;
      if (base <= 0) return 0;
      return (form.unit_tax / base) * 100 || 0;
   },
   set: (value) => calcFinancials(total_cost.value, form.quantity, discount.value, value)
});

const save = async () => {
   if (!form._validate()) return;

   // `product` is a joined relation used by the form, not a stock column.
   const payload = _omit(_pick(form._data, fields), ['product']);

   const { data } = await supabase
      .from('stock')
      .upsert(payload)
      .eq('id', form.id)
      .select()
      .maybeSingle()
      .throwOnError();

   // The saved row has no joined `product`; keep the form's so it is not marked as changed.
   if (form.id) form._setDefaults(_pick({ ...form._data, ...data }, fields))._reset();

   emitter.emit('stock-update', data);

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
};
</script>

<template>
   <div class="card">
      <FormBox @submit="save" @reset="() => form._reset()" :form :readonly>
         <FormBox class="!flex-auto" :legend="$t('stock.information')">
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('product_id')"
               :label="$t('fields.product_id')"
               v-slot="slotProps"
            >
               <SelectProduct
                  v-bind="slotProps"
                  :category="
                     form?.product?.category?.map?.((c) => c.display_name)?.join?.('|') ||
                     $route.params.category
                  "
                  v-model="form.product_id"
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('vendor')"
               :label="$t('fields.vendor')"
               v-slot="slotProps"
            >
               <SelectStockVendor v-bind="slotProps" v-model="form.vendor" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('stocked_at')"
               :label="$t('fields.stocked_at')"
               v-slot="slotProps"
            >
               <DatePicker
                  :selectionMode="'single'"
                  v-bind="slotProps"
                  v-model="form.stocked_at"
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
                  :error="form?._errors?.first('barcode')"
                  :label="$t('fields.barcode')"
                  v-slot="slotProps"
               >
                  <InputText v-bind="slotProps" v-model="form.barcode" />
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('serial_number')"
                  :label="$t('fields.serial_number')"
                  v-slot="slotProps"
               >
                  <InputText v-bind="slotProps" v-model="form.serial_number" />
               </FormField>
            </span>
         </FormBox>

         <FormBox :legend="$t('stock.financial')" class="!flex-auto">
            <span class="form_box !flex-auto place-content-start">
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('currency_code')"
                  :label="$t('fields.currency')"
                  v-slot="slotProps"
               >
                  <SelectCurrency v-bind="slotProps" v-model="form.currency_code" />
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('unit_cost')"
                  :label="$t('fields.unit_cost')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputNumber
                        v-bind="slotProps"
                        v-model="form.unit_cost"
                        :max-fraction-digits="2"
                        :mode="form.currency_code ? 'currency' : 'decimal'"
                        :currency="form.currency_code || undefined"
                        :min="form.unit_discount"
                        :step="0.01"
                        showButtons
                     />
                  </template>
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('unit_discount')"
                  :label="$t('fields.unit_discount')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➖ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           v-bind="slotProps"
                           v-model="form.unit_discount"
                           :max-fraction-digits="2"
                           :mode="form.currency_code ? 'currency' : 'decimal'"
                           :currency="form.currency_code || undefined"
                           :min="0"
                           :max="form.unit_cost"
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
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('unit_tax')"
                  :label="$t('fields.unit_tax')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`➕ ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           v-bind="slotProps"
                           v-model="form.unit_tax"
                           :max-fraction-digits="2"
                           :mode="form.currency_code ? 'currency' : 'decimal'"
                           :currency="form.currency_code || undefined"
                           :min="0"
                           :max="form.unit_cost"
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
                  :error="form?._errors?.first('quantity')"
                  :label="$t('fields.quantity')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`✖️ ${form.quantity} ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputGroup>
                        <InputNumber
                           :model-value="form.quantity"
                           @value-change="
                              form._set(`quantity`, _isNil($event) ? null : _round($event, 2))
                           "
                           showButtons
                           :min="0"
                           :step="form.unit_type === 'pcs' ? 1 : 0.1"
                           v-bind="slotProps"
                           input-class="!rounded-none"
                        />
                        <InputGroupAddon class="!p-0 !min-w-fit">
                           <SelectStockUnitType class="!border-0" v-model="form.unit_type" />
                        </InputGroupAddon>
                     </InputGroup>
                  </template>
               </FormField>
               <FormField
                  :readonly
                  fluid
                  :error="form?._errors?.first('total_cost')"
                  :label="$t('fields.total_cost')"
               >
                  <template #label="slotProps">
                     <label v-bind="slotProps" v-text="`🟰  ${slotProps.label}`" />
                  </template>
                  <template #default="slotProps">
                     <InputNumber
                        v-bind="slotProps"
                        v-model="total_cost"
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
      </FormBox>
   </div>
</template>
