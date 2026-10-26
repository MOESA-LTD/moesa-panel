<script setup lang="ts">
import {
   toUserFormValues,
   toUserPayload,
   userSchema,
   useSaveUser,
   useUser,
   type UserWithRoles
} from '@/api/user';
import { useUpsertForm } from '@/composables/useUpsertForm';

const props = defineProps<{
   id?: string | null;
   /** Prefill for an invitation. */
   data?: Partial<UserWithRoles> | null;
}>();

const authStore = useAuthStore();

const { values, errors, isDirty, isSubmitting, readonly, reset, save, ready } = useUpsertForm({
   id: () => props.id ?? props.data?.id,
   prefill: () => props.data,
   useRow: useUser,
   useSaveRow: useSaveUser,
   subject: 'user',
   schema: userSchema,
   toFormValues: toUserFormValues,
   toPayload: toUserPayload,
   // Another owner's account can only be changed by that owner.
   lockRow: (user) =>
      user.id !== authStore.user?.id && user.role?.some((role) => role.display_name === 'owner')
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
         <FormField fluid v-slot="slotProps" :label="$t('fields.email')" :error="errors.email">
            <InputText v-bind="slotProps" autocomplete="username" v-model="values.email" />
         </FormField>
         <FormField
            v-if="values.id"
            fluid
            v-slot="slotProps"
            :label="$t('fields.phone')"
            :error="errors.phone"
         >
            <PhoneInput v-bind="slotProps" autocomplete="off" v-model="values.phone" />
         </FormField>
      </FormBox>
      <FormBox :legend="$t('user.security')" v-if="values.id">
         <FormField
            v-if="$can('read', 'role') && $can('modify', 'user_role')"
            fluid
            v-slot="slotProps"
            :label="$t('fields.role')"
            :error="errors.role"
         >
            <SelectUserRole v-bind="slotProps" v-model="values.role" option-value="" />
         </FormField>
         <FormField
            fluid
            v-slot="slotProps"
            :label="$t('fields.password')"
            :error="errors.password"
         >
            <Password
               :pt="{
                  pcInputText: {
                     root: {
                        autocomplete: 'new-password'
                     }
                  }
               }"
               v-bind="slotProps"
               :toggle-mask="true"
               :feedback="false"
               v-model="values.password"
            />
         </FormField>
      </FormBox>
   </FormBox>
</template>
