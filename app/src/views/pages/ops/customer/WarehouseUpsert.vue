<script setup lang="ts">
import {
   WAREHOUSE_TYPES,
   customerWarehouseResource,
   customerWarehouseSchema,
   toCustomerWarehouseFormValues,
   toCustomerWarehousePayload
} from '@/api/customer';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Opened as a dialog from a customer's warehouses: a new warehouse belongs to the route's customer.
const props = defineProps<{
   id?: string | null;
   customerId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({ customer_id: props.customerId ?? undefined }),
      useRow: customerWarehouseResource.useOne,
      useSaveRow: customerWarehouseResource.useSave,
      subject: 'customer_warehouse',
      schema: customerWarehouseSchema,
      toFormValues: toCustomerWarehouseFormValues,
      // Every add dialog shares one draft, so a new warehouse takes the customer from the route.
      toPayload: (data) =>
         toCustomerWarehousePayload(
            data.id || !props.customerId ? data : { ...data, customer_id: props.customerId }
         )
   });
await ready;

const ADDRESS = ['city', 'address', 'postal_code'] as const;
const RECEIVING = [
   'dock_hours',
   'appointment_rule',
   'pallet_standard',
   'receiving_person'
] as const;
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
            :label="$t('ops.customer.warehouse.fields.display_name')"
            :error="errors.display_name"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.display_name" />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.warehouse.fields.type')"
            :error="errors.type"
            :readonly
            v-slot="slotProps"
         >
            <SelectEnum
               v-bind="slotProps"
               v-model="values.type"
               :values="WAREHOUSE_TYPES"
               i18n-prefix="ops.customer.warehouse.type"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.customer.warehouse.fields.country')"
            :error="errors.country"
            :readonly
            v-slot="slotProps"
         >
            <SelectCountry v-bind="slotProps" v-model="values.country" showClear />
         </FormField>
         <FormField
            v-for="field in [...ADDRESS, ...RECEIVING]"
            :key="field"
            fluid
            :label="$t(`ops.customer.warehouse.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values[field]" />
         </FormField>
         <span class="flex items-center gap-2">
            <ToggleSwitch
               v-model="values.is_default"
               inputId="customer-warehouse-is-default"
               :disabled="readonly"
            />
            <label for="customer-warehouse-is-default">
               {{ $t('ops.customer.warehouse.fields.is_default') }}
            </label>
         </span>
      </FormBox>
   </div>
</template>
