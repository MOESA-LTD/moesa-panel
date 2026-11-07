<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type {
   ResourceTableProps,
   TableRow
} from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { toS10Csv, type ProductExportRow } from '@/api/product/csv';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';
import { useCustomerFilter, withCustomerFilter } from '@/store/customerFilter';
import MediaThumb from '@/components/service-components/media/MediaThumb.vue';
import AmazonBulkPublish from './AmazonBulkPublish.vue';
import {
   PRODUCT_STATUSES,
   specFilterFromQuery,
   type ComplianceStatus,
   type ProductStatus
} from '@/api/product';

// The products of the customer the lists are filtered by (every customer's when none is), with
// their evidence (public.product_with_evidence).
type Props = ResourceTableProps<'product_with_evidence'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   // The primary image (its thumbnail), named for screen readers only.
   {
      field: 'primary_image_path',
      header: '',
      reorderableColumn: false,
      pt: { headerCell: { 'aria-label': t('ops.media.primary') } }
   },
   { field: 'customer.code', header: t('ops.product.fields.customer') },
   { field: 'sku', sortable: true, sortOrder: { value: 1 }, header: t('ops.product.fields.sku') },
   { field: 'display_name', sortable: true, header: t('ops.product.fields.display_name') },
   { field: 'variant_label', header: t('ops.product.fields.variant_label') },
   { field: 'gtin', header: t('ops.product.fields.gtin') },
   {
      field: 'status',
      sortable: true,
      header: t('ops.product.fields.status'),
      showFilterMatchModes: false,
      showFilterOperator: false,
      showAddButton: false
   },
   { field: 'supplier.code', header: t('ops.product.fields.supplier') },
   {
      field: 'has_signed_spec',
      header: t('ops.product.fields.spec'),
      showFilterMatchModes: false,
      showFilterOperator: false,
      showAddButton: false
   },
   { field: 'compliance_status', sortable: true, header: t('ops.product.fields.compliance_status') }
]);

// No keyword search: it would compare every filter column as text, the status enum and the
// customer id included, which the database rejects.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         sku: 'startsWith',
         display_name: 'text',
         gtin: 'startsWith',
         status: equalsFilter(),
         has_signed_spec: equalsFilter(),
         customer_id: equalsFilter()
      },
      attrs.filters as Props['filters']
   )
);

// The table reads its filters once and then restores its stored state over them, so the selected
// customer is written into the existing customer filter after mounting and whenever it changes.
const customerFilter = useCustomerFilter();
const applyCustomerFilter = () => {
   const { customer_id } = withCustomerFilter({}, customerFilter.customerId);
   filters.value.customer_id.constraints = (customer_id ?? equalsFilter()).constraints;
};
onMounted(applyCustomerFilter);
watch(() => customerFilter.customerId, applyCustomerFilter);

// A link may ask for products with or without a signed spec sheet (?spec=true|false), applied
// over the stored state like the customer filter.
onMounted(() => {
   const spec = specFilterFromQuery(route.query);
   if (spec !== null) filters.value.has_signed_spec.constraints = equalsFilter(spec).constraints;
});

const SPEC_OPTIONS = computed(() => [
   { value: true, label: t('ops.product.spec_signed') },
   { value: false, label: t('ops.product.spec_none') }
]);

const STATUS_SEVERITY: Record<ProductStatus, string> = {
   concept: 'secondary',
   development: 'info',
   approved: 'info',
   ordering: 'warn',
   on_sale: 'success',
   paused: 'warn',
   archived: 'danger'
};

const COMPLIANCE_SEVERITY: Record<ComplianceStatus, string> = {
   none: 'danger',
   partial: 'warn',
   complete: 'success'
};

const specVersion = (version: number | null) => `v${String(version ?? 0).padStart(2, '0')}`;

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-product-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

// Export: every product of the customer filter (all when none), as an S10 file. Read page by page,
// as the API returns at most a page of rows per request.
const EXPORT_PAGE = 1000;
const exporting = ref(false);

const fetchExportRows = async () => {
   const products: ProductExportRow[] = [];
   for (let from = 0; ; from += EXPORT_PAGE) {
      let query = supabase
         .from('product')
         .select('*, customer(code), supplier(code)')
         .order('sku')
         .order('id')
         .range(from, from + EXPORT_PAGE - 1);
      if (customerFilter.customerId) query = query.eq('customer_id', customerFilter.customerId);
      const { data } = await query.throwOnError();
      products.push(...(data as ProductExportRow[]));
      if (data.length < EXPORT_PAGE) return products;
   }
};

