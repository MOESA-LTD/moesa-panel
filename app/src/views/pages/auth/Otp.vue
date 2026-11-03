<script setup lang="ts">
import { emailSchema, otpSchema, verifyOtp } from '@/api/auth';
import { useForm } from '@/lib/form/useForm';
import { useConfirm, useToast } from 'primevue';

const router = useRouter();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const isPasswordReset = computed(() => route.path.endsWith('forgot-password'));

const { values, errors, isDirty, handleSubmit } = useForm({
   schema: otpSchema,
   initialValues: { email: '', code: '' }
});

const resendForm = useForm({ schema: emailSchema, initialValues: { email: '' } });
const { values: resendValues, errors: resendErrors } = resendForm;

const resendCode = () => {
   confirm.require({
      group: 'resend-code',
      header: i18n.t('auth.otp.resend_code.confirm.title'),
      icon: PrimeIcons.REFRESH,
      rejectProps: {
         label: i18n.t('action.cancel'),
         severity: 'secondary',
         outlined: true
      },
      // reactive() unwraps the computed, so the button follows the e-mail's validity.
      acceptProps: reactive({
         label: i18n.t('action.send'),
         disabled: computed(() => !emailSchema.safeParse(resendValues.value).success)
      }),
      accept: resendForm.handleSubmit(async ({ email }) => {
         if (isPasswordReset.value) {
            await supabase.auth.resetPasswordForEmail(email);
         } else if (route.path.endsWith('invite-code')) {
            await supabase.auth.resend({ email, type: 'signup' });
         }

         toast.add({
            severity: 'info',
            summary: i18n.t('toast.success'),
            detail: i18n.t('auth.otp.resend_code.toast.code_sended'),
            life: 3000
         });
      })
   });
};

const save = handleSubmit(async ({ email, code }) => {
   await verifyOtp(email, code, isPasswordReset.value ? 'recovery' : 'invite');

   await router.replace({ name: 'account-security' });

   toast.add({
      life: 0,
      closable: true,
      severity: ToastSeverity.INFO,
      summary: i18n.t('auth.otp.resend_code.code_verified'),
      detail: i18n.t('auth.please_dont_forget_to_update_your_password')
   });
});
</script>
<template>
   <div class="flex-auto w-full text-center flex flex-col justify-center gap-8 mb-8">
      <div
         class="text-3xl font-medium"
         v-text="
            route.path.endsWith('forgot-password')
               ? $t('auth.otp.forgot_password.lets_get_your_account_back!💪')
               : $t('auth.otp.invite_code.so_you_are_invited!🎊')
         "
      />

      <span
         class="text-muted-color font-medium"
         v-text="$t('auth.otp.invite_code.please_enter_the_code_in_email_to_login')"
      />
   </div>
   <FormBox @submit="save" class="justify-center">
      <FormField v-slot="slotProps" :label="$t('fields.email')" :error="errors.email">
         <InputText autofocus v-bind="slotProps" type="email" v-model="values.email" />
      </FormField>
      <FormField :label="$t('fields.code')" v-slot="slotProps" :error="errors.code">
         <InputOtp v-bind="slotProps" v-model="values.code" :length="6" />
      </FormField>
      <template #form-actions>
         <div class="form_box__actions-bar !justify-center">
            <span class="form_box__button-container">
               <Button
                  :label="$t('action.resend_code')"
                  class="form_box__button"
                  size="small"
                  severity="secondary"
                  @click="resendCode"
               />
               <Button
                  :label="$t('action.submit')"
                  class="form_box__button"
                  size="small"
                  :disabled="!isDirty"
                  @click="save"
               />
            </span>
         </div>
      </template>
   </FormBox>
   <ConfirmDialog group="resend-code" :draggable="false">
      <template #message>
         <FormField
            :label="$t('fields.email')"
            fluid
            v-slot="slotProps"
            :error="resendErrors.email"
         >
            <InputText v-bind="slotProps" v-model="resendValues.email" :length="6" />
         </FormField>
      </template>
   </ConfirmDialog>
</template>
