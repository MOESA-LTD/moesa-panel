<script setup lang="ts">
import { provideFieldAccess } from '@/composables/useFieldAccess';
import {
   S15_STEPS,
   shipmentEventResource,
   shipmentEventSchema,
   toShipmentEventFormValues,
   toShipmentEventPayload
} from '@/api/shipment';
import { useUpsertForm } from '@/composables/useUpsertForm';

// Hides the fields the user may not read, makes read-only those they may not write.
provideFieldAccess('shipment_event');

// Opened as a dialog from a shipment's events: a new entry belongs to the route's shipment and
// starts now. The step is one of S15 §B's rows; none makes it another event.
const props = defineProps<{
   id?: string | null;
   shipmentId?: string | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({
         shipment_id: props.shipmentId ?? undefined,
         happened_at: new Date().toISOString()
      }),
      useRow: shipmentEventResource.useOne,
      useSaveRow: shipmentEventResource.useSave,
      subject: 'shipment_event',
      schema: shipmentEventSchema,
      toFormValues: toShipmentEventFormValues,
      // Every add dialog shares one draft, so a new entry takes the shipment from the route.
      toPayload: (data) =>
         toShipmentEventPayload(
            data.id || !props.shipmentId ? data : { ...data, shipment_id: props.shipmentId }
         )
   });
await ready;

const { t } = useI18n();
const stepOptions = computed(() =>
   S15_STEPS.map((step) => ({ value: step, label: `${step}. ${t(`ops.shipment.steps.${step}`)}` }))
);

const TEXT_FIELDS = ['from_party', 'to_party', 'channel'] as const;
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
            :label="$t('ops.shipment.fields.happened_at')"
            :error="errors.happened_at"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               :model-value="values.happened_at || null"
               @update:model-value="values.happened_at = $event as Date"
               date-format="yy-mm-dd"
               showTime
               hourFormat="24"
               show-icon
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.shipment.fields.step')"
            :error="errors.step"
            :readonly
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.step"
               :options="stepOptions"
               option-value="value"
               option-label="label"
               showClear
               filter
               :placeholder="$t('ops.shipment.steps.other')"
            />
         </FormField>
         <FormField
            v-for="field in TEXT_FIELDS"
            :field="field"
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
            field="note"
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.shipment.fields.note')"
            :error="errors.note"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.note" auto-resize rows="4" />
         </FormField>
      </FormBox>
   </div>
</template>
