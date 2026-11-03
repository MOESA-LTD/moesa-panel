<script setup lang="ts">
import { createAccount, registerSchema } from '@/api/auth';
import { useForm } from '@/lib/form/useForm';
import { PrimeIcons } from '@primevue/core';
import { useToast } from 'primevue';
import { useI18n } from 'vue-i18n';

const toast = useToast();
const router = useRouter();
const { t } = useI18n();

const stepper = ref();
const setStep = (step) => _set(stepper.value, 'd_value', step);
const steps = computed(() => [
   {
      icon: PrimeIcons.USER_PLUS,
      label: t('register.stepper.label.account')
   },
   {
      icon: PrimeIcons.BUILDING,
      label: t('register.stepper.label.company')
   }
]);

const { values, errors, validateFields, handleSubmit } = useForm({
   schema: registerSchema,
   initialValues: {
      account: { email: '', password: '', password_confirmation: '' },
      company: { display_name: '', email: '', phone: '' }
   }
});

const register = handleSubmit(async (data) => {
   await createAccount(data);

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success')
   });
   await router.replace({ name: 'auth-login' });
});

const hasAccountErrors = () =>
   Object.keys(errors.value).some((path) => path.startsWith('account.'));

const submit = async () => {
   // Errors of the account step would be hidden on the company step.
   if (!validateFields(['account'])) return setStep(1);
   await register();
   // e.g. the e-mail turned out to be registered already.
   if (hasAccountErrors()) setStep(1);
};
</script>

<template>
   <FormBox @submit="submit" class="flex-auto !w-full justify-center gap-8" v-focustrap>
      <div class="flex-auto w-full text-center flex flex-col justify-center gap-8">
         <div class="text-3xl font-medium" v-text="$t('auth.register.create_account')" />

         <span
            class="text-muted-color font-medium"
            v-text="$t('auth.register.create_an_account_and_join_us')"
         />
      </div>
      <Stepper ref="stepper" class="flex-auto !w-full flex flex-col gap-8" :value="1">
         <StepList class="flex-wrap sm:flex-nowrap gap-2">
            <Step
               v-for="(step, i) in steps"
               :key="`step_${i}`"
               v-slot="{ value, a11yAttrs, active }"
               asChild
               :value="i + 1"
            >
               <div
                  class="flex gap-2"
                  :class="{
                     'flex-auto': i < steps.length - 1
                  }"
                  v-bind="a11yAttrs.root"
               >
                  <Button
                     class="flex-auto"
                     v-bind="a11yAttrs.header"
                     :icon="step.icon"
                     :label="$t(step.label)"
                     :variant="!active ? 'outlined' : ''"
                     @click="() => setStep(value)"
                  />
                  <Divider class="!hidden lg:!flex flex-1" v-if="i < steps.length - 1" />
               </div>
            </Step>
         </StepList>
         <StepPanels>
            <StepPanel :value="1">
               <div class="flex flex-col gap-4">
                  <div
                     class="mx-auto text-xl font-medium"
                     v-text="$t('auth.register.account_info')"
                  />
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.email')"
                     :error="errors['account.email']"
                  >
                     <InputText autofocus v-bind="slotProps" v-model="values.account.email" />
                  </FormField>
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.password')"
                     :error="errors['account.password']"
                  >
                     <Password
                        v-bind="slotProps"
                        v-model="values.account.password"
                        :toggleMask="true"
                        :feedback="false"
                     />
                  </FormField>
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.password_confirmation')"
                     :error="errors['account.password_confirmation']"
                  >
                     <Password
                        v-bind="slotProps"
                        v-model="values.account.password_confirmation"
                        :toggleMask="true"
                        :feedback="false"
                     />
                  </FormField>
                  <div class="w-1/2 self-end">
                     <Button
                        :label="$t('fields.company')"
                        class="w-full"
                        :icon="PrimeIcons.CARET_RIGHT"
                        iconPos="right"
                        variant="outlined"
                        @click="() => validateFields(['account']) && setStep(2)"
                     />
                  </div>
               </div>
            </StepPanel>
            <StepPanel :value="2">
               <div class="flex flex-col gap-4">
                  <div
                     class="mx-auto text-surface-900 dark:text-surface-0 text-xl font-medium"
                     v-text="$t('auth.register.company_info')"
                  />
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.name')"
                     :error="errors['company.display_name']"
                  >
                     <InputText v-bind="slotProps" v-model="values.company.display_name" />
                  </FormField>
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.email')"
                     :error="errors['company.email']"
                  >
                     <InputText v-bind="slotProps" v-model="values.company.email" />
                  </FormField>
                  <FormField
                     v-slot="slotProps"
                     fluid
                     :label="$t('fields.phone')"
                     :error="errors['company.phone']"
                  >
                     <PhoneInput v-bind="slotProps" v-model="values.company.phone" />
                  </FormField>
                  <div class="self-stretch flex gap-8">
                     <Button
                        :label="$t('action.back')"
                        severity="secondary"
                        class="w-full"
                        :icon="PrimeIcons.CARET_LEFT"
                        @click="() => setStep(1)"
                     />
                     <Button
                        :label="$t('action.submit')"
                        class="w-full"
                        type="submit"
                        variant="outlined"
                        icon-pos="right"
                        :icon="PrimeIcons.CARET_RIGHT"
                     />
                  </div>
               </div>
            </StepPanel>
         </StepPanels>
      </Stepper>
      <template #form-actions><template /></template>
   </FormBox>
</template>
<style lang="scss" scoped>
.welcome-bg {
   box-shadow: inset 0 0 1.5rem 2.5rem var(--surface-ground);
   background-color: #e5e5f7;
   opacity: 0.8;
   background-image:
      radial-gradient(circle at center center, var(--p-primary-500), #e5e5f7),
      repeating-radial-gradient(
         circle at center center,
         var(--p-primary-300),
         var(--p-primary-900),
         1rem,
         transparent 2rem,
         transparent 1rem
      );
   background-blend-mode: multiply;
}
</style>
