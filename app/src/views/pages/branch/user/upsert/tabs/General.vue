<script setup lang="ts">
import {
   toUserFormValues,
   toUserPayload,
   userSchema,
   useSaveUser,
   useUser,
   isOwnerAbove,
   type UserWithRoles
} from '@/api/user';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for an invitation. */
   data?: Partial<UserWithRoles> | null;
   /** The branch of the membership edited; see the route. */
   tenant?: string | null;
}>();

const authStore = useAuthStore();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready, draft } =
   useUpsertForm({
      id: () => props.id ?? props.data?.id,
      prefill: () => props.data,
      useRow: (id) => useUser(id, () => props.tenant),
      useSaveRow: useSaveUser,
      subject: 'user',
      schema: userSchema,
      toFormValues: toUserFormValues,
      toPayload: toUserPayload,
      // Another owner's account can only be changed by that owner; an owner of a tenant above who
      // is no member here is managed in that tenant.
      lockRow: (user) =>
         isOwnerAbove(user) || (user.id !== authStore.user?.id && !!user.tenant_owner?.length)
   });
await ready;

const metadata = computed(
   () =>
      values.value.user_metadata as {
         display_name?: string;
         avatar_url?: string;
         email_verified?: boolean;
      }
);
</script>

<template>
   <FormBox
      @submit="save"
      @reset="() => reset()"
      v-focustrap
      :readonly
      :dirty="isDirty"
      :submitting="isSubmitting"
      :draft
      :submit-text="values.id ? $t('action.save') : $t('action.invite')"
   >
      <span v-if="values.id" class="flex-0 m-4 mb-0 relative">
         <AvatarPlaceholder
            :alt="metadata.display_name"
            preview
            class="w-32 rounded-[var(--content-border-radius)] overflow-hidden"
            :src="metadata.avatar_url"
            :placeholder="metadata.display_name || values.email"
         />
         <Badge
            v-if="metadata.email_verified"
            :severity="metadata.email_verified ? 'primary' : 'danger'"
            class="!p-0 !h-fit !min-w-fit !w-fit !rounded-full absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-auto"
         >
            <i
               :title="metadata.email_verified ? 'Email verified' : 'Email not verified'"
               class="pi pi-fw !text-2xl"
               :class="metadata.email_verified ? 'pi-verified' : 'pi-exclamation-circle'"
            />
         </Badge>
      </span>
      <FormBox :legend="$t('user.general_info')">
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.name')"
            :error="errors['user_metadata.display_name']"
         >
            <InputText v-bind="slotProps" v-model="values.user_metadata.display_name" />
         </FormField>
         <!-- Whom to invite; a member's sign-in details are theirs to change (account settings). -->
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.email')"
            :error="errors.email"
            :readonly="!!values.id"
         >
            <InputText
               v-bind="slotProps"
               autocomplete="username"
               :readonly="!!values.id"
               v-model="values.email"
            />
         </FormField>
      </FormBox>
      <FormBox
         :legend="$t('user.security')"
         v-if="values.id && $can('read', 'role') && $can('modify', 'user_role')"
      >
         <FormField fluid v-slot="slotProps" :label="$t('fields.role')" :error="errors.role">
            <SelectUserRole v-bind="slotProps" v-model="values.role" option-value="" />
         </FormField>
      </FormBox>
   </FormBox>
</template>
