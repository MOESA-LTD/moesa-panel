<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { ClientModel } from '@/api/client/model';
import { useDeleteClient } from '@/api/client/queries';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import parsePhoneNumberFromString from 'libphonenumber-js';
import ClientUpsert from './upsert/Index.vue';

type Props = ResourceTableProps<'client', ClientModel>;

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();
const router = useRouter();

const columns = computed<Props['columns']>(() => [
   {
      field: 'display_name',
      header: t('client.table.headers.client'),
      sortable: true,
      sortOrder: { value: -1 }
   },
   {
      field: 'nationality',
      sortable: true,
      header: t('client.table.headers.nationality')
   },
   {
      field: 'national_id',
      sortable: true,
      header: t('client.table.headers.national_id')
   },
   {
      field: 'birth_date',
      sortable: true,
      header: t('client.table.headers.birth_date')
   },
   {
      // Derived from the embedded addresses by ClientModel; not a column, so not sortable.
      field: 'address',
      header: t('fields.address')
   },
   {
      field: 'email',
      sortable: true,
      header: t('client.table.headers.email')
   },
   {
      field: 'phone',
      sortable: true,
      header: t('client.table.headers.phone')
   },
   {
      field: 'created_at',
      sortable: true,
      header: t('client.table.headers.created_at'),
      sortOrder: { value: -1 }
   }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         national_id: 'text',
         nationality: 'text',
         birth_date: 'date',
         display_name: 'text',
         email: 'text',
         phone: 'text',
         created_at: 'date'
      },
      attrs.filters as Props['filters']
   )
);

const stateKey = 'client';
const confirmDelete = useConfirmDelete();
const { mutateAsync: deleteClient } = useDeleteClient();

const rowActions: Props['rowActions'] = [
   {
      label: t('action.delete'),
      command:
         ({ data }) =>
         async () => {
            if (await confirmDelete(data)) await deleteClient(data.id);
         },
      icon: PrimeIcons.TRASH
   },
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'client-manage',
               params: {
                  id: data.id
               },
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
      from="client"
      select="*, address(*)"
      :model="ClientModel"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink
                  v-if="$can('create', 'client')"
                  :to="{ name: 'client-manage' }"
                  v-slot="{ navigate }"
               >
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <ClientUpsert :id="data.id" class="p-0" />
      </template>
      <template #birth_date_body="{ data }">
         <span v-text="data.birth_date" />
         <span v-if="data.age !== null" class="text-muted-color" v-text="` (${data.age})`" />
      </template>
      <template #address_body="{ data }">
         <span v-text="data.primaryAddress?.fullAddress" />
      </template>
      <template #email_body="{ data }">
         <a
            v-if="data.email"
            class="underline"
            :href="`mailto:${data.email}`"
            v-text="data.email"
         />
      </template>
      <template #phone_body="{ data }">
         <a
            v-if="data.phone"
            class="underline"
            :href="parsePhoneNumberFromString(data.phone)?.getURI()"
            v-text="data.phone"
         />
      </template>
      <template v-for="slot in _keys($slots)" #[slot]="slotProps" :key="slot">
         <slot :name="slot" v-bind="slotProps" />
      </template>
   </ResourceTable>
</template>
