<script setup>
import { useLookup } from '@/api/useLookup';

defineOptions({
   inheritAttrs: false
});

const { t } = useI18n();
const attrs = useAttrs();

const modelValue = defineModel({ get: (value) => value || [] });

const columns = computed(() => [
   {
      field: 'display_name',
      header: t('component.select_permission.table.headers.permission_name')
   },
   {
      field: 'read',
      header: t('component.select_permission.table.headers.read')
   },
   {
      field: 'create',
      header: t('component.select_permission.table.headers.create')
   },
   {
      field: 'modify',
      header: t('component.select_permission.table.headers.modify')
   }
]);

const permissionKinds = ['read', 'create', 'modify'];

const { data: permissionRows, suspense } = useLookup('permission', {
   select: 'id,resource_name,group_name,kind'
});
await suspense();
const allPermissions = computed(() => permissionRows.value ?? []);

const permissionByKind = computed(() => _groupBy(allPermissions.value, 'kind'));

const permissionByGroup = computed(() => _groupBy(allPermissions.value, 'group_name'));

const permissions = computed(() =>
   Object.keys(permissionByGroup.value)?.map?.((key) => ({
      display_name: key,
      items: _groupBy(permissionByGroup.value?.[key], 'kind')
   }))
);

const isPermissionChecked = (item) => {
   return _find(modelValue.value, ({ id }) => id === item?.id);
};

const isAllChecked = computed(
   () =>
      allPermissions.value.length > 0 &&
      allPermissions.value.every((item) => isPermissionChecked(item))
);

const togglePermissions = (items) => {
   modelValue.value = _xorBy(modelValue.value, items, ({ id }) => id);
};

const togglePermissionColumn = (checked, field) => {
   // Replace the model instead of removing items in place from the parent's array.
   const others = modelValue.value.filter(({ kind }) => kind !== field);
   modelValue.value = checked ? [...others, ...(permissionByKind.value[field] ?? [])] : others;
};

const toggleAll = (checked) => {
   modelValue.value = checked ? _cloneDeep(allPermissions.value) : [];
};

const tableProps = computed(() => ({
   stateKey: 'permission',
   dataKey: 'display_name',
   paginator: false,
   columns: columns.value,
   rowActions: [],
   rows: null,
   value: permissions.value,
   ...attrs
}));
</script>
<template>
   <CustomTable v-bind="tableProps">
      <template #display_name_header>
         <FormField
            class="!flex-[0] flex-nowrap"
            :label="$t('component.select_permission.table.headers.all')"
         >
            <template #default="slotProps">
               <ToggleSwitch
                  :readonly="$attrs.readonly"
                  v-bind="slotProps"
                  class="min-w-fit"
                  :model-value="isAllChecked || false"
                  @change="(e) => toggleAll(e.target.checked)"
               />
            </template>
         </FormField>
      </template>
      <template #display_name_body="{ data, field }">
         {{
            $te(`fields.${_get(data, field)}`)
               ? $t(`fields.${_get(data, field)}`)
               : _get(data, field)
         }}
      </template>
      <template
         v-for="(kind, i) in permissionKinds"
         #[`${kind}_header`]="{ header, field }"
         :key="`${kind}_${i}`"
      >
         <FormField class="!flex-[0] flex-nowrap" :label="header">
            <template #default="slotProps">
               <ToggleSwitch
                  :readonly="$attrs.readonly"
                  v-bind="slotProps"
                  class="min-w-fit"
                  :model-value="
                     permissionByKind?.[field]?.every?.((item) => isPermissionChecked(item)) ||
                     false
                  "
                  @change="(e) => togglePermissionColumn(e.target.checked, field)"
               />
            </template>
         </FormField>
      </template>
      <template
         v-for="(kind, i) in permissionKinds"
         #[`${kind}_body`]="{ data, field }"
         :key="`${kind}_${i}`"
      >
         <ToggleSwitch
            :readonly="$attrs.readonly"
            v-if="data?.items[field]?.some?.((item) => item.id)"
            :model-value="data?.items[field]?.every?.((item) => isPermissionChecked(item))"
            @change="() => togglePermissions(data?.items[field])"
         />
      </template>
   </CustomTable>
</template>
