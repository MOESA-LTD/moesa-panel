<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import { RecordModel } from '@/api/record/model';
import { useDeleteAction } from '@/composables/useDeleteAction';
import ResourceTable, {
   ResourceTableProps
} from '@/components/service-components/resource-table/ResourceTable.vue';
import { RECORD_STATUSES, RECORD_TYPES } from '@/constants/form/record';
import Upsert from '@/views/pages/record/upsert/index.vue';
import { useI18n } from 'vue-i18n';

type Props = ResourceTableProps<'record', RecordModel>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();

const { t } = useI18n();

const props = withDefaults(
   defineProps<{
      record_type?: RecordModel['record_type'] | null;
      record_status?: RecordModel['record_status'] | null;
   }>(),
   {
      record_type: null,
      record_status: null
   }
);

const columns = computed<Props['columns']>(() => [
   {
      field: 'record_type',
      sortable: true,
      showFilterMenu: _isNil(props.record_type),
      header: t('record.table.headers.record_type')
   },
   {
      field: 'record_status',
      sortable: true,
      showFilterMenu: _isNil(props.record_status),
      header: t('record.table.headers.record_status')
   },
   {
      field: 'stock.display_name',
      sortable: true,
      header: t('record.table.headers.product')
   },
   {
      field: 'client.display_name',
      sortable: true,
      header: t('record.table.headers.client')
   },
   {
      field: 'quantity',
      sortable: true,
      header: t('record.table.headers.quantity')
   },
   {
      field: 'bid',
      sortable: true,
      header: t('record.table.headers.bid')
   },
   {
      field: 'created_at',
      sortable: true,
      header: t('record.table.headers.created_at'),
      sortOrder: { value: -1 }
   }
]);

const filters = ref<NonNullable<Props['filters']>>({
   global: {
      value: null,
      matchMode: FilterMatchMode.CONTAINS
   },
   'stock.display_name': {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }]
   },
   'client.display_name': {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.STARTS_WITH }]
   },
   record_type: {
      operator: FilterOperator.AND,
      constraints: [{ value: props.record_type, matchMode: FilterMatchMode.EQUALS }]
   },
   record_status: {
      operator: FilterOperator.AND,
      constraints: [{ value: props.record_status, matchMode: FilterMatchMode.EQUALS }]
   },
   quantity: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
      dataType: 'decimal'
   },
   bid: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.EQUALS }],
      dataType: 'decimal'
   },
   created_at: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }],
      dataType: 'date'
   },
   ...(attrs.filters as Props['filters'])
});

const stateKey = props.record_type ? 'record-' + props.record_type : 'record';

const deleteAction = useDeleteAction('record');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            await router.push({
               name: 'record-edit',
               params: { id: data.id },
               query: { showDialog: 'true' }
            }),
      icon: PrimeIcons.PENCIL
   }
];

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      :stateKey
      from="record"
      :useMeta="!(record_type || record_status)"
      select="*,stock:stock_view!inner(id,display_name,unit_type), client!inner(id,display_name,email)"
      :model="RecordModel"
      :columns="columns"
      :rowActions="rowActions"
      v-model:filters="filters"
      v-bind="$attrs"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink v-if="$can('create', 'record')" :to="{ name: 'record-add' }">
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #expansion="{ data }">
         <Upsert :id="data.id" class="p-0" />
      </template>
      <template #record_type_body="{ data }">
         {{
            $te(`fields.${data.record_type}`) ? $t(`fields.${data.record_type}`) : data.record_type
         }}
      </template>
      <template #record_type_filter="{ filterModel }">
         <Select
            :options="RECORD_TYPES"
            :option-label="'label'"
            :option-value="'value'"
            v-model="filterModel.value"
         />
      </template>
      <template #record_status_filter="{ filterModel }" v-if="record_type">
         <Select
            :options="_get(RECORD_STATUSES, record_type as string, _get(RECORD_STATUSES, 'common'))"
            :option-label="'label'"
            :option-value="'value'"
            v-model="filterModel.value"
         />
      </template>

      <template v-if="$can('read', 'client')" #client_display_name_body="{ data }">
         <CustomLink
            v-if="data.client"
            :to="{
               name: 'client-manage',
               params: { id: data.client.id },
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button
               variant="link"
               size="small"
               class="!text-left"
               raised
               :label="data.clientName ?? undefined"
               @click="navigate"
            />
         </CustomLink>
      </template>
      <template v-if="$can('read', 'stock')" #stock_display_name_body="{ data }">
         <CustomLink
            v-if="data.stock?.id"
            :to="{
               name: 'stock-edit',
               params: { id: data.stock.id },
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button
               variant="link"
               size="small"
               class="!text-left"
               raised
               :label="data.stock.display_name ?? undefined"
               @click="navigate"
            />
         </CustomLink>
      </template>
      <template #quantity_body="{ data }">
         <span v-text="`${data.quantity} ${$t(`fields.${data.stock?.unit_type}`)}`" />
      </template>
      <template #bid_body="{ data }">
         <span v-text="data.bidText" />
      </template>
   </ResourceTable>
</template>
