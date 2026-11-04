<script setup lang="ts">
import {
   PURCHASE_ORDER_STATUSES,
   PURCHASE_ORDER_STATUS_SEVERITY,
   type PurchaseOrderStatus
} from '@/api/purchaseOrder';
import {
   useLinkPurchaseOrder,
   useUnlinkPurchaseOrder,
   type ShipmentCardOrder,
   type ShipmentLineRow
} from '@/api/shipment';
import { useDeleteRow } from '@/api/tables';
import { useLookup } from '@/api/useLookup';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { DIALOG_POSITIONS } from '@/constants/router';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { injectShipmentForm, injectShipmentOverview, useShipmentLocked } from '../useShipmentForm';

// The orders on the shipment with their lines, and what of each line goes on it. Orders are put on
// it from the customer's open ones (pi_approved … balance_paid, shipment_po_not_open) and taken off
// while none of their lines is on it (shipment_po_has_lines); lines are added and edited in a
// dialog. From loaded on nothing here changes (shipment_locked). An order without an approved PSI
// is marked; it is a warning only (K3).
const form = injectShipmentForm();
const overview = injectShipmentOverview();
const locked = useShipmentLocked(form);

const shipment = computed(() => form.row.value ?? null);
const orders = computed(() =>
   (shipment.value?.shipment_purchase_order ?? []).flatMap(({ purchase_order }) =>
      purchase_order ? [purchase_order] : []
   )
);

/** The shipment's line of each order line on it. */
const shipmentLines = computed(
   () =>
      new Map<string, ShipmentLineRow>(
         (shipment.value?.shipment_line ?? []).map((line) => [line.purchase_order_line_id, line])
      )
);
const hasLines = (order: ShipmentCardOrder) =>
   order.purchase_order_line.some((line) => shipmentLines.value.has(line.id));

const psiMissing = computed(() => new Set(overview.value?.psi_missing_po_codes ?? []));

// --- changes ---

const confirmDelete = useConfirmDelete();
const { mutateAsync: link } = useLinkPurchaseOrder();
const { mutateAsync: unlink } = useUnlinkPurchaseOrder();
const { mutateAsync: deleteLine } = useDeleteRow('shipment_line');

const run = async (change: () => Promise<unknown>) => {
   try {
      await change();
   } catch (error) {
      appErrorHandler(error);
   }
};

const removeOrder = async (order: ShipmentCardOrder) => {
   if (!(await confirmDelete({ id: order.id, name: order.code }))) return;
   await run(() => unlink({ shipmentId: shipment.value!.id, purchaseOrderId: order.id }));
};

const removeLine = async (line: ShipmentLineRow, sku?: string | null) => {
   if (!(await confirmDelete({ id: line.id, name: sku }))) return;
   await run(() => deleteLine({ id: line.id }));
};

// --- the order picker ---

/** The order statuses a shipment may carry (031: pi_approved … balance_paid). */
const SHIPPABLE = PURCHASE_ORDER_STATUSES.slice(
   PURCHASE_ORDER_STATUSES.indexOf('pi_approved'),
   PURCHASE_ORDER_STATUSES.indexOf('balance_paid') + 1
);

type OrderOption = { id: string; code: string; status: PurchaseOrderStatus; customer_id: string };

const picking = ref(false);
const { data: openOrders } = useLookup<OrderOption>(
   'purchase_order_overview',
   { select: 'id, code, status, customer_id', in: { column: 'status', values: SHIPPABLE } },
   picking
);

/** The customer's open orders that are not on the shipment yet. */
const offered = computed(() => {
   const linked = new Set(orders.value.map(({ id }) => id));
   return (openOrders.value ?? [])
      .filter((order) => order.customer_id === shipment.value?.customer_id && !linked.has(order.id))
      .sort((a, b) => a.code.localeCompare(b.code));
});

const linking = ref(false);
const addOrder = async (order: OrderOption) => {
   linking.value = true;
   await run(async () => {
      await link({
         shipmentId: shipment.value!.id,
         purchaseOrderId: order.id,
         tenantId: shipment.value!.tenant_id
      });
      picking.value = false;
   });
   linking.value = false;
};
</script>

