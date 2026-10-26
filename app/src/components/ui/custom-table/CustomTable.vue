<script setup lang="ts" generic="T = any">
import { useRouteLoading } from '@/composables/useRouteStatus';
import Collection from '@/lib/Collection';
import { isValidDate, localeDateString } from '@/lib/dayjs';
import { RemovableRef } from '@vueuse/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import {
   ColumnProps,
   DataTableFilterEvent,
   DataTableFilterMetaData,
   DataTableOperatorFilterMetaData,
   DataTablePageEvent,
   DataTableProps,
   DataTableSlots,
   DataTableSortEvent,
   DataTableSortMeta,
   DataTableStateEvent
} from 'primevue';
import { MenuItem } from 'primevue/menuitem';
import { isVNode, VNode } from 'vue';

export declare type CustomTableProps<T = any> = DataTableProps<T> & {
   columns: (ColumnProps & { sortOrder?: { value: number }; translateValue?: boolean })[];
   rowActions?: MenuItem[];
   useMeta?: boolean;
   filters?: {
      [key: string | 'global']: Partial<DataTableFilterMetaData> &
         Partial<DataTableOperatorFilterMetaData> & {
            dataType?: 'text' | 'numeric' | 'decimal' | 'date';
         };
   };
   dateFormat?: string;
   enableExpansion?: boolean;
};
export declare type CustomTableEmitOptions<T = any> = {
   meta: [value: CustomTableMetaEvent<T>];
   'update:filters': [value: CustomTableProps<T>['filters']];
};

export declare type CustomTableMetaEvent<T = any> = Partial<
   DataTableFilterEvent &
      DataTablePageEvent &
      DataTableStateEvent &
      DataTableSortEvent & { filters: CustomTableProps<T>['filters'] }
>;

export declare type UseTableMetaOptions<T = any> = Required<
   Pick<
      CustomTableProps<T>,
      'stateStorage' | 'useMeta' | 'columns' | 'filters' | 'stateKey' | 'rows'
   >
>;

export declare type CustomTableSlots<T = any> = DataTableSlots<T> & {
   [key: string]: (props: any) => VNode[];
};

const DATA_TYPES = {
   numeric: 'numeric',
   decimal: 'numeric',
   date: 'date',
   text: 'text'
};

defineSlots<CustomTableSlots<T>>();

defineOptions({
   inheritAttrs: false
});

const props = withDefaults(defineProps<CustomTableProps<T>>(), {
   showHeaders: true,
   showGridlines: true,
   stateStorage: undefined,
   translateValue: true,
   dateFormat: 'LL LTS',
   enableExpansion: true
});

const emit = defineEmits<CustomTableEmitOptions<T>>();
const router = useRouter();
const route = useRoute();
const { t, te } = useI18n();

const routeLoading = useRouteLoading();
const loading = computed(() => {
   return props.loading || routeLoading.value;
});

const filterInput = computed({
   get: () => props.filters,
   set: (values) => {
      _toPairs(values).forEach(([field, filter]) => {
         if (!_has(meta.value.filters, field)) return;
         _merge(meta.value.filters[field], {
            ..._get(values as object, field),
            ..._pick(props.filters[field], ['dataType'])
         });
         if (meta.value.filters[field]?.constraints && _isArray(filter.constraints)) {
            _set(meta.value.filters[field], 'constraints', filter.constraints);
         }
      });
      emit('update:filters', meta.value.filters);
   }
});

const selection = defineModel<CustomTableProps<T>['selection']>('selection');
const rows = defineModel<CustomTableProps<T>['rows']>('rows');

const values = defineModel<CustomTableProps<T>['value']>('value');

const dialogRef = inject('dialogRef', null as any);

