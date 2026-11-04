<script setup lang="ts">
import { CHANGE_REQUEST_STATUSES, type ChangeRequestStatus } from '@/api/changeRequest';
import { withCustomerFilter } from '@/api/customerFilter';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';
import { isDecisionOverdue } from '@/views/pages/ops/change-request/useChangeRequestForm';

// Change requests (S08) of the customer the lists are filtered by (every customer's when none
// is), the newest first. An open request whose decision date has passed is marked.
type Props = ResourceTableProps<'change_request'>;

const router = useRouter();
const { t } = useI18n();

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
      header: t('ops.change_request.fields.code')
   },
   { field: 'customer.code', header: t('ops.change_request.fields.customer') },
   { field: 'project.code', header: t('ops.change_request.fields.project') },
   { field: 'title', sortable: true, header: t('ops.change_request.fields.title') },
   { field: 'source', sortable: true, header: t('ops.change_request.fields.source') },
   { field: 'urgency', sortable: true, header: t('ops.change_request.fields.urgency') },
   {
      field: 'status',
      sortable: true,
      header: t('ops.change_request.fields.status'),
      ...enumFilterColumn
   },
   {
      field: 'decision_due_on',
      sortable: true,
      header: t('ops.change_request.fields.decision_due_on')
   },
   { field: 'closed_on', sortable: true, header: t('ops.change_request.fields.closed_on') }
]);

// No keyword search: it would compare the enum and id filter columns as text.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters({
      code: 'startsWith',
      title: 'text',
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

const STATUS_SEVERITY: Record<ChangeRequestStatus, string> = {
   open: 'info',
   approved: 'success',
   rejected: 'secondary',
   applied: 'secondary'
};

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-change-request-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="change_request"
      from="change_request"
      select="*, customer!change_request_customer_fkey(code), project!change_request_project_fkey(code)"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #empty>
         <span class="text-muted-color">{{ $t('ops.change_request.no_rows') }}</span>
      </template>
      <template #source_body="{ data }">
         {{ data.source ? $t(`ops.change_request.source.${data.source}`) : '' }}
      </template>
      <template #urgency_body="{ data }">
         <Tag
            v-if="data.urgency === 'urgent'"
            severity="warn"
            :value="$t('ops.change_request.urgency.urgent')"
         />
         <template v-else-if="data.urgency">
            {{ $t(`ops.change_request.urgency.${data.urgency}`) }}
         </template>
      </template>
      <template #status_body="{ data }">
         <Tag
            v-if="data.status"
            :value="$t(`ops.change_request.status.${data.status}`)"
            :severity="STATUS_SEVERITY[data.status as ChangeRequestStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="CHANGE_REQUEST_STATUSES"
            i18n-prefix="ops.change_request.status"
            glossary="change_request_status"
         />
      </template>
      <template #decision_due_on_body="{ data }">
         <Tag
            v-if="isDecisionOverdue(data)"
            data-test="decision-overdue"
            severity="danger"
            :value="data.decision_due_on"
            v-tooltip.top="$t('ops.change_request.overdue')"
         />
         <template v-else>{{ data.decision_due_on ?? '' }}</template>
      </template>
   </ResourceTable>
</template>
