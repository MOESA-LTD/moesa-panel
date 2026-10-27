<script setup lang="ts">
import { AddressModel } from '@/api/address/model';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';
import Upsert from './Upsert.vue';

type Props = ResourceTableProps<'address', AddressModel>;

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();

const router = useRouter();

const columns = computed<Props['columns']>(() => [
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

const filters = ref<Props['filters']>(
   createFilters(
      {
         display_name: 'startsWith',
         country: 'startsWith',
         city: 'startsWith',
         district: 'startsWith',
         details: 'startsWith'
      },
      attrs.filters as Props['filters']
   )
);

const stateKey = 'address';
const deleteAction = useDeleteAction('address');
const rowActions: Props['rowActions'] = [
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
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            }),
      icon: PrimeIcons.PENCIL
   }
];

const dialogRef = inject('dialogRef', null);
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      :stateKey
      from="address"
      select="*"
      :model="AddressModel"
      :columns
      :rowActions
      v-model:filters="filters"
   >
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
