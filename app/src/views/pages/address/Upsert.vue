<script setup>
import { useFormReadonly } from '@/composables/useFormReadonly';
import { Form } from '@/lib/Form';

import { useToast } from 'primevue';

/**
 * @typedef {Tables['address']['Row']} Data
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

const initialFormData = {
   id: undefined,
   display_name: null,
   country: null,
   city: null,
   district: null,
   details: null
};

/**@type {[keyof Data]} */
const fields = _keys(initialFormData);

const form = Form.create({
   data: _defaults(_pick(props.data, fields), initialFormData),
   rules: {
      display_name: 'required',
      country: 'required',
      city: 'required'
   },
   useDialogForm: false
});

const readonly = useFormReadonly('address', () => form.id);

if (props.id) {
   await supabase
      .from('address')
      .select('*')
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._setDefaults(_pick(data, fields))._reset());
}

const save = async () => {
   if (!form._validate()) return;

   await supabase
      .from('address')
      .upsert(form._data)
      .eq('id', form.id)
      .select()
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._merge(_pick(data, fields)));

   emitter.emit('address-update', form._data);
   emitter.emit('client_address-update', form._data);

   form._setDefaults(form._data)._reset();

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
};

if (props.id || props.data?.id) {
   const updateCallback = (data) => {
      if (data?.id === form.id) form._setDefaults(_pick(data, fields))._reset();
   };
   onMounted(() => emitter.on('address-update', updateCallback));
   onUnmounted(() => emitter.off('address-update', updateCallback));
}
</script>

<template>
   <div class="card">
      <FormBox @submit="save" @reset="() => form._reset()" :form :readonly>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('display_name')"
            :label="$t('fields.name')"
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="form.display_name" />
            </template>
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('country')"
            :label="$t('fields.country')"
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="form.country" />
            </template>
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('city')"
            :label="$t('fields.city')"
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="form.city" />
            </template>
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('district')"
            :label="$t('fields.district')"
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="form.district" />
            </template>
         </FormField>
         <FormField
            class="!flex-auto !max-w-full w-full h-fit"
            :readonly
            fluid
            :error="form?._errors?.first('details')"
            :label="$t('fields.details')"
         >
            <template #default="slotProps">
               <Editor v-bind="slotProps" v-model="form.details" />
            </template>
         </FormField>
      </FormBox>
   </div>
</template>
