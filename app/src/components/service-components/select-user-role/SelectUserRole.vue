<script setup lang="ts" generic="T = Tables['role']['Row']">
import { useLookup } from '@/api/useLookup';
import { ResourceTableProps } from '@components/service-components/resource-table/ResourceTable.vue';

export type SelectRoleProps = {
   select?: ResourceTableProps['select'];
   showEdit?: boolean;
   showAdd?: boolean;
};
const props = withDefaults(defineProps<SelectRoleProps>(), {
   showEdit: true,
   showAdd: true,
   select: '*'
});

const modelValue = defineModel<T | T[]>();

const { data: roles, suspense } = useLookup<T>('role', () => ({
   select: props.select,
   order: 'display_name'
}));
await suspense();
</script>
<template>
   <InputGroup :class="$attrs.class">
      <MultiSelect
         :filter="true"
         :options="roles ?? []"
         multiple
         option-label="display_name"
         option-value="id"
         v-bind="_omit($attrs, ['class'])"
         v-model:model-value="modelValue"
         :placeholder="$t('role.select_role')"
         :option-disabled="(data) => !data?.tenant_id"
      >
         <template #option="{ option }">
            <span v-text="option?.display_name" class="align-middle m-2 me-auto" />
            <RouterLink
               v-if="showEdit && $can('read', 'role') && (!!option?.id || !!option)"
               :to="{
                  name: 'branch-role-edit',
                  params: { id: option?.id || option },
                  query: { showDialog: 'center' }
               }"
               v-slot="{ navigate }"
            >
               <Button
                  size="small"
                  severity="info"
                  :icon="PrimeIcons.PENCIL"
                  @click.capture.stop="navigate"
               />
            </RouterLink>
         </template>
      </MultiSelect>
      <InputGroupAddon v-if="showAdd && $can('create', 'role')">
         <RouterLink
            :to="{
               name: 'branch-role-add',
               query: { showDialog: 'center' }
            }"
            v-slot="{ navigate }"
         >
            <Button size="small" severity="success" :icon="PrimeIcons.PLUS" @click="navigate" />
         </RouterLink>
      </InputGroupAddon>
   </InputGroup>
</template>
