<script setup lang="ts">
import type { ResourceTableProps } from '@/components/service-components/resource-table/ResourceTable.vue';
import {
   createFilters,
   equalsFilter
} from '@/components/service-components/resource-table/createFilters';
import { useDeleteAction } from '@/composables/useDeleteAction';
import { DIALOG_POSITIONS } from '@/constants/router';

// The people of one supplier; added and edited in a dialog.
const props = defineProps<{ id: string }>();

type Props = ResourceTableProps<'supplier_contact'>;

const router = useRouter();
const { t } = useI18n();

const columns = computed<Props['columns']>(() => [
   { field: 'name', sortable: true, header: t('ops.supplier.contact.fields.name') },
   { field: 'role', sortable: true, header: t('ops.supplier.contact.fields.role') },
   { field: 'email', header: t('ops.supplier.contact.fields.email') },
   { field: 'phone', header: t('ops.supplier.contact.fields.phone') },
   { field: 'is_primary', header: t('ops.supplier.contact.fields.is_primary') }
]);

const filters = ref<NonNullable<Props['filters']>>(
   createFilters({ supplier_id: equalsFilter(props.id), name: 'text' })
);

const deleteAction = useDeleteAction('supplier_contact');
const rowActions: Props['rowActions'] = [
   deleteAction,
   {
      label: t('action.edit'),
      icon: PrimeIcons.PENCIL,
      requires: { action: 'modify', subject: 'supplier_contact' },
      command:
         ({ data }) =>
         () =>
            router.push({
               name: 'ops-supplier-contact-edit',
               params: { id: data.id },
               query: { showDialog: DIALOG_POSITIONS.CENTER }
            })
   }
];
</script>

<template>
   <ResourceTable
      stateKey="supplier-contact"
      from="supplier_contact"
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
            <span class="font-semibold">{{ $t('ops.supplier.tabs.contacts') }}</span>
            <CustomLink
               v-if="$can('create', 'supplier_contact')"
               :to="{
                  name: 'ops-supplier-contact-add',
                  params: { supplierId: id },
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }"
            >
               <template #default="{ navigate }">
                  <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
               </template>
            </CustomLink>
         </span>
      </template>
      <template #is_primary_body="{ data }">
         <i v-if="data.is_primary" :class="PrimeIcons.CHECK" />
      </template>
   </ResourceTable>
</template>
