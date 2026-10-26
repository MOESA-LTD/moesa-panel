<script setup>
import { useDeleteAction } from '@/composables/useDeleteAction';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import Collection from '@/lib/Collection';
import Upsert from './Upsert.vue';

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

// Define the columns
/**@type {ComputedRef<ResourceTableProps['columns']>} */
const columns = computed(() => [
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

// Define the filters object
/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
   createFilters(
      {
         display_name: 'startsWith',
         created_at: 'date'
      },
      attrs.filters
   )
);

const stateKey = 'role';
const deleteAction = useDeleteAction('role');
const rowActions = Collection.create([
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'branch-role-edit',
               params: { id: data.id },
               query: { showDialog: true }
            }),
      icon: PrimeIcons.PENCIL
   }
]);

const dialogRef = inject('dialogRef', null);

const tableProps = computed(() => ({
   stateKey,
   from: 'role',
   select: '*, permission(id, kind, group_name, resource_name)',
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
