<script setup lang="ts">
import { AVATAR_TYPES, removeAvatar, uploadAvatar, validateAvatarFile } from '@/api/account/avatar';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { localeDateString } from '@/lib/dayjs';
import type { FileUploadSelectEvent } from 'primevue';
import { useToast } from 'primevue/usetoast';

// Who is signed in, and their photo. The store refreshes the user on USER_UPDATED, so an upload
// shows here and in the account popover without keeping any state of its own.
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();

const user = computed(() => authStore.user);
const name = computed(() => user.value?.user_metadata?.display_name || '');
const avatarUrl = computed(() => user.value?.user_metadata?.avatar_url || undefined);
const memberSince = computed(() =>
   user.value?.created_at ? localeDateString({ value: user.value.created_at, validate: false }) : ''
);

const uploading = ref(false);
const removing = ref(false);

const updated = () =>
   toast.add({ life: 3000, severity: ToastSeverity.SUCCESS, summary: t('toast.updated') });

const onSelect = async ({ files }: FileUploadSelectEvent) => {
   const file = ([] as File[]).concat(files)[0];
   const id = user.value?.id;
   if (!file || !id) return;

   // Checked here too, so a wrong file is explained rather than refused by the bucket.
   const code = validateAvatarFile(file);
   if (code) {
      toast.add({
         life: 5000,
         severity: ToastSeverity.ERROR,
         summary: t('toast.error'),
         detail: t(`errors.${code}`)
      });
      return;
   }

   uploading.value = true;
   try {
      await uploadAvatar(file, id);
      updated();
   } catch (error) {
      appErrorHandler(error);
   } finally {
      uploading.value = false;
   }
};

const onRemove = async () => {
   const id = user.value?.id;
   if (!id) return;

   removing.value = true;
   try {
      await removeAvatar(id);
      updated();
   } catch (error) {
      appErrorHandler(error);
   } finally {
      removing.value = false;
   }
};
</script>

<template>
   <header v-if="user" class="account_header">
      <AvatarPlaceholder
         :src="avatarUrl"
         :placeholder="name || user.email || ''"
         preview
         class="account_header__avatar"
      />

      <div class="account_header__identity">
         <h1 v-if="name" class="account_header__name">{{ name }}</h1>
         <span class="account_header__email">
            {{ user.email }}
            <Tag
               :severity="user.email_confirmed_at ? 'success' : 'warn'"
               :value="
                  $t(
                     user.email_confirmed_at
                        ? 'account.header.email_verified'
                        : 'account.header.email_not_verified'
                  )
               "
            />
         </span>
         <small v-if="memberSince" class="text-muted-color">
            {{ $t('account.header.member_since', { date: memberSince }) }}
         </small>
      </div>

      <div class="account_header__avatar-actions">
         <FileUpload
            mode="basic"
            auto
            customUpload
            :accept="AVATAR_TYPES.join(',')"
            :chooseLabel="$t(avatarUrl ? 'account.avatar.change' : 'account.avatar.upload')"
            :chooseButtonProps="{ size: 'small', outlined: true, loading: uploading }"
            :disabled="uploading || removing"
            @select="onSelect"
         />
         <Button
            v-if="avatarUrl"
            data-avatar-remove
            size="small"
            text
            severity="danger"
            :icon="PrimeIcons.TRASH"
            :label="$t('account.avatar.remove')"
            :loading="removing"
            :disabled="uploading"
            @click="onRemove"
         />
         <small class="text-muted-color">{{ $t('account.avatar.hint') }}</small>
      </div>
   </header>
</template>

<style lang="scss">
.account_header {
   @apply flex flex-wrap items-center gap-4;

   &__avatar {
      @apply w-24 h-24 shrink-0 rounded-full overflow-hidden;
   }

   &__identity {
      @apply flex flex-col gap-1 flex-1 min-w-48;
   }

   &__name {
      @apply text-xl font-semibold m-0;
   }

   &__email {
      @apply flex flex-wrap items-center gap-2 break-all;
   }

   &__avatar-actions {
      @apply flex flex-col gap-2 items-stretch;
   }
}
</style>
