<script setup lang="ts">
import { useRevertAuditLog } from '@/api/auditLog';
import { AuditLogModel } from '@/api/auditLog/model';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { ability } from '@plugins/casl';
import { useI18n } from 'vue-i18n';
import AuditUser from './AuditUser.vue';
import CorrelatedAuditLogs from './CorrelatedAuditLogs.vue';

type Props = ResourceTableProps<'audit_log_group', AuditLogModel>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   {
      field: 'table_name',
      header: t('audit_log.table.headers.resource'),
      sortable: true,
      showFilterMenu: false
   },
   {
      field: 'operation',
      header: t('audit_log.table.headers.operation'),
      sortable: true,
      showFilterMatchModes: false,
      showFilterOperator: false,
      showAddButton: false
   },
   { field: 'user_id', header: t('audit_log.table.headers.user_who_performed'), sortable: true },
   {
      field: 'created_at',
      header: t('audit_log.table.headers.created_at'),
      sortable: true,
      sortOrder: { value: -1 }
   },
   {
      field: 'reverted_by',
      header: t('audit_log.table.headers.user_who_reverted'),
      sortable: true
   },
   { field: 'reverted_at', header: t('audit_log.table.headers.reverted_at'), sortable: true }
]);

const filters = ref<Props['filters']>(
   createFilters(
      {
         table_name: 'text',
         operation: {
            operator: FilterOperator.AND,
            constraints: [{ value: null, matchMode: FilterMatchMode.IN }]
         },
         reverted_at: 'date',
         'old_data->>id': 'text',
         'row_data->>id': 'text',
         created_at: 'date'
      },
      attrs.filters as Props['filters']
   )
);

const { mutateAsync: revertAuditLog } = useRevertAuditLog();
const rowActions: Props['rowActions'] = [
   {
      label: ({ data }) =>
         data.reverted ? t('audit_log.already_reverted') : t('audit_log.attempt_to_revert'),
      command:
         ({ data }) =>
         async () =>
            await revertAuditLog({ correlationId: data.groupId, tableName: data.table_name }),
      disabled: ({ data }) =>
         !!data.reverted ||
         ability.cannot('create', data.table_name) ||
         ability.cannot('modify', data.table_name),
      icon: PrimeIcons.REFRESH
   }
];

const operations = computed(() => [
   { value: 'INSERT', label: t('audit_log.added'), severity: 'success' },
   { value: 'UPDATE', label: t('audit_log.updated'), severity: 'info' },
   { value: 'DELETE', label: t('audit_log.deleted'), severity: 'danger' },
   { value: 'SELECT', label: t('audit_log.readed'), severity: 'secondary' }
]);

const getOperationTag = (operation: string | null) => {
   const tag = operations.value.find((o) => o.value === operation);
   return tag && { ...tag, value: tag.label };
};

const dialogRef = inject('dialogRef', null);

const stateKey = 'audit_log';
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      :stateKey
      from="audit_log_group"
      select="*, user_id:user!user_id(*), reverted_by:user!reverted_by(*)"
      :model="AuditLogModel"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
            </span>
         </Teleport>
      </template>
      <template #table_name_body="{ data }">
         {{ $t(`fields.${data.table_name ?? ''}`) }}
      </template>
      <template #operation_body="{ data }">
         <Tag v-bind="getOperationTag(data.operation)" />
      </template>
      <template #operation_filter="{ filterModel }">
         <SelectAuditOperation v-model="filterModel.value" multiple />
      </template>
      <template #expansion="{ data }">
         <CorrelatedAuditLogs :id="data.correlation_id" layout="list" />
      </template>
      <template #user_id_body="{ data }">
         <AuditUser :user="data.user_id" />
      </template>
      <template #reverted_by_body="{ data }">
         <AuditUser :user="data.reverted_by" />
      </template>
   </ResourceTable>
</template>
