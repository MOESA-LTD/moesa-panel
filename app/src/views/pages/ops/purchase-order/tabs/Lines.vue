<script setup lang="ts">
import { formatAmount, type PurchaseOrderCardLine } from '@/api/purchaseOrder';
import { useFieldAccess } from '@/composables/useFieldAccess';
import { DIALOG_POSITIONS } from '@/constants/router';
import {
   injectPurchaseOrderForm,
   injectPurchaseOrderOverview,
   useOrderLocked
} from '../usePurchaseOrderForm';

// The order's lines as the card loaded them, with the spec sheet each was ordered against. The
// missing-spec mark comes from the overview (the database's rule); it only hints, the database
// refuses. Lines are added and edited in a dialog until the PI is approved.
const form = injectPurchaseOrderForm();
const overview = injectPurchaseOrderOverview();
const locked = useOrderLocked(form);

const orderId = computed(() => form.row.value?.id ?? null);
const currency = computed(() => overview.value?.currency ?? form.row.value?.currency ?? null);

const lines = computed(() =>
   [...(form.row.value?.purchase_order_line ?? [])].sort((a, b) => a.position - b.position)
);
const specMissing = computed(() => new Set(overview.value?.spec_missing_line_ids ?? []));

const specVersion = (line: PurchaseOrderCardLine) =>
   `v${String(line.spec_document?.version ?? 0).padStart(2, '0')}`;

// A user without the cost fields sees the lines without their prices.
const lineAccess = useFieldAccess('purchase_order_line');
</script>

<template>
   <DataTable :value="lines" dataKey="id" showGridlines size="small">
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.purchase_order.tabs.lines') }}</span>
            <CustomLink
               v-if="orderId && !locked && $can('create', 'purchase_order_line')"
               :to="{
                  name: 'ops-purchase-order-line-add',
                  params: { purchaseOrderId: orderId },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #empty>{{ $t('ops.purchase_order.no_lines') }}</template>
      <Column field="position" :header="$t('ops.purchase_order.fields.position')" />
      <Column :header="$t('ops.purchase_order.fields.sku')">
         <template #body="{ data }">{{ data.product?.sku }}</template>
      </Column>
      <Column :header="$t('ops.purchase_order.fields.display_name')">
         <template #body="{ data }">{{ data.product?.display_name }}</template>
      </Column>
      <Column field="quantity" :header="$t('ops.purchase_order.fields.quantity')" />
      <Column
         v-if="lineAccess.canRead('unit_price')"
         :header="$t('ops.purchase_order.fields.unit_price')"
      >
         <template #body="{ data }">{{ data.unit_price }} {{ currency }}</template>
      </Column>
      <Column
         v-if="lineAccess.canRead('line_total')"
         :header="$t('ops.purchase_order.fields.line_total')"
      >
         <template #body="{ data }">{{ formatAmount(data.line_total, currency) }}</template>
      </Column>
      <Column :header="$t('ops.purchase_order.fields.spec_document')">
         <template #body="{ data }">
            <Tag
               v-if="data.spec_document"
               data-test="spec-version"
               :value="specVersion(data)"
               severity="success"
            />
            <Tag
               v-else-if="specMissing.has(data.id)"
               data-test="spec-missing"
               :data-line="data.id"
               :value="$t('ops.purchase_order.spec_missing')"
               severity="danger"
            />
         </template>
      </Column>
      <Column v-if="!locked && $can('modify', 'purchase_order_line')">
         <template #body="{ data }">
            <CustomLink
               :to="{
                  name: 'ops-purchase-order-line-edit',
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
      <template #footer>
         <span class="flex justify-end gap-2" data-test="subtotal">
            <span>{{ $t('ops.purchase_order.fields.subtotal') }}:</span>
            <span class="font-semibold">
               {{ formatAmount(overview?.system_subtotal, currency) }}
            </span>
         </span>
      </template>
   </DataTable>
</template>
