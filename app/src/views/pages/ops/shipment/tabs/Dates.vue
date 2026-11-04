<script setup lang="ts">
import { etaState } from '@/api/shipment';
import dayjs from 'dayjs';
import { injectShipmentForm } from '../useShipmentForm';

// The shipment's seven dates (S15), in the card's shared form: ready, booking confirmed, ETD, ETA,
// customs cleared, planned delivery and the delivery itself (a time). Beside the ETA, how near it
// is until the goods are delivered. The status actions ask for them (booking, ETD/ETA, delivery).
const form = injectShipmentForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const DAYS = [
   'ready_on',
   'booking_confirmed_on',
   'etd',
   'eta',
   'customs_cleared_on',
   'planned_delivery_on'
] as const;

const ETA_SEVERITY = { late: 'danger', this_week: 'warn', later: 'secondary' } as const;

const eta = computed(() =>
   form.row.value
      ? etaState(
           {
              eta: values.value.eta ? dayjs(values.value.eta).format('YYYY-MM-DD') : null,
              status: form.row.value.status
           },
           dayjs().format('YYYY-MM-DD')
        )
      : null
);
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
         v-for="field in DAYS"
         :key="field"
         fluid
         :label="$t(`ops.shipment.fields.${field}`)"
         :error="errors[field]"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            :data-field="field"
            :model-value="values[field] || null"
            @update:model-value="values[field] = $event as Date | null"
            date-format="yy-mm-dd"
            show-icon
            showClear
         />
         <Tag
            v-if="field === 'eta' && eta"
            class="mt-2"
            data-test="eta-state"
            :value="$t(`ops.shipment.eta_state.${eta}`)"
            :severity="ETA_SEVERITY[eta]"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.shipment.fields.delivered_at')"
         :error="errors.delivered_at"
         :readonly
         v-slot="slotProps"
      >
         <DatePicker
            v-bind="slotProps"
            data-field="delivered_at"
            :model-value="values.delivered_at || null"
            @update:model-value="values.delivered_at = $event as Date | null"
            date-format="yy-mm-dd"
            showTime
            hourFormat="24"
            show-icon
            showClear
         />
      </FormField>
   </FormBox>
</template>
