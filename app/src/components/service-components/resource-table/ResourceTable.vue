<script setup lang="ts" generic="F extends TableName, T = TableRow<F>">
import { applyTableMeta } from '@/api/postgrest/tableQuery';
import { useRouteLoading } from '@/composables/useRouteStatus';
import CustomTable, { CustomTableProps } from '@/components/ui/custom-table/CustomTable.vue';
import type { CustomTableSlots } from '@/components/ui/custom-table/types';
import { queryKeys, type TableName } from '@/api/queryKeys';
import { forTenant } from '@/api/formTenant';
import { useTenantKey } from '@/api/useTenantKey';
import { toModel, type ModelClass } from '@/lib/model/Model';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { DataTableStateEvent } from 'primevue';

/** The row type of a table or view, used for the slots when no model is given. */
export declare type TableRow<F extends TableName> = F extends keyof Tables
   ? Tables[F]['Row']
   : F extends keyof Views
     ? Views[F]['Row']
     : never;

/**
 * The slots' row type is the model's when `model` is set, otherwise the table's row type (embedded
 * relations in `select` are not part of it).
 */
export declare type ResourceTableProps<
   F extends TableName = TableName,
   T = TableRow<F>
> = CustomTableProps<T> & {
   from: F;
   select: string;
   /** Rows are mapped to this model (see lib/model); the cache keeps the plain rows. */
   model?: ModelClass<any, T>;
   count?: {
      head: boolean;
      count: 'exact' | 'planned' | 'estimated';
   };
   /** Reads this tenant alone instead of the branches shown (e.g. picking for a form's row). */
   tenant?: string | null;
};
export declare type ResourceTableSlots<T = any> = CustomTableSlots<T>;

defineOptions({
   inheritAttrs: false
});

const slots = defineSlots<CustomTableSlots<T>>();

const props = withDefaults(defineProps<ResourceTableProps<F, T>>(), {
   count: () => ({
      head: true,
      count: 'exact'
   }),
   paginator: true,
   alwaysShowPaginator: true,
   showHeaders: true,
   useMeta: true,
   stateStorage: undefined,
   rows: 5,
   lazy: true,
   dataKey: 'id' as keyof T,
   filterDisplay: 'menu',
   sortMode: 'multiple',
   rowGroupMode: 'rowspan',
   reorderableColumns: true,
   removableSort: true,
   rowsPerPageOptions: () => [1, 5, 10],
   paginatorTemplate:
      'FirstPageLink PrevPageLink PageLinks NextPageLink RowsPerPageDropdown CurrentPageReport',
   resizableColumns: true,
   showGridlines: true,
   enableExpansion: true
});
const attrs = useAttrs();

const tenantId = useTenantKey();

// Set by the first `meta` event of CustomTable, which carries the initial paging/sorting state.
const meta = ref<Partial<DataTableStateEvent> | null>(null);
const onMeta = (value: Partial<DataTableStateEvent>) => {
   meta.value = _cloneDeep(value);
};

const listQuery = useQuery({
   queryKey: computed(() =>
      queryKeys.list(props.tenant ?? tenantId.value, props.from, {
         select: props.select,
         meta: meta.value
      })
   ),
   queryFn: async ({ signal }) => {
      const query = forTenant(
         supabase
            // supabase-js cannot narrow the row type for a table name held in a generic.
            .from(props.from as keyof Tables)
            .select(props.select, props.paginator ? { count: props.count.count } : undefined)
            .abortSignal(signal),
         props.tenant
      );

      const { data, count } = await applyTableMeta(query, meta.value).throwOnError();
      return { rows: data as T[], count };
   },
   select: (data) => (props.model ? { ...data, rows: toModel(props.model, data.rows) } : data),
   enabled: computed(() => meta.value !== null),
   placeholderData: keepPreviousData
});

const rows = ref([]) as Ref<T[]>;
const modelValue = defineModel<T[]>({ default: () => [] });

watch(
   () => listQuery.data.value?.rows,
   (data) => {
      if (!data) return;
      // Query data is deeply readonly and shared with the cache; slots and cards get their own copy.
      rows.value = _cloneDeep(data);
      modelValue.value = rows.value;
   }
);

const totalRecords = computed(() => listQuery.data.value?.count ?? 0);

const routeLoading = useRouteLoading();
const loading = computed(() => routeLoading.value || listQuery.isFetching.value);

const mounted = useMounted();

// Rows of several branches (rows with a tenant_id) are told apart by a branch column.
const authStore = useAuthStore();
const { t } = useI18n();
const showBranch = computed(
   () =>
      !props.tenant &&
      authStore.scopeTenants.length > 1 &&
      !props.columns.some(({ field }) => field === 'tenant_id') &&
      rows.value.some((row) => !!row && typeof row === 'object' && 'tenant_id' in row)
);
const branchName = (id: string | null | undefined) =>
   authStore.branches.find((branch) => branch.id === id)?.display_name ?? '';
const columns = computed(() =>
   showBranch.value
      ? [...props.columns, { field: 'tenant_id', header: t('component.branch_picker.column') }]
      : props.columns
);

const tableProps = computed(() => ({
   ..._omit(props, ['stateKey', 'model', 'tenant']),
   ...attrs,
   columns: columns.value
}));
</script>
<template>
   <component
      :is="CustomTable<T>"
      v-bind="tableProps"
      :totalRecords
      :stateKey="props.stateKey || props.from"
      :loading="loading"
      :value="rows"
      @meta="onMeta"
   >
      <template v-for="slot in _keys(slots)" #[slot]="slotProps" :key="slot">
         <slot :name="slot" v-if="mounted" v-bind="slotProps" />
      </template>
      <template v-if="showBranch" #tenant_id_body="{ data }">
         <Tag
            severity="secondary"
            :value="branchName((data as { tenant_id?: string }).tenant_id)"
         />
      </template>
   </component>
</template>
