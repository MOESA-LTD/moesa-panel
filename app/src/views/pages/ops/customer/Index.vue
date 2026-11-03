<script setup lang="ts">
import { useDialogRef } from '@/composables/useDialogRef';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { DIALOG_POSITIONS } from '@/constants/router';
import type { CustomerStatus } from '@/api/customer';

// Every customer of the tenant: the customer filter narrows the customer-scoped lists, not this one.
type Props = ResourceTableProps<'customer'>;

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'code', sortable: true, header: t('ops.customer.fields.code') },
   { field: 'display_name', sortable: true, header: t('ops.customer.fields.display_name') },
   { field: 'country', sortable: true, header: t('ops.customer.fields.country') },
   {
      field: 'commercial_model',
      sortable: true,
      header: t('ops.customer.fields.commercial_model')
   },
   { field: 'packages', header: t('ops.customer.fields.packages') },
   { field: 'status', sortable: true, header: t('ops.customer.fields.status') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters(
      {
         code: 'startsWith',
         display_name: 'text',
         country: 'text'
      },
      attrs.filters as Props['filters']
   )
);

const SEVERITY: Record<CustomerStatus, string> = {
   lead: 'secondary',
   onboarding: 'info',
   active: 'success',
   paused: 'warn',
   closed: 'danger'
};

const rowActions: Props['rowActions'] = [
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         async () =>
            router.push({
               name: 'ops-customer-manage',
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
      stateKey="customer"
      from="customer"
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
                  v-if="$can('create', 'customer')"
                  :to="{
                     name: 'ops-customer-manage',
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
      <template #commercial_model_body="{ data }">
         {{ $t(`ops.customer.commercial_model.${data.commercial_model}`) }}
      </template>
      <template #packages_body="{ data }">
         <span class="flex flex-wrap gap-1">
            <Tag v-for="pkg in data.packages" :key="pkg" :value="pkg" severity="secondary" />
         </span>
      </template>
      <template #status_body="{ data }">
         <Tag
            :value="$t(`ops.customer.status.${data.status}`)"
            :severity="SEVERITY[data.status as CustomerStatus]"
         />
      </template>
   </ResourceTable>
</template>
