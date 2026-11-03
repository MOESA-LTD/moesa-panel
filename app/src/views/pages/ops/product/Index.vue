<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import { useLookup } from '@/api/useLookup';
import { toS10Csv, type ProductExportRow } from '@/api/product/csv';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';
import { useCustomerFilter, withCustomerFilter } from '@/store/customerFilter';
import {
   PRODUCT_STATUSES,
   type ComplianceStatus,
   type ProductEvidenceRow,
   type ProductRow,
   type ProductStatus
} from '@/api/product';

// The products of the customer the lists are filtered by (every customer's when none is).
type Props = ResourceTableProps<'product'>;
type Evidence = Pick<
   ProductEvidenceRow,
   'product_id' | 'has_signed_spec' | 'spec_version' | 'compliance_complete'
>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
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
   { field: 'spec', header: t('ops.product.fields.spec') },
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

// The evidence of the products shown: a view has no foreign key to embed, so it is read apart.
const rows = ref<ProductRow[]>([]);
const productIds = computed(() => rows.value.map(({ id }) => id));
const { data: evidenceRows } = useLookup<Evidence>(
   'product_evidence',
   () => ({
      select: 'product_id, has_signed_spec, spec_version, compliance_complete',
      in: { column: 'product_id', values: productIds.value }
   }),
   () => productIds.value.length > 0
);
const evidence = computed(
   () => new Map((evidenceRows.value ?? []).map((row) => [row.product_id, row]))
);
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

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      stateKey="product"
      from="product"
      select="*, customer(code, display_name), supplier(code)"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model="rows"
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
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
            i18n-prefix="ops.product.status"
         />
      </template>
      <template #spec_body="{ data }">
         <Tag
            v-if="evidence.get(data.id)?.has_signed_spec"
            :value="specVersion(evidence.get(data.id)!.spec_version)"
            severity="success"
         />
         <Tag
            v-else-if="evidence.has(data.id)"
            :value="$t('ops.product.spec_none')"
            severity="danger"
         />
      </template>
      <template #compliance_status_body="{ data }">
         <Tag
            :value="$t(`ops.product.compliance_status.${data.compliance_status}`)"
            :severity="COMPLIANCE_SEVERITY[data.compliance_status as ComplianceStatus]"
         />
      </template>
   </ResourceTable>
</template>
