<script setup lang="ts">
import { profileSchema, toProfileFormValues, updateProfile } from '@/api/account';
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard';
import { useForm } from '@/lib/form/useForm';
import { useToast } from 'primevue/usetoast';

// The user's name, email and phone. A new email only applies once confirmed from the new
// address, so the form keeps the current one after saving and says where to look.
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const { values, errors, isDirty, isSubmitting, reset, handleSubmit } = useForm({
   schema: profileSchema,
   initialValues: toProfileFormValues(authStore.user)
});

useUnsavedChangesGuard(isDirty);

const save = handleSubmit(async (data) => {
   const previousEmail = authStore.user?.email;
   const updated = await updateProfile(data);
   reset(toProfileFormValues(updated));

   if (data.email !== previousEmail) {
      toast.add({
         life: 0,
         closable: true,
         severity: ToastSeverity.INFO,
         summary: t('account.profile.email_change_sent', { email: data.email })
      });
   } else {
      toast.add({ life: 3000, severity: ToastSeverity.SUCCESS, summary: t('toast.updated') });
   }
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
      <FormBox :legend="t('account.profile.legend')" class="!flex-auto">
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.name')"
            :error="errors.display_name"
         >
            <InputText autofocus v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField fluid v-slot="slotProps" :label="$t('fields.email')" :error="errors.email">
            <InputText v-bind="slotProps" v-model="values.email" />
            <small class="text-muted-color">{{ $t('account.profile.email_change_hint') }}</small>
         </FormField>
         <FormField fluid v-slot="slotProps" :label="$t('fields.phone')" :error="errors.phone">
            <PhoneInput v-bind="slotProps" v-model="values.phone" />
         </FormField>
      </FormBox>
   </FormBox>
</template>
