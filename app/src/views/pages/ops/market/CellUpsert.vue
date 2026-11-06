<script setup lang="ts">
import { usePlatformOptions } from '@/api/customer';
import type { ProductRow } from '@/api/product';
import {
   CONTENT_STATUSES,
   liveMissing,
   MARKET_CELL_STATUS_SEVERITY,
   MARKET_COMPLIANCES,
   marketCellResource,
   marketCellSchema,
   nextMarketCellStatuses,
   STOCK_SOURCES,
   toMarketCellFormValues,
   toMarketCellPayload,
   useSetMarketCellStatus,
   type MarketCellCard,
   type MarketCellRow,
   type MarketCellStatus,
   type LiveField
} from '@/api/marketMatrix';
import { useLookup } from '@/api/useLookup';
import { useDialogRef } from '@/composables/useDialogRef';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { defaultCurrencyFor } from '@/constants/currency';
import { DIALOG_POSITIONS } from '@/constants/router';
import { isTermCode } from '@/constants/terms';
import { useCustomerFilter } from '@/store/customerFilter';
import ProductSelect from '../purchase-order/ProductSelect.vue';
import CellAmazonDrawer from './CellAmazonDrawer.vue';
import ProjectSelect from '../purchase-order/ProjectSelect.vue';

// A market cell (S05), opened as a dialog. A new one names its product, platform and country (an
// empty matrix cell passes them) and starts as a candidate; once saved they are fixed, and the
// status moves by its actions. Empty fields are saved as NULL (toMarketCellPayload).
const props = defineProps<{
   id?: string | null;
   product_id?: string | null;
   platform_id?: string | null;
   country?: string | null;
}>();

const router = useRouter();
const dialogRef = useDialogRef();
const { t } = useI18n();

/** A new cell is edited on in its own dialog, where the identity is fixed. */
const openSaved = (cell: MarketCellCard) => {
   const to = { name: 'ops-market-cell-edit', params: { id: cell.id } };
   if (!dialogRef) return router.replace(to);
   dialogRef.value.close();
   return router.push({ ...to, query: { showDialog: DIALOG_POSITIONS.CENTER } });
};

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft, row } =
   useUpsertForm({
      id: () => props.id,
      prefill: () => ({
         product_id: props.product_id ?? undefined,
         platform_id: props.platform_id ?? undefined,
         country: props.country ?? undefined,
         currency: defaultCurrencyFor(props.country) ?? undefined
      }),
      useRow: marketCellResource.useOne,
      useSaveRow: marketCellResource.useSave,
      subject: 'market_cell',
      schema: marketCellSchema,
      toFormValues: toMarketCellFormValues,
      toPayload: (data) => toMarketCellPayload(data, props.id),
      onSaved: (cell) => {
         if (!props.id) openSaved(cell);
      }
   });
await ready;

const cell = computed(() => row.value ?? null);

// --- a new cell: its customer's products, the platform's countries ---

const customerFilter = useCustomerFilter();
const customerId = ref<string | null>(customerFilter.customerId);

// Opened from the matrix without a customer filter: the product's customer.
const { data: prefilledProduct } = useLookup<Pick<ProductRow, 'id' | 'customer_id'>>(
   'product',
   () => ({
      select: 'id, customer_id',
      in: { column: 'id', values: [props.product_id] }
   }),
   () => !props.id && !!props.product_id && !customerId.value
);
watch(
   prefilledProduct,
   (products) => {
      customerId.value ??= products?.[0]?.customer_id ?? null;
   },
   { immediate: true }
);

const onCustomerPick = () => {
   values.value.product_id = null;
   values.value.project_id = null;
};

const { data: platforms } = usePlatformOptions();
const countryOptions = computed(
   () =>
      platforms.value?.find((platform) => platform.id === values.value.platform_id)?.countries ?? []
);
// A currency left empty (or still the previous country's default on a new cell) follows the country.
watch(
   () => values.value.country,
   (country, before) => {
      const current = values.value.currency;
      if (!current || (!props.id && current === defaultCurrencyFor(before)))
         values.value.currency = defaultCurrencyFor(country) ?? current ?? null;
   }
);
const onPlatformPick = () => {
   if (values.value.country && !countryOptions.value.includes(values.value.country))
      values.value.country = null;
};

const priorityOptions = computed(() =>
   [1, 2, 3].map((value) => ({ value, label: `${value} — ${t(`ops.market.priority.${value}`)}` }))
);

// --- status ---

const { mutateAsync: setStatus } = useSetMarketCellStatus();
const nextStatuses = computed(() => (cell.value ? nextMarketCellStatuses(cell.value.status) : []));

