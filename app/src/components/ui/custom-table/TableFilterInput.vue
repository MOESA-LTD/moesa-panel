<script setup lang="ts">
import type { DataTableFilterMetaData } from 'primevue';

export type TableFilterInputProps = {
   /** PrimeVue's filter model; the editor writes `value` into it, as the column filter expects. */
   filterModel: DataTableFilterMetaData;
   dataType?: string;
   filterCallback?: () => void;
};

const props = defineProps<TableFilterInputProps>();

const DATE_MODES: string[] = [
   FilterMatchMode.DATE_IS,
   FilterMatchMode.DATE_IS_NOT,
   FilterMatchMode.DATE_BEFORE,
   FilterMatchMode.DATE_AFTER
];

const kind = computed(() => {
   if (props.dataType === 'date' || DATE_MODES.includes(props.filterModel.matchMode)) return 'date';
   if (props.dataType === 'numeric' || props.dataType === 'decimal') return 'number';
   return 'text';
});

const value = computed({
   get: () => props.filterModel.value,
   set: (value) => {
      // eslint-disable-next-line vue/no-mutating-props -- PrimeVue column filters are edited in place.
      props.filterModel.value = value;
   }
});
</script>

<template>
   <FormField fluid>
      <template v-slot="inputProps">
         <div class="flex flex-col gap-2 items-start" v-if="kind === 'date'">
            <DatePicker
               :selectionMode="'single'"
               v-bind="inputProps"
               v-model="value"
               dateFormat="dd/mm/yy"
               showButtonBar
               placeholder="dd/mm/yyyy"
            />
            <DatePicker
               :selectionMode="'single'"
               v-bind="inputProps"
               v-model="value"
               timeOnly
               show-seconds
               showButtonBar
               dateFormat="hh:mm"
               placeholder="00:00"
            />
         </div>
         <InputNumber
            v-else-if="kind === 'number'"
            v-bind="inputProps"
            v-model="value"
            :max-fraction-digits="dataType === 'decimal' ? 3 : null"
            @keydown.enter="filterCallback"
         />
         <InputText
            v-else
            v-bind="inputProps"
            type="text"
            v-model="value"
            @keydown.enter="filterCallback"
         />
      </template>
   </FormField>
</template>
