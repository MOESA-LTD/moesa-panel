<script setup lang="ts">
import {
   customerContactResource,
   customerContactSchema,
   toCustomerContactFormValues,
   toCustomerContactPayload
} from '@/api/customer';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a customer's contacts: a new contact belongs to the route's customer.
const props = defineProps<{
   id?: string | null;
   customerId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ customer_id: props.customerId ?? undefined }),
      useRow: customerContactResource.useOne,
      useSaveRow: customerContactResource.useSave,
      subject: 'customer_contact',
      schema: customerContactSchema,
      toFormValues: toCustomerContactFormValues,
      // Every add dialog shares one draft, so a new contact takes the customer from the route.
      toPayload: (data) =>
         toCustomerContactPayload(
            data.id || !props.customerId ? data : { ...data, customer_id: props.customerId }
         )
   });
await ready;
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <FormField
            fluid
            :label="$t('ops.customer.contact.fields.name')"
            :error="errors.name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.contact.fields.role')"
            :error="errors.role"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.role" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.contact.fields.email')"
            :error="errors.email"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.email" type="email" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.contact.fields.phone')"
            :error="errors.phone"
            :readonly
            v-slot="slotProps"
         >
            <PhoneInput v-bind="slotProps" v-model="values.phone" />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.can_approve"
               inputId="customer-contact-can-approve"
               :disabled="readonly"
            />
            <label for="customer-contact-can-approve">
               {{ $t('ops.customer.contact.fields.can_approve') }}
            </label>
         </span>
      </FormBox>
   </div>
</template>
