<script setup lang="ts" generic="T = any">
import { useRouteLoading } from '@/composables/useRouteStatus';
import TableFilterInput from './TableFilterInput.vue';
import { useTableMeta, type TableStateStorage } from './useTableMeta';
import { isValidDate, localeDateString } from '@/lib/dayjs';
import {
   ColumnProps,
   DataTableFilterEvent,
   DataTableFilterMetaData,
   DataTableOperatorFilterMetaData,
   DataTablePageEvent,
   DataTableProps,
   DataTableSlots,
   DataTableSortEvent,
   DataTableStateEvent
} from 'primevue';
import type { MenuItem } from 'primevue/menuitem';
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

const { meta, stateStorage, metaStateKey, onMeta } = useTableMeta({
   stateStorage: props.stateStorage as TableStateStorage,
   useMeta: props.useMeta,
   inDialog: !!dialogRef?.value,
   stateKey: props.stateKey,
   columns: props.columns,
   filters: props.filters,
   rows,
   getFilters: () => filterInput.value,
   onChange: (value) => emit('meta', value as CustomTableMetaEvent<T>)
});

const actions = computed(() => props.rowActions ?? []);

// Props that are CustomTable's own; everything else is forwarded to DataTable.
const OWN_PROPS = ['columns', 'rowActions', 'useMeta', 'filters', 'dateFormat', 'enableExpansion'];
const attrs = useAttrs();
const dataTableProps = computed(() =>
   _omitBy({ ..._omit(props, OWN_PROPS), ...attrs }, _isUndefined)
);

/** Per-column values the template needs, computed once instead of inline per binding. */
const columnModels = computed(() =>
   props.columns.map((column, index) => {
      const field = column?.field?.toString() ?? '';
      const filter = meta.value?.filters?.[field];
      return {
         column,
         field,
         key: `column_${field}_${index}`,
         slotPrefix: _snakeCase(field),
         filter,
         dataType: _get(DATA_TYPES, filter?.dataType),
         nested: field.split('.').length > 1,
         filtered:
            filter?.constraints?.some?.(({ value }) => !_isNil(value)) || !_isNil(filter?.value)
      };
   })
);

const slots = useSlots();
/** Column-scoped slots such as `display_name_header`, without the column prefix. */
const columnSlots = (slotPrefix: string) =>
   _keys(slots)
      .filter(
         (key) =>
            key.startsWith(`${slotPrefix}_`) && !key.endsWith('body') && !key.endsWith('filter')
      )
      .map((key) => key.slice(slotPrefix.length + 1));

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
      v-bind="dataTableProps"
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
      :groupRowsBy="meta.multiSortMeta?.map(({ field }) => field as string)"
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
         v-for="{
            column,
            field,
            key,
            slotPrefix,
            filter,
            dataType,
            nested,
            filtered
         } in columnModels"
         :key
         showClearButton
         :data-type="dataType"
         :showFilterOperator="!nested"
         :showFilterMenu="!!filter"
         :header="!$slots[`${slotPrefix}_header`] && column.header"
         :footer="!$slots[`${slotPrefix}_footer`] && column.footer"
      >
         <template
            v-for="slot in columnSlots(slotPrefix)"
            #[slot]="slotProps"
            :key="`${slotPrefix}_slot_${slot}`"
         >
            <slot
               :name="`${slotPrefix}_${slot}`"
               v-bind="{ ...column, ..._omitBy(slotProps, isVNode) }"
            />
         </template>
         <template #filtericon>
            <IconField
               :class="[
                  filtered
                     ? `custom_table__filter-icon ${PrimeIcons.FILTER_FILL}`
                     : PrimeIcons.FILTER
               ]"
            />
         </template>
         <template #filter="slotProps" v-if="!!filter">
            <slot :name="`${_snakeCase(slotProps?.field)}_filter`" v-bind="slotProps">
               <TableFilterInput
                  v-if="slotProps?.filterModel"
                  :filterModel="slotProps.filterModel"
                  :dataType="filter?.dataType"
                  :filterCallback="slotProps.filterCallback"
               />
            </slot>
         </template>
         <template #body="body" v-if="!column.expander && field">
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
            (actions?.length && (frozenValue?.length || tableValue?.length)) || $slots.table_actions
         "
         field="_actions"
         :key="'table_action'"
         :style="
            actions?.length &&
            `width: ${actions?.length * 4}rem !important;
            min-width: ${actions?.length * 4}rem !important;
            max-width: ${actions?.length * 4}rem !important`
         "
         class="custom_table__column"
      >
         <template #body="body">
            <slot name="table_actions">
               <ActionButtons :body :items="actions" />
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
