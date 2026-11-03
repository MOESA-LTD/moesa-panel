<script setup lang="ts">
import {
   supplierContactResource,
   supplierContactSchema,
   toSupplierContactFormValues,
   toSupplierContactPayload
} from '@/api/supplier';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a supplier's contacts: a new contact belongs to the route's supplier.
const props = defineProps<{
   id?: string | null;
   supplierId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ supplier_id: props.supplierId ?? undefined }),
      useRow: supplierContactResource.useOne,
      useSaveRow: supplierContactResource.useSave,
      subject: 'supplier_contact',
      schema: supplierContactSchema,
      toFormValues: toSupplierContactFormValues,
      // Every add dialog shares one draft, so a new contact takes the supplier from the route.
      toPayload: (data) =>
         toSupplierContactPayload(
            data.id || !props.supplierId ? data : { ...data, supplier_id: props.supplierId }
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
            :label="$t('ops.supplier.contact.fields.name')"
            :error="errors.name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.contact.fields.role')"
            :error="errors.role"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.role" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.contact.fields.email')"
            :error="errors.email"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.email" type="email" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.supplier.contact.fields.phone')"
            :error="errors.phone"
            :readonly
            v-slot="slotProps"
         >
            <PhoneInput v-bind="slotProps" v-model="values.phone" />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.is_primary"
               inputId="supplier-contact-is-primary"
               :disabled="readonly"
            />
            <label for="supplier-contact-is-primary">
               {{ $t('ops.supplier.contact.fields.is_primary') }}
            </label>
         </span>
      </FormBox>
   </div>
</template>
