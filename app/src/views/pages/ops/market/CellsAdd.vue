<script setup lang="ts">
import { usePlatformOptions } from '@/api/customer';
import {
   missingCells,
   useAddMarketCells,
   useMarketCells,
   type MarketCellRow
} from '@/api/marketMatrix';
import { useDialogRef } from '@/composables/useDialogRef';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useCustomerFilter } from '@/store/customerFilter';
import { useToast } from 'primevue/usetoast';
import ProjectSelect from '../purchase-order/ProjectSelect.vue';

// Opens a customer's products on one platform in several countries at once, each a candidate.
// Only the cells that are not open yet are added; the toast says how many already were.
const { t } = useI18n();
const toast = useToast();
const dialogRef = useDialogRef();
const customerFilter = useCustomerFilter();

const customerId = ref<string | null>(customerFilter.customerId);
const productIds = ref<string[]>([]);
const projectId = ref<string | null>(null);
const platformId = ref<string | null>(null);
const countries = ref<string[]>([]);
const priority = ref(2);

const onCustomerPick = () => {
   productIds.value = [];
   projectId.value = null;
};

const clear = () => {
   onCustomerPick();
   platformId.value = null;
   countries.value = [];
   priority.value = 2;
};

const { data: platforms } = usePlatformOptions();
const countryOptions = computed(
   () => platforms.value?.find((platform) => platform.id === platformId.value)?.countries ?? []
);
const onPlatformPick = () => {
   countries.value = countries.value.filter((country) => countryOptions.value.includes(country));
};

const priorityOptions = computed(() =>
   [1, 2, 3].map((value) => ({ value, label: `${value} — ${t(`ops.market.priority.${value}`)}` }))
);

// The customer's cells, to leave out the ones already open.
const { data: existing } = useMarketCells(() => ({ customerId: customerId.value }));
const { mutateAsync: addCells, isPending } = useAddMarketCells();

const ready = computed(
   () =>
      !!customerId.value &&
      productIds.value.length > 0 &&
      !!platformId.value &&
      countries.value.length > 0 &&
      !!existing.value
);

const submit = async () => {
   if (!ready.value) return;
   // Overview columns are nullable; every cell has its product, platform and country.
   const open = (existing.value ?? []) as Pick<
      MarketCellRow,
      'product_id' | 'platform_id' | 'country'
   >[];
   const cells = missingCells(open, productIds.value, platformId.value!, countries.value);
   const skipped = productIds.value.length * countries.value.length - cells.length;
   let added = 0;
   try {
      if (cells.length)
         added = await addCells(
            cells.map((cell) => ({
               ...cell,
               priority: priority.value,
               project_id: projectId.value
            }))
         );
   } catch (error) {
      return appErrorHandler(error);
   }
   toast.add({
      life: 5000,
      severity: ToastSeverity.SUCCESS,
      summary: t('toast.success'),
      detail: t('ops.market.cells_added', { added, skipped })
   });
   dialogRef?.value.close();
};
</script>

<template>
   <FormBox
      class="card"
      :dirty="ready"
      :submitting="isPending"
      :submitText="$t('ops.market.add_cells')"
      @submit="submit"
      @reset="clear"
   >
      <FormField fluid :label="$t('ops.market.fields.customer')" v-slot="slotProps">
         <SelectCustomer
            v-bind="slotProps"
            v-model="customerId"
            hide-closed
            @update:model-value="onCustomerPick"
         />
      </FormField>
      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.market.fields.products')"
         v-slot="slotProps"
      >
         <ProductMultiSelect v-bind="slotProps" v-model="productIds" :customerId />
      </FormField>
      <FormField fluid :label="$t('ops.market.fields.project')" v-slot="slotProps">
         <ProjectSelect v-bind="slotProps" v-model="projectId" :customerId />
      </FormField>
      <FormField fluid :label="$t('ops.market.fields.platform')" v-slot="slotProps">
         <SelectPlatform
            v-bind="slotProps"
            v-model="platformId"
            @update:model-value="onPlatformPick"
         />
      </FormField>
      <FormField fluid :label="$t('ops.market.fields.countries')" v-slot="slotProps">
         <MultiSelect
            v-bind="slotProps"
            v-model="countries"
            :options="countryOptions"
            display="chip"
            filter
         />
      </FormField>
      <FormField fluid :label="$t('ops.market.fields.priority')" v-slot="slotProps">
         <Select
            v-bind="slotProps"
            v-model="priority"
            :options="priorityOptions"
            option-value="value"
            option-label="label"
         />
      </FormField>
   </FormBox>
</template>
