<script setup lang="ts">
import type { Tenant } from '@/api/access';
import { logoUrl } from '@/api/branch';
import { appErrorHandler } from '@/lib/appErrorHandler';
import type { TreeNode } from 'primevue/treenode';

/**
 * Picks the branches the pages show (any of the user's tenants, each on its own) and the active
 * one, where new rows go (the star). Shown only to users with more than one tenant.
 */
const authStore = useAuthStore();
const { branches, currentTenant, currentLogoPath, scopeTenants } = storeToRefs(authStore);
const logo = computed(() => logoUrl(currentLogoPath.value));
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
            <img v-if="logo" :src="logo" alt="" class="branch_picker__logo" />
            <span v-else :class="PrimeIcons.SITEMAP" class="branch_picker__icon" />
            <span v-text="t('component.branch_picker.label')" class="branch_picker__label" />
            <!-- Small screens: the icon and how many branches are shown. -->
            <span class="branch_picker__active">
               <span :class="PrimeIcons.STAR_FILL" class="branch_picker__star" />
               <span v-text="currentTenant?.display_name" class="branch_picker__name" />
            </span>
            <Tag
               v-if="scopeTenants.length > 1"
               severity="secondary"
               class="branch_picker__more"
               :value="`+${scopeTenants.length - 1}`"
               v-tooltip.bottom="
                  scopeTenants
                     .filter(({ id }) => !isActive(id))
                     .map(({ display_name }) => display_name)
                     .join(', ')
               "
            />
            <Tag severity="secondary" class="branch_picker__count" :value="scopeTenants.length" />
         </span>
      </template>
      <template #header>
         <p v-text="t('component.branch_picker.hint')" class="branch_picker__hint" />
      </template>
      <template #option="{ node, selected }">
         <span class="branch_picker__option">
            <Checkbox :modelValue="selected" binary readonly :tabindex="-1" />
            <img
               v-if="node.data.logo_path"
               :src="logoUrl(node.data.logo_path) ?? undefined"
               alt=""
               class="branch_picker__logo"
            />
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
.branch_picker__logo {
   @apply size-5 shrink-0 rounded-sm object-contain;
}

.branch_picker {
   @apply max-w-80 max-sm:max-w-none;

   &__value {
      @apply flex items-center gap-2 min-w-0;
   }

   &__icon {
      @apply text-muted-color;
   }

   &__label {
      @apply text-muted-color text-sm hidden lg:inline;

      &::after {
         content: ':';
      }
   }

   &__active {
      @apply flex items-center gap-2 min-w-0 max-sm:hidden;
   }

   // Tag sets its own display, injected after these rules.
   &__more {
      @apply max-sm:!hidden;
   }

   &__count {
      @apply sm:!hidden;
   }

   &__star {
      @apply text-primary text-sm;
   }

   &__name {
      @apply truncate;
   }

   &__hint {
      @apply m-0 px-4 pt-3 pb-1 text-sm text-muted-color max-w-80;
   }

   &__option {
      @apply flex items-center gap-2 w-full;

      .branch_picker__name {
         @apply flex-1;
      }
   }
}
</style>
