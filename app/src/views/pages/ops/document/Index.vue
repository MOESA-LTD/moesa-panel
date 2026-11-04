<script setup lang="ts">
import {
   DOCUMENT_ENTITIES_SELECTABLE,
   DOCUMENT_STATUSES,
   DOCUMENT_MEDIA_SELECT,
   DOCUMENT_TYPES,
   documentFile,
   type DocumentStatus
} from '@/api/document';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import DocumentFileLink from '@/components/service-components/entity-documents/DocumentFileLink.vue';
import { useCustomerFilter, withCustomerFilter } from '@/store/customerFilter';

// Every document of the tenant (of the customer the lists are filtered by, when one is). Opened
// and edited in the same dialog as a record's document list; documents are never deleted.
type Props = ResourceTableProps<'document'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

const FILTER_COLUMN = {
   showFilterMatchModes: false,
   showFilterOperator: false,
   showAddButton: false
};

const columns = computed<Props['columns']>(() => [
   { field: 'customer.code', header: t('ops.document.fields.customer') },
   { field: 'type', header: t('ops.document.fields.type'), ...FILTER_COLUMN },
   { field: 'version', sortable: true, header: t('ops.document.fields.version') },
   { field: 'status', header: t('ops.document.fields.status'), ...FILTER_COLUMN },
   { field: 'file_name', sortable: true, header: t('ops.document.fields.file_name') },
   {
      field: 'issued_on',
      sortable: true,
      sortOrder: { value: -1 },
      header: t('ops.document.fields.issued_on')
   },
   { field: 'entity_type', header: t('ops.document.fields.entity_type'), ...FILTER_COLUMN },
   { field: 'url', header: t('ops.document.fields.url') }
]);

// No keyword search: it would compare the enum and id columns as text, which the database rejects.
const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         type: equalsFilter(),
         status: equalsFilter(),
         entity_type: equalsFilter(),
         file_name: 'text',
         customer_id: equalsFilter()
      },
      attrs.filters as Props['filters']
   )
);

// The selected customer is written into the customer filter after mounting and whenever it
// changes, as the table restores its stored state over its initial filters (see the product list).
const customerFilter = useCustomerFilter();
const applyCustomerFilter = () => {
   const { customer_id } = withCustomerFilter({}, customerFilter.customerId);
   filters.value.customer_id.constraints = (customer_id ?? equalsFilter()).constraints;
};
onMounted(applyCustomerFilter);
watch(() => customerFilter.customerId, applyCustomerFilter);

const SEVERITY: Record<DocumentStatus, string> = {
   draft: 'secondary',
   signed: 'success',
   approved: 'info',
   superseded: 'warn'
};

// The record's code is not known here, so the dialog keeps the stored file name.
const rowActions = computed<Props['rowActions']>(() => [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'document' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-document-edit',
               params: { id: data.id },
               query: {
                  showDialog: DIALOG_POSITIONS.CENTER,
                  entity_type: data.entity_type,
                  entity_id: data.entity_id,
                  ...(data.customer_id ? { customer_id: data.customer_id } : {})
               }
            })
   }
]);
</script>

<template>
   <ResourceTable
      v-bind="attrs"
      stateKey="document"
      from="document"
      :select="`*, customer!document_customer_fkey(code), ${DOCUMENT_MEDIA_SELECT}`"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #type_body="{ data }">
         {{ $t(`ops.document.type.${data.type}`) }}
      </template>
      <template #type_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="DOCUMENT_TYPES"
            glossary="document_type"
            i18n-prefix="ops.document.type"
         />
      </template>
      <template #version_body="{ data }"> v{{ String(data.version).padStart(2, '0') }} </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.document.status.${data.status}`)"
            :severity="SEVERITY[data.status as DocumentStatus]"
         />
      </template>
      <template #status_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="DOCUMENT_STATUSES"
            glossary="document_status"
            i18n-prefix="ops.document.status"
         />
      </template>
      <template #entity_type_body="{ data }">
         {{ $t(`ops.document.entity.${data.entity_type}`) }}
      </template>
      <template #entity_type_filter="{ filterModel }">
         <SelectEnum
            v-model="filterModel.value"
            :values="DOCUMENT_ENTITIES_SELECTABLE"
            i18n-prefix="ops.document.entity"
         />
      </template>
      <template #url_body="{ data }">
         <DocumentFileLink :url="data.url" :media="documentFile(data)" />
      </template>
   </ResourceTable>
</template>
