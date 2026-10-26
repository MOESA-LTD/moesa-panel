<script setup>
import { applyTableMeta } from '@/api/postgrest/tableQuery';
import { queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import { useRouteLoading } from '@/composables/useRouteStatus';
import Collection from '@/lib/Collection';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';

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
const tenantId = useTenantId();

const meta = ref({
   first: 0,
   rows: 5,
   ...props.meta
});
const onPage = ({ first, rows }) => {
   meta.value = { ...meta.value, first, rows };
};

const listQuery = useQuery({
   queryKey: computed(() =>
      queryKeys.list(tenantId.value, props.from, { select: props.select, meta: meta.value })
   ),
   queryFn: async ({ signal }) => {
      const paginate = _get(attrs, 'paginator', true);
      const query = supabase
         .from(props.from)
         .select(props.select, paginate ? { count: props.count.count } : undefined)
         .abortSignal(signal);

      const { data, count } = await applyTableMeta(query, meta.value).throwOnError();
      return { rows: data, count };
   },
   placeholderData: keepPreviousData
});
await listQuery.suspense();

watch(
   () => listQuery.data.value?.rows,
   (rows) => {
      // Query data is deeply readonly and shared with the cache; slots and cards get their own copy.
      if (rows) modelValue.value = _cloneDeep(rows);
   },
   { immediate: true }
);

const totalRecords = computed(() => listQuery.data.value?.count ?? 0);

const routeLoading = useRouteLoading();
const loading = computed(() => routeLoading.value || listQuery.isFetching.value);

const viewProps = computed(() => ({
   totalRecords: totalRecords.value,
   stateKey: props.from,
   loading: loading.value,
   onPage,
   layout: layout.value,
   value: modelValue.value,
   rowsPerPageOptions: [1, 5, 10],
   paginatorTemplate:
      'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown',
   lazy: true,
   ...meta.value,
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
