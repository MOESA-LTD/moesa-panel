<script setup lang="ts" generic="T extends Tables['user']['Row']">
import { useDialogRef } from '@/composables/useDialogRef';
import ResourceTable, {
   ResourceTableProps
} from '@/components/service-components/resource-table/ResourceTable.vue';
import { isOwnerAbove, USER_ACCESS, useRemoveUser, type UserAccess } from '@/api/user';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { useI18n } from 'vue-i18n';
import Upsert from './upsert/Index.vue';

defineOptions({
   inheritAttrs: false
});

const attrs = useAttrs();
const router = useRouter();

const { t } = useI18n();

const columns = computed<ResourceTableProps['columns']>(() => [
   {
      field: 'user_metadata.display_name',
      filterField: 'user_metadata->>display_name',
      sortField: 'user_metadata->>display_name',
      sortable: true,
      header: t('user.table.headers.name')
   },
   {
      field: 'email',
      sortable: true,
      header: t('user.table.headers.email')
   },
   {
      field: 'created_at',
      sortable: true,
      header: t('user.table.headers.created_at')
   }
]);

const filters = ref<NonNullable<ResourceTableProps['filters']>>({
   global: {
      value: null,
      matchMode: FilterMatchMode.CONTAINS
   },
   email: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
   },
   'user_metadata->>display_name': {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }]
   },
   created_at: {
      operator: FilterOperator.AND,
      constraints: [{ value: null, matchMode: FilterMatchMode.DATE_IS }],
      dataType: 'date'
   },
   ...(attrs.filters as ResourceTableProps['filters'])
});

const stateKey = 'user';
// The edge function used to be confirmed by the dialog in customFetch, which no longer exists.
const confirmDelete = useConfirmDelete();
const { mutateAsync: removeUser } = useRemoveUser();

const rowActions: ResourceTableProps<'user', T>['rowActions'] = [
   {
      label: t('action.delete'),
      command:
         ({ data }) =>
         async () => {
            if (await confirmDelete({ ...data, display_name: data.email })) {
               await removeUser({ id: data.id, tenantId: (data as UserAccess).tenant_id });
            }
         },
      icon: PrimeIcons.TRASH,
      requires: { action: 'modify', subject: 'user' },
      disabled: ({ data }) => isOwnerAbove(data as UserAccess)
   },
   {
      label: t('action.edit'),
      command:
         ({ data }) =>
         async () =>
            await router.push({
               name: 'branch-user-manage',
               params: { id: data.id },
               query: { showDialog: 'true' }
            }),
      icon: PrimeIcons.PENCIL,
      disabled: ({ data }) => isOwnerAbove(data as UserAccess)
   }
];

const dialogRef = useDialogRef();
</script>
<template>
   <component
      :is="ResourceTable<'user', T>"
      :stateKey
      :from="'user'"
      :select="`*, role(*,permission(*)), ${USER_ACCESS}`"
      :columns="columns"
      :rowActions="rowActions"
      v-model:filters="filters"
   >
      <template #header>
         <Teleport to="#page-toolbar" :disabled="!!dialogRef">
            <span class="flex-1 flex justify-end gap-4 flex-wrap-reverse">
               <KeywordSearchInput v-model="filters.global.value" />
               <CustomLink v-if="$can('create', 'user')" :to="{ name: 'branch-user-manage' }">
                  <template #default="{ navigate }">
                     <Button variant="outlined" :label="$t('action.add')" @click="navigate" />
                  </template>
               </CustomLink>
            </span>
         </Teleport>
      </template>
      <template #user_metadata_display_name_body="{ data }">
         <span class="inline-flex items-center gap-2 flex-wrap">
            <span>{{
               (data.user_metadata as { display_name?: string } | null)?.display_name
            }}</span>
            <Tag
               v-for="tenant in (data as UserAccess).owned_via"
               :key="tenant"
               severity="secondary"
               :value="$t('user.owner_of', { name: tenant })"
               v-tooltip.top="isOwnerAbove(data as UserAccess) ? $t('user.owner_above') : undefined"
            />
         </span>
      </template>
      <template #expansion="{ data }">
         <Upsert :id="data.id" class="p-0" />
      </template>
   </component>
</template>
