<script setup lang="ts">
import { passwordSchema, updatePassword } from '@/api/account';
import { useForm } from '@/lib/form/useForm';
import { useToast } from 'primevue';

const { t } = useI18n();
const toast = useToast();

const { values, errors, isDirty, isSubmitting, reset, handleSubmit } = useForm({
   schema: passwordSchema,
   initialValues: { password: '', password_confirmation: '' }
});

const save = handleSubmit(async (data) => {
   await updatePassword(data);
   reset();

   toast.add({
      life: 3000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.updated')
   });
});
</script>
<template>
   <FormBox
      @submit="save"
      @reset="() => reset()"
      v-focustrap
      :dirty="isDirty"
      :submitting="isSubmitting"
   >
      <FormField fluid v-slot="slotProps" :label="$t('fields.password')" :error="errors.password">
         <Password
            autofocus
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
</template>
