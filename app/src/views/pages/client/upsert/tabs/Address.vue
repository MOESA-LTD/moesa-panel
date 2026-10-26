<script setup>
import { useClient, useSaveClientAddresses } from '@/api/client/queries';
import { useFormReadonly } from '@/composables/useFormReadonly';
import SelectClient from '@/components/service-components/client/SelectClient.vue';
import { Form } from '@/lib/Form';
import AddressTable from '@/views/pages/address/Index.vue';
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

const toast = useToast();
const { t } = useI18n();

const initialFormData = {
   id: undefined,
   address: []
};
/**@type {[keyof ClientUpsertFormData]} */
const fields = _keys(initialFormData);

const clientId = computed(() => props.id ?? props.data?.id ?? null);
const { data: client, suspense } = useClient(clientId);
if (clientId.value) await suspense();

/**@type {ClientUpsertFormData & Form<ClientUpsertFormData>} */
const form = Form.create({
   // _pick copies, so the source object is not mutated by _defaults.
   data: _defaults(_pick(client.value ?? props.data, fields), initialFormData),
   rules: {
      id: 'required',
      'address.*': 'required'
   },
   useDialogForm: false
});

// Follow fresh server data (e.g. saved in another view) unless the user has unsaved edits.
watch(client, (value) => {
   if (value && !form._isChanged) form._setDefaults(_pick(value, fields))._reset();
});

const readonly = useFormReadonly('client_address', () => form.id);

const { mutateAsync: saveAddresses } = useSaveClientAddresses();

const save = async () => {
   if (!form._validate()) return;

   if (!!form._changedData['address'] && form.id) {
      await saveAddresses({
         clientId: form.id,
         addressIds: form._data.address.map(({ id }) => id)
      });
   }

   form._setDefaults(form._data)._reset();

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved')
   });
};

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
