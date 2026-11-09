<script setup lang="ts">
import { useLookup } from '@/api/useLookup';
import { useFieldAccess } from '@/composables/useFieldAccess';
import { computed, useAttrs } from 'vue';
import { useI18n } from 'vue-i18n';
import PermissionCheckbox from './PermissionCheckbox.vue';

import type { FieldRightInput } from '@/api/role';

type Kind = 'read' | 'write';
type FieldRef = { resource_name: string; field: string };

defineOptions({ inheritAttrs: false });

const { t, te } = useI18n();
const attrs = useAttrs();

const modelValue = defineModel<FieldRightInput[]>({ get: (value) => value || [] });

const { data: fieldRows, suspense } = useLookup<{
   resource_name: string;
   field: string;
   class: string;
   group_name: string | null;
}>('field_class', { select: 'resource_name,field,class,group_name' });
const { data: groupRows } = useLookup<{ id: string; position: number }>('field_group', {
   select: 'id,position'
});
await suspense();

const position = computed(
   () => new Map((groupRows.value ?? []).map(({ id, position }) => [id, position]))
);

// One row per resource; its sensitive fields, by group in the groups' order.
const resources = computed(() => {
   const sensitive = (fieldRows.value ?? []).filter(({ class: c }) => c === 'sensitive');
   return Object.entries(_groupBy(sensitive, 'resource_name')).map(([resource_name, rows]) => ({
      display_name: resource_name,
      fields: rows as FieldRef[],
      groups: Object.entries(_groupBy(rows, ({ group_name }) => group_name ?? ''))
         .map(([id, own]) => ({ id, fields: own as FieldRef[] }))
         .sort((a, b) => (position.value.get(a.id) ?? 99) - (position.value.get(b.id) ?? 99))
   }));
});

const keyOf = (i: FieldRef) => `${i.resource_name}.${i.field}`;
const rightOf = computed(() => new Map((modelValue.value ?? []).map((r) => [keyOf(r), r])));

/** 'all' when every one of `items` holds the right, 'none' when none does, 'some' otherwise. */
const stateOf = (items: FieldRef[], kind: Kind) => {
   const held = items.filter((i) => rightOf.value.get(keyOf(i))?.[`can_${kind}`]).length;
   if (!held) return 'none';
   return held === items.length ? 'all' : 'some';
};

/** Clears the right of `items` when all hold it, otherwise gives it to all (write implies read). */
const toggle = (items: FieldRef[], kind: Kind) => {
   const on = stateOf(items, kind) !== 'all';
   const keys = new Set(items.map(keyOf));
   const others = (modelValue.value ?? []).filter((r) => !keys.has(keyOf(r)));
   const changed = items
      .map((i) => {
         const old = rightOf.value.get(keyOf(i));
         const right: FieldRightInput = {
            resource_name: i.resource_name,
            field: i.field,
            can_read: old?.can_read ?? false,
            can_write: old?.can_write ?? false
         };
         if (kind === 'read') {
            right.can_read = on;
            if (!on) right.can_write = false;
         } else {
            right.can_write = on;
            if (on) right.can_read = true;
         }
         return right;
      })
      .filter((r) => r.can_read || r.can_write);
   modelValue.value = [...others, ...changed];
};

// Resource names carry their schema ("public.product"); the field labels are keyed by table.
const tableOf = (resource: string) => resource.replace(/^[a-z_]+\./, '');

// The editor can give only the rights they hold (save_role refuses the rest).
const grantable = (item: FieldRef, kind: Kind) => {
   const access = useFieldAccess(tableOf(item.resource_name));
   return kind === 'read' ? access.canRead(item.field) : access.canWrite(item.field);
};
const disabledFor = (items: FieldRef[], kind: Kind) => items.some((i) => !grantable(i, kind));
const hint = (items: FieldRef[], kind: Kind) =>
   disabledFor(items, kind) ? t('component.select_field_permission.not_grantable') : undefined;

const resourceLabel = (resource: string) =>
   te(`fields.${tableOf(resource)}`) ? t(`fields.${tableOf(resource)}`) : tableOf(resource);
const groupLabel = (id: string) =>
   te(`fields.field_group.${id}`) ? t(`fields.field_group.${id}`) : id;
const fieldLabel = ({ resource_name, field }: FieldRef) => {
   const key = `ops.${tableOf(resource_name)}.fields.${field}`;
   return te(key) ? t(key) : field;
};
const kindLabel = (kind: Kind) => t(`component.select_field_permission.${kind}`);

const kinds: Kind[] = ['read', 'write'];
const columns = computed(() => [
   { field: 'display_name', header: t('component.select_permission.table.headers.resource') },
   ...kinds.map((kind) => ({ field: kind, header: kindLabel(kind) }))
]);

const tableProps = computed(() => ({
   stateKey: 'field_permission',
   dataKey: 'display_name' as const,
   paginator: false,
   columns: columns.value,
   rowActions: [],
   rows: null as unknown as number,
   value: resources.value,
   ...attrs
}));
const isReadonly = computed(() => !!attrs.readonly);
</script>
<template>
   <CustomTable v-bind="tableProps">
      <template #display_name_body="{ data }">{{ resourceLabel(data.display_name) }}</template>
      <template v-for="kind in kinds" #[`${kind}_body`]="{ data }" :key="kind">
         <span v-tooltip="hint(data.fields, kind)">
            <PermissionCheckbox
               :test-id="`field-resource-${data.display_name}-${kind}`"
               :state="stateOf(data.fields, kind)"
               :readonly="isReadonly"
               :disabled="disabledFor(data.fields, kind)"
               :aria-label="`${resourceLabel(data.display_name)}: ${kindLabel(kind)}`"
               @toggle="toggle(data.fields, kind)"
            />
         </span>
      </template>
      <template #expansion="{ data }">
         <table class="w-full">
            <tbody>
               <template v-for="group in data.groups" :key="group.id">
                  <tr class="font-medium">
                     <td class="py-1 px-2">{{ groupLabel(group.id) }}</td>
                     <td v-for="kind in kinds" :key="kind" class="py-1 px-2 w-32">
                        <span v-tooltip="hint(group.fields, kind)">
                           <PermissionCheckbox
                              :test-id="`field-group-${data.display_name}-${group.id}-${kind}`"
                              :state="stateOf(group.fields, kind)"
                              :readonly="isReadonly"
                              :disabled="disabledFor(group.fields, kind)"
                              :aria-label="`${groupLabel(group.id)}: ${kindLabel(kind)}`"
                              @toggle="toggle(group.fields, kind)"
                           />
                        </span>
                     </td>
                  </tr>
                  <tr v-for="item in group.fields" :key="item.field">
                     <td class="py-1 px-2 pl-6">{{ fieldLabel(item) }}</td>
                     <td v-for="kind in kinds" :key="kind" class="py-1 px-2 w-32">
                        <span v-tooltip="hint([item], kind)">
                           <PermissionCheckbox
                              :test-id="`field-${data.display_name}-${item.field}-${kind}`"
                              :state="stateOf([item], kind)"
                              :readonly="isReadonly"
                              :disabled="disabledFor([item], kind)"
                              :aria-label="`${fieldLabel(item)}: ${kindLabel(kind)}`"
                              @toggle="toggle([item], kind)"
                           />
                        </span>
                     </td>
                  </tr>
               </template>
            </tbody>
         </table>
      </template>
   </CustomTable>
</template>
