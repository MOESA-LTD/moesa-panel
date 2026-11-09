<script setup lang="ts">
import {
   roleSchema,
   toRoleFormValues,
   toRolePayload,
   useRole,
   useSaveRole,
   type RoleWithPermissions
} from '@/api/role';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for a new role. */
   data?: Partial<RoleWithPermissions> | null;
}>();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id ?? props.data?.id,
      prefill: () => props.data,
      useRow: useRole,
      useSaveRow: useSaveRole,
      subject: 'role',
      schema: roleSchema,
      toFormValues: toRoleFormValues,
      toPayload: toRolePayload,
      // Roles without a tenant are global (e.g. owner) and cannot be edited.
      lockRow: (role) => !role.tenant_id
   });
await ready;

// save_role checks the rights it adds in the role's own tenant, while the ability is the active
// tenant's: a role of another tenant cannot have its field rights changed from here.
const { data: roleRow } = useRole(() => props.id);
const foreignTenant = computed(() => {
   const tenant = roleRow.value?.tenant_id;
   return !!tenant && tenant !== useAuthStore().currentTenant?.id;
});
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
         <FormField fluid :label="$t('fields.name')" :error="errors.display_name" :readonly>
            <template #default="slotProps">
               <InputText v-bind="slotProps" v-model="values.display_name" />
            </template>
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('fields.permission')"
            :readonly
            :error="errors.permission"
            v-slot="slotProps"
         >
            <SelectPermissions v-bind="slotProps" v-model="values.permission" />
         </FormField>
         <FormField
            class="!flex-auto !max-w-none w-full"
            fluid
            :label="$t('component.select_field_permission.label')"
            :readonly
            :error="errors.field_rights"
            v-slot="slotProps"
         >
            <SelectFieldPermissions
               v-bind="slotProps"
               v-model="values.field_rights"
               :foreign-tenant
            />
         </FormField>
      </FormBox>
   </div>
</template>
