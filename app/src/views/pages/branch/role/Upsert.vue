<script setup>
import { useFormReadonly } from '@/composables/useFormReadonly';
import { Form } from '@/lib/Form';
import { useToast } from 'primevue';

const toast = useToast();
const { t } = useI18n();
const router = useRouter();

/**
 * @typedef {Tables['role']['Row']} Data
 * @type {{ id: Data['id'], data: Data }} */
const props = defineProps({
   id: {
      type: String,
      default: null
   },
   data: {
      type: Object,
      default: null
   }
});

const initialFormData = {
   id: undefined,
   display_name: null,
   permissions: undefined
};

/**@type {[keyof Data]} */
const fields = _keys(initialFormData);

const form = Form.create({
   data: _defaults(_pick(props.data, fields), initialFormData),
   rules: {
      display_name: 'required|string',
      permission: 'required'
   },
   useDialogForm: false
});

// Roles without a tenant are global (e.g. owner) and cannot be edited.
const cannotSubmit = useFormReadonly('role', () => form.id);
const readonly = computed(() => cannotSubmit.value || (form.id && !form.tenant_id));

if (props.id) {
   await supabase
      .from('role')
      .select('*, permission(id, kind, group_name)')
      .eq('id', props.id)
      .maybeSingle()
      .throwOnError()
      .then(({ data }) => {
         form._setDefaults(data || {})._reset();
      });
}

const updateCallback = (data) => {
   if (props?.data?.id) {
      return;
   }
   if (data?.id === form.id) {
      form._setDefaults(data)._reset();
   }
};

onMounted(() => emitter.on('role-update', updateCallback));
onUnmounted(() => emitter.off('role-update', updateCallback));
const save = async () => {
   if (!form._validate()) return;

   const { data } = await supabase
      .from('role')
      .upsert(_pick(form._data, fields))
      .select('*')
      .maybeSingle()
      .throwOnError();

   if (form._changedData['permission']) {
      if (form.id)
         await supabase
            .from('role_permission')
            .delete()
            .eq('role_id', form.id)
            .setHeader('x-delete-confirmed', true)
            .throwOnError();

      const payload = form._data.permission.map(({ id: permission_id }) => ({
         permission_id,
         role_id: data.id
      }));

      await supabase.from('role_permission').insert(payload).throwOnError();
   }

   if (form.id) form._setDefaults(form._data)._reset();

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('toast.saved', { name: form._data.display_name })
   });

   emitter.emit('role-update', form._data);
};
</script>

<template>
   <div class="card">
      <FormBox @submit="save" @reset="() => form?._reset()" v-focustrap :form :readonly>
         <FormField
            fluid
            :label="$t('fields.name')"
            :error="form?._errors.first('display_name')"
            :readonly
         >
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="form['display_name']" />
            </template>
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('fields.permission')"
            :readonly="!$can('modify', 'role') || !$can('create', 'role')"
            :error="form?._errors.first('permission')"
            v-slot="slotProps"
         >
            <SelectPermissions v-bind="slotProps" v-model="form['permission']" />
         </FormField>
      </FormBox>
   </div>
</template>
