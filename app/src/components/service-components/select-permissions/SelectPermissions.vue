<script setup>
import { useLookup } from '@/api/useLookup';
import PermissionCheckbox from './PermissionCheckbox.vue';

defineOptions({
   inheritAttrs: false
});

const { t, te } = useI18n();
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

// Permissions of modules outside the company's plan can be given, but have no effect until then.
const authStore = useAuthStore();
const isLocked = (group) =>
   !authStore.isSuperAdmin &&
   !!authStore.subscription &&
   !authStore.subscription.modules.includes(group);

const { data: permissionRows, suspense } = useLookup('permission', {
   select: 'id,resource_name,group_name,kind'
});
await suspense();
const allPermissions = computed(() => permissionRows.value ?? []);

const permissionByKind = computed(() => _groupBy(allPermissions.value, 'kind'));

// Permissions without a group are listed together under "Other" (key '').
const permissionByGroup = computed(() =>
   _groupBy(allPermissions.value, ({ group_name }) => group_name ?? OTHER_GROUP)
);

// One row per group; its resources show when the row is expanded. A resource can have more than
// one permission of a kind (update and delete are both `modify`), so each kind holds a list.
const permissions = computed(() =>
   Object.entries(permissionByGroup.value).map(([group, items]) => ({
      display_name: group,
      items: _groupBy(items, 'kind'),
      resources: Object.entries(_groupBy(items, 'resource_name')).map(([resource, own]) => ({
         resource_name: resource,
         items: _groupBy(own, 'kind')
      }))
   }))
);

const selectedIds = computed(() => new Set(modelValue.value.map(({ id }) => id)));

/** 'all' when every one of `items` is selected, 'none' when none is, 'some' otherwise. */
const stateOf = (items = []) => {
   const selected = items.filter(({ id }) => selectedIds.value.has(id)).length;
   if (!selected) return 'none';
   return selected === items.length ? 'all' : 'some';
};

/** Deselects `items` when all of them are selected, otherwise selects the ones missing. */
const toggle = (items = []) => {
   const ids = new Set(items.map(({ id }) => id));
   // Replace the model instead of changing the parent's array in place.
   const others = modelValue.value.filter(({ id }) => !ids.has(id));
   modelValue.value = stateOf(items) === 'all' ? others : [...others, ..._cloneDeep(items)];
};

const label = (key) => (te(`fields.${key}`) ? t(`fields.${key}`) : key);

// Permissions without a group share one row; a non-empty key keeps the row expandable.
const OTHER_GROUP = '__other__';
const groupLabel = (group) =>
   group && group !== OTHER_GROUP ? label(group) : t('component.select_permission.groups.other');

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
               <PermissionCheckbox
                  scope="all"
                  v-bind="slotProps"
                  :state="stateOf(allPermissions)"
                  :readonly="$attrs.readonly"
                  @toggle="toggle(allPermissions)"
               />
            </template>
         </FormField>
      </template>
      <template #display_name_body="{ data, field }">
         <span class="inline-flex items-center gap-2">
            {{ groupLabel(_get(data, field)) }}
            <i
               v-if="_get(data, field) && isLocked(_get(data, field))"
               class="pi pi-lock text-muted-color"
               v-tooltip="$t('subscription.locked.permission')"
            />
         </span>
      </template>
      <template
         v-for="(kind, i) in permissionKinds"
         #[`${kind}_header`]="{ header, field }"
         :key="`${kind}_${i}`"
      >
         <FormField class="!flex-[0] flex-nowrap" :label="header">
            <template #default="slotProps">
               <PermissionCheckbox
                  :scope="`kind:${field}`"
                  v-bind="slotProps"
                  :state="stateOf(permissionByKind[field])"
                  :readonly="$attrs.readonly"
                  @toggle="toggle(permissionByKind[field])"
               />
            </template>
         </FormField>
      </template>
      <template
         v-for="(kind, i) in permissionKinds"
         #[`${kind}_body`]="{ data, field, header }"
         :key="`${kind}_${i}`"
      >
         <PermissionCheckbox
            v-if="data?.items[field]?.length"
            :scope="`group:${data.display_name}:${field}`"
            :aria-label="`${groupLabel(data.display_name)}: ${header}`"
            :state="stateOf(data.items[field])"
            :readonly="$attrs.readonly"
            @toggle="toggle(data.items[field])"
         />
      </template>
      <template #expansion="{ data }">
         <table class="w-full">
            <thead>
               <tr class="text-left text-muted-color">
                  <th scope="col" class="font-medium py-1 px-2">
                     {{ $t('component.select_permission.table.headers.resource') }}
                  </th>
                  <th
                     scope="col"
                     v-for="kind in permissionKinds"
                     :key="kind"
                     class="font-medium py-1 px-2 w-32"
                  >
                     {{ $t(`component.select_permission.table.headers.${kind}`) }}
                  </th>
               </tr>
            </thead>
            <tbody>
               <tr
                  v-for="resource in data.resources"
                  :key="resource.resource_name"
                  :data-permission-resource="resource.resource_name"
               >
                  <td class="py-1 px-2">{{ label(resource.resource_name) }}</td>
                  <td
                     v-for="kind in permissionKinds"
                     :key="kind"
                     class="py-1 px-2"
                     :data-permission-cell="`resource:${resource.resource_name}:${kind}`"
                  >
                     <PermissionCheckbox
                        v-if="resource.items[kind]?.length"
                        :state="stateOf(resource.items[kind])"
                        :readonly="$attrs.readonly"
                        :aria-label="`${label(resource.resource_name)}: ${$t(
                           `component.select_permission.table.headers.${kind}`
                        )}`"
                        @toggle="toggle(resource.items[kind])"
                     />
                  </td>
               </tr>
            </tbody>
         </table>
      </template>
   </CustomTable>
</template>
