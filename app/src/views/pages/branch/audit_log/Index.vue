<script setup>
import { useRevertAuditLog } from '@/api/auditLog';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import Collection from '@/lib/Collection';
import { useI18n } from 'vue-i18n';
import CorrelatedAuditLogs from './CorrelatedAuditLogs.vue';

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const { t } = useI18n();

// Define the columns
const columns = computed(() => [
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

// Define the filters object

/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
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
      attrs.filters
   )
);

const { ability } = useAuthStore();
const { mutateAsync: revertAuditLog } = useRevertAuditLog();
const rowActions = Collection.create([
   {
      label: ({ data }) =>
         data?.reverted ? t('audit_log.already_reverted') : t('audit_log.attempt_to_revert'),
      command:
         ({ data }) =>
         async () =>
            await revertAuditLog({
               correlationId: data?.correlation_id || data?.id,
               tableName: data?.table_name
            }),
      disabled: ({ data }) =>
         data?.reverted ||
         ability.cannot('create', data?.table_name) ||
         ability.cannot('modify', data?.table_name),
      icon: PrimeIcons.REFRESH
   }
]);

const operations = computed(() => [
   { value: 'INSERT', label: t('audit_log.added'), severity: 'success' },
   { value: 'UPDATE', label: t('audit_log.updated'), severity: 'info' },
   { value: 'DELETE', label: t('audit_log.deleted'), severity: 'danger' },
   { value: 'SELECT', label: t('audit_log.readed'), severity: 'secondary' }
]);

const getOperationTag = (body) => {
   const tag = _clone(_find(operations.value, (o) => o.value === _get(body, 'data.operation')));
   if (tag) {
      tag.value = t(tag?.label);
      return tag;
   }
};

const dialogRef = inject('dialogRef', null);

const stateKey = 'audit_log';
const tableProps = computed(() => ({
   stateKey,
   from: 'audit_log_group',
   select: '*, user_id:user!user_id(*), reverted_by:user!reverted_by(*)',
   columns: columns.value,
   rowActions: rowActions._data,
   ...attrs
}));
</script>
<template>
   <ResourceTable v-bind="tableProps" v-model:filters="filters">
      <template #header>
         <Teleport to="#page-toolbar" :disabled="dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
            </span>
         </Teleport>
      </template>
      <template #table_name_body="{ data, field }">
         {{ $t('fields.' + _get(data, field, '')) }}
      </template>
      <template #operation_body="{ data }">
         <Tag v-if="data" v-bind="getOperationTag({ data })" />
      </template>
      <template #operation_filter="{ filterModel }">
         <SelectAuditOperation v-model="filterModel.value" multiple />
      </template>
      <template #expansion="{ data }">
         <CorrelatedAuditLogs v-if="data" :id="data.correlation_id" layout="list" />
      </template>
      <template #user_id_body="{ data, field }">
         <div class="flex gap-4 items-center">
            <CustomLink
               v-if="_get(data, `${field}.id`) && $can('read', 'user')"
               :to="{
                  name: 'branch-manage-user-general',
                  params: { id: _get(data, `${field}.id`) },
                  query: { showDialog: 'center' }
               }"
               v-slot="{ navigate }"
            >
               <Button
                  variant="link"
                  size="small"
                  raised
                  :label="
                     _get(data, `${field}.user_metadata.display_name`) ||
                     _get(data, `${field}.email`)
                  "
                  @click="navigate"
               />
            </CustomLink>
            <span v-else>
               {{
                  _get(data, `${field}.user_metadata.display_name`) || _get(data, `${field}.email`)
               }}
            </span>
         </div>
      </template>
      <template #reverted_by_body="{ data, field }">
         <div class="flex gap-4 items-center">
            <CustomLink
               v-if="_get(data, `${field}.id`) && $can('read', 'user')"
               :to="{
                  name: 'branch-manage-user-general',
                  params: { id: _get(data, `${field}.id`) },
                  query: { showDialog: 'center' }
               }"
               v-slot="{ navigate }"
            >
               <Button
                  variant="link"
                  size="small"
                  raised
                  :label="
                     _get(data, `${field}.user_metadata.display_name`) ||
                     _get(data, `${field}.email`)
                  "
                  @click="navigate"
               />
            </CustomLink>
            <span v-else>
               {{
                  _get(data, `${field}.user_metadata.display_name`) || _get(data, `${field}.email`)
               }}
            </span>
         </div>
      </template>
   </ResourceTable>
</template>
