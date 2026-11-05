<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { emailSchema, loginSchema } from '@/api/auth';
import { useForm } from '@/lib/form/useForm';
import { readStorage, removeStorage, writeStorage } from '@/lib/storage';
import { useConfirm, useToast } from 'primevue';

const authStore = useAuthStore();
const { loginWithPassword } = authStore;
const { isSignedIn } = storeToRefs(authStore);
const confirm = useConfirm();
const toast = useToast();
const router = useRouter();

const rememberMe = ref(!!readStorage('remember-me'));

const dialogRef = useDialogRef();

const login = useForm({
   schema: loginSchema,
   initialValues: { email: readStorage('remember-me') ?? '', password: '' }
});

const forgotPasswordForm = useForm({ schema: emailSchema, initialValues: { email: '' } });

const forgotPassword = () =>
   confirm.require({
      group: 'forgot-password',
      header: i18n.t('auth.forgot_password.confirm.header'),
      icon: PrimeIcons.REFRESH,
      rejectProps: {
         label: i18n.t('action.cancel'),
         severity: 'secondary',
         outlined: true
      },
      // reactive() unwraps the computed, so the button follows the e-mail's validity.
      acceptProps: reactive({
         label: i18n.t('action.send'),
         disabled: computed(() => !emailSchema.safeParse(forgotPasswordForm.values.value).success)
      }),
      accept: forgotPasswordForm.handleSubmit(async ({ email }) => {
         await supabase.auth.resetPasswordForEmail(email);
         await router.push({
            path: 'forgot-password'
         });
         toast.add({
            severity: 'info',
            summary: i18n.t('toast.sended'),
            detail: i18n.t(
               'auth.otp.forgot_password.password_reset_email_sended_please_check_your_email'
            ),
            life: 0
         });
      })
   });

const submit = login.handleSubmit(async (credentials) => {
   await loginWithPassword({ email: credentials.email, password: credentials.password });

   removeStorage('remember-me');
   if (rememberMe.value) writeStorage('remember-me', credentials.email);
});

watch(
   () => isSignedIn.value,
   async (value) => {
      if (value) dialogRef?.value?.close?.();
   },
   { immediate: true }
);

const { values, errors } = login;
const { values: forgotValues, errors: forgotErrors } = forgotPasswordForm;
</script>

<template>
   <FormBox @submit="submit" class="self-center gap-8" v-focustrap>
      <div class="flex-auto w-full text-center flex flex-col justify-center gap-8">
         <div class="text-3xl font-medium" v-text="$t('auth.login.welcome_back')" />

         <span
            class="text-muted-color font-medium"
            v-text="$t('auth.login.please_login_to_continue')"
         />
      </div>
      <div class="flex-auto flex flex-col gap-8">
         <FormField v-slot="slotProps" fluid :label="$t('fields.email')" :error="errors.email">
            <InputText autofocus v-bind="slotProps" v-model="values.email" />
         </FormField>
         <FormField
            v-slot="slotProps"
            fluid
            :label="$t('fields.password')"
            :error="errors.password"
         >
            <Password
               v-bind="slotProps"
               v-model="values.password"
               :toggleMask="true"
               :feedback="false"
            />
         </FormField>
      </div>
      <template #form-actions>
         <div class="flex-auto w-full flex flex-col gap-8">
            <div class="flex items-center justify-between gap-4">
               <FormField v-slot="slotProps" reverse :label="$t('fields.remember_me')">
                  <Checkbox v-bind="slotProps" v-model="rememberMe" binary />
               </FormField>

               <div class="flex flex-col justify-center items-end">
                  <Button
                     variant="link"
                     @click="forgotPassword"
                     :label="$t('auth.login.forgot_your_password?')"
                  />
                  <RouterLink
                     custom
                     v-slot="{ href, navigate }"
                     :to="{
                        path: 'invite-code',
                        replace: true
                     }"
                  >
                     <Button
                        variant="link"
                        as="a"
                        :href
                        @click="navigate"
                        :label="$t('auth.login.do_you_have_invite_code?')"
                     />
                  </RouterLink>
               </div>
            </div>
            <Button
               variant="outlined"
               class="!border-primary-emphasis w-[75%] mx-auto"
               type="submit"
               :label="$t('action.submit')"
            />
         </div>
      </template>
   </FormBox>
   <ConfirmDialog group="forgot-password" :draggable="false">
      <template #message>
         <FormField
            :label="$t('fields.email')"
            fluid
            v-slot="slotProps"
            :error="forgotErrors.email"
         >
            <InputText v-bind="slotProps" v-model="forgotValues.email" :length="6" />
         </FormField>
      </template>
   </ConfirmDialog>
</template>