<template>
   <div class="flex flex-col gap-4">
      <span class="flex items-center justify-between gap-4">
         <span class="font-semibold">{{ $t('ops.shipment.tabs.orders') }}</span>
         <Button
            v-if="!locked && $can('create', 'shipment_purchase_order')"
            data-test="add-order"
            variant="outlined"
            :label="$t('ops.shipment.add_order')"
            @click="picking = true"
         />
      </span>
      <p v-if="!orders.length" class="m-0 text-muted-color">{{ $t('ops.shipment.no_orders') }}</p>
      <section
         v-for="order in orders"
         :key="order.id"
         :data-order="order.id"
         class="flex flex-col gap-2"
      >
         <span class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ order.code }}</span>
            <Tag
               :value="$t(`ops.purchase_order.status.${order.status}`)"
               :severity="PURCHASE_ORDER_STATUS_SEVERITY[order.status]"
            />
            <Tag
               v-if="psiMissing.has(order.code ?? '')"
               data-test="psi-missing"
               severity="warn"
               :value="$t('ops.shipment.psi_missing')"
            />
            <Button
               v-if="!locked && $can('modify', 'shipment_purchase_order')"
               class="ms-auto"
               data-test="remove-order"
               variant="text"
               severity="danger"
               :icon="PrimeIcons.TIMES"
               :label="$t('ops.shipment.remove_order')"
               :disabled="hasLines(order)"
               v-tooltip.top="hasLines(order) ? $t('errors.shipment_po_has_lines') : undefined"
               @click="removeOrder(order)"
            />
         </span>
         <DataTable :value="order.purchase_order_line" dataKey="id" showGridlines size="small">
            <Column :header="$t('ops.purchase_order.fields.sku')">
               <template #body="{ data }">
                  {{ data.product?.sku }}
               </template>
            </Column>
            <Column :header="$t('ops.purchase_order.fields.display_name')">
               <template #body="{ data }">{{ data.product?.display_name }}</template>
            </Column>
            <Column field="quantity" :header="$t('ops.shipment.fields.ordered')" />
            <Column :header="$t('ops.shipment.fields.on_shipment')">
               <template #body="{ data }">
                  <span :data-line="data.id">
                     {{ shipmentLines.get(data.id)?.quantity ?? '' }}
                  </span>
               </template>
            </Column>
            <Column :header="$t('ops.shipment.fields.carton_count')">
               <template #body="{ data }">{{
                  shipmentLines.get(data.id)?.carton_count ?? ''
               }}</template>
            </Column>
            <Column v-if="!locked">
               <template #body="{ data }">
                  <span :data-actions="data.id" class="flex justify-end gap-1">
                     <template v-if="shipmentLines.get(data.id)">
                        <CustomLink
                           v-if="$can('modify', 'shipment_line')"
                           :to="{
                              name: 'ops-shipment-line-edit',
                              params: { id: shipmentLines.get(data.id)!.id },
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
                        <Button
                           v-if="$can('modify', 'shipment_line')"
                           data-test="remove-line"
                           variant="text"
                           severity="danger"
                           :icon="PrimeIcons.TRASH"
                           :aria-label="$t('action.delete')"
                           @click="removeLine(shipmentLines.get(data.id)!, data.product?.sku)"
                        />
                     </template>
                     <CustomLink
                        v-else-if="$can('create', 'shipment_line')"
                        :to="{
                           name: 'ops-shipment-line-add',
                           params: { shipmentId: shipment!.id },
                           query: {
                              purchaseOrderLineId: data.id,
                              showDialog: DIALOG_POSITIONS.CENTER
                           }
                        }"
                     >
                        <template #default="{ navigate }">
                           <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                        </template>
                     </CustomLink>
                  </span>
               </template>
            </Column>
         </DataTable>
      </section>
   </div>
   <!-- A plain dialog: the card may itself be a route dialog. -->
   <Dialog
      v-model:visible="picking"
      modal
      :header="$t('ops.shipment.add_order')"
      :style="{ width: '28rem' }"
   >
      <p v-if="!offered.length" class="m-0 text-muted-color">
         {{ $t('ops.shipment.no_open_orders') }}
      </p>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
         <li v-for="order in offered" :key="order.id">
            <Button
               data-test="order-option"
               :data-option="order.id"
               class="w-full justify-between"
               variant="outlined"
               :disabled="linking"
               @click="addOrder(order)"
            >
               <span>{{ order.code }}</span>
               <Tag
                  :value="$t(`ops.purchase_order.status.${order.status}`)"
                  :severity="PURCHASE_ORDER_STATUS_SEVERITY[order.status]"
               />
            </Button>
         </li>
      </ul>
   </Dialog>
</template>
