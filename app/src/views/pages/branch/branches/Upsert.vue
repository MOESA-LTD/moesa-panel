<script setup lang="ts">
import {
   branchSchema,
   toBranchFormValues,
   toBranchPayload,
   useBranch,
   useSaveBranch
} from '@/api/branch';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** The branch a new branch is opened under. */
   parentId?: string | null;
}>();

const authStore = useAuthStore();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id,
      useRow: useBranch,
      useSaveRow: useSaveBranch,
      subject: 'tenant',
      schema: branchSchema,
      toFormValues: toBranchFormValues,
      toPayload: (data) => ({ ...toBranchPayload(data), parent_id: props.parentId }),
      // Branches are opened by the owners of the branch above (create_branch); changing one takes
      // the permission in that branch itself.
      canSubmit: ({ id }) =>
         id
            ? authStore.canIn(id, 'modify', 'tenant')
            : !!authStore.branches.find((branch) => branch.id === props.parentId)?.owned
   });
await ready;

const parentName = computed(
   () => authStore.branches.find((branch) => branch.id === props.parentId)?.display_name
);
</script>

<template>
   <div class="card">
      <FormBox
         @submit="save"
         @reset="() => reset()"
         v-focustrap
         :dirty="isDirty"
         :submitting="isSubmitting"
         :draft
         :readonly
      >
         <Message v-if="!values.id && parentName" severity="secondary" class="w-full">
            {{ $t('branch_tree.opened_under', { name: parentName }) }}
         </Message>
         <FormField fluid :label="$t('fields.name')" :error="errors.display_name" :readonly>
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.display_name" />
            </template>
         </FormField>
         <div class="form_box !flex-auto">
            <FormField
               :readonly
               fluid
               :error="errors.email"
               :label="$t('fields.email')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.email" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.phone"
               :label="$t('fields.phone')"
               v-slot="slotProps"
            >
               <PhoneInput v-bind="slotProps" v-model="values.phone" />
            </FormField>
         </div>
      </FormBox>
   </div>
</template>
