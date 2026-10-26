<script setup>
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { useDeleteClient } from '@/api/client/queries';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import Collection from '@/lib/Collection';
import parsePhoneNumberFromString from 'libphonenumber-js';
import ClientUpsert from './upsert/Index.vue';

defineOptions({
   inheritAttrs: false
});

const { t, te } = useI18n();
const attrs = useAttrs();
const router = useRouter();
/**@type {ComputedRef<ResourceTableProps['columns']>} */
const columns = computed(() => [
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

// Define the filters object
/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
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
      attrs.filters
   )
);

const stateKey = 'client';
const confirmDelete = useConfirmDelete();
const { mutateAsync: deleteClient } = useDeleteClient();

const rowActions = Collection.create([
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
               query: { showDialog: true }
            }),
      icon: PrimeIcons.PENCIL
   }
]);

const dialogRef = inject('dialogRef', null);

const tableProps = computed(() => ({
   stateKey,
   from: 'client',
   select: '*, address(*)',
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
      <template #email_body="{ data, field }">
         <a
            v-if="_get(data, field)"
            class="underline"
            :href="'mailto:' + _get(data, field)"
            v-text="_get(data, field)"
         />
      </template>
      <template #phone_body="{ data, field }">
         <a
            v-if="_get(data, field)"
            class="underline"
            :href="parsePhoneNumberFromString(_get(data, field, ''))?.getURI?.()"
            v-text="_get(data, field)"
         />
      </template>
      <template v-for="slot in _keys($slots)" #[slot]="slotProps" :key="slot">
         <slot :name="slot" v-bind="slotProps" />
      </template>
   </ResourceTable>
</template>
