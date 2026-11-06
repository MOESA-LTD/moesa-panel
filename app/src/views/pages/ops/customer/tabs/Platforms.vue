<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { amazonErrorText } from '@/api/amazon';
import { usePlatformOptions } from '@/api/customer';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { formatEmpty } from '@/constants/format';
import { DIALOG_POSITIONS } from '@/constants/router';
import { ToastSeverity } from '@primevue/core/api';
import dayjs from 'dayjs';
import { useToast } from 'primevue/usetoast';
import AmazonConnection from '../AmazonConnection.vue';

// The marketplaces one customer sells on; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'customer_platform_account'>;

const router = useRouter();
const route = useRoute();
const toast = useToast();
const { t, te } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'platform_id', sortable: true, header: t('ops.customer.platform.fields.platform_id') },
   { field: 'countries', header: t('ops.customer.platform.fields.countries') },
   { field: 'account_holder', header: t('ops.customer.platform.fields.account_holder') },
   { field: 'access', sortable: true, header: t('ops.customer.platform.fields.access') },
   { field: 'api_connection', header: t('ops.amazon.platform.api_connection') },
   { field: 'authorized_at', header: t('ops.amazon.platform.authorized_at') }
]);

const date = (value: string | null) =>
   formatEmpty(value ? dayjs(value).format('YYYY-MM-DD HH:mm') : null);

// Amazon's consent callback comes back here with ?amazon=connected or ?amazon=error&reason=<code>:
// it is told once, and the query dropped so a reload does not tell it again.
onMounted(() => {
   const { amazon, reason, ...rest } = route.query;
   if (amazon !== 'connected' && amazon !== 'error') return;
   if (amazon === 'connected')
      toast.add({
         life: 5000,
         severity: ToastSeverity.SUCCESS,
         summary: t('ops.amazon.api_connection.connected'),
         detail: t('ops.amazon.connect.result.connected')
      });
   else
      toast.add({
         life: 8000,
         severity: ToastSeverity.ERROR,
         summary: t('ops.amazon.connect.result.error'),
         detail:
            typeof reason === 'string' && te(`errors.${reason}`)
               ? amazonErrorText({ message: reason })
               : undefined
      });
   router.replace({ query: rest });
});

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
      <template #api_connection_body="{ data }">
         <AmazonConnection v-if="data.platform_id === 'amazon'" :account="data" />
         <span v-else class="text-muted-color">{{ formatEmpty(null) }}</span>
      </template>
      <template #authorized_at_body="{ data }">
         {{ date(data.authorized_at) }}
      </template>
   </ResourceTable>
</template>
