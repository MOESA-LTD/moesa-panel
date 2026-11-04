<script setup lang="ts">
import { withCustomerFilter } from '@/api/customerFilter';
import {
   INCIDENT_SEVERITIES,
   INCIDENT_SEVERITY_SEVERITY,
   INCIDENT_STATUSES,
   type IncidentEntityType,
   type IncidentSeverity
} from '@/api/incident';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter } from '@/store/customerFilter';
import dayjs from 'dayjs';

// Incidents (public.incident_overview) of the customer the lists are filtered by (every
// customer's when none is), optionally only those linked to one record (a project's Incidents
// tab). The most severe come first, then the newest. Embedded in another card (with filters), the
// table keeps its state for the session only.
type Props = ResourceTableProps<'incident_overview'>;

const props = defineProps<{
   filters?: { entityType?: IncidentEntityType; entityId?: string };
}>();

const router = useRouter();
const { t } = useI18n();

const embedded = computed(() => !!props.filters);

const enumFilterColumn = {
   showFilterMatchModes: false,
   showFilterOperator: false,
   showAddButton: false
};

const columns = computed<Props['columns']>(() => [
   { field: 'code', sortable: true, header: t('ops.incident.fields.code') },
   { field: 'customer_code', sortable: true, header: t('ops.incident.fields.customer') },
   {
      field: 'severity',
      sortable: true,
      sortOrder: { value: 1, priority: 1 },
      header: t('ops.incident.fields.severity'),
      ...enumFilterColumn
   },
   {
      field: 'status',
      sortable: true,
      header: t('ops.incident.fields.status'),
      ...enumFilterColumn
   },
   { field: 'title', sortable: true, header: t('ops.incident.fields.title') },
   { field: 'entity_label', header: t('ops.incident.fields.entity') },
   {
      field: 'opened_at',
      sortable: true,
      sortOrder: { value: -1, priority: 2 },
      header: t('ops.incident.fields.opened_at')
   },
   {
      field: 'next_deadline_at',
      sortable: true,
      header: t('ops.incident.fields.next_deadline_at')
   },
   { field: 'is_repeat', header: t('ops.incident.fields.is_repeat') }
]);

// No keyword search: it would compare the enum and id filter columns as text.
const tableFilters = ref<NonNullable<Props['filters']>>(
   createFilters({
      code: 'startsWith',
      severity: equalsFilter(),
      status: equalsFilter(),
      customer_id: equalsFilter(),
      entity_type: equalsFilter(props.filters?.entityType ?? null),
      entity_id: equalsFilter(props.filters?.entityId ?? null)
   })
);

// The table reads its filters once and then restores its stored state over them, so the selected
// customer (and the record an embedded table is narrowed to) is written into the existing filters
// after mounting and whenever it changes.
const customerFilter = useCustomerFilter();
const applyFilters = () => {
   const { customer_id } = withCustomerFilter({}, customerFilter.customerId);
   tableFilters.value.customer_id.constraints = (customer_id ?? equalsFilter()).constraints;
   if (embedded.value) {
      tableFilters.value.entity_type.constraints = equalsFilter(
         props.filters?.entityType ?? null
      ).constraints;
      tableFilters.value.entity_id.constraints = equalsFilter(
         props.filters?.entityId ?? null
      ).constraints;
   }
};
onMounted(applyFilters);
watch([() => customerFilter.customerId, () => props.filters], applyFilters, { deep: true });

const time = (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '');

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-incident-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="incident"
      from="incident_overview"
      select="*"
      :useMeta="!embedded"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="tableFilters"
   >
      <template #empty>
         <span class="text-muted-color">{{ $t('ops.incident.no_rows') }}</span>
      </template>
      <template #severity_body="{ data }">
         <Tag
            v-if="data.severity"
            :value="$t(`ops.incident.severity.${data.severity}`)"
            :severity="INCIDENT_SEVERITY_SEVERITY[data.severity as IncidentSeverity]"
         />
      </template>
      <template #severity_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="INCIDENT_SEVERITIES"
            i18n-prefix="ops.incident.severity"
            glossary="incident_severity"
         />
      </template>
      <template #status_body="{ data }">
         <Tag
            v-if="data.status"
            :value="$t(`ops.incident.status.${data.status}`)"
            :severity="data.status === 'closed' ? 'secondary' : 'info'"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="INCIDENT_STATUSES"
            i18n-prefix="ops.incident.status"
            glossary="incident_status"
         />
      </template>
      <template #opened_at_body="{ data }">{{ time(data.opened_at) }}</template>
      <template #next_deadline_at_body="{ data }">
         <Tag
            v-if="(data.overdue_deadline_count ?? 0) > 0"
            data-test="deadline-overdue"
            severity="danger"
            :value="time(data.next_deadline_at) || $t('ops.incident.deadline.overdue')"
         />
         <template v-else>{{ time(data.next_deadline_at) }}</template>
      </template>
      <template #is_repeat_body="{ data }">
         <Tag v-if="data.is_repeat" severity="warn" :value="$t('ops.incident.fields.is_repeat')" />
      </template>
   </ResourceTable>
</template>
