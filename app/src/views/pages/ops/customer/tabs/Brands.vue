<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// The brands of one customer; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'customer_brand'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'name', sortable: true, header: t('ops.customer.brand.fields.name') },
   {
      field: 'registration_status',
      header: t('ops.customer.brand.fields.registration_status')
   },
   {
      field: 'brand_program_status',
      header: t('ops.customer.brand.fields.brand_program_status')
   },
   { field: 'gs1_prefix_owner', header: t('ops.customer.brand.fields.gs1_prefix_owner') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ customer_id: equalsFilter(props.id), name: 'text' })
);

const deleteAction = useDeleteAction('customer_brand');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'customer_brand' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-customer-brand-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="customer-brand"
      from="customer_brand"
      select="*"
      :useMeta="false"
      :columns
      :rowActions
      :rows="10"
      :enableExpansion="false"
      v-model:filters="filters"
   >
      <template #header>
         <span class="flex items-center justify-between gap-4">
            <span class="font-semibold">{{ $t('ops.customer.tabs.brands') }}</span>
            <CustomLink
               v-if="$can('create', 'customer_brand')"
               :to="{
                  name: 'ops-customer-brand-add',
                  params: { customerId: id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
   </ResourceTable>
</template>
