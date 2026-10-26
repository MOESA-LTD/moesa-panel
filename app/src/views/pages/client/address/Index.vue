<script setup>
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';
import Upsert from '@/views/pages/address/Upsert.vue';

defineOptions({
   inheritAttrs: false
});

const { t, te } = useI18n();
const attrs = useAttrs();
/**@type {ComputedRef<ResourceTableProps['columns']>} */
const columns = computed(() => [
   {
      field: 'client_display_name',
      sortable: true,
      header: t('client.address.table.headers.client')
   },
   {
      field: 'address_display_name',
      sortable: true,
      header: t('client.address.table.headers.address')
   },
   {
      field: 'address_country',
      sortable: true,
      header: t('client.address.table.headers.country'),
      sortOrder: { value: -1 }
   },
   {
      field: 'address_city',
      sortable: true,
      header: t('client.address.table.headers.city'),
      sortOrder: { value: -1 }
   },
   {
      field: 'address_district',
      sortable: true,
      header: t('client.address.table.headers.district'),
      sortOrder: { value: -1 }
   },
   {
      field: 'address_created_at',
      sortable: true,
      header: t('client.address.table.headers.created_at'),
      sortOrder: { value: -1 }
   }
]);

// Define the filters object
/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
   createFilters(
      {
         client_display_name: 'startsWith',
         client_national_id: 'startsWith',
         address_display_name: 'startsWith',
         address_country: 'startsWith',
         address_city: 'startsWith',
         address_district: 'startsWith',
         address_details: 'startsWith'
      },
      attrs.filters
   )
);

const stateKey = 'client-address';
const deleteAction = useDeleteAction('client_address', (row) => ({
   address_id: row.address_id,
   client_id: row.client_id
}));
const rowActions = [deleteAction];

const dialogRef = inject('dialogRef', null);

const tableProps = computed(() => ({
   stateKey,
   from: 'client_address_view',
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

               <CustomLink :to="{ name: 'address-list' }" v-slot="{ navigate }">
                  <Button
                     variant="outlined"
                     :label="$t('router.action.manage_addresses')"
                     @click="navigate"
                     severity="info"
                  />
               </CustomLink>
               <RouterLink
                  v-if="$can('create', 'client-address') || $can('modify', 'address')"
                  :to="{
                     name: 'client-manage-address',
                     query: { showDialog: DIALOG_POSITIONS.CENTER }
                  }"
                  v-slot="{ navigate }"
               >
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </RouterLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert class="p-0" :id="data.address_id" />
      </template>
   </ResourceTable>
</template>
