<script setup lang="ts">
import { Form } from '@/lib/Form';
import { useConfirm, useToast } from 'primevue';
const authStore = useAuthStore();
const { loginWithPassword } = authStore;
const { isSignedIn } = storeToRefs(authStore);
const confirm = useConfirm();
const toast = useToast();
const router = useRouter();

const rememberMe = ref(!!localStorage.getItem('remember-me'));

const dialogRef = inject('dialogRef', null);

const loginForm = Form.create({
   data: {
      email: '',
      password: ''
   },
   rules: {
      email: 'required|email',
      password: 'required'
   }
});

const forgotPasswordForm = Form.create<{ email: string }>({
   data: {
      email: null
   },
   rules: {
      email: 'required|email'
   },
   autoValidate: ['email']
});

const forgotPassword = async () =>
   confirm.require({
      group: 'forgot-password',
      header: i18n.t('auth.forgot_password.confirm.header'),
      icon: PrimeIcons.REFRESH,
      rejectProps: {
         label: i18n.t('action.cancel'),
         severity: 'secondary',
         outlined: true
      },
      acceptProps: {
         label: i18n.t('action.send'),
         autoValidate: true,
         disabled: computed(() => !forgotPasswordForm._isValid)
      },
      accept: async () => {
         if (!forgotPasswordForm._validate()) return false;
         await supabase.auth.resetPasswordForEmail(forgotPasswordForm.email);
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
      }
   });

const login = async () => {
   if (!loginForm._validate()) {
      return;
   }

   await loginWithPassword(loginForm._data);

   localStorage.removeItem('remember-me');
   if (rememberMe.value) {
      localStorage.setItem('remember-me', loginForm.email);
   }
};

watch(
   () => isSignedIn.value,
   async (value) => {
      if (value) dialogRef?.value?.close?.();
   },
   { immediate: true }
);

if (rememberMe.value) {
   loginForm.email = localStorage.getItem('remember-me');
}
</script>

<template>
   <FormBox @submit="login" class="self-center gap-8" v-focustrap :loginForm>
      <div class="flex-auto w-full text-center flex flex-col justify-center gap-8">
         <div class="text-3xl font-medium" v-text="$t('auth.login.welcome_back')" />

         <span
            class="text-muted-color font-medium"
            v-text="$t('auth.login.please_login_to_continue')"
         />
      </div>
      <div class="flex-auto flex flex-col gap-8">
         <FormField
            v-slot="slotProps"
            fluid
            :label="$t('fields.email')"
            :error="loginForm?._errors?.first('email')"
         >
            <InputText autofocus v-bind="slotProps" v-model="loginForm['email']" />
         </FormField>
         <FormField
            v-slot="slotProps"
            fluid
            :label="$t('fields.password')"
            :error="loginForm?._errors?.first('password')"
         >
            <Password
               v-bind="slotProps"
               v-model="loginForm.password"
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
            :error="forgotPasswordForm?._errors?.first('email')"
         >
            <InputText v-bind="slotProps" v-model="forgotPasswordForm.email" :length="6" />
         </FormField>
      </template>
   </ConfirmDialog>
</template>
