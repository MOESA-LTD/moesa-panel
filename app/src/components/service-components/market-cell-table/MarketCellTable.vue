<script setup lang="ts">
import { withCustomerFilter } from '@/api/customerFilter';
import {
   MARKET_CELL_STATUS_SEVERITY,
   MARKET_CELL_STATUSES,
   type MarketCellStatus
} from '@/api/marketMatrix';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { formatEmpty } from '@/constants/format';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';

// The market cells (public.market_cell_overview) of the customer the lists are filtered by (every
// customer's when none is), as a list: the matrix's other view.
type Props = ResourceTableProps<'market_cell_overview'>;

const router = useRouter();
const { t } = useI18n();

const enumFilterColumn = {
   showFilterMatchModes: false,
   showFilterOperator: false,
   showAddButton: false
};

const columns = computed<Props['columns']>(() => [
   { field: 'sku', sortable: true, sortOrder: { value: 1 }, header: t('ops.market.fields.sku') },
   { field: 'product_name', sortable: true, header: t('ops.market.fields.product') },
   { field: 'platform_name', sortable: true, header: t('ops.market.fields.platform') },
   { field: 'country', sortable: true, header: t('ops.market.fields.country') },
   { field: 'status', sortable: true, header: t('ops.market.fields.status'), ...enumFilterColumn },
   { field: 'priority', sortable: true, header: t('ops.market.fields.priority') },
   { field: 'compliance', sortable: true, header: t('ops.market.fields.compliance') },
   { field: 'content_status', sortable: true, header: t('ops.market.fields.content_status') },
   { field: 'target_launch_on', sortable: true, header: t('ops.market.fields.target_launch_on') },
   { field: 'launched_on', sortable: true, header: t('ops.market.fields.launched_on') },
   { field: 'last_checked_on', sortable: true, header: t('ops.market.fields.last_checked_on') }
]);

// No keyword search: it would compare the enum and id filter columns as text.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters({
      sku: 'startsWith',
      product_name: 'text',
      country: 'startsWith',
      status: equalsFilter(),
      customer_id: equalsFilter()
   })
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
               name: 'ops-market-cell-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

const COMPLIANCE_SEVERITY: Record<string, string> = {
   green: 'success',
   yellow: 'warn',
   red: 'danger',
   pending: 'secondary'
};
</script>

<template>
   <ResourceTable
      stateKey="market-cell"
      from="market_cell_overview"
      select="*"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.market.status.${data.status}`)"
            :severity="MARKET_CELL_STATUS_SEVERITY[data.status as MarketCellStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="MARKET_CELL_STATUSES"
            i18n-prefix="ops.market.status"
            glossary="market_cell_status"
         />
      </template>
      <template #priority_body="{ data }">
         <span
            v-tooltip.top="data.priority ? $t(`ops.market.priority.${data.priority}`) : undefined"
         >
            {{ formatEmpty(data.priority?.toString()) }}
         </span>
      </template>
      <template #compliance_body="{ data }">
         <Tag
            v-if="data.compliance"
            :value="$t(`ops.market.compliance.${data.compliance}`)"
            :severity="COMPLIANCE_SEVERITY[data.compliance]"
         />
      </template>
      <template #content_status_body="{ data }">
         {{ data.content_status ? $t(`ops.market.content_status.${data.content_status}`) : '' }}
      </template>
   </ResourceTable>
</template>
