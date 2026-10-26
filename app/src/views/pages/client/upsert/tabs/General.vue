<script setup>
import { useFormReadonly } from '@/composables/useFormReadonly';
import { Form } from '@/lib/Form';

import { useToast } from 'primevue';

/**
 * @type {{ id: ClientUpsertFormData['id'], data: ClientUpsertFormData }} */
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

const { t } = useI18n();

const toast = useToast();

/**
 * @type {ClientUpsertFormData} */
const initialFormData = {
   id: undefined,
   national_id: null,
   display_name: null,
   birth_date: null,
   gender: null,
   email: null,
   phone: null,
   nationality: null
};

/**@type {[keyof ClientUpsertFormData]} */
const fields = _keys(initialFormData);

/**@type {ClientUpsertFormData & Form<ClientUpsertFormData>} */
const form = Form.create({
   data: _defaults(props.data, initialFormData),
   rules: {
      display_name: 'required',
      nationality: 'required',
      national_id: 'required',
      birth_date: 'required|date',
      gender: 'required',
      email: 'email',
      phone: 'phone'
   },
   useDialogForm: false
});

if (props.id) {
   await supabase
      .from('client')
      .select('*')
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._setDefaults(_pick(data, fields))._reset());
}

const readonly = useFormReadonly('client', () => form.id);

const save = async () => {
   if (!form._validate()) return;

   await supabase
      .from('client')
      .upsert(_pick(form._data, fields))
      .eq('id', form.id)
      .select()
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => form._merge(_pick(data, fields)));

   emitter.emit('client-update', form._data);

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
   onMounted(() => emitter.on('client-update', updateCallback));
   onUnmounted(() => emitter.off('client-update', updateCallback));
}
</script>

<template>
   <div class="card p-0">
      <FormBox @submit="save" @reset="() => form._reset()" :form :readonly>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('display_name')"
            :label="$t('fields.name')"
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="form.display_name" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('nationality')"
            :label="$t('fields.nationality')"
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="form.nationality" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('national_id')"
            :label="$t('fields.national_id')"
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="form.national_id" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('birth_date')"
            :label="$t('fields.birth_date')"
            v-slot="slotProps"
         >
            <DatePicker v-bind="slotProps" v-model="form.birth_date" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="form?._errors?.first('gender')"
            :label="$t('fields.gender')"
            v-slot="slotProps"
         >
            <SelectButton
               :options="[
                  { value: 'male', label: $t('client.gender.male') },
                  { value: 'female', label: $t('client.gender.female') }
               ]"
               :allow-empty="false"
               option-value="value"
               option-label="label"
               v-bind="slotProps"
               v-model="form.gender"
            />
         </FormField>
         <div class="form_box !flex-auto">
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('email')"
               :label="$t('fields.email')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="form.email" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="form?._errors?.first('phone')"
               :label="$t('fields.phone')"
               v-slot="slotProps"
            >
               <PhoneInput v-bind="slotProps" v-model="form.phone" />
            </FormField>
         </div>
      </FormBox>
   </div>
</template>
