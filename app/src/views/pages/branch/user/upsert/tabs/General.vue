<script setup lang="ts">
import { Form } from '@/lib/Form';
import { useToast } from 'primevue';
import { UserUpsertFormData } from '../Index.vue';

export declare type UserUpsertGeneralProps = {
   id?: Tables['user']['Update']['id'];
   data?: UserUpsertFormData;
};

const toast = useToast();

const { user } = useAuthStore();

const props = withDefaults(defineProps<UserUpsertGeneralProps>(), {});

const initialFormData: UserUpsertFormData = {
   id: undefined,
   email: null,
   phone: null,
   user_metadata: {
      display_name: null
   },
   password: null,
   role: null
};

const form = inject(
   'userForm',
   Form.create<UserUpsertFormData>({
      data: props.id
         ? ((
              await supabase
                 .from('user')
                 .select('*, role(*)')
                 .eq('id', props.id)
                 .maybeSingle()
                 .throwOnError()
           ).data as any)
         : _defaults(props.data, initialFormData),
      rules: {
         email: 'required|email',
         phone: 'phone',
         'user_metadata.display_name': 'required'
      },
      useDialogForm: false
   })
);

const fields = _keys(initialFormData);

const readonly = computed(
   () => form.id !== user.id && form?.role?.some((r) => r?.display_name === 'owner')
);

if (props.id || props.data?.id) {
   const updateCallback = (data: any) => {
      if (data?.id === form.id) form._setDefaults(_pick(data, fields))._reset();
   };
   onMounted(() => emitter.on('user-update', updateCallback));
   onUnmounted(() => emitter.off('user-update', updateCallback));
}

const save = async () => {
   if (!form?._validate()) return;

   const body = _pick(form._data, fields);

   if (_size(_omit(form._changedData, ['role']))) {
      const { data, error } = form.id
         ? await supabase.functions.invoke(`user/${form.id}`, {
              body,
              method: 'PUT'
           })
         : await supabase.functions.invoke(`user`, {
              body,
              method: 'POST'
           });

      if (error) throw error;
      form._set('id', data?.user?.id);
   }

   if (_size(form._changedData['role'])) {
      if (form.id) {
         await supabase
            .from('user_role')
            .delete()
            .eq('user_id', form.id)
            .in(
               'role_id',
               form._defaults.role.filter((role) => role.tenant_id).map((role) => role.id)
            )
            .throwOnError();
      }
      await supabase
         .from('user_role')
         .insert(
            form.role
               .filter((role) => role.tenant_id)
               .map((role) => ({
                  user_id: form.id,
                  role_id: role.id
               }))
         )
         .throwOnError();
   }

   form._setDefaults(form._data);

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: i18n.t('toast.saved')
   });

   emitter.emit('user-update', form._data);
};
</script>

<template>
   <FormBox
      @submit="save"
      @reset="() => form?._reset()"
      v-focustrap
      :readonly
      :form
      :submit-text="form.id ? $t('action.save') : $t('action.invite')"
   >
      <span v-if="form.id" class="flex-0 m-4 mb-0 relative">
         <AvatarPlaceholder
            :alt="form.user_metadata?.display_name"
            preview
            class="w-32 rounded-[var(--content-border-radius)] overflow-hidden"
            :src="form.user_metadata?.avatar_url"
            :placeholder="form.user_metadata?.display_name || form?.email"
         />
         <Badge
            v-if="form?.user_metadata?.email_verified"
            :severity="form?.user_metadata?.email_verified ? 'primary' : 'danger'"
            class="!p-0 !h-fit !min-w-fit !w-fit !rounded-full absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-auto"
         >
            <i
               :title="
                  form?.user_metadata?.email_verified ? 'Email verified' : 'Email not verified'
               "
               class="pi pi-fw !text-2xl"
               :class="
                  form?.user_metadata?.email_verified ? 'pi-verified' : 'pi-exclamation-circle'
               "
            />
         </Badge>
      </span>
      <FormBox :legend="$t('user.general_info')">
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.name')"
            :error="form?._errors.first('user_metadata.display_name')"
         >
            <InputText v-bind="slotProps" v-model="(form.user_metadata as any).display_name" />
         </FormField>
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.email')"
            :error="form?._errors.first('email')"
         >
            <InputText v-bind="slotProps" autocomplete="username" v-model="form['email']" />
         </FormField>
         <FormField
            v-if="form.id"
            fluid
            v-slot="slotProps"
            :label="$t('fields.phone')"
            :error="form?._errors?.first('phone')"
         >
            <PhoneInput
               v-bind="slotProps"
               autocomplete="off"
               :model-value="form['phone']"
               @update:model-value="form['phone'] = $event"
            />
         </FormField>
      </FormBox>
      <FormBox :legend="$t('user.security')" v-if="form.id">
         <FormField
            v-if="$can('read', 'role') && $can('modify', 'user_role')"
            fluid
            v-slot="slotProps"
            :label="$t('fields.role')"
            :error="form?._errors?.first('role')"
         >
            <SelectUserRole v-bind="slotProps" v-model="form.role" option-value="" />
         </FormField>
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.password')"
            :error="form?._errors?.first('password')"
         >
            <Password
               :pt="{
                  pcInputText: {
                     root: {
                        autocomplete: 'new-password'
                     }
                  }
               }"
               v-bind="slotProps"
               :toggle-mask="true"
               :feedback="false"
               v-model="form['password']"
               @input="() => form._validate(['password'])"
            />
         </FormField>
      </FormBox>
   </FormBox>
</template>