function useTableMeta({
   stateStorage,
   useMeta,
   columns,
   filters,
   stateKey,
   ...rest
}: UseTableMetaOptions<T>) {
   stateStorage ??= props.stateStorage || (!dialogRef?.value && useMeta) ? 'local' : 'session';

   const metaStateKey = 'dt-' + (stateStorage === 'local' ? stateKey : _uniqueId());
   const routeMeta = computed<CustomTableMetaEvent<T>>(() => {
      const json = (route.query?.meta as string) || compressToEncodedURIComponent('{}');
      const decodedMeta = decompressFromEncodedURIComponent(json);
      return JSON.parse(decodedMeta);
   });

   const initialValue: Partial<DataTableStateEvent> = {
      expandedRows: {},
      expandedRowGroups: [],
      rows: rest.rows,
      multiSortMeta: _chain(columns)
         .filter(({ sortField, field, sortOrder }) => (!!sortField || !!field) && !!sortOrder)
         .sortBy(({ sortOrder }) => sortOrder?.value || 0)
         .map(({ sortField, field, sortOrder }) => ({
            field: sortField || field,
            order: sortOrder?.value
         }))
         .value() as DataTableSortMeta[]
   };
   const storageOptions = { mergeDefaults: true, writeDefaults: true };

   if (stateStorage === 'session') sessionStorage?.clear();

   const meta = <RemovableRef<CustomTableMetaEvent<T>>>(
      (stateStorage === 'local' ? useLocalStorage : useSessionStorage)?.(
         metaStateKey,
         initialValue,
         storageOptions
      )
   );

   meta.value.filters = _merge(filters, meta.value.filters);

   _merge(meta.value, _get(routeMeta.value, metaStateKey, {}));

   const onMeta = async (event: CustomTableMetaEvent = meta.value) => {
      _merge(meta.value, { ...event, filters: filterInput.value });

      if (stateStorage === 'local') {
         const metaData = {
            ...routeMeta.value,
            [metaStateKey]: _pick(meta.value, ['filters', 'first', 'rows', 'multiSortMeta'])
         };
         const json = JSON.stringify(metaData);
         const compressedMeta = compressToEncodedURIComponent(json);
         await router.replace({
            ...route,
            query: {
               ...route?.query,
               meta: compressedMeta
            }
         });
      }
   };

   const emitMeta = (meta: CustomTableMetaEvent) => emit('meta', meta);

   watch(
      () => _pick(meta.value, ['filters', 'rows', 'first', 'multiSortMeta']),
      _throttle(emitMeta, 500),
      {
         deep: true
      }
   );

   watch(
      () => rows.value,
      (r) => _set(meta.value, 'rows', r)
   );

   if (stateStorage == 'session') sessionStorage.removeItem(metaStateKey);

   onUnmounted(() => stateStorage == 'session' && sessionStorage.removeItem(metaStateKey));

   return {
      stateStorage,
      metaStateKey,
      meta,
      onMeta
   };
}

const actions = Collection.create(props.rowActions);
const { meta, stateStorage, metaStateKey, onMeta } = useTableMeta(props);

const getFieldValue = (body: any) => {
   const value = _get(body?.data, body?.field?.toString(), '') || '';

   if (_endsWith(body.field, '_at') && isValidDate({ value }))
      return localeDateString({ value, validate: false, returnFormat: props.dateFormat });

   return te('fields.' + value) ? t('fields.' + value) : value;
};

const tableValue = computed(() => {
   const dataKey = props.dataKey as string;
   if (_isNil(values.value) || loading.value) return new Array(meta.value.rows);

   if (values.value?.length)
      return values.value?.filter?.(
         (v) => !props.frozenValue?.some((f) => _get(f, dataKey) === _get(v, dataKey))
      );
   return [];
});
</script>

