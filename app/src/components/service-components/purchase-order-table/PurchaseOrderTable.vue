<script setup lang="ts">
import { withCustomerFilter } from '@/api/customerFilter';
import {
   formatAmount,
   PURCHASE_ORDER_STATUS_SEVERITY,
   PURCHASE_ORDER_STATUSES,
   usePurchaseOrderIds,
   type PurchaseOrderStatus
} from '@/api/purchaseOrder';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter,
   type FilterSpec
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';

// Purchase orders (public.purchase_order_overview) of the customer the lists are filtered by
// (every customer's when none is), optionally of one supplier, project or product. Embedded in
// another card (with filters), the table keeps its state for the session only.
type Props = ResourceTableProps<'purchase_order_overview'>;

const props = defineProps<{
   filters?: { supplierId?: string; projectId?: string; productId?: string };
}>();

const router = useRouter();
const { t } = useI18n();

const embedded = computed(() => !!props.filters);
const productId = computed(() => props.filters?.productId);

// The orders with a line of the product. Until they are known, or when there are none, the table
// is not shown: an empty IN filter is skipped and would match every order.
const { data: productOrderIds } = usePurchaseOrderIds(() => ({ productId: productId.value }));
const showTable = computed(() => !productId.value || (productOrderIds.value?.length ?? 0) > 0);

const enumFilterColumn = {
   showFilterMatchModes: false,
   showFilterOperator: false,
   showAddButton: false
};

const columns = computed<Props['columns']>(() => [
   {
      field: 'code',
      sortable: true,
      sortOrder: { value: -1 },
      header: t('ops.purchase_order.fields.code')
   },
   { field: 'customer_code', sortable: true, header: t('ops.purchase_order.fields.customer') },
   {
      field: 'supplier_id',
      sortField: 'supplier_code',
      sortable: true,
      header: t('ops.purchase_order.fields.supplier'),
      ...enumFilterColumn
   },
   { field: 'project_code', sortable: true, header: t('ops.purchase_order.fields.project') },
   {
      field: 'status',
      sortable: true,
      header: t('ops.purchase_order.fields.status'),
      ...enumFilterColumn
   },
   { field: 'ready_on', sortable: true, header: t('ops.purchase_order.fields.ready_on') },
   { field: 'system_total', sortable: true, header: t('ops.purchase_order.fields.total') },
   {
      field: 'deposit_paid_on',
      sortable: true,
      header: t('ops.purchase_order.fields.deposit_paid_on')
   },
   {
      field: 'balance_planned_on',
      sortable: true,
      header: t('ops.purchase_order.fields.balance_planned_on')
   }
]);

const idFilter = (ids: readonly string[]) => ({
   operator: FilterOperator.AND,
   constraints: [{ value: [...ids], matchMode: FilterMatchMode.IN }]
});

// No keyword search: it would compare the enum and id filter columns as text.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters({
      code: 'startsWith',
      status: equalsFilter(),
      customer_id: equalsFilter(),
      supplier_id: equalsFilter(props.filters?.supplierId ?? null),
      project_id: equalsFilter(props.filters?.projectId ?? null),
      ...(productId.value ? { id: idFilter([]) as FilterSpec } : {})
   })
);

// Set before the table mounts (it shows once the ids are there) and kept current after.
watch(
   productOrderIds,
   (ids) => {
      if (productId.value && ids) filters.value.id = idFilter(ids);
   },
   { immediate: true }
);

// The table reads its filters once and then restores its stored state over them, so the selected
// customer is written into the existing customer filter after mounting and whenever it changes.
const customerFilter = useCustomerFilter();
const applyCustomerFilter = () => {
   const { customer_id } = withCustomerFilter({}, customerFilter.customerId);
   filters.value.customer_id.constraints = (customer_id ?? equalsFilter()).constraints;
};
onMounted(applyCustomerFilter);
watch(() => customerFilter.customerId, applyCustomerFilter);

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-purchase-order-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      v-if="showTable"
      stateKey="purchase-order"
      from="purchase_order_overview"
      select="*"
      :useMeta="!embedded"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #supplier_id_body="{ data }">{{ data.supplier_code }}</template>
      <template #supplier_id_filter="{ filterModel }">
         <SelectSupplier v-model="filterModel.value" />
      </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.purchase_order.status.${data.status}`)"
            :severity="PURCHASE_ORDER_STATUS_SEVERITY[data.status as PurchaseOrderStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="PURCHASE_ORDER_STATUSES"
            i18n-prefix="ops.purchase_order.status"
         />
      </template>
      <template #system_total_body="{ data }">
         {{ formatAmount(data.system_total, data.currency) }}
      </template>
   </ResourceTable>
   <p v-else class="m-0 p-4 text-muted-color">{{ $t('ops.purchase_order.no_rows') }}</p>
</template>
