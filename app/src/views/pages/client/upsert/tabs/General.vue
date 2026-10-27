<script setup lang="ts">
import { useClient, useSaveClient } from '@/api/client/queries';
import type { Client } from '@/api/client/repository';
import { clientSchema, toClientFormValues, toClientPayload } from '@/api/client/schema';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new client. */
   data?: Partial<Client> | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id ?? props.data?.id,
      prefill: () => props.data,
      useRow: useClient,
      useSaveRow: useSaveClient,
      subject: 'client',
      schema: clientSchema,
      toFormValues: toClientFormValues,
      toPayload: toClientPayload
   });
await ready;
</script>

<template>
   <div class="card p-0">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField
            :readonly
            fluid
            :error="errors.display_name"
            :label="$t('fields.name')"
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.nationality"
            :label="$t('fields.nationality')"
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="values.nationality" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.national_id"
            :label="$t('fields.national_id')"
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.national_id" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.birth_date"
            :label="$t('fields.birth_date')"
            v-slot="slotProps"
         >
            <DatePicker v-bind="slotProps" v-model="values.birth_date" />
         </FormField>
         <FormField
            :readonly
            fluid
            :error="errors.gender"
            :label="$t('fields.gender')"
            v-slot="slotProps"
         >
            <SelectButton
               :options="[
                  { value: 'male', label: $t('client.gender.male') },
                  { value: 'female', label: $t('client.gender.female') }
               ]"
               :allow-empty="false"
               option-value="value"
               option-label="label"
               v-bind="slotProps"
               v-model="values.gender"
            />
         </FormField>
         <div class="form_box !flex-auto">
            <FormField
               :readonly
               fluid
               :error="errors.email"
               :label="$t('fields.email')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.email" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.phone"
               :label="$t('fields.phone')"
               v-slot="slotProps"
            >
               <PhoneInput v-bind="slotProps" v-model="values.phone" />
            </FormField>
         </div>
      </FormBox>
   </div>
</template>
