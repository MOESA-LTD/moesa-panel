<script setup lang="ts">
import { INCOTERMS } from '@/api/purchaseOrder';
import { SHIPMENT_MODES } from '@/api/shipment';
import { injectShipmentForm } from '../useShipmentForm';

// The shipment's customer, warehouse, mode, parties, terms, transport and packed quantities, in
// the card's shared form. The customer is chosen on a new shipment only; the warehouse is one of
// the customer's, with its S14 receiving rules (dock hours, appointment) shown under it.
const form = injectShipmentForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft, warehouses } = form;

const id = computed(() => values.value.id ?? null);

const warehouseOptions = computed(() =>
   warehouses.value.map((warehouse) => ({
      value: warehouse.id,
      label: [warehouse.display_name, warehouse.city].filter(Boolean).join(' — ')
   }))
);

/** The chosen warehouse's receiving rules: from the list, or as the saved shipment loaded them. */
const warehouse = computed(() => {
   const chosen = values.value.delivery_warehouse_id;
   if (!chosen) return null;
   const listed = warehouses.value.find((option) => option.id === chosen);
   if (listed) return listed;
   return form.row.value?.delivery_warehouse_id === chosen
      ? (form.row.value.customer_warehouse ?? null)
      : null;
});

/** An optional number as InputNumber takes it (the form also allows an empty string). */
const asNumber = (value: unknown) => (typeof value === 'number' ? value : null);

const PARTIES = ['forwarder', 'customs_broker', 'carrier'] as const;
const TRANSPORT_TEXT = ['container_no', 'seal_no'] as const;
const FREE_DAYS = ['free_days_port', 'free_days_detention'] as const;
const PACKED_COUNTS = ['carton_count', 'pallet_count'] as const;
/** The packed volume and weight, with the decimals their columns keep. */
const PACKED_AMOUNTS = [
   ['volume_m3', 3],
   ['gross_kg', 2]
] as const;
</script>

<template>
   <FormBox
      @submit="submit"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
   >
      <FormField
         fluid
         :label="$t('ops.shipment.fields.customer')"
         :error="errors.customer_id"
         :readonly="readonly || !!id"
         v-slot="slotProps"
      >
         <!-- The warehouse and the orders are the customer's. -->
         <SelectCustomer
            v-bind="slotProps"
            v-model="values.customer_id"
            :disabled="!!id"
            hideClosed
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.shipment.fields.delivery_warehouse')"
         :error="errors.delivery_warehouse_id"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.delivery_warehouse_id"
            :options="warehouseOptions"
            option-value="value"
            option-label="label"
            data-field="delivery_warehouse_id"
            :disabled="!values.customer_id"
         />
         <dl v-if="warehouse" class="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-sm">
            <dt class="text-muted-color">{{ $t('ops.customer.warehouse.fields.dock_hours') }}</dt>
            <dd class="m-0 whitespace-pre-line" data-test="dock-hours">
               {{ warehouse.dock_hours || '—' }}
            </dd>
            <dt class="text-muted-color">
               {{ $t('ops.customer.warehouse.fields.appointment_rule') }}
            </dt>
            <dd class="m-0 whitespace-pre-line" data-test="appointment-rule">
               {{ warehouse.appointment_rule || '—' }}
            </dd>
         </dl>
      </FormField>
      <FormField
         fluid
         :label="$t('ops.shipment.fields.mode')"
         :error="errors.mode"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum
            v-bind="slotProps"
            v-model="values.mode"
            :values="SHIPMENT_MODES"
            i18n-prefix="ops.shipment.mode"
            glossary="shipment_mode"
            data-field="mode"
         />
      </FormField>
      <FormField
         v-for="field in PARTIES"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values[field]" />
      </FormField>
      <FormField
         v-for="field in ['incoterm_buy', 'incoterm_sell'] as const"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <SelectEnum v-bind="slotProps" v-model="values[field]" :values="INCOTERMS" />
      </FormField>
      <span class="flex items-center gap-2">
         <ToggleSwitch
            v-model="values.is_insured"
            inputId="shipment-is-insured"
            :disabled="readonly"
         />
         <label for="shipment-is-insured">{{ $t('ops.shipment.fields.is_insured') }}</label>
      </span>
      <FormField
         v-for="field in TRANSPORT_TEXT"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values[field]" />
      </FormField>
      <FormField
         v-for="field in FREE_DAYS"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            :model-value="asNumber(values[field])"
            @update:model-value="values[field] = $event"
            :min="0"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.shipment.fields.demurrage_note')"
         :error="errors.demurrage_note"
         :readonly
         v-slot="slotProps"
      >
         <InputText v-bind="slotProps" v-model="values.demurrage_note" />
      </FormField>
      <p class="m-0 w-full text-sm text-muted-color" data-test="packing-list-hint">
         {{ $t('ops.shipment.packing_list_hint') }}
      </p>
      <FormField
         v-for="field in PACKED_COUNTS"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            :model-value="asNumber(values[field])"
            @update:model-value="values[field] = $event"
            :min="0"
         />
      </FormField>
      <FormField
         v-for="[field, decimals] in PACKED_AMOUNTS"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <InputNumber
            v-bind="slotProps"
            :model-value="asNumber(values[field])"
            @update:model-value="values[field] = $event"
            :min="0"
            :maxFractionDigits="decimals"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.shipment.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
