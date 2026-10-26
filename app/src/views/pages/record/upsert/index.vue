<script setup lang="ts">
import { useFormReadonly } from '@/composables/useFormReadonly';
import { currencies } from '@/constants/form/common';
import { RECORD_STATUSES, RECORD_TYPES } from '@/constants/form/record';
import { Form } from '@/lib/Form';
import { useToast } from 'primevue';
import { Rules } from 'validatorjs';
import AssembleForm from './AssembleForm.vue';
import RecordForm from './RecordForm.vue';

export type RecordUpsertFormData = Tables['record']['Row'] & {
   stock: Views['stock_view']['Row'] & {
      product: Tables['product']['Row'] & {
         category: Partial<Tables['product_category']['Row']>[];
      };
   };
   attributes?: {
      device_side?: 'left' | 'pair' | 'right';
      repair_fee?: number;
      insurance_type?: number;
      insurance_contribution?: number;
      client_insurance_contribution?: number;
      rear_ear_devices?: {
         side?: string;
         type?: string;
         model?: string;
         ventilation?: number;
         speaker_power?: string;
         speaker_size?: number;
      }[];
      inner_ear_devices?: {
         side?: string;
         model?: string;
         ventilation?: number;
         speaker_power?: string;
         has_bluetooth?: boolean;
         has_button?: boolean;
      }[];
   };
};

export interface RecordUpsertProps {
   id?: string;
   data?: RecordUpsertFormData;
   select?: string;
}

const props = withDefaults(defineProps<RecordUpsertProps>(), {
   select: '*,stock:stock_view!inner(*), client!inner(id,display_name)'
});

const { t, te } = useI18n();
const toast = useToast();

const initialFormData: Partial<RecordUpsertFormData> = {
   id: undefined,
   client_id: undefined,
   stock_id: undefined,
   user_id: undefined,
   record_type: undefined,
   record_status: undefined,
   quantity: undefined,
   payment_type: undefined,
   currency_code: 'TRY',
   bid: 0,
   bid_discount: 0,
   tax: 0,
   attributes: {},
   details: undefined,
   created_at: undefined,
   stock: undefined
};

const fields = _keys(initialFormData) as Array<keyof RecordUpsertFormData>;

const form = Form.create<RecordUpsertFormData>({
   data: _defaults(_pick(props.data, fields), initialFormData),
   useDialogForm: false
});

provide('recordForm', form);

form._setRules(
   computed<Rules>((): Rules => {
      const statuses = _get(RECORD_STATUSES.value, form.record_type, [])
         ?.map((e: any) => e?.value)
         ?.join(',');
      const types = RECORD_TYPES.value.map((e) => e.value).join(',');

      const quantity = [
         {
            required_with: 'stock_id',
            min: form.stock?.unit_type === 'pcs' ? 1 : 0.01,
            max: availableQuantity?.value
         }
      ] as unknown as Rules;

      const isDeviceSideRequired = form?.stock?.product?.category?.some?.(
         (category: Partial<Tables['product_category']['Row']>) =>
            category.display_name === 'device'
      );

      const attributeRules = {
         attributes: {
            rear_ear_devices: {
               '*': {
                  type: `required`,
                  model: `required`,
                  side: `required`,
                  ventilation: `required`,
                  speaker_size: `required`,
                  speaker_power: `required`
               }
            },
            inner_ear_devices: {
               '*': {
                  side: `required`,
                  model: `required`,
                  ventilation: `required`,
                  speaker_power: `required`
               }
            },
            device_side: isDeviceSideRequired ? 'required' : '',
            repair_fee: 'required_if:record_type,repair',
            insurance_type: 'required_if:record_type,sale',
            insurance_contribution: 'required_with:insurance_type',
            client_insurance_contribution: 'required_with:insurance_type'
         }
      };

      return {
         ...attributeRules,
         quantity,
         record_type: `required|in:${types}`,
         currency_code: `required|in:${currencies.join(',')}`,
         record_status: `required|in:${statuses}`,
         stock_id: 'required',
         client_id: 'required',
         bid: [
            ...['sale', 'assemble', 'repair'].map((value) => `required_if:record_type,${value}`),
            'numeric',
            'min:0'
         ],
         bid_discount: 'numeric|min:0|lte:bid',
         payment_type: 'required_with:bid'
      };
   })
);

const availableQuantity = computed(() => {
   const quantity = _round(
      form?.stock?.id === form?._defaults?.stock_id
         ? (form?._defaults.quantity ?? 0) + (form?.stock?.available_quantity ?? 0)
         : (form?.stock?.available_quantity ?? 0),
      2
   );

   return form.stock?.unit_type === 'pcs' ? _floor(quantity) : quantity;
});

provide('availableQuantity', availableQuantity);

const readonly = useFormReadonly('record', () => form.id);

if (props.id) {
   await supabase
      .from('record')
      .select(props.select)
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) =>
         form._setDefaults(_pick(data as Partial<RecordUpsertFormData>, fields))._reset()
      );
}

if (props.id || props.data?.id) {
   const updateCallback = (data: any) => {
      if (data?.id === form.id) form._setDefaults(_pick(data, fields))._reset();
   };
   onMounted(() => emitter.on('sales-update', updateCallback));
   onUnmounted(() => emitter.off('sales-update', updateCallback));
}

const save = async () => {
   if (!form._validate()) return;

   const payload = _omit(form._data, 'stock');
   const { data } = await supabase
      .from('record')
      .upsert(payload)
      .eq('id', form.id)
      .select()
      .maybeSingle()
      .throwOnError();

   if (form.id) form._setDefaults(_merge(data, form._data))._reset();

   emitter.emit('sales-update', data);

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
};
</script>
<template>
   <div class="card p-0">
      <Tabs value="record" class="w-full">
         <TabList>
            <Tab value="record">{{ $t('record.tab.record') }}</Tab>
            <Tab value="earmold">{{ $t('record.tab.ear_device') }}</Tab>
         </TabList>
         <TabPanels>
            <TabPanel value="record">
               <FormBox @reset="() => form._reset()" :form :readonly @submit="save">
                  <RecordForm :readonly />
               </FormBox>
            </TabPanel>
            <TabPanel value="earmold">
               <FormBox @reset="() => form._reset()" :form :readonly @submit="save">
                  <AssembleForm :readonly />
               </FormBox>
            </TabPanel>
         </TabPanels>
      </Tabs>
   </div>
</template>
