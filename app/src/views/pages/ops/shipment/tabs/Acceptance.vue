<script setup lang="ts">
import { acceptanceHints, documentChecklist, nextShipmentStatuses } from '@/api/shipment';
import type { DocumentStatus } from '@/api/document';
import dayjs from 'dayjs';
import {
   injectShipmentForm,
   receiptStatus,
   shipmentHazmat,
   useShipmentDocuments,
   type ShipmentCardTab
} from '../useShipmentForm';

// The S16 delivery acceptance, in the card's shared form: who received the goods, whether the
// quantities match, whether anything is damaged, and the dispute deadline. Beside it the M8 shipping
// documents (the SDS only with a hazardous line on the shipment), each with the status of its
// newest version; they are added on the Documents tab. While accepting is the next step, what the
// database would refuse it for is named (031, rule 6: from disputed, the receipt only); only the
// database decides.
const emit = defineEmits<{ openTab: [tab: ShipmentCardTab] }>();

const form = injectShipmentForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const shipment = computed(() => form.row.value ?? null);
const documents = useShipmentDocuments(() => shipment.value?.id);

const checklist = computed(() =>
   documentChecklist(documents.value, shipmentHazmat(shipment.value))
);

const hints = computed(() =>
   shipment.value && nextShipmentStatuses(shipment.value.status).includes('accepted')
      ? acceptanceHints(
           {
              status: shipment.value.status,
              quantity_matches: values.value.quantity_matches ?? null,
              has_damage: values.value.has_damage ?? null
           },
           receiptStatus(documents.value)
        )
      : []
);

const DOCUMENT_SEVERITY: Record<DocumentStatus, string> = {
   draft: 'secondary',
   signed: 'success',
   approved: 'info',
   superseded: 'warn'
};

const { t } = useI18n();
const yesNo = computed(() => [
   { label: t('action.yes'), value: true },
   { label: t('action.no'), value: false }
]);

const acceptedOn = computed(() =>
   shipment.value?.accepted_on ? dayjs(shipment.value.accepted_on).format('YYYY-MM-DD') : null
);
</script>

<template>
   <div class="flex flex-col gap-6">
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
            :label="$t('ops.shipment.fields.accepted_by')"
            :error="errors.accepted_by"
            :readonly
            v-slot="slotProps"
         >
            <InputText v-bind="slotProps" v-model="values.accepted_by" />
         </FormField>
         <FormField
            v-for="field in ['quantity_matches', 'has_damage'] as const"
            :key="field"
            fluid
            :label="$t(`ops.shipment.fields.${field}`)"
            :error="errors[field]"
            :readonly
            v-slot="slotProps"
         >
            <!-- Unanswered (null) until the receiver says; a second click clears it. -->
            <SelectButton
               v-bind="slotProps"
               v-model="values[field]"
               :data-field="field"
               :options="yesNo"
               option-label="label"
               option-value="value"
               :disabled="readonly"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.shipment.fields.dispute_deadline_at')"
            :error="errors.dispute_deadline_at"
            :readonly
            v-slot="slotProps"
         >
            <DatePicker
               v-bind="slotProps"
               data-field="dispute_deadline_at"
               :model-value="values.dispute_deadline_at || null"
               @update:model-value="values.dispute_deadline_at = $event as Date | null"
               date-format="yy-mm-dd"
               showTime
               hourFormat="24"
               show-icon
               showClear
            />
         </FormField>
         <p v-if="acceptedOn" class="m-0 w-full" data-test="accepted-on">
            {{ $t('ops.shipment.fields.accepted_on') }}: {{ acceptedOn }}
         </p>
         <div v-if="hints.length" class="flex w-full flex-col gap-2">
            <Message
               v-for="hint in hints"
               :key="hint"
               :data-hint="hint"
               severity="warn"
               size="small"
            >
               {{ $t(`errors.${hint}`) }}
            </Message>
         </div>
      </FormBox>
      <section class="flex flex-col gap-2">
         <span class="font-semibold">{{ $t('ops.shipment.document_checklist') }}</span>
         <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li
               v-for="row in checklist"
               :key="row.type"
               :data-doc-type="row.type"
               :data-status="row.status ?? ''"
               class="flex items-center justify-between gap-4"
            >
               <Button
                  variant="link"
                  class="p-0"
                  :label="$t(`ops.document.type.${row.type}`)"
                  @click="emit('openTab', 'documents')"
               />
               <Tag
                  v-if="row.status"
                  :value="$t(`ops.document.status.${row.status}`)"
                  :severity="DOCUMENT_SEVERITY[row.status]"
               />
               <Tag v-else :value="$t('ops.shipment.document_missing')" severity="danger" />
            </li>
         </ul>
      </section>
   </div>
</template>
