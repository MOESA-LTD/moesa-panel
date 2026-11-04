<script setup lang="ts">
import { useMemberOptions } from '@/api/project';
import {
   PI_CHECK_KEYS,
   PI_CHECK_STATUSES,
   formatAmount,
   piChecklistComplete,
   useEntityDocumentOptions,
   type PiCheckKey,
   type PiCheckStatus,
   type PurchaseOrderCardLine
} from '@/api/purchaseOrder';
import { invalidateTables } from '@/api/queryKeys';
import { updateRow } from '@/api/saveRow';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useQueryClient } from '@tanstack/vue-query';
import dayjs from 'dayjs';
import {
   injectPurchaseOrderForm,
   purchaseOrderPiCheck,
   useOrderLocked
} from '../usePurchaseOrderForm';

// The S09 PI check, in the card's shared form: the PI document and its figures, the 30-item
// checklist, and the recalculation against them, live as they are typed. Each line's PI total is
// saved on its own (it is the line's column). Approving the PI is a status action; the database
// checks both halves then (po_pi_mismatch, po_pi_checklist_incomplete). From pi_approved on it
// is all read-only, with who checked it and when.
const form = injectPurchaseOrderForm();
const { values, errors, isDirty, isSubmitting, readonly, reset, submit, draft } = form;

const { t } = useI18n();
const queryClient = useQueryClient();
const locked = useOrderLocked(form);
const members = useMemberOptions();

const id = computed(() => values.value.id ?? null);
const currency = computed(() => form.row.value?.currency ?? values.value.currency ?? '');
const fixed = computed(() => readonly.value || locked.value);

const piOptions = useEntityDocumentOptions(() => ({
   entityType: 'purchase_order',
   entityId: id.value,
   type: 'pi'
}));

// --- the recalculation ---

const lines = computed(() =>
   [...(form.row.value?.purchase_order_line ?? [])].sort((a, b) => a.position - b.position)
);

// The PI line totals as typed, until they are saved (and the order reloads with them).
const lineTotals = ref<Record<string, number | null>>({});
watch(
   lines,
   (rows) =>
      (lineTotals.value = Object.fromEntries(rows.map((line) => [line.id, line.pi_line_total]))),
   { immediate: true }
);

// Live from the form; incomplete lines and cleared inputs are left out (see purchaseOrderPiCheck).
const check = computed(() => purchaseOrderPiCheck(lines.value, values.value, lineTotals.value));

// --- the PI figures ---

const FIGURES = [
   ['pi_subtotal', 'subtotal'],
   ['pi_extra_amount', 'extra'],
   ['pi_discount_amount', 'discount'],
   ['pi_total', 'total'],
   ['pi_deposit_amount', 'deposit'],
   ['pi_balance_amount', 'balance']
] as const;

// --- line totals ---

const canEditLines = computed(() => !fixed.value);

/** Saves a line's PI total once its input is left, when it changed. */
const saveLineTotal = async (line: PurchaseOrderCardLine) => {
   // InputNumber reports the blur before its final value.
   await nextTick();
   const value = lineTotals.value[line.id] ?? null;
   if (value === line.pi_line_total) return;
   try {
      await updateRow('purchase_order_line', line.id, { pi_line_total: value });
   } catch (error) {
      return appErrorHandler(error);
   }
   await invalidateTables(queryClient, ['purchase_order_line']);
};

// --- checklist ---

const statusOptions = computed(() =>
   PI_CHECK_STATUSES.map((value) => ({
      value,
      label: t(`ops.purchase_order.pi_check.status.${value}`)
   }))
);

const checkOf = (key: PiCheckKey) => values.value.pi_check?.[key] ?? null;

const setCheck = (key: PiCheckKey, status: PiCheckStatus | null) => {
   const next = { ...(values.value.pi_check ?? {}) };
   if (status) next[key] = status;
   else delete next[key];
   values.value.pi_check = next;
};

const okCount = computed(
   () => PI_CHECK_KEYS.filter((key) => values.value.pi_check?.[key] === 'ok').length
);
const checklistComplete = computed(() => piChecklistComplete(values.value.pi_check ?? {}));

// --- checked by ---

const checkedBy = computed(() => {
   const userId = form.row.value?.pi_checked_by;
   if (!userId) return null;
   return members.value.find(({ value }) => value === userId)?.label ?? userId;
});
const checkedAt = computed(() => {
   const at = form.row.value?.pi_checked_at;
   return at ? dayjs(at).format('YYYY-MM-DD HH:mm') : null;
});
</script>

