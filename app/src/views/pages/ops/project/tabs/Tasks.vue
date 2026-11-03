<script setup lang="ts">
import { TASK_STATUSES, useMemberOptions, useSetTaskStatus, type TaskStatus } from '@/api/project';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// The project's phase checklist, by phase and order. The status changes right in the row; the
// rest is edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'project_task'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   {
      field: 'phase',
      sortable: true,
      sortOrder: { value: 1 },
      header: t('ops.project.task.fields.phase')
   },
   {
      field: 'position',
      sortable: true,
      sortOrder: { value: 1 },
      header: t('ops.project.task.fields.position')
   },
   { field: 'display_name', header: t('ops.project.task.fields.display_name') },
   { field: 'role', header: t('ops.project.task.fields.role') },
   { field: 'assignee_id', header: t('ops.project.task.fields.assignee_id') },
   { field: 'due_on', sortable: true, header: t('ops.project.task.fields.due_on') },
   { field: 'blocks_gate', header: t('ops.project.task.fields.blocks_gate') },
   { field: 'status', header: t('ops.project.task.fields.status') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ project_id: equalsFilter(props.id), display_name: 'text' })
);

const members = useMemberOptions();
const memberName = computed(() => new Map(members.value.map(({ value, label }) => [value, label])));

const { mutateAsync: setStatus } = useSetTaskStatus();

const deleteAction = useDeleteAction('project_task');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'project_task' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-project-task-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="project-task"
      from="project_task"
      select="*"
      :useMeta="false"
      :columns
      :rowActions
      :rows="25"
      :rowsPerPageOptions="[10, 25, 50]"
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.project.tabs.tasks') }}</span>
            <CustomLink
               v-if="$can('create', 'project_task')"
               :to="{
                  name: 'ops-project-task-add',
                  params: { projectId: id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #phase_body="{ data }">
         {{ $t(`ops.project.phase.${data.phase}`) }}
      </template>
      <template #role_body="{ data }">
         <template v-if="data.role">{{ $t(`ops.project.role.${data.role}`) }}</template>
      </template>
      <template #assignee_id_body="{ data }">
         {{ data.assignee_id ? memberName.get(data.assignee_id) : '' }}
      </template>
      <template #blocks_gate_body="{ data }">
         <i v-if="data.blocks_gate" :class="PrimeIcons.LOCK" />
      </template>
      <template #status_body="{ data }">
         <SelectEnum
            :modelValue="data.status"
            :values="TASK_STATUSES"
            i18n-prefix="ops.project.task_status"
            :disabled="!$can('modify', 'project_task')"
            @update:modelValue="$event && setStatus({ id: data.id, status: $event as TaskStatus })"
         />
      </template>
   </ResourceTable>
</template>
