<script setup lang="ts">
import {
   formatAmount,
   purchaseOrderPaymentResource,
   suggestPayments,
   type PurchaseOrderPaymentRow
} from '@/api/purchaseOrder';
import { toUnits } from '@/api/purchaseOrder/figures';
import { invalidateTables } from '@/api/queryKeys';
import { useFieldAccess } from '@/composables/useFieldAccess';
import { DIALOG_POSITIONS } from '@/constants/router';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useQueryClient } from '@tanstack/vue-query';
import { injectPurchaseOrderForm, injectPurchaseOrderOverview } from '../usePurchaseOrderForm';

// The order's payments as the card loaded them. "Plan from PI" adds the deposit and the balance
// the order has no row for yet, at the recalculated figures (the overview's system_*); a deposit
// that differs from the recalculated one is marked. The paid dates open the payment gates of the
// status flow (po_deposit_unpaid, po_balance_unpaid). Nothing changes once the order is closed or
// cancelled (po_closed).
const form = injectPurchaseOrderForm();
const overview = injectPurchaseOrderOverview();
const queryClient = useQueryClient();

const order = computed(() => form.row.value ?? null);
const orderId = computed(() => order.value?.id ?? null);
const currency = computed(() => overview.value?.currency ?? order.value?.currency ?? '');
const open = computed(() => !!order.value && !['closed', 'cancelled'].includes(order.value.status));

const payments = computed(() =>
   [...(order.value?.purchase_order_payment ?? [])].sort(
      (a, b) =>
         (a.planned_on ?? a.paid_on ?? '').localeCompare(b.planned_on ?? b.paid_on ?? '') ||
         a.created_at.localeCompare(b.created_at)
   )
);

const suggestions = computed(() => {
   const row = overview.value;
   if (
      !row ||
      row.system_subtotal === null ||
      row.system_total === null ||
      row.system_deposit === null ||
      row.system_balance === null
   )
      return [];
   return suggestPayments(
      {
         subtotal: row.system_subtotal,
         total: row.system_total,
         deposit: row.system_deposit,
         balance: row.system_balance
      },
      currency.value,
      payments.value
   );
});

/** A deposit whose amount is not the recalculated deposit (compared in cents, not as floats). */
const depositDiffers = (payment: PurchaseOrderPaymentRow) => {
   const deposit = overview.value?.system_deposit;
   return (
      payment.kind === 'deposit' &&
      deposit !== null &&
      deposit !== undefined &&
      payment.amount !== null &&
      toUnits(payment.amount, 2) !== toUnits(deposit, 2)
   );
};

const planning = ref(false);

/** Saves each suggested payment, unplanned and unpaid. */
const plan = async () => {
   if (!orderId.value) return;
   planning.value = true;
   try {
      for (const payment of suggestions.value)
         await purchaseOrderPaymentResource.repository.save({
            purchase_order_id: orderId.value,
            ...payment,
            planned_on: null,
            paid_on: null,
            notes: null
         });
   } catch (error) {
      await appErrorHandler(error);
   } finally {
      planning.value = false;
      await invalidateTables(queryClient, ['purchase_order_payment']);
   }
};

// Recording a payment takes its amount and currency (finance): a user who may only read them (a
// coordinator) neither plans nor adds payments.
const paymentAccess = useFieldAccess('purchase_order_payment');
const canRecordAmounts = computed(
   () => paymentAccess.canWrite('amount') && paymentAccess.canWrite('currency')
);
</script>

<template>
   <DataTable :value="payments" dataKey="id" showGridlines size="small">
      <template #header>
         <span class="flex flex-wrap items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.purchase_order.tabs.payments') }}</span>
            <span v-if="orderId && open" class="flex gap-2">
               <Button
                  v-if="
                     suggestions.length &&
                     $can('create', 'purchase_order_payment') &&
                     canRecordAmounts
                  "
                  data-test="plan-payments"
                  variant="outlined"
                  :label="$t('ops.purchase_order.plan_payments')"
                  :loading="planning"
                  @click="plan"
               />
               <CustomLink
                  v-if="$can('create', 'purchase_order_payment') && canRecordAmounts"
                  :to="{
                     name: 'ops-purchase-order-payment-add',
                     params: { purchaseOrderId: orderId },
                     query: { showDialog: DIALOG_POSITIONS.CENTER }
                  }"
               >
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </span>
      </template>
      <template #empty>{{ $t('ops.purchase_order.no_payments') }}</template>
      <Column :header="$t('ops.purchase_order.payment.fields.kind')">
         <template #body="{ data }">
            <span class="flex flex-wrap items-center gap-2">
               {{ $t(`ops.purchase_order.payment.kind.${data.kind}`) }}
               <Tag
                  v-if="depositDiffers(data)"
                  data-test="deposit-differs"
                  severity="warn"
                  :value="$t('ops.purchase_order.deposit_differs')"
               />
            </span>
         </template>
      </Column>
      <Column
         v-if="paymentAccess.canRead('amount')"
         :header="$t('ops.purchase_order.payment.fields.amount')"
      >
         <template #body="{ data }">{{ formatAmount(data.amount, data.currency) }}</template>
      </Column>
      <Column field="planned_on" :header="$t('ops.purchase_order.payment.fields.planned_on')" />
      <Column field="paid_on" :header="$t('ops.purchase_order.payment.fields.paid_on')" />
      <Column :header="$t('ops.purchase_order.payment.fields.paid_by')">
         <template #body="{ data }">
            {{ $t(`ops.purchase_order.payment.payer.${data.paid_by}`) }}
         </template>
      </Column>
      <Column
         v-if="paymentAccess.canRead('notes')"
         field="notes"
         :header="$t('ops.purchase_order.fields.notes')"
      />
      <Column v-if="open && $can('modify', 'purchase_order_payment')">
         <template #body="{ data }">
            <CustomLink
               :to="{
                  name: 'ops-purchase-order-payment-edit',
                  params: { id: data.id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button
                     variant="text"
                     :icon="PrimeIcons.PENCIL"
                     :aria-label="$t('action.edit')"
                     @click="navigate"
                  />
               </template>
            </CustomLink>
         </template>
      </Column>
   </DataTable>
</template>
