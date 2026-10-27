<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';
import Upsert from '@/views/pages/address/Upsert.vue';

type Props = ResourceTableProps<'client_address_view'>;

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();
const columns = computed<Props['columns']>(() => [
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

const filters = ref<NonNullable<Props['filters']>>(
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
      attrs.filters as Props['filters']
   )
);

const stateKey = 'client-address';
const deleteAction = useDeleteAction('client_address', (row) => ({
   address_id: row.address_id,
   client_id: row.client_id
}));
const rowActions: Props['rowActions'] = [deleteAction];

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      :stateKey
      from="client_address_view"
      select="*"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
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
