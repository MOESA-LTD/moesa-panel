<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { useRevertAuditTransaction } from '@/api/auditLog';
import { AuditTransactionModel } from '@/api/auditLog/model';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { useI18n } from 'vue-i18n';
import AuditUser from './AuditUser.vue';
import CorrelatedAuditLogs from './CorrelatedAuditLogs.vue';
import { revertDisabledReason } from './revertReason';

type Props = ResourceTableProps<'audit_transaction', AuditTransactionModel>;

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
   { field: 'actor_id', header: t('audit_log.table.headers.user_who_performed') },
   {
      field: 'created_at',
      header: t('audit_log.table.headers.created_at'),
      sortable: true,
      sortOrder: { value: -1 }
   },
   { field: 'reverted_by', header: t('audit_log.table.headers.user_who_reverted') },
   { field: 'reverted_at', header: t('audit_log.table.headers.reverted_at'), sortable: true }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         table_name: 'text',
         operation: {
            operator: FilterOperator.AND,
            constraints: [{ value: null, matchMode: FilterMatchMode.IN }]
         },
         reverted_at: 'date',
         created_at: 'date'
      },
      attrs.filters as Props['filters']
   )
);

const authStore = useAuthStore();
const { mutateAsync: revertTransaction } = useRevertAuditTransaction();
const rowActions: Props['rowActions'] = [
   {
      label: ({ data }) =>
         data.reverted ? t('audit_log.already_reverted') : t('audit_log.attempt_to_revert'),
      command:
         ({ data }) =>
         async () =>
            await revertTransaction(data.id),
      // In the tenant of the change, which may be another of the branches shown. A transfer's
      // transaction is never reverted (the server refuses it), so its button says why.
      disabled: ({ data }) =>
         data.reverted ||
         !!revertDisabledReason(data, (action, subject) =>
            authStore.canIn(data.tenant_id, action, subject)
         ),
      tooltip: ({ data }) =>
         revertDisabledReason(data, (action, subject) =>
            authStore.canIn(data.tenant_id, action, subject)
         ) ?? undefined,
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

const dialogRef = useDialogRef();

const stateKey = 'audit_log';
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      :stateKey
      from="audit_transaction"
      select="*, actor(*), reverter(*)"
      :model="AuditTransactionModel"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
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
         <CorrelatedAuditLogs :id="data.id" layout="list" />
      </template>
      <template #actor_id_body="{ data }">
         <AuditUser :user="data.actor" />
      </template>
      <template #reverted_by_body="{ data }">
         <AuditUser :user="data.reverter" />
      </template>
   </ResourceTable>
</template>
