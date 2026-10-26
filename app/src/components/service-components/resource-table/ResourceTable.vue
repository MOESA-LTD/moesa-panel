<script setup lang="ts" generic="T = any">
import CustomTable, {
   CustomTableProps,
   CustomTableSlots
} from '@/components/ui/custom-table/CustomTable.vue';
import Collection from '@/lib/Collection';
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

const meta = Collection.create<Partial<DataTableStateEvent>>({});
const onMeta = (value: Partial<DataTableStateEvent>) => getValues(value);

const values = Collection.create<T[]>([] as T[]);
const modelValue = defineModel<T[]>({
   get: () => values,
   set: (value: any) => values._set(value),
   default: () => []
});

const totalRecords = ref<number | null>(5);

const routeLoading = inject('routeLoading', false);
const loading = ref(routeLoading);

let ac = new AbortController();

async function getValues(metaObj: Partial<DataTableStateEvent>) {
   if (loading.value) return;

   try {
      ac.abort();
      ac = new AbortController();

      meta._reset(metaObj);

      loading.value = true;

      const req = supabase
         .from(props.from)
         .select(props.select)
         .abortSignal(ac.signal)
         .overrideTypes<T[], { merge: false }>();

      if (!_isEmpty(meta._data)) req.setHeader('meta', encodeURI(JSON.stringify(meta._data)));

      const { data } = await req.throwOnError();
      modelValue.value = data;

      if (props.paginator) {
         const countReq = supabase
            .from(props.from)
            .select(props.select, props.count)
            .abortSignal(ac.signal);

         if (!_isEmpty(meta._data)) {
            const encodedMeta = encodeURI(JSON.stringify(_pick(meta._data, ['filters'])));
            countReq.setHeader('meta', encodedMeta);
         }

         countReq.then(({ count }) => {
            totalRecords.value = count;
         });
      }
   } finally {
      loading.value = false;
   }
}

const updateCallback = () => getValues(meta._data);
onMounted(() => emitter.on(`${props.stateKey || props.from}-update`, updateCallback));
onBeforeUnmount(() => {
   ac.abort();
   emitter.off(`${props.stateKey || props.from}-update`, updateCallback);
});

const mounted = useMounted();

const tableProps = computed(() => _merge({}, _omit(props, ['stateKey']), attrs));
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
