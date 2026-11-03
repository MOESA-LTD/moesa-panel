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
   /** Without its own card, e.g. inside the branch profile. */
   plain?: boolean;
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

const WEBSITE_PLACEHOLDER = 'https://example.com';

const parentName = computed(
   () => authStore.branches.find((branch) => branch.id === props.parentId)?.display_name
);
</script>

<template>
   <div :class="{ card: !plain }">
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
         <FormBox :legend="$t('branch_profile.general')" class="!flex-auto">
            <FormField fluid :label="$t('fields.name')" :error="errors.display_name" :readonly>
               <template #default="slotProps">
                  <InputText v-bind="slotProps" v-model="values.display_name" />
               </template>
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.email"
               :label="$t('fields.email')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.email" type="email" />
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
            <FormField
               :readonly
               fluid
               :error="errors.website"
               :label="$t('fields.website')"
               v-slot="slotProps"
            >
               <InputText
                  v-bind="slotProps"
                  v-model="values.website"
                  :placeholder="WEBSITE_PLACEHOLDER"
               />
            </FormField>
         </FormBox>

         <FormBox :legend="$t('branch_profile.tax')" class="!flex-auto">
            <FormField
               :readonly
               fluid
               :error="errors.legal_name"
               :label="$t('fields.legal_name')"
               class="!flex-auto !max-w-none w-full"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.legal_name" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.tax_office"
               :label="$t('fields.tax_office')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.tax_office" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.tax_number"
               :label="$t('fields.tax_number')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.tax_number" />
            </FormField>
         </FormBox>

         <FormBox :legend="$t('fields.address')" class="!flex-auto">
            <FormField
               :readonly
               fluid
               :error="errors.country"
               :label="$t('fields.country')"
               v-slot="slotProps"
            >
               <SelectCountry
                  v-bind="slotProps"
                  :model-value="values.country || null"
                  @update:model-value="values.country = $event ?? ''"
                  showClear
               />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.city"
               :label="$t('fields.city')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.city" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.district"
               :label="$t('fields.district')"
               v-slot="slotProps"
            >
               <InputText v-bind="slotProps" v-model="values.district" />
            </FormField>
            <FormField
               :readonly
               fluid
               :error="errors.address"
               :label="$t('fields.address_details')"
               class="!flex-auto !max-w-none w-full"
               v-slot="slotProps"
            >
               <Textarea v-bind="slotProps" v-model="values.address" autoResize rows="2" />
            </FormField>
         </FormBox>
      </FormBox>
   </div>
</template>
