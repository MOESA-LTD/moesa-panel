<script setup lang="ts" generic="F extends TableName, T = TableRow<F>">
import { applyTableMeta, type ColumnFilter, type TableMeta } from '@/api/postgrest/tableQuery';
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
   /**
    * What the branch column sorts by: by default the branch's name through the row's tenant
    * relation; a view without that relation names a column of its own.
    */
   branchSortField?: string;
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
      const { meta: tableMeta, branches, embedBranch } = withBranchColumn(meta.value);
      const query = forTenant(
         supabase
            // supabase-js cannot narrow the row type for a table name held in a generic.
            .from(props.from as keyof Tables)
            .select(
               embedBranch ? `${props.select}, ${BRANCH_EMBED}` : props.select,
               props.paginator ? { count: props.count.count } : undefined
            )
            .abortSignal(signal),
         props.tenant
      );

      const filtered = applyTableMeta(query, tableMeta);
      const { data, count } = await (
         branches.length ? filtered.in('tenant_id', branches) : filtered
      ).throwOnError();
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

// Rows of several branches (rows with a tenant_id) are told apart by a branch column. Once the
// table had such rows it keeps the column, so a branch filter that matches nothing can be cleared.
const authStore = useAuthStore();
const { t } = useI18n();
const hasBranchRows = ref(false);
watch(rows, (value) => {
   if (value.some((row) => !!row && typeof row === 'object' && 'tenant_id' in row))
      hasBranchRows.value = true;
});
const showBranch = computed(
   () =>
      !props.tenant &&
      authStore.scopeTenants.length > 1 &&
      !props.columns.some(({ field }) => field === 'tenant_id') &&
      hasBranchRows.value
);
const branchName = (id: string | null | undefined) =>
   authStore.branches.find((branch) => branch.id === id)?.display_name ?? '';
const columns = computed(() =>
   showBranch.value
      ? [
           ...props.columns,
           { field: 'tenant_id', header: t('component.branch_picker.column'), sortable: true }
        ]
      : props.columns
);

// The branch filter: a list of branches (shown or not, the filter state always has it, as the
// table reads its filters once).
const BRANCH_FILTER = { tenant_id: { value: null, matchMode: FilterMatchMode.IN } };
const BRANCH_EMBED = 'branch:tenant(display_name)';

/**
 * The table state with the branch column's filter and sort taken out: the filter keeps only the
 * branches still shown (and none without the column), and sorting goes by the branch's name. The
 * global search skips the column, as its values are ids.
 */
const withBranchColumn = (value: TableMeta | null) => {
   const { tenant_id: filter, ...filters } = (value?.filters ?? {}) as Record<string, ColumnFilter>;
   const picked = (filter?.value ?? filter?.constraints?.[0]?.value ?? []) as string[];
   const shown = new Set(authStore.scopeTenants.map(({ id }) => id));
   const branches = showBranch.value ? picked.filter((id) => shown.has(id)) : [];

   const sortField = props.branchSortField ?? 'branch.display_name';
   const multiSortMeta = value?.multiSortMeta?.map((sort) =>
      sort.field === 'tenant_id' ? { ...sort, field: sortField } : sort
   );
   const embedBranch =
      !props.branchSortField && !!value?.multiSortMeta?.some(({ field }) => field === 'tenant_id');

   return { meta: value && { ...value, filters, multiSortMeta }, branches, embedBranch };
};

const tableProps = computed(() => ({
   ..._omit(props, ['stateKey', 'model', 'tenant', 'branchSortField']),
   ...attrs,
   filters: { ...BRANCH_FILTER, ...props.filters },
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
      <template v-if="showBranch" #tenant_id_filter="{ filterModel }">
         <MultiSelect
            v-model="filterModel.value"
            :options="authStore.scopeTenants"
            optionLabel="display_name"
            optionValue="id"
            :placeholder="t('component.branch_picker.column')"
            display="chip"
            class="w-full min-w-56"
         />
      </template>
   </component>
</template>
