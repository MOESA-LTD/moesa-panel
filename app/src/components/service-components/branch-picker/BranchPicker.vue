<script setup lang="ts">
import type { Tenant } from '@/api/access';
import { appErrorHandler } from '@/lib/appErrorHandler';
import type { TreeNode } from 'primevue/treenode';

/**
 * Picks the branches the pages show (any of the user's tenants, each on its own) and the active
 * one, where new rows go (the star). Shown only to users with more than one tenant.
 */
const authStore = useAuthStore();
const { branches, currentTenant, scopeTenants } = storeToRefs(authStore);
const { t } = useI18n();

/** The user's tenants as a tree; a tenant whose parent they cannot use is a root for them. */
const nodes = computed<TreeNode[]>(() => {
   const toNode = (tenant: Tenant): TreeNode => {
      const children = branches.value
         .filter(({ parent_id }) => parent_id === tenant.id)
         .map(toNode);
      return {
         key: tenant.id,
         label: tenant.display_name,
         data: tenant,
         children,
         leaf: !children.length
      };
   };
   return branches.value.filter(({ parent_id }) => !parent_id).map(toNode);
});

// Every branch with branches starts open, so all of them can be picked right away.
const expandedKeys = ref<Record<string, boolean>>({});
watch(
   branches,
   (list) => {
      for (const { parent_id } of list) {
         if (parent_id) expandedKeys.value[parent_id] ??= true;
      }
   },
   { immediate: true }
);

const selection = computed<Record<string, boolean>>({
   get: () => Object.fromEntries(scopeTenants.value.map(({ id }) => [id, true])),
   set: (value) =>
      void authStore
         .setScope(Object.keys(value ?? {}).filter((id) => value[id]))
         .catch(appErrorHandler)
});

const isActive = (id: string) => currentTenant.value?.id === id;

function makeActive(tenant: Tenant) {
   // Becoming active also adds it to the branches shown.
   const ids = new Set([...scopeTenants.value.map(({ id }) => id), tenant.id]);
   authStore
      .changeCurrentTenant(tenant)
      .then(() => authStore.setScope([...ids]))
      .catch(appErrorHandler);
}
</script>

<template>
   <TreeSelect
      v-if="branches.length > 1"
      v-model="selection"
      v-model:expandedKeys="expandedKeys"
      :options="nodes"
      selectionMode="multiple"
      :metaKeySelection="false"
      :aria-label="t('component.branch_picker.label')"
      class="branch_picker"
      panelClass="branch_picker__panel"
   >
      <template #value>
         <span class="branch_picker__value">
            <span :class="PrimeIcons.STAR_FILL" class="branch_picker__star" />
            <span v-text="currentTenant?.display_name" class="branch_picker__name" />
            <Tag
               v-if="scopeTenants.length > 1"
               severity="secondary"
               :value="`+${scopeTenants.length - 1}`"
               v-tooltip.bottom="
                  scopeTenants
                     .filter(({ id }) => !isActive(id))
                     .map(({ display_name }) => display_name)
                     .join(', ')
               "
            />
         </span>
      </template>
      <template #option="{ node, selected }">
         <span class="branch_picker__option">
            <Checkbox :modelValue="selected" binary readonly :tabindex="-1" />
            <span v-text="node.label" class="branch_picker__name" />
            <Button
               :icon="isActive(node.key) ? PrimeIcons.STAR_FILL : PrimeIcons.STAR"
               :severity="isActive(node.key) ? 'primary' : 'secondary'"
               text
               rounded
               size="small"
               :aria-label="t('component.branch_picker.make_active')"
               v-tooltip.left="
                  isActive(node.key)
                     ? t('component.branch_picker.active')
                     : t('component.branch_picker.make_active')
               "
               :disabled="isActive(node.key)"
               @click.stop="makeActive(node.data)"
            />
         </span>
      </template>
   </TreeSelect>
</template>

<style lang="scss">
.branch_picker {
   @apply min-w-48 max-w-80;

   &__value {
      @apply flex items-center gap-2 min-w-0;
   }

   &__star {
      @apply text-primary text-sm;
   }

   &__name {
      @apply truncate;
   }

   &__option {
      @apply flex items-center gap-2 w-full;

      .branch_picker__name {
         @apply flex-1;
      }
   }
}
</style>
