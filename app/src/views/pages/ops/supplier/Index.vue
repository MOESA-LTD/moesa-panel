<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import type { SupplierStatus } from '@/api/supplier';

// Suppliers are shared by every customer of the tenant, so the customer filter does not apply.
type Props = ResourceTableProps<'supplier'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'code', sortable: true, header: t('ops.supplier.fields.code') },
   { field: 'display_name', sortable: true, header: t('ops.supplier.fields.display_name') },
   { field: 'country', sortable: true, header: t('ops.supplier.fields.country') },
   { field: 'city', sortable: true, header: t('ops.supplier.fields.city') },
   { field: 'rating', sortable: true, header: t('ops.supplier.fields.rating') },
   { field: 'status', sortable: true, header: t('ops.supplier.fields.status') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         code: 'startsWith',
         display_name: 'text',
         country: 'text',
         city: 'text'
      },
      attrs.filters as Props['filters']
   )
);

const SEVERITY: Record<SupplierStatus, string> = {
   candidate: 'secondary',
   approved: 'success',
   suspended: 'danger'
};

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-supplier-manage',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

const dialogRef = useDialogRef();
</script>
<template>
   <ResourceTable
      v-bind="attrs"
      stateKey="supplier"
      from="supplier"
      select="*"
      :columns
      :rowActions
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink
                  v-if="$can('create', 'supplier')"
                  :to="{
                     name: 'ops-supplier-manage',
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
            :value="$t(`ops.supplier.status.${data.status}`)"
            :severity="SEVERITY[data.status as SupplierStatus]"
         />
      </template>
   </ResourceTable>
</template>
