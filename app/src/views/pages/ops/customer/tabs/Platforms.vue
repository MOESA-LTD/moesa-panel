<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { usePlatformOptions } from '@/api/customer';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// The marketplaces one customer sells on; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'customer_platform_account'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'platform_id', sortable: true, header: t('ops.customer.platform.fields.platform_id') },
   { field: 'countries', header: t('ops.customer.platform.fields.countries') },
   { field: 'account_holder', header: t('ops.customer.platform.fields.account_holder') },
   { field: 'access', sortable: true, header: t('ops.customer.platform.fields.access') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ customer_id: equalsFilter(props.id) })
);

const { data: platforms } = usePlatformOptions();
const platformName = (id: string) =>
   platforms.value?.find((platform) => platform.id === id)?.display_name ?? id;

const deleteAction = useDeleteAction('customer_platform_account');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'customer_platform_account' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-customer-platform-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="customer-platform-account"
      from="customer_platform_account"
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
            <span class="font-semibold">{{ $t('ops.customer.tabs.platforms') }}</span>
            <CustomLink
               v-if="$can('create', 'customer_platform_account')"
               :to="{
                  name: 'ops-customer-platform-add',
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
      <template #platform_id_body="{ data }">
         {{ platformName(data.platform_id) }}
      </template>
      <template #countries_body="{ data }">
         {{ data.countries.join(', ') }}
      </template>
      <template #access_body="{ data }">
         {{ $t(`ops.customer.platform.access.${data.access}`) }}
      </template>
   </ResourceTable>
</template>
