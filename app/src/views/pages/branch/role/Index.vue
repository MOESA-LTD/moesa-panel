<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import Upsert from './Upsert.vue';

type Props = ResourceTableProps<'role'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   {
      field: 'display_name',
      sortable: true,
      header: t('role.table.headers.name')
   },
   {
      field: 'created_at',
      sortable: true,
      header: t('role.table.headers.created_at')
   }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         display_name: 'startsWith',
         created_at: 'date'
      },
      attrs.filters as Props['filters']
   )
);

const stateKey = 'role';
const deleteAction = useDeleteAction('role');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'branch-role-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }),
      icon: PrimeIcons.PENCIL
   }
];

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      :stateKey
      from="role"
      select="*, permission(id, kind, group_name, resource_name)"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink v-if="$can('create', 'role')" :to="{ name: 'branch-role-add' }">
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert class="p-0" :id="data.id" />
      </template>
   </ResourceTable>
</template>