<template>
   <div class="flex flex-col gap-4">
      <div
         v-if="locked && (checkedBy || checkedAt)"
         class="flex flex-wrap gap-6 px-4"
         data-test="pi-checked"
      >
         <span>
            <span class="text-muted-color">{{ $t('ops.purchase_order.fields.checked_by') }}:</span>
            {{ checkedBy }}
         </span>
         <span>
            <span class="text-muted-color">{{ $t('ops.purchase_order.fields.checked_at') }}:</span>
            {{ checkedAt }}
         </span>
      </div>

      <FormBox
         @submit="submit"
         @reset="() => reset()"
         v-focustrap
         :readonly="fixed"
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
      >
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.pi_document')"
            :error="errors.pi_document_id"
            :readonly="fixed"
            v-slot="slotProps"
         >
            <Select
               v-bind="slotProps"
               v-model="values.pi_document_id"
               :options="piOptions"
               option-value="value"
               option-label="label"
               showClear
               data-field="pi_document_id"
               :disabled="fixed"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.purchase_order.fields.pi_number')"
            :error="errors.pi_number"
            :readonly="fixed"
            v-slot="slotProps"
         >
            <InputText
               v-bind="slotProps"
               v-model="values.pi_number"
               data-field="pi_number"
               :disabled="fixed"
            />
         </FormField>
         <FormField
            v-for="[field, key] in FIGURES"
            :key="field"
            fluid
            :label="$t(`ops.purchase_order.pi.${key}`)"
            :error="errors[field]"
            :readonly="fixed"
            v-slot="slotProps"
         >
            <InputNumber
               v-bind="slotProps"
               v-model="values[field]"
               :data-field="field"
               :min="field === 'pi_discount_amount' ? 0 : undefined"
               :minFractionDigits="2"
               :maxFractionDigits="2"
               :suffix="currency ? ` ${currency}` : undefined"
               :disabled="fixed"
            />
         </FormField>

         <div class="w-full" data-test="pi-checklist">
            <div class="mb-2 flex items-center gap-2">
               <span class="font-semibold">{{ $t('ops.purchase_order.pi.checklist') }}</span>
               <Tag
                  :value="`${okCount} / ${PI_CHECK_KEYS.length}`"
                  :severity="checklistComplete ? 'success' : 'secondary'"
                  data-test="pi-checklist-count"
               />
            </div>
            <div
               v-for="key in PI_CHECK_KEYS"
               :key
               class="flex flex-wrap items-center justify-between gap-2 border-b border-surface py-1"
               :data-check="key"
            >
               <span>{{ key }}. {{ $t(`ops.purchase_order.pi_check.items.${key}`) }}</span>
               <SelectButton
                  :model-value="checkOf(key)"
                  @update:model-value="setCheck(key, $event)"
                  :options="statusOptions"
                  option-value="value"
                  option-label="label"
                  size="small"
                  :disabled="fixed"
               />
            </div>
         </div>
      </FormBox>

      <DataTable :value="lines" dataKey="id" showGridlines size="small">
         <template #header>
            <span class="font-semibold">{{ $t('ops.purchase_order.pi.line_totals') }}</span>
         </template>
         <template #empty>{{ $t('ops.purchase_order.no_lines') }}</template>
         <Column field="position" :header="$t('ops.purchase_order.fields.position')" />
         <Column :header="$t('ops.purchase_order.fields.sku')">
            <template #body="{ data }">{{ data.product?.sku }}</template>
         </Column>
         <Column :header="$t('ops.purchase_order.fields.line_total')">
            <template #body="{ data }">{{ formatAmount(data.line_total, currency) }}</template>
         </Column>
         <Column :header="$t('ops.purchase_order.fields.pi_line_total')">
            <template #body="{ data }">
               <InputNumber
                  v-if="canEditLines && $can('modify', 'purchase_order_line')"
                  v-model="lineTotals[data.id]"
                  :data-line-total="data.id"
                  :minFractionDigits="2"
                  :maxFractionDigits="2"
                  :suffix="currency ? ` ${currency}` : undefined"
                  @blur="saveLineTotal(data)"
               />
               <span v-else>{{ formatAmount(data.pi_line_total, currency) }}</span>
            </template>
         </Column>
      </DataTable>

      <PiArithmeticTable :rows="check.rows" :currency />
   </div>
</template>
