<script setup lang="ts">
import { companyOf, toBranchTree, useDeleteBranch, type BranchNode } from '@/api/branch';
import { planBlock } from '@/api/subscription';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import { DIALOG_POSITIONS } from '@/constants/router';

const authStore = useAuthStore();
const router = useRouter();
const confirmDelete = useConfirmDelete();
const { mutateAsync: deleteBranch } = useDeleteBranch();

const nodes = computed(() => toBranchTree(authStore.branches));

// Under the active company, its plan may not allow another branch (read-only, or the limit
// reached); the database refuses it anyway, this says why beforehand. Other companies' plans are
// not loaded, so there the database alone decides.
const addBlock = (id: string) =>
   !authStore.isSuperAdmin &&
   companyOf(authStore.branches, id) === authStore.subscription?.company_id
      ? planBlock(authStore.subscription, 'max_branches')
      : null;

// Branches start expanded; what the user collapses stays collapsed while the page is open.
const expandedKeys = ref<Record<string, boolean>>({});
watch(
   () => authStore.branches,
   (branches) => {
      for (const { id } of branches) expandedKeys.value[id] ??= true;
   },
   { immediate: true }
);

const openForm = (name: string, params: Record<string, string>) =>
   router.push({ name, params, query: { showDialog: DIALOG_POSITIONS.CENTER } });

const remove = async (branch: BranchNode['data']) => {
   if (await confirmDelete(branch)) await deleteBranch(branch.id);
};
</script>

<template>
   <TreeTable :value="nodes" v-model:expandedKeys="expandedKeys" class="branch_tree">
      <template #header>
         <p class="text-sm text-muted-color m-0">{{ $t('branch_tree.hint') }}</p>
         <Message
            v-if="authStore.subscription && addBlock(authStore.subscription.company_id)"
            severity="warn"
            size="small"
            class="mt-2"
         >
            {{ $t(`errors.${addBlock(authStore.subscription.company_id)}`) }}
         </Message>
      </template>
      <Column field="display_name" :header="$t('fields.name')" expander>
         <template #body="{ node }: { node: BranchNode }">
            <span class="inline-flex items-center gap-2 flex-wrap">
               <span>{{ node.data.display_name }}</span>
               <Tag
                  v-if="node.key === authStore.currentTenant?.id"
                  severity="info"
                  icon="pi pi-star-fill"
                  :value="$t('branch_tree.active')"
               />
               <Tag v-if="node.data.owned" severity="secondary" :value="$t('branch_tree.owner')" />
            </span>
         </template>
      </Column>
      <Column class="w-0">
         <template #body="{ node }: { node: BranchNode }">
            <div class="flex gap-2 items-center justify-end">
               <Button
                  size="small"
                  icon="pi pi-plus"
                  severity="success"
                  v-tooltip.left="
                     addBlock(node.key)
                        ? $t(`errors.${addBlock(node.key)}`)
                        : $t('branch_tree.add_branch')
                  "
                  :aria-label="$t('branch_tree.add_branch')"
                  :disabled="!node.data.canAddBranch || !!addBlock(node.key)"
                  @click="openForm('branch-tree-add', { parentId: node.key })"
               />
               <Button
                  size="small"
                  icon="pi pi-pencil"
                  severity="info"
                  v-tooltip.left="$t('action.edit')"
                  :aria-label="$t('action.edit')"
                  :disabled="!authStore.canIn(node.key, 'modify', 'tenant')"
                  @click="openForm('branch-tree-edit', { id: node.key })"
               />
               <Button
                  size="small"
                  icon="pi pi-trash"
                  severity="danger"
                  v-tooltip.left="$t('action.delete')"
                  :aria-label="$t('action.delete')"
                  :disabled="!node.data.canDelete"
                  @click="remove(node.data)"
               />
            </div>
         </template>
      </Column>
   </TreeTable>
</template>
