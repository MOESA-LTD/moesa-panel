<script setup>
import { useFormReadonly } from '@/composables/useFormReadonly';
import SelectClient from '@/components/service-components/client/SelectClient.vue';
import { Form } from '@/lib/Form';
import AddressTable from '@/views/pages/address/Index.vue';
import { useToast } from 'primevue';

/**
 * @type {{ id: ClientUpsertFormData['id'], data: ClientUpsertFormData, from: ResourceTableProps['from'],select: ResourceTableProps['select'] }} */
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
   },
   from: {
      type: String,
      default: 'client',
      required: false
   },
   select: {
      type: String,
      default: 'id,display_name, address(*)',
      required: false
   }
});

const toast = useToast();
const { t, te } = useI18n();

const initialFormData = {
   id: undefined,
   address: []
};
/**@type {[keyof ClientUpsertFormData]} */
const fields = _keys(initialFormData);

/**@type {ClientUpsertFormData & Form<ClientUpsertFormData>} */
const form = Form.create({
   data: _defaults(props.data, initialFormData),
   rules: {
      id: 'required',
      'address.*': 'required'
   },
   useDialogForm: false
});

const readonly = useFormReadonly('client_address', () => form.id);

if (props.id) {
   supabase
      .from(props.from)
      .select(props.select)
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(async ({ data }) => {
         form._setDefaults(_pick(data, fields))._reset();
      });
}

const save = async () => {
   if (!form._validate()) return;

   if (!!form._changedData['address'] && form.id) {
      await supabase
         .from('client_address')
         .delete()
         .eq('client_id', form.id)
         .setHeader('x-delete-confirmed', true)
         .throwOnError();

      const payload = form._data.address.map(({ id: address_id }) => ({
         address_id,
         client_id: form.id
      }));

      await supabase.from('client_address').insert(payload).throwOnError();
   }

   emitter.emit('client_address-update', form._data);
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
      if (data?.id === form.id) form._setDefaults(data)._reset();
   };
   onMounted(() => emitter.on('client_address-update', updateCallback));
   onUnmounted(() => emitter.off('client_address-update', updateCallback));
}

provide('dialogRef', true);
</script>

<template>
   <div class="card p-0">
      <FormBox @submit="save" @reset="() => form._reset()" :form :readonly>
         <FormField
            fluid
            :error="form?._errors?.first('id')"
            :label="$t('fields.client_id')"
            v-slot="slotProps"
            v-if="!id && !data?.id"
         >
            <SelectClient
               v-bind="slotProps"
               v-model="form.id"
               @clientSelect="form._setDefaults($event)._reset()"
            />
         </FormField>
         <FormField
            fluid
            :error="form?._errors?.first('address')"
            v-slot="slotProps"
            class="!flex-auto !max-w-none w-full"
         >
            <AddressTable
               v-bind="slotProps"
               selectionMode="multiple"
               v-model:selection="form.address"
               :useMeta="false"
               :frozenValue="form.address"
               :rows="5"
            />
         </FormField>
      </FormBox>
   </div>
</template>
