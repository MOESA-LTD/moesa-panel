<script setup>
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import Collection from '@/lib/Collection';
import Upsert from '../Upsert.vue';

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();

const router = useRouter();
/**@type {ComputedRef<ResourceTableProps['columns']>} */
const columns = computed(() => [
   {
      field: 'display_name',
      sortable: true,
      header: t('stock.device.table.headers.product'),
      sortOrder: { value: -1 }
   },
   {
      field: 'serial_number',
      sortable: true,
      header: t('stock.device.table.headers.serial_number')
   },
   {
      field: 'unit_cost',
      sortable: true,
      header: t('stock.device.table.headers.unit_cost')
   },
   {
      field: 'vendor',
      sortable: true,
      header: t('stock.device.table.headers.vendor')
   },
   {
      field: 'stocked_at',
      sortable: true,
      header: t('stock.device.table.headers.stocked_at'),
      sortOrder: { value: -1 }
   }
]);

// Define the filters object
/**@type {Ref<ResourceTableProps['filters']>} */
const filters = ref(
   createFilters({
      'product.category.display_name': equalsFilter('device'),
      display_name: 'text',
      brand: 'text',
      barcode: 'text',
      serial_number: 'text',
      unit_cost: 'decimal',
      quantity: 'numeric',
      vendor: 'text',
      stocked_at: 'date'
   })
);

const stateKey = 'device';
const deleteAction = useDeleteAction('stock');
const rowActions = Collection.create([
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'stock-edit',
               params: {
                  id: data.id,
                  category: data?.product?.category
                     ?.map?.(({ display_name }) => display_name)
                     .join?.('|')
               },
               query: { showDialog: true }
            }),
      icon: PrimeIcons.PENCIL
   }
]);

const dialogRef = inject('dialogRef', null);

const tableProps = computed(() => ({
   stateKey,
   from: 'stock_view',
   select:
      'id, display_name, serial_number, unit_cost, vendor, stocked_at, product:product!inner(category:product_category!inner(*))',
   columns: columns.value,
   rowActions: rowActions._data
}));
</script>
<template>
   <ResourceTable v-bind="tableProps" v-model:filters="filters">
      <template #header>
         <Teleport to="#page-toolbar" :disabled="dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />

               <CustomLink
                  v-if="$can('create', 'stock')"
                  :to="{ name: 'stock-add', params: { category: 'device' } }"
                  v-slot="{ navigate }"
               >
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert class="p-0" :id="data.id" />
      </template>
      <template #vendor_filter="{ filterModel }">
         <SelectStockVendor v-model="filterModel.value" />
      </template>
   </ResourceTable>
</template>
