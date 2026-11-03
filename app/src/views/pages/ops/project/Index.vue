<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useCustomerFilter, withCustomerFilter } from '@/store/customerFilter';
import {
   PROJECT_STATUSES,
   PROJECT_TYPES,
   openGate,
   useMemberOptions,
   type ProjectGateRow,
   type ProjectStatus
} from '@/api/project';

// The projects of the customer the lists are filtered by (every customer's when none is), with
// the phase each is in and the gate it waits for.
type Props = ResourceTableProps<'project'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
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
      header: t('ops.project.fields.code')
   },
   { field: 'customer.code', header: t('ops.project.fields.customer') },
   { field: 'display_name', sortable: true, header: t('ops.project.fields.display_name') },
   { field: 'type', sortable: true, header: t('ops.project.fields.type'), ...enumFilterColumn },
   { field: 'current_phase', sortable: true, header: t('ops.project.fields.current_phase') },
   { field: 'open_gate', header: t('ops.project.fields.open_gate') },
   { field: 'coordinator_id', header: t('ops.project.fields.coordinator') },
   { field: 'target_live_on', sortable: true, header: t('ops.project.fields.target_live_on') },
   { field: 'status', sortable: true, header: t('ops.project.fields.status'), ...enumFilterColumn }
]);

// No keyword search: it would compare the enum and id filter columns as text.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         code: 'startsWith',
         display_name: 'text',
         type: equalsFilter(),
         status: equalsFilter(),
         customer_id: equalsFilter()
      },
      attrs.filters as Props['filters']
   )
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

const members = useMemberOptions();
const memberName = computed(() => new Map(members.value.map(({ value, label }) => [value, label])));

const STATUS_SEVERITY: Record<ProjectStatus, string> = {
   active: 'success',
   on_hold: 'warn',
   closed: 'secondary',
   cancelled: 'danger'
};

const gateOf = (data: unknown) =>
   openGate((data as { project_gate?: ProjectGateRow[] }).project_gate ?? []);

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-project-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      stateKey="project"
      from="project"
      select="*, customer(code, display_name), project_gate(id, code, position, status)"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <CustomLink
                  v-if="$can('create', 'project')"
                  :to="{ name: 'ops-project-add', query: { showDialog: DIALOG_POSITIONS.CENTER } }"
               >
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #type_body="{ data }">
         {{ $t(`ops.project.type.${data.type}`) }}
      </template>
      <template #type_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="PROJECT_TYPES"
            i18n-prefix="ops.project.type"
         />
      </template>
      <template #current_phase_body="{ data }">
         <Tag :value="$t(`ops.project.phase.${data.current_phase}`)" severity="info" />
      </template>
      <template #open_gate_body="{ data }">
         <template v-if="gateOf(data)">{{ $t(`ops.project.gate.${gateOf(data)!.code}`) }}</template>
      </template>
      <template #coordinator_id_body="{ data }">
         {{ data.coordinator_id ? memberName.get(data.coordinator_id) : '' }}
      </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.project.status.${data.status}`)"
            :severity="STATUS_SEVERITY[data.status as ProjectStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="PROJECT_STATUSES"
            i18n-prefix="ops.project.status"
         />
      </template>
   </ResourceTable>
</template>
