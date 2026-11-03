<script setup lang="ts">
import { passwordSchema, signOutOtherSessions, updatePassword } from '@/api/account';
import { useConfirmAction } from '@/composables/useConfirmAction';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useForm } from '@/lib/form/useForm';
import { useToast } from 'primevue/usetoast';

// A new password, and ending the sessions on other devices (this one stays signed in).
const { t } = useI18n();
const toast = useToast();
const confirm = useConfirmAction();

const { values, errors, isDirty, isSubmitting, reset, handleSubmit } = useForm({
   schema: passwordSchema,
   initialValues: { password: '', password_confirmation: '' }
});

const save = handleSubmit(async (data) => {
   await updatePassword(data);
   reset();
   toast.add({ life: 3000, severity: ToastSeverity.SUCCESS, summary: t('toast.updated') });
});

const signingOut = ref(false);

const signOutOthers = () =>
   confirm({
      header: t('account.security.confirm_sign_out_others.header'),
      message: t('account.security.confirm_sign_out_others.question'),
      accept: async () => {
         signingOut.value = true;
         try {
            await signOutOtherSessions();
         } finally {
            signingOut.value = false;
         }
         toast.add({
            life: 3000,
            severity: ToastSeverity.SUCCESS,
            summary: t('account.security.signed_out_others')
         });
      }
   }).catch(appErrorHandler);
</script>

<template>
   <div class="flex flex-col gap-4">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
      >
         <FormBox :legend="t('account.security.password_legend')" class="!flex-auto">
            <FormField
               fluid
               v-slot="slotProps"
               :label="$t('fields.password')"
               :error="errors.password"
            >
               <Password
                  v-bind="slotProps"
                  :toggle-mask="true"
                  :feedback="false"
                  v-model="values.password"
               />
            </FormField>
            <FormField
               fluid
               v-slot="slotProps"
               :label="$t('fields.password_confirmation')"
               :error="errors.password_confirmation"
            >
               <Password
                  v-bind="slotProps"
                  :toggle-mask="true"
                  :feedback="false"
                  v-model="values.password_confirmation"
               />
            </FormField>
         </FormBox>
      </FormBox>

      <FormBox :legend="t('account.security.sessions_legend')">
         <div class="flex flex-wrap items-center justify-between gap-4 w-full p-2">
            <span>{{ $t('account.security.sign_out_others_hint') }}</span>
            <Button
               data-sign-out-others
               outlined
               severity="danger"
               :icon="PrimeIcons.SIGN_OUT"
               :label="$t('account.security.sign_out_others')"
               :loading="signingOut"
               @click="signOutOthers"
            />
         </div>
      </FormBox>
   </div>
</template>
