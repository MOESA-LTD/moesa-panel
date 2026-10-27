<script setup lang="ts">
import { StockModel } from '@/api/stock/model';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';
import Upsert from './Upsert.vue';

type Props = ResourceTableProps<'stock_view', StockModel>;
type StockColumn =
   | 'display_name'
   | 'serial_number'
   | 'unit_cost'
   | 'quantity'
   | 'vendor'
   | 'stocked_at';

/** The stock of one product category (battery, device, ...), as listed under Stock. */
const props = withDefaults(
   defineProps<{
      /** The category's name in the database, e.g. `spare part`. */
      category: string;
      /** Its i18n key under `stock.*`, e.g. `spare_part`. */
      i18nKey: string;
      stateKey: string;
      fields?: StockColumn[];
   }>(),
   { fields: () => ['display_name', 'unit_cost', 'quantity', 'vendor', 'stocked_at'] }
);

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();
const router = useRouter();

const COLUMN_OPTIONS: Partial<Record<StockColumn, Props['columns'][number]>> = {
   display_name: { sortOrder: { value: -1 } },
   unit_cost: { dataType: 'numeric' },
   quantity: { dataType: 'numeric' },
   stocked_at: { sortOrder: { value: -1 } }
};
const HEADER_KEYS: Record<StockColumn, string> = {
   display_name: 'product',
   serial_number: 'serial_number',
   unit_cost: 'unit_cost',
   quantity: 'quantity',
   vendor: 'vendor',
   stocked_at: 'stocked_at'
};

const columns = computed<Props['columns']>(() =>
   props.fields.map((field) => ({
      field,
      header: t(`stock.${props.i18nKey}.table.headers.${HEADER_KEYS[field]}`),
      sortable: true,
      ...COLUMN_OPTIONS[field]
   }))
);

const select = computed(
   () => `id, ${props.fields.join(', ')}, product:product!inner(category:product_category!inner(*))`
);

const filters = ref<Props['filters']>(
   createFilters(
      {
         'product.category.display_name': equalsFilter(props.category),
         display_name: 'text',
         brand: 'text',
         barcode: 'text',
         serial_number: 'text',
         unit_cost: 'decimal',
         quantity: 'numeric',
         vendor: 'text',
         stocked_at: 'date'
      },
      attrs.filters as Props['filters']
   )
);

const deleteAction = useDeleteAction('stock');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'stock-edit',
               params: { id: data.id, category: data.categoryPath },
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
      from="stock_view"
      :select
      :model="StockModel"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />

               <CustomLink
                  v-if="$can('create', 'stock')"
                  :to="{ name: 'stock-add', params: { category } }"
                  v-slot="{ navigate }"
               >
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert class="p-0" :id="data.id" :category="data.categoryPath" />
      </template>
      <template #vendor_filter="{ filterModel }">
         <SelectStockVendor v-model="filterModel.value" />
      </template>
   </ResourceTable>
</template>
