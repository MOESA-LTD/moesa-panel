<script setup lang="ts">
import { useMemberOptions } from '@/api/project';
import { usePurchaseOrderUpdates } from '@/api/purchaseOrder';
import { DIALOG_POSITIONS } from '@/constants/router';
import { injectPurchaseOrderForm } from '../usePurchaseOrderForm';

// The order's production log, newest first: what the supplier reported and who wrote it down.
// Entries are added and edited in a dialog until the order is closed or cancelled (po_closed).
const props = defineProps<{ id: string }>();

const form = injectPurchaseOrderForm();
const members = useMemberOptions();

const { data: updates } = usePurchaseOrderUpdates(() => props.id);

const open = computed(
   () => !!form.row.value && !['closed', 'cancelled'].includes(form.row.value.status)
);

const author = (userId: string | null) =>
   userId ? (members.value.find(({ value }) => value === userId)?.label ?? userId) : '';
</script>

<template>
   <DataTable :value="updates ?? []" dataKey="id" showGridlines size="small">
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.purchase_order.tabs.production') }}</span>
            <CustomLink
               v-if="open && $can('create', 'purchase_order_update')"
               :to="{
                  name: 'ops-purchase-order-update-add',
                  params: { purchaseOrderId: id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #empty>{{ $t('ops.purchase_order.no_updates') }}</template>
      <Column
         field="happened_on"
         :header="$t('ops.purchase_order.production.fields.happened_on')"
      />
      <Column :header="$t('ops.purchase_order.production.fields.note')">
         <template #body="{ data }">
            <span class="whitespace-pre-line">{{ data.note }}</span>
         </template>
      </Column>
      <Column :header="$t('ops.purchase_order.production.fields.author')">
         <template #body="{ data }">{{ author(data.created_by) }}</template>
      </Column>
      <Column v-if="open && $can('modify', 'purchase_order_update')">
         <template #body="{ data }">
            <CustomLink
               :to="{
                  name: 'ops-purchase-order-update-edit',
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
