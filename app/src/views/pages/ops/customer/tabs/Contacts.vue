<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// The people of one customer; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'customer_contact'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'name', sortable: true, header: t('ops.customer.contact.fields.name') },
   { field: 'role', sortable: true, header: t('ops.customer.contact.fields.role') },
   { field: 'email', header: t('ops.customer.contact.fields.email') },
   { field: 'phone', header: t('ops.customer.contact.fields.phone') },
   { field: 'can_approve', header: t('ops.customer.contact.fields.can_approve') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ customer_id: equalsFilter(props.id), name: 'text' })
);

const deleteAction = useDeleteAction('customer_contact');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'customer_contact' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-customer-contact-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="customer-contact"
      from="customer_contact"
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
            <span class="font-semibold">{{ $t('ops.customer.tabs.contacts') }}</span>
            <CustomLink
               v-if="$can('create', 'customer_contact')"
               :to="{
                  name: 'ops-customer-contact-add',
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
      <template #can_approve_body="{ data }">
         <i v-if="data.can_approve" :class="PrimeIcons.CHECK" />
      </template>
   </ResourceTable>
</template>