<template>
   <DataTable
      v-bind="_merge({}, props, $attrs)"
      :pt="{
         header: {
            class: 'custom_table__header'
         },
         footer: {
            class: 'custom_table__footer'
         }
      }"
      :stateStorage="stateStorage"
      class="custom_table"
      :rows="meta.rows"
      :loading
      selection-mode="radiobutton"
      :state-key="metaStateKey"
      :groupRowsBy="meta.multiSortMeta?.map(({ field }) => field)"
      v-model:filters="filterInput"
      v-model:expanded-row-groups="meta.expandedRowGroups"
      v-model:multi-sort-meta="meta.multiSortMeta"
      v-model:selection="selection"
      v-model:expanded-rows="meta.expandedRows"
      @page="(value: any) => onMeta(value)"
      @sort="(value: any) => onMeta(value)"
      :value="tableValue"
   >
      <template #empty>
         <span class="custom_table__no-data" v-text="$t('component.table.no_data_found')" />
      </template>
      <template
         v-for="slot in _keys(_omit($slots, ['expansion']))"
         #[slot]="slotProps"
         :key="`slot_${slot}`"
      >
         <slot v-bind="slotProps" :name="slot" :key="`slot_${slot}`" />
      </template>
      <template #expansion="slotProps" v-if="!loading && enableExpansion">
         <span class="custom_table__expansion" v-if="$slots.expansion">
            <Suspense>
               <slot name="expansion" v-bind="slotProps" />
               <template #fallback>
                  <ProgressBar mode="indeterminate" class="!h-1" />
               </template>
            </Suspense>
         </span>
      </template>
      <Column
         v-if="selectionMode || selection"
         :selectionMode="selectionMode"
         class="custom_table__column custom_table__column--header"
         style="max-width: 4rem !important; width: 4rem !important"
      />
      <Column
         v-if="$slots.expansion && enableExpansion && (frozenValue?.length || tableValue?.length)"
         field="_expansion"
         expander
         class="custom_table__column custom_table__column--expander"
         style="max-width: 4rem !important; width: 4rem !important"
      />
      <Column
         v-bind="column"
         class="custom_table__column"
         v-for="(column, i) in columns"
         :key="'column_' + (column?.field.toString() ? +column?.field.toString() + i : i) || i"
         showClearButton
         :data-type="_get(DATA_TYPES, meta?.filters?.[column?.field.toString()]?.dataType)"
         :showFilterOperator="column?.field.toString()?.split?.('.')?.length > 1 ? false : true"
         :showFilterMenu="!!meta?.filters?.[`${column?.field.toString()}`]"
         :header="!$slots[`${_snakeCase(column?.field.toString())}_header`] && column.header"
         :footer="!$slots[`${_snakeCase(column?.field.toString())}_footer`] && column.footer"
      >
         <template
            v-for="slot in _keys($slots)
               .filter(
                  (key) =>
                     key.startsWith(`${_snakeCase(column?.field.toString())}_`) &&
                     !key.endsWith('body') &&
                     !key.endsWith('filter')
               )
               .map((key) => key.replace(`${_snakeCase(column?.field.toString())}_`, ''))"
            #[slot]="slotProps"
            :key="`${_snakeCase(column?.field.toString())}_slot_${slot}`"
         >
            <slot
               v-if="_has($slots, `${_snakeCase(column?.field.toString())}_${slot}`)"
               :name="`${_snakeCase(column?.field.toString())}_${slot}`"
               v-bind="_merge(column, _omitBy(slotProps, isVNode))"
            />
         </template>
         <template #filtericon>
            <IconField
               :class="[
                  meta?.filters?.[`${column?.field.toString()}`]?.constraints?.some?.(
                     ({ value }) => !_isNil(value)
                  ) || !_isNil(meta?.filters?.[column?.field.toString()]?.value)
                     ? `custom_table__filter-icon ${PrimeIcons.FILTER_FILL}`
                     : PrimeIcons.FILTER
               ]"
            />
         </template>
         <template #filter="slotProps" v-if="!!meta?.filters?.[column?.field.toString()]">
            <slot :name="`${_snakeCase(slotProps?.field)}_filter`" v-bind="slotProps">
               <FormField fluid v-if="slotProps?.filterModel">
                  <template v-slot="inputProps">
                     <div
                        class="flex flex-col gap-2 items-start"
                        v-if="
                           meta?.filters?.[column?.field.toString()]?.dataType === 'date' ||
                           [
                              FilterMatchMode.DATE_IS,
                              FilterMatchMode.DATE_IS_NOT,
                              FilterMatchMode.DATE_BEFORE,
                              FilterMatchMode.DATE_AFTER
                           ].includes(slotProps.filterModel.matchMode)
                        "
                     >
                        <DatePicker
                           :selectionMode="'single'"
                           v-bind="inputProps"
                           v-model="slotProps.filterModel.value"
                           dateFormat="dd/mm/yy"
                           showButtonBar
                           placeholder="dd/mm/yyyy"
                        />
                        <DatePicker
                           :selectionMode="'single'"
                           v-bind="inputProps"
                           v-model="slotProps.filterModel.value"
                           timeOnly
                           show-seconds
                           showButtonBar
                           dateFormat="hh:mm"
                           placeholder="00:00"
                        />
                     </div>
                     <InputNumber
                        v-else-if="
                           ['numeric', 'decimal'].includes(
                              meta?.filters?.[column?.field.toString()]?.dataType
                           )
                        "
                        v-bind="inputProps"
                        v-model="slotProps.filterModel.value"
                        :max-fraction-digits="
                           meta?.filters?.[column?.field.toString()]?.dataType === 'decimal'
                              ? 3
                              : null
                        "
                        @keydown.enter="slotProps.filterCallback"
                     />
                     <InputText
                        v-else
                        v-bind="inputProps"
                        type="text"
                        v-model="slotProps.filterModel.value"
                        @keydown.enter="slotProps.filterCallback"
                     />
                  </template>
               </FormField>
            </slot>
         </template>
         <template #body="body" v-if="!column.expander && column?.field.toString()">
            <Skeleton v-if="loading" class="absolute left-0 top-0 right-0 bottom-0 min-h-8" />
            <slot v-else :name="`${_snakeCase(body?.field?.toString())}_body`" v-bind="body">
               <div
                  class="custom_table__cell"
                  :title="getFieldValue(body)"
                  v-text="getFieldValue(body)"
               />
            </slot>
         </template>
      </Column>
      <Column
         v-if="
            (actions._data?.length && (frozenValue?.length || tableValue?.length)) ||
            $slots.table_actions
         "
         field="_actions"
         :key="'table_action'"
         :style="
            actions._data?.length &&
            `width: ${actions._data?.length * 4}rem !important;
            min-width: ${actions._data?.length * 4}rem !important;
            max-width: ${actions._data?.length * 4}rem !important`
         "
         class="custom_table__column"
      >
         <template #body="body">
            <slot name="table_actions">
               <ActionButtons :body :items="actions._data" />
            </slot>
         </template>
      </Column>
   </DataTable>
</template>
<style lang="scss">
.custom_table {
   &__header {
      @apply empty:hidden !important;
   }

   &__footer {
      @apply empty:hidden !important;
   }

   &__expansion {
      @apply relative;
   }

   &__no-data {
      @apply text-center;
   }

   &__column {
      @apply relative min-w-32;
      &--header {
         @apply min-w-[3rem] max-w-[3rem] w-[3rem] !important;
      }

      &--expander {
         @apply min-w-[4rem] max-w-[4rem] w-[4rem] !important;
      }
   }

   &__filter-icon {
      @apply text-primary;
   }

   &__cell {
      @apply truncate;
   }
}

.p-datatable {
   &-tbody tr {
      td[rowspan] {
         @apply align-baseline;
      }
   }
   &-mask.p-overlay-mask {
      @apply bg-[rgba(250,250,250,0.1)];
   }
   &-row-expansion {
      @apply relative;
   }
}
</style>
