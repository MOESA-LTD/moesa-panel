<script setup lang="ts">
import {
   customerBrandResource,
   customerBrandSchema,
   toCustomerBrandFormValues,
   toCustomerBrandPayload
} from '@/api/customer';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a customer's brands: a new brand belongs to the route's customer.
const props = defineProps<{
   id?: string | null;
   customerId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ customer_id: props.customerId ?? undefined }),
      useRow: customerBrandResource.useOne,
      useSaveRow: customerBrandResource.useSave,
      subject: 'customer_brand',
      schema: customerBrandSchema,
      toFormValues: toCustomerBrandFormValues,
      // Every add dialog shares one draft, so a new brand takes the customer from the route.
      toPayload: (data) =>
         toCustomerBrandPayload(
            data.id || !props.customerId ? data : { ...data, customer_id: props.customerId }
         )
   });
await ready;

const FIELDS = ['name', 'registration_status', 'brand_program_status', 'gs1_prefix_owner'] as const;
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
            v-for="field in FIELDS"
            :key="field"
            fluid
            :label="$t(`ops.customer.brand.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
         </FormField>
      </FormBox>
   </div>
</template>
