<script setup lang="ts">
import type { PlanWithTerms } from '@/api/admin';
import { LIMIT_KEYS } from '@/api/subscription';
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import { createFilters } from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { useDialogRef } from '@/composables/useDialogRef';
import { DIALOG_POSITIONS } from '@/constants/router';

type Props = ResourceTableProps<'plan'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'display_name', sortable: true, header: t('fields.name') },
   { field: 'price', sortable: true, header: t('admin.plan.price') },
   { field: 'trial_days', sortable: true, header: t('admin.plan.trial_days') },
   { field: 'plan_module', header: t('subscription.modules') },
   { field: 'plan_limit', header: t('subscription.limits') },
   { field: 'is_active', sortable: true, header: t('admin.plan.state') },
   { field: 'position', sortable: true, header: t('admin.plan.position') }
]);

const filters = ref<NonNullable<Props['filters']>>(createFilters({ display_name: 'startsWith' }));

// The panel is the super admin's (see the route): no table permission to check.
const rowActions: Props['rowActions'] = [
   { ...useDeleteAction('plan'), requires: undefined },
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'admin-plan-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];

const terms = (data: unknown) => data as PlanWithTerms;
const limitText = (plan: PlanWithTerms, key: (typeof LIMIT_KEYS)[number]) => {
   const value = plan.plan_limit.find(({ limit_key }) => limit_key === key)?.value;
   return `${t(`subscription.limit.${key}`)}: ${value ?? '∞'}`;
};

const dialogRef = useDialogRef();
</script>

<template>
   <ResourceTable
      stateKey="admin-plan"
      from="plan"
      select="*, plan_module(module_id), plan_limit(limit_key, value)"
      :columns
      :rowActions
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink
                  :to="{ name: 'admin-plan-add', query: { showDialog: DIALOG_POSITIONS.CENTER } }"
               >
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #display_name_body="{ data }">
         <span class="inline-flex items-center gap-2">
            {{ data.display_name }}
            <Tag v-if="data.is_default" severity="info" :value="$t('admin.plan.default')" />
         </span>
      </template>
      <template #price_body="{ data }">
         <template v-if="data.price !== null">
            {{ data.price }} {{ data.currency }}
            <span v-if="data.billing_period" class="text-muted-color">
               / {{ $t(`admin.plan.period.${data.billing_period}`) }}
            </span>
         </template>
         <span v-else class="text-muted-color">-</span>
      </template>
      <!-- The table shows nothing for a 0. -->
      <template #trial_days_body="{ data }">{{ data.trial_days }}</template>
      <template #plan_module_body="{ data }">
         <span class="flex flex-wrap gap-1">
            <Tag
               v-for="{ module_id } in terms(data).plan_module"
               :key="module_id"
               severity="secondary"
               :value="$t(`fields.${module_id}`)"
            />
         </span>
      </template>
      <template #plan_limit_body="{ data }">
         <span class="flex flex-col text-sm">
            <span v-for="key in LIMIT_KEYS" :key>{{ limitText(terms(data), key) }}</span>
         </span>
      </template>
      <template #is_active_body="{ data }">
         <Tag
            :severity="data.is_active ? 'success' : 'secondary'"
            :value="$t(data.is_active ? 'admin.plan.active' : 'admin.plan.inactive')"
         />
      </template>
   </ResourceTable>
</template>
