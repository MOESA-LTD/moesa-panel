<script setup lang="ts">
import { statusSeverity } from '@/api/subscription';
import type { SubscriptionStatus } from '@/api/access';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { useDialogRef } from '@/composables/useDialogRef';
import { DIALOG_POSITIONS } from '@/constants/router';
import { localeDateString } from '@/lib/dayjs';

// Every company with the subscription in force (company_subscription, the super admin's only).
type Props = ResourceTableProps<'company_subscription'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'display_name', sortable: true, header: t('admin.subscription.company') },
   { field: 'plan_name', sortable: true, header: t('admin.subscription.plan') },
   { field: 'status', sortable: true, header: t('admin.subscription.status') },
   { field: 'ends_at', sortable: true, header: t('subscription.ends_at') },
   { field: 'branches', sortable: true, header: t('subscription.limit.max_branches') },
   { field: 'users', sortable: true, header: t('subscription.limit.max_users') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ display_name: 'startsWith', plan_name: 'startsWith' })
);

const rowActions: Props['rowActions'] = [
   {
      label: t('admin.subscription.manage'),
      icon: PrimeIcons.COG,
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'admin-subscription-manage',
               params: { companyId: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

const formatDate = (value: string | null) =>
   value ? localeDateString({ value, validate: false }) : '';

const dialogRef = useDialogRef();
</script>

<template>
   <ResourceTable
      stateKey="admin-subscription"
      from="company_subscription"
      select="*"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4">
               <KeywordSearchInput v-model="filters.global.value" />
            </span>
         </Teleport>
      </template>
      <template #plan_name_body="{ data }">
         {{ data.plan_name ?? $t('subscription.no_plan') }}
      </template>
      <template #status_body="{ data }">
         <Tag
            :severity="statusSeverity(data.status as SubscriptionStatus)"
            :value="$t(`subscription.status.${data.status}`)"
         />
      </template>
      <!-- The table shows nothing for a 0. -->
      <template #branches_body="{ data }">{{ data.branches ?? '-' }}</template>
      <template #users_body="{ data }">{{ data.users ?? '-' }}</template>
      <template #ends_at_body="{ data }">
         {{ data.ends_at ? formatDate(data.ends_at) : $t('subscription.no_end') }}
      </template>
   </ResourceTable>
</template>
