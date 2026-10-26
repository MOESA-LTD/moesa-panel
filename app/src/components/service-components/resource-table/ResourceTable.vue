<script setup lang="ts" generic="T = any">
import { applyTableMeta } from '@/api/postgrest/tableQuery';
import { useRouteLoading } from '@/composables/useRouteStatus';
import CustomTable, {
   CustomTableProps,
   CustomTableSlots
} from '@/components/ui/custom-table/CustomTable.vue';
import { queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import Collection from '@/lib/Collection';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { DataTableStateEvent } from 'primevue';

export declare type ResourceTableProps<T = any> = CustomTableProps<T> & {
   from: string & keyof Tables;
   select: string;
   count?: {
      head: boolean;
      count: 'exact' | 'planned' | 'estimated';
   };
};
export declare type ResourceTableSlots<T = any> = CustomTableSlots<T>;

defineOptions({
   inheritAttrs: false
});

const slots = defineSlots<CustomTableSlots<T>>();

const props = withDefaults(defineProps<ResourceTableProps<T>>(), {
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

const tenantId = useTenantId();

// Set by the first `meta` event of CustomTable, which carries the initial paging/sorting state.
const meta = ref<Partial<DataTableStateEvent> | null>(null);
const onMeta = (value: Partial<DataTableStateEvent>) => {
   meta.value = _cloneDeep(value);
};

const listQuery = useQuery({
   queryKey: computed(() =>
      queryKeys.list(tenantId.value, props.from, { select: props.select, meta: meta.value })
   ),
   queryFn: async ({ signal }) => {
      const query = supabase
         .from(props.from)
         .select(props.select, props.paginator ? { count: props.count.count } : undefined)
         .abortSignal(signal);

      const { data, count } = await applyTableMeta(query, meta.value).throwOnError();
      return { rows: data as T[], count };
   },
   enabled: computed(() => meta.value !== null),
   placeholderData: keepPreviousData
});

const values = Collection.create<T[]>([] as T[]);
const modelValue = defineModel<T[]>({
   get: () => values,
   set: (value: any) => values._set(value),
   default: () => []
});

watch(
   () => listQuery.data.value?.rows,
   (rows) => {
      // Query data is deeply readonly and shared with the cache; slots and cards get their own copy.
      if (rows) modelValue.value = _cloneDeep(rows);
   }
);

const totalRecords = computed(() => listQuery.data.value?.count ?? 0);

const routeLoading = useRouteLoading();
const loading = computed(() => routeLoading.value || listQuery.isFetching.value);

// Transitional: modules not yet on src/api announce writes with `<stateKey>-update`.
const refetch = () => listQuery.refetch();
onMounted(() => emitter.on(`${props.stateKey || props.from}-update`, refetch));
onBeforeUnmount(() => emitter.off(`${props.stateKey || props.from}-update`, refetch));

const mounted = useMounted();

const tableProps = computed(() => ({ ..._omit(props, ['stateKey']), ...attrs }));
</script>
<template>
   <component
      :is="CustomTable<T>"
      v-bind="tableProps"
      :totalRecords
      :stateKey="props.stateKey || props.from"
      :loading="loading"
      :value="values._data"
      @meta="onMeta"
   >
      <template v-for="slot in _keys(slots)" #[slot]="slotProps" :key="slot">
         <slot :name="slot" v-if="mounted" v-bind="slotProps" />
      </template>
   </component>
</template>