const exportCsv = async () => {
   exporting.value = true;
   try {
      // With a byte order mark, so spreadsheets read the file as UTF-8.
      const blob = new Blob([String.fromCharCode(0xfeff), toS10Csv(await fetchExportRows())], {
         type: 'text/csv;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `urun_ana_tablosu_${dayjs().format('YYYYMMDD')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
   } finally {
      exporting.value = false;
   }
};

// Transfer: the selected products, when they are all one customer's (a transfer moves or copies
// products of one customer). The selection is cleared once the dialog opens and whenever the
// filters change (rows it holds may no longer be listed).
const selected = ref<TableRow<'product_with_evidence'>[]>([]);
const transferCustomer = computed(() => {
   const customers = new Set(selected.value.map(({ customer_id }) => customer_id));
   return customers.size === 1 ? [...customers][0] : null;
});
const transferHint = computed(() => {
   if (!selected.value.length) return t('ops.transfer.open_disabled_empty');
   return transferCustomer.value ? null : t('ops.transfer.open_disabled_mixed');
});
// By value: the customer filter is written again on mount with the same constraints.
watch(
   () => JSON.stringify(filters.value),
   () => (selected.value = [])
);
const openTransfer = async () => {
   if (!transferCustomer.value) return;
   await router.push({
      name: 'ops-transfer',
      query: {
         customer_id: transferCustomer.value,
         product_ids: selected.value.map(({ id }) => id).join(','),
         showDialog: DIALOG_POSITIONS.CENTER
      }
   });
   selected.value = [];
};

// Publish to Amazon: the selected products, one customer's like a transfer (the customer's Amazon
// account publishes them). The dialog keeps its own copy of the products, so the selection is
// cleared and the result table stays.
const bulkHint = computed(() => {
   if (!selected.value.length) return t('ops.amazon.bulk.open_disabled_empty');
   return transferCustomer.value ? null : t('ops.amazon.bulk.open_disabled_mixed');
});
const bulkProducts = ref<TableRow<'product_with_evidence'>[]>([]);
const bulkOpen = ref(false);
const openBulk = () => {
   if (!transferCustomer.value) return;
   bulkProducts.value = [...selected.value];
   bulkOpen.value = true;
   // As after a transfer: the next action starts from a new selection.
   selected.value = [];
};

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      stateKey="product"
      from="product_with_evidence"
      select="*, customer(code, display_name), supplier(code)"
      :columns
      :rowActions
      :enableExpansion="false"
      selectionMode="multiple"
      v-model:selection="selected"
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <span
                  v-if="$can('create', 'transfer')"
                  v-tooltip.bottom="transferHint"
                  data-transfer
               >
                  <Button
                     variant="outlined"
                     :icon="PrimeIcons.ARROW_RIGHT_ARROW_LEFT"
                     :label="
                        selected.length
                           ? $t('ops.transfer.open_count', { count: selected.length })
                           : $t('ops.transfer.open')
                     "
                     :disabled="!transferCustomer"
                     @click="openTransfer"
                  />
               </span>
               <span
                  v-if="$can('create', 'listing_submission')"
                  v-tooltip.bottom="bulkHint"
                  data-amazon-bulk
               >
                  <Button
                     variant="outlined"
                     :icon="PrimeIcons.AMAZON"
                     :label="
                        selected.length
                           ? $t(
                                'ops.amazon.bulk.open_count',
                                { count: selected.length },
                                selected.length
                             )
                           : $t('ops.amazon.bulk.open')
                     "
                     :disabled="!transferCustomer"
                     @click="openBulk"
                  />
               </span>
               <Button
                  variant="outlined"
                  :icon="PrimeIcons.DOWNLOAD"
                  :label="$t('ops.product.import.export')"
                  :loading="exporting"
                  @click="exportCsv"
               />
               <CustomLink
                  v-if="$can('create', 'product')"
                  :to="{
                     name: 'ops-product-import',
                     query: { showDialog: DIALOG_POSITIONS.CENTER }
                  }"
               >
                  <template #default="{ navigate }">
                     <Button
                        variant="outlined"
                        :icon="PrimeIcons.UPLOAD"
                        :label="$t('ops.product.import.open')"
                        @click="navigate"
                     />
                  </template>
               </CustomLink>
               <CustomLink
                  v-if="$can('create', 'product')"
                  :to="{
                     name: 'ops-product-manage',
                     query: { showDialog: DIALOG_POSITIONS.CENTER }
                  }"
               >
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #primary_image_path_body="{ data }">
         <MediaThumb :path="data.primary_image_path" :alt="data.display_name" :size="40" />
      </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.product.status.${data.status}`)"
            :severity="STATUS_SEVERITY[data.status as ProductStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="PRODUCT_STATUSES"
            glossary="product_status"
            i18n-prefix="ops.product.status"
         />
      </template>
      <template #has_signed_spec_body="{ data }">
         <Tag
            v-if="data.has_signed_spec"
            :value="specVersion(data.spec_version)"
            severity="success"
         />
         <Tag v-else :value="$t('ops.product.spec_none')" severity="danger" />
      </template>
      <template #has_signed_spec_filter="{ filterModel }">
         <Select
            v-model="filterModel.value"
            :options="SPEC_OPTIONS"
            option-value="value"
            option-label="label"
            :placeholder="$t('ops.product.fields.spec')"
         />
      </template>
      <template #compliance_status_body="{ data }">
         <Tag
            :value="$t(`ops.product.compliance_status.${data.compliance_status}`)"
            :severity="COMPLIANCE_SEVERITY[data.compliance_status as ComplianceStatus]"
         />
      </template>
   </ResourceTable>
   <Dialog
      v-model:visible="bulkOpen"
      modal
      :header="$t('ops.amazon.bulk.title')"
      class="w-full max-w-3xl"
      :draggable="false"
   >
      <AmazonBulkPublish
         :productIds="bulkProducts.map(({ id }) => id!)"
         :products="
            bulkProducts.map(({ id, sku, display_name }) => ({
               id: id!,
               sku: sku!,
               display_name: display_name!
            }))
         "
      />
   </Dialog>
</template>
