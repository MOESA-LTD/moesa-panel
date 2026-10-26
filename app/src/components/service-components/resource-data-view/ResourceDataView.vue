<script setup>
import { useRouteLoading } from '@/composables/useRouteStatus';
import Collection from '@/lib/Collection';

defineOptions({
   inheritAttrs: false
});
const props = defineProps({
   mapClass: {
      type: Function,
      default: Collection
   },
   from: {
      type: String,
      required: true
   },
   select: {
      type: String,
      default: '*',
      required: false
   },
   count: {
      type: Object,
      default: () => ({
         count: 'exact',
         head: true
      })
   },
   meta: {
      type: Object,
      default: () => ({
         first: 0,
         rows: 5
      })
   }
});

const slots = useSlots();
const options = computed(() => {
   const res = [];
   if (slots.grid) res.push('grid');
   if (slots.list) res.push('list');
   return res;
});

const layout = defineModel('layout', { default: 'list' });

const values = ref();
const modelValue = defineModel({
   get: (value) => value || values,
   set: (value) => {
      values.value = props.mapClass.create?.(value);
      return values.value;
   },
   default: []
});

const attrs = useAttrs();

const totalRecords = ref(0);

const routeLoading = useRouteLoading();
const loading = ref(routeLoading.value);

const meta = Collection.create({
   first: 0,
   rows: 5,
   ...props.meta
});

let ac = new AbortController();

async function getValues(metaObj) {
   if (loading.value) return;
   try {
      ac?.abort?.();
      ac = new AbortController();

      meta._merge(metaObj);

      loading.value = true;

      const req = supabase.from(props.from).select(props.select).abortSignal(ac.signal);

      if (!_isEmpty(meta._data)) req.setHeader?.('meta', JSON.stringify(meta._data));

      const usePaginator = _get(attrs, 'paginator', true);
      if (usePaginator) {
         const countReq = supabase
            .from(props.from)
            .select?.(props.select, props.count)
            .abortSignal?.(ac.signal);

         if (!_isEmpty(meta._data))
            countReq.setHeader?.('meta', JSON.stringify(_pick(meta._data, ['filters'])));

         countReq.then?.(({ count }) => {
            totalRecords.value = count;
         });
      }

      const { data } = await req.throwOnError();
      modelValue.value = data;
   } finally {
      loading.value = false;
   }
}

if (!loading.value) {
   await getValues(meta._data);
}

const updateCallback = () => getValues(meta._data);
onMounted(() => emitter.on(`${attrs.stateKey || props.from}-update`, updateCallback));
onBeforeUnmount(() => {
   emitter.off(`${attrs.stateKey || props.from}-update`, updateCallback);
   ac.abort?.();
});

const viewProps = computed(() => ({
   totalRecords: totalRecords.value,
   stateKey: props.from,
   loading: loading.value,
   onPage: async (value) => await getValues(value),
   onRows: async (value) => await getValues(value),
   layout: layout.value,
   value: modelValue.value,
   rowsPerPageOptions: [1, 5, 10],
   paginatorTemplate:
      'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown',
   lazy: true,
   ...meta._data,
   ...attrs
}));
</script>
<template>
   <DataView v-bind="viewProps">
      <template #paginatorstart>
         <SelectButton v-model="layout" :options :allowEmpty="false">
            <template #option="{ option }">
               <i :class="[option === 'list' ? 'pi pi-bars' : 'pi pi-table']" />
            </template>
         </SelectButton>
      </template>
      <template v-for="slot in _keys($slots)" #[slot]="slotProps" :key="`slot_${slot}`">
         <slot v-bind="slotProps" :name="slot" :key="`slot_${slot}`" />
      </template>
   </DataView>
</template>