/** What the cell still lacks to go (or stay) live, as the form has it now. */
const missingForLive = computed(() =>
   liveMissing(values.value as unknown as Pick<MarketCellRow, LiveField>)
);
const liveHint = computed(() =>
   missingForLive.value.length
      ? t('ops.market.live_missing', {
           fields: missingForLive.value.map((field) => t(`ops.market.fields.${field}`)).join(', ')
        })
      : undefined
);
// The database decides (market_cell_live_incomplete); this only warns in the confirmation.
const statusWarnings = computed(() => (liveHint.value ? { live: liveHint.value } : {}));

const changeStatus = (status: string) =>
   setStatus({ id: cell.value!.id, status: status as MarketCellStatus });

const productIdLabel = computed(
   () => cell.value?.platform?.product_id_label || t('ops.market.fields.platform_product_id')
);

// An Amazon cell opens its listing (connection, completeness, publishing) in a drawer, which asks
// before it closes over unsaved Amazon fields.
const amazonOpen = ref(false);
const amazonDrawer = ref<InstanceType<typeof CellAmazonDrawer> | null>(null);
const setAmazonOpen = async (open: boolean) => {
   if (open || ((await amazonDrawer.value?.allowClose()) ?? true)) amazonOpen.value = open;
};

const LISTING_TEXTS = ['platform_sku'] as const;
const DATES = ['target_launch_on', 'launched_on', 'last_checked_on'] as const;
</script>

