<script setup lang="ts">
import { useEntityDocuments, type DocumentEntity, type DocumentStatus } from '@/api/document';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

// The documents of one record (customer, supplier, product, project, gate...), embedded in its
// card. Documents are opened, added and edited in a dialog; they are never deleted.
const props = defineProps<{
   entityType: DocumentEntity;
   entityId: string;
   /** The record's code the files are named after (see documentFileName). */
   code: string;
   customerId?: string | null;
}>();

type Props = ResourceTableProps<'document'>;

const router = useRouter();
const { t } = useI18n();

const { filters: initialFilters, ...table } = useEntityDocuments(props.entityType, props.entityId);
const filters = ref<NonNullable<Props['filters']>>(initialFilters);

const columns = computed<Props['columns']>(() => [
   { field: 'type', header: t('ops.document.fields.type') },
   { field: 'version', sortable: true, header: t('ops.document.fields.version') },
   { field: 'issued_on', sortable: true, header: t('ops.document.fields.issued_on') },
   { field: 'status', header: t('ops.document.fields.status') },
   { field: 'file_name', header: t('ops.document.fields.file_name') },
   { field: 'url', header: t('ops.document.fields.url') }
]);

const SEVERITY: Record<DocumentStatus, string> = {
   draft: 'secondary',
   signed: 'success',
   approved: 'info',
   superseded: 'warn'
};

/** The record the dialog's document belongs to. */
const context = computed(() => ({
   showDialog: DIALOG_POSITIONS.CENTER,
   entity_type: props.entityType,
   entity_id: props.entityId,
   code: props.code,
   ...(props.customerId ? { customer_id: props.customerId } : {})
}));

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
               query: context.value
            })
   }
]);
</script>

<template>
   <ResourceTable
      v-bind="table"
      :stateKey="`document-${entityType}`"
      :columns
      :rowActions
      :rows="10"
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.document.title') }}</span>
            <CustomLink
               v-if="$can('create', 'document')"
               :to="{ name: 'ops-document-add', query: context }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #type_body="{ data }">
         {{ $t(`ops.document.type.${data.type}`) }}
      </template>
      <template #version_body="{ data }"> v{{ String(data.version).padStart(2, '0') }} </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.document.status.${data.status}`)"
            :severity="SEVERITY[data.status as DocumentStatus]"
         />
      </template>
      <template #url_body="{ data }">
         <a
            v-if="data.url"
            :href="data.url"
            target="_blank"
            rel="noopener"
            :title="$t('ops.document.open_link')"
            :aria-label="$t('ops.document.open_link')"
         >
            <i :class="PrimeIcons.EXTERNAL_LINK" />
         </a>
      </template>
   </ResourceTable>
</template>
