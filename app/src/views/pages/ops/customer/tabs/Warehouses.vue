<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// Where one customer's goods are delivered; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'customer_warehouse'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   {
      field: 'display_name',
      sortable: true,
      header: t('ops.customer.warehouse.fields.display_name')
   },
   { field: 'type', sortable: true, header: t('ops.customer.warehouse.fields.type') },
   { field: 'country', sortable: true, header: t('ops.customer.warehouse.fields.country') },
   { field: 'city', sortable: true, header: t('ops.customer.warehouse.fields.city') },
   { field: 'is_default', header: t('ops.customer.warehouse.fields.is_default') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ customer_id: equalsFilter(props.id), display_name: 'text' })
);

const deleteAction = useDeleteAction('customer_warehouse');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'customer_warehouse' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-customer-warehouse-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="customer-warehouse"
      from="customer_warehouse"
      select="*"
      :useMeta="false"
      :columns
      :rowActions
      :rows="10"
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.customer.tabs.warehouses') }}</span>
            <CustomLink
               v-if="$can('create', 'customer_warehouse')"
               :to="{
                  name: 'ops-customer-warehouse-add',
                  params: { customerId: id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #type_body="{ data }">
         {{ $t(`ops.customer.warehouse.type.${data.type}`) }}
      </template>
      <template #is_default_body="{ data }">
         <i v-if="data.is_default" :class="PrimeIcons.CHECK" />
      </template>
   </ResourceTable>
</template>
