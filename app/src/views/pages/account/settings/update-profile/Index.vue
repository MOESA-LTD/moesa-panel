<script setup lang="ts">
import { profileSchema, toProfileFormValues, updateProfile } from '@/api/account';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { useForm } from '@/lib/form/useForm';
import { useToast } from 'primevue';

const { t } = useI18n();
const toast = useToast();

const { user } = storeToRefs(useAuthStore());

const { values, errors, isDirty, isSubmitting, reset, handleSubmit } = useForm({
   schema: profileSchema,
   initialValues: toProfileFormValues(user.value)
});

useUnsavedChangesGuard(isDirty);

const save = handleSubmit(async (data) => {
   const updated = await updateProfile(data);
   reset(toProfileFormValues(updated));

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
      <FormField fluid v-slot="slotProps" :label="$t('fields.name')" :error="errors.display_name">
         <InputText autofocus v-bind="slotProps" v-model="values.display_name" />
      </FormField>
      <FormField fluid v-slot="slotProps" :label="$t('fields.email')" :error="errors.email">
         <InputText v-bind="slotProps" v-model="values.email" />
      </FormField>
      <FormField fluid v-slot="slotProps" :label="$t('fields.phone')" :error="errors.phone">
         <PhoneInput v-bind="slotProps" v-model="values.phone" />
      </FormField>
   </FormBox>
</template>
