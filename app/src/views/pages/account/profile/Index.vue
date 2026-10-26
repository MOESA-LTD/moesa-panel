<script setup>
import { localeDateString } from '@/lib/dayjs';

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const formatDate = (value) => (value ? localeDateString({ value, validate: false }) : '');
</script>

<template>
   <div class="card flex flex-wrap items-start gap-4 p-4">
      <span class="flex-0 mx-auto relative">
         <AvatarPlaceholder
            :alt="user?.user_metadata?.display_name"
            preview
            class="w-32 rounded-[var(--content-border-radius)] overflow-hidden"
            :src="user?.user_metadata?.avatar_url"
            :placeholder="user.user_metadata?.display_name || user?.email"
         />
         <Badge
            v-if="user?.email_confirmed_at"
            :severity="user?.email_confirmed_at ? 'primary' : 'danger'"
            class="!p-0 !h-fit !min-w-fit !w-fit !rounded-full absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 z-auto"
         >
            <i
               :title="user?.email_confirmed_at ? 'Email verified' : 'Email not verified'"
               class="pi pi-fw !text-2xl"
               :class="user?.email_confirmed_at ? 'pi-verified' : 'pi-exclamation-circle'"
            />
         </Badge>
      </span>
      <FormBox :legend="$t('account.profile.user_info')" class="flex-1">
         <FormField fluid :label="$t('account.profile.name')" v-slot="slotProps">
            <InputText
               v-bind="slotProps"
               readonly
               :model-value="user?.user_metadata?.display_name"
            />
         </FormField>
         <FormField fluid :label="$t('account.profile.email')" v-slot="slotProps">
            <InputText v-bind="slotProps" readonly :model-value="user?.email" />
         </FormField>
         <FormField fluid :label="$t('account.profile.phone')" v-slot="slotProps">
            <PhoneInput v-bind="slotProps" :model-value="user?.phone" readonly />
         </FormField>
      </FormBox>
      <FormBox :legend="$t('account.profile.events')" class="flex-1">
         <FormField fluid :label="$t('account.profile.logs.created_at')" v-slot="slotProps">
            <InputText v-bind="slotProps" readonly :model-value="formatDate(user?.created_at)" />
         </FormField>
         <FormField fluid :label="$t('account.profile.logs.email_confirmed_at')" v-slot="slotProps">
            <InputText
               v-bind="slotProps"
               readonly
               :model-value="formatDate(user?.email_confirmed_at)"
            />
         </FormField>
         <FormField fluid :label="$t('account.profile.logs.last_sign_in_at')" v-slot="slotProps">
            <InputText
               v-bind="slotProps"
               readonly
               :model-value="formatDate(user?.last_sign_in_at)"
            />
         </FormField>
      </FormBox>
   </div>
</template>
