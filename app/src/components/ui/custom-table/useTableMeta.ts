import { removeStorage, storageOrMemory } from '@/lib/storage';
import { useStorage, type RemovableRef } from '@vueuse/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { ColumnProps, DataTableSortMeta, DataTableStateEvent } from 'primevue';
import { computed, onUnmounted, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export type TableStateStorage = 'local' | 'session';

/**
 * A column's default sort: `value` is the direction (1 ascending, -1 descending) and, without a
 * `priority`, also the place among the sorted columns; `priority` places it on its own.
 */
export type ColumnSortOrder = { value: number; priority?: number };

type SortableColumn = Pick<ColumnProps, 'field' | 'sortField'> & { sortOrder?: ColumnSortOrder };

/** Table state shared with the URL and storage: filters, paging, sorting and expansion. */
export type TableMetaState = Partial<DataTableStateEvent> & { filters?: Record<string, any> };

/**
 * Pages keep their table state in localStorage (and the URL, so it can be shared); tables inside
 * dialogs or with `useMeta: false` keep it only for the session.
 */
export const resolveStateStorage = ({
   stateStorage,
   useMeta,
   inDialog
}: {
   stateStorage?: TableStateStorage;
   useMeta?: boolean;
   inDialog?: boolean;
}): TableStateStorage => stateStorage || (!inDialog && useMeta ? 'local' : 'session');

const sortPlace = ({ sortOrder }: SortableColumn) => sortOrder?.priority ?? sortOrder?.value ?? 0;

/** Default multi-sort from the columns' `sortOrder`, lowest first (by priority, else by value). */
export const initialSortMeta = (columns: SortableColumn[] = []): DataTableSortMeta[] =>
   columns
      .filter(({ sortField, field, sortOrder }) => (!!sortField || !!field) && !!sortOrder)
      .sort((a, b) => sortPlace(a) - sortPlace(b))
      .map(({ sortField, field, sortOrder }) => ({
         field: (sortField || field) as DataTableSortMeta['field'],
         order: sortOrder?.value as DataTableSortMeta['order']
      }));

export const encodeRouteMeta = (value: object) =>
   compressToEncodedURIComponent(JSON.stringify(value));

/** Decodes the `meta` query parameter; a malformed value is ignored instead of breaking the page. */
export const decodeRouteMeta = (value?: string | null): Record<string, TableMetaState> => {
   if (!value) return {};
   try {
      return JSON.parse(decompressFromEncodedURIComponent(value) || '{}') ?? {};
   } catch {
      return {};
   }
};

/**
 * Drops filters and sorts a stored or shared state names but the table no longer has (saved by an
 * older version of the page), so they are not sent as columns that do not exist.
 */
export const pruneStaleState = (
   state: TableMetaState,
   filters: Record<string, any> | undefined,
   columns: SortableColumn[] = []
) => {
   if (filters && state.filters) state.filters = _pick(state.filters, Object.keys(filters));
   if (state.multiSortMeta && columns.length) {
      const sortable = new Set(columns.flatMap(({ field, sortField }) => [field, sortField]));
      state.multiSortMeta = state.multiSortMeta.filter(({ field }) => sortable.has(field));
   }
   return state;
};

const SHARED_KEYS = ['filters', 'first', 'rows', 'multiSortMeta'] as const;

export type UseTableMetaOptions = {
   stateStorage?: TableStateStorage;
   useMeta?: boolean;
   inDialog?: boolean;
   stateKey?: string;
   columns: SortableColumn[];
   /** The parent's filters; merged with the stored state so the filter UI shows restored values. */
   filters?: Record<string, any>;
   rows: Ref<number | undefined>;
   /** Current filters to store with a page/sort change. */
   getFilters: () => Record<string, any> | undefined;
   /** Called (throttled) whenever filters, paging or sorting change. */
   onChange: (meta: TableMetaState) => void;
};

export function useTableMeta(options: UseTableMetaOptions) {
   const route = useRoute();
   const router = useRouter();

   const stateStorage = resolveStateStorage(options);
   const metaStateKey = 'dt-' + (stateStorage === 'local' ? options.stateKey : _uniqueId());
   const routeMeta = computed(() => decodeRouteMeta(route.query?.meta as string));

   const initialValue: TableMetaState = {
      expandedRows: {},
      expandedRowGroups: [],
      rows: options.rows.value,
      multiSortMeta: initialSortMeta(options.columns)
   };

   // _uniqueId restarts on every page load, so drop a leftover entry from a previous load.
   if (stateStorage === 'session') removeStorage(metaStateKey, 'session');

   const meta: RemovableRef<TableMetaState> = useStorage(
      metaStateKey,
      initialValue,
      storageOrMemory(stateStorage),
      { mergeDefaults: true, writeDefaults: true }
   );

   // Pruned before merging: the merge writes into the parent's filters.
   pruneStaleState(meta.value, options.filters, options.columns);
   meta.value.filters = _merge(options.filters, meta.value.filters);

   _merge(
      meta.value,
      pruneStaleState(_get(routeMeta.value, metaStateKey, {}), options.filters, options.columns)
   );

   /** Stores a page/sort event and, for page tables, mirrors the state into the URL. */
   const onMeta = async (event: TableMetaState = meta.value) => {
      _merge(meta.value, { ...event, filters: options.getFilters() });

      if (stateStorage !== 'local') return;

      await router.replace({
         ...route,
         query: {
            ...route?.query,
            meta: encodeRouteMeta({
               ...routeMeta.value,
               [metaStateKey]: _pick(meta.value, SHARED_KEYS)
            })
         }
      });
   };

   watch(() => _pick(meta.value, SHARED_KEYS), _throttle(options.onChange, 500), { deep: true });

   watch(options.rows, (rows) => _set(meta.value, 'rows', rows));

   onUnmounted(() => {
      if (stateStorage === 'session') removeStorage(metaStateKey, 'session');
   });

   return { stateStorage, metaStateKey, meta, onMeta };
}
