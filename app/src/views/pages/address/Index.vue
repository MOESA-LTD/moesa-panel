<script setup>
import { useDeleteAction } from '@/composables/useDeleteAction';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import Upsert from './Upsert.vue';

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();

const router = useRouter();

const columns = computed(() => [
   {
      field: 'display_name',
      header: t('address.table.headers.address_name'),
      sortable: true
   },
   {
      field: 'country',
      header: t('address.table.headers.country'),
      sortable: true
   },
   {
      field: 'city',
      sortable: true,
      header: t('address.table.headers.city')
   },
   {
      field: 'district',
      header: t('address.table.headers.district'),
      sortable: true
   },
   {
      field: 'created_at',
      header: t('address.table.headers.created_at'),
      sortable: true,
      sortOrder: { value: -1 }
   }
]);

/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
   createFilters(
      {
         display_name: 'startsWith',
         country: 'startsWith',
         city: 'startsWith',
         district: 'startsWith',
         details: 'startsWith'
      },
      attrs.filters
   )
);

const stateKey = 'address';
const deleteAction = useDeleteAction('address');
const rowActions = [
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'address-edit',
               params: {
                  id: data.id
               },
               query: { showDialog: true }
            }),
      icon: PrimeIcons.PENCIL
   }
];

const dialogRef = inject('dialogRef', null);

const tableProps = computed(() => ({
   stateKey,
   from: 'address',
   select: '*',
   columns: columns.value,
   rowActions: rowActions,
   ...attrs
}));
</script>
<template>
   <ResourceTable v-bind="tableProps" v-model:filters="filters">
      <template #header>
         <Teleport to="#page-toolbar" :disabled="dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />

               <CustomLink v-if="$can('create', 'address')" :to="{ name: 'address-add' }">
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert class="p-0" :data />
      </template>
      <template v-for="slot in _keys($slots)" #[slot]="slotProps" :key="slot">
         <slot :name="slot" v-bind="slotProps" />
      </template>
   </ResourceTable>
</template>