<template>
   <div v-if="cell" class="mb-4 flex flex-wrap items-center gap-2">
      <h2 class="m-0 text-xl font-semibold">
         {{ [cell.product?.sku, cell.product?.display_name].filter(Boolean).join(' — ') }}
      </h2>
      <span class="text-muted-color">
         {{ cell.platform?.display_name ?? cell.platform_id }} {{ cell.country }}
      </span>
      <Tag
         :value="$t(`ops.market.status.${cell.status}`)"
         :severity="MARKET_CELL_STATUS_SEVERITY[cell.status]"
      />
      <template v-if="cell.platform_id === 'amazon' && id">
         <span class="flex-1" />
         <Button
            data-action="amazon-open"
            variant="outlined"
            size="small"
            :icon="PrimeIcons.AMAZON"
            :label="$t('ops.amazon.cell.open')"
            @click="amazonOpen = true"
         />
         <Drawer
            :visible="amazonOpen"
            @update:visible="setAmazonOpen"
            position="right"
            :header="$t('ops.amazon.cell.title')"
            class="!w-full md:!w-[40rem]"
         >
            <CellAmazonDrawer v-if="amazonOpen" ref="amazonDrawer" :cellId="cell.id" />
         </Drawer>
      </template>
   </div>
   <FormBox
      @submit="save"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
      :class="{ card: !id }"
   >
      <template v-if="!id">
         <FormField fluid :label="$t('ops.market.fields.customer')" :readonly v-slot="slotProps">
            <SelectCustomer
               v-bind="slotProps"
               v-model="customerId"
               hide-closed
               @update:model-value="onCustomerPick"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.market.fields.product')"
            :error="errors.product_id"
            :readonly
            v-slot="slotProps"
         >
            <ProductSelect v-bind="slotProps" v-model="values.product_id" :customerId />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.market.fields.platform')"
            :error="errors.platform_id"
            :readonly
            v-slot="slotProps"
         >
            <SelectPlatform
               v-bind="slotProps"
               v-model="values.platform_id"
               @update:model-value="onPlatformPick"
            />
         </FormField>
         <FormField
            fluid
            :label="$t('ops.market.fields.country')"
            :error="errors.country"
            :readonly
            v-slot="slotProps"
         >
            <Select v-bind="slotProps" v-model="values.country" :options="countryOptions" filter />
         </FormField>
      </template>

      <FormField
         fluid
         :label="$t('ops.market.fields.priority')"
         :error="errors.priority"
         :readonly
         v-slot="slotProps"
      >
         <Select
            v-bind="slotProps"
            v-model="values.priority"
            :options="priorityOptions"
            option-value="value"
            option-label="label"
         />
      </FormField>
      <FormField
         fluid
         :label="$t('ops.market.fields.project')"
         :error="errors.project_id"
         :readonly
         v-slot="slotProps"
      >
         <ProjectSelect
            v-bind="slotProps"
            v-model="values.project_id"
            :customerId="cell?.customer_id ?? customerId"
         />
      </FormField>

      <template v-if="cell">
         <FormBox :legend="$t('ops.market.sections.status')" class="!flex-auto w-full">
            <span class="flex flex-wrap items-center gap-2">
               <StatusActions
                  v-if="$can('update', 'market_cell')"
                  :current="cell.status"
                  :next="nextStatuses"
                  i18nPrefix="ops.market.status"
                  glossary="market_cell_status"
                  :warnings="statusWarnings"
                  :disabled="isDirty"
                  :onChange="changeStatus"
               />
               <small
                  v-if="isDirty && $can('update', 'market_cell')"
                  class="text-muted-color"
                  data-test="status-dirty-hint"
                  v-text="$t('ops.status_actions.dirty_hint')"
               />
            </span>
            <Message
               v-if="liveHint && (cell.status === 'live' || nextStatuses.includes('live'))"
               severity="warn"
               class="w-full"
               data-test="live-missing"
            >
               {{ liveHint }}
            </Message>
         </FormBox>

         <FormBox :legend="$t('ops.market.sections.compliance')" class="!flex-auto w-full">
            <FormField
               fluid
               :label="$t('ops.market.fields.compliance')"
               :error="errors.compliance"
               :readonly
               v-slot="slotProps"
            >
               <SelectEnum
                  v-bind="slotProps"
                  v-model="values.compliance"
                  :values="MARKET_COMPLIANCES"
                  i18n-prefix="ops.market.compliance"
                  glossary="market_compliance"
               />
            </FormField>
            <FormField
               class="!flex-auto !max-w-none w-full"
               fluid
               :label="$t('ops.market.fields.compliance_note')"
               :error="errors.compliance_note"
               :readonly
               v-slot="slotProps"
            >
               <Textarea v-bind="slotProps" v-model="values.compliance_note" auto-resize rows="2" />
            </FormField>
         </FormBox>

         <FormBox :legend="$t('ops.market.sections.listing')" class="!flex-auto w-full">
            <FormField
               fluid
               :label="productIdLabel"
               :term="isTermCode(productIdLabel) ? productIdLabel : undefined"
               :error="errors.platform_product_id"
               :readonly
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.platform_product_id" />
            </FormField>
            <FormField
               v-for="field in LISTING_TEXTS"
               :key="field"
               fluid
               :label="$t(`ops.market.fields.${field}`)"
               :term="field === 'platform_sku' ? 'SKU' : undefined"
               :error="errors[field]"
               :readonly
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values[field]" />
            </FormField>
            <FormField
               fluid
               :label="$t('ops.market.fields.currency')"
               :error="errors.currency"
               :readonly
               v-slot="slotProps"
            >
               <SelectCurrency v-bind="slotProps" v-model="values.currency" />
            </FormField>
            <FormField
               fluid
               :label="$t('ops.market.fields.price')"
               :error="errors.price"
               :readonly
               v-slot="slotProps"
            >
               <InputNumber
                  v-bind="slotProps"
                  :model-value="typeof values.price === 'number' ? values.price : null"
                  @update:model-value="values.price = $event"
                  :min="0"
                  :minFractionDigits="2"
                  :maxFractionDigits="2"
               />
            </FormField>
            <FormField
               fluid
               :label="$t('ops.market.fields.stock_source')"
               :error="errors.stock_source"
               :readonly
               v-slot="slotProps"
            >
               <SelectEnum
                  v-bind="slotProps"
                  v-model="values.stock_source"
                  :values="STOCK_SOURCES"
                  i18n-prefix="ops.market.stock_source"
                  glossary="stock_source"
                  showClear
               />
            </FormField>
            <FormField
               fluid
               :label="$t('ops.market.fields.content_status')"
               :error="errors.content_status"
               :readonly
               v-slot="slotProps"
            >
               <SelectEnum
                  v-bind="slotProps"
                  v-model="values.content_status"
                  :values="CONTENT_STATUSES"
                  i18n-prefix="ops.market.content_status"
                  glossary="content_status"
               />
            </FormField>
         </FormBox>

         <FormBox :legend="$t('ops.market.sections.dates')" class="!flex-auto w-full">
            <FormField
               v-for="date in DATES"
               :key="date"
               fluid
               :label="$t(`ops.market.fields.${date}`)"
               :error="errors[date]"
               :readonly
               v-slot="slotProps"
            >
               <DatePicker
                  v-bind="slotProps"
                  :model-value="values[date] || null"
                  @update:model-value="values[date] = $event as Date | null"
                  date-format="yy-mm-dd"
                  show-icon
               />
            </FormField>
         </FormBox>

         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('ops.market.fields.open_issue')"
            :error="errors.open_issue"
            :readonly
            v-slot="slotProps"
         >
            <Textarea v-bind="slotProps" v-model="values.open_issue" auto-resize rows="2" />
         </FormField>
      </template>

      <FormField
         class="!flex-auto !max-w-none w-full"
         fluid
         :label="$t('ops.market.fields.notes')"
         :error="errors.notes"
         :readonly
         v-slot="slotProps"
      >
         <Textarea v-bind="slotProps" v-model="values.notes" auto-resize rows="3" />
      </FormField>
   </FormBox>
</template>
