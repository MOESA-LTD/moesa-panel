<script setup>
import { safeAvatarUrl } from '@/api/account/avatar';
import { useLogout } from '@/composables/useLogout';
import { useMenuSection } from '@/router/menu';
import { useToast } from 'primevue/usetoast';
import { buildAccountMenu } from './accountMenu';

const accountMenu = ref();

const { user } = storeToRefs(useAuthStore());
const { confirmLogout } = useLogout();
const toast = useToast();

const logout = () => {
   accountMenu.value?.hide();
   confirmLogout().catch((error) =>
      toast.add({
         life: 5000,
         severity: ToastSeverity.ERROR,
         summary: i18n.t('toast.error'),
         detail: error?.message
      })
   );
};

const account = useMenuSection('account');
const accountMenuItems = computed(() => buildAccountMenu(account.value?.items, logout));
</script>

<template>
   <slot v-if="user" name="button" :toggleFn="accountMenu?.toggle">
      <Button
         type="button"
         title="Account"
         :icon="PrimeIcons.USER"
         rounded
         text
         :label="$attrs.label"
         severity="secondary"
         @click="accountMenu?.toggle"
         aria-haspopup="true"
         aria-controls="account_menu"
         class="account_popover__button"
      />
   </slot>
   <Popover append-to="#app" ref="accountMenu">
      <TieredMenu id="account_menu" class="account_popover__menu" :model="accountMenuItems">
         <template #start>
            <div v-if="user" class="account_popover__user_info">
               <AvatarPlaceholder
                  :alt="user?.user_metadata?.display_name"
                  class="account_popover__avatar"
                  :src="safeAvatarUrl(user?.user_metadata?.avatar_url)"
                  :placeholder="user.user_metadata?.display_name || user?.email"
               />
               <p
                  v-if="user.user_metadata?.display_name"
                  v-text="user.user_metadata?.display_name"
                  class="account_popover__name"
               />
               <p v-if="user.email" v-text="user.email" class="account_popover__email" />
            </div>
         </template>

         <template #item="{ item, props, hasSubmenu }">
            <span
               :class="{
                  'account_popover__menu_item--active':
                     !!item.route?.name &&
                     $route.matched.some(({ name }) => name === item.route.name)
               }"
               class="account_popover__menu_item"
            >
               <button
                  v-if="item.command"
                  type="button"
                  v-bind="props.action"
                  class="account_popover__menu_item_button"
               >
                  <span class="account_popover__menu_item_icon" :class="item.icon" />
                  <span class="account_popover__menu_item_label" v-text="item.label" />
               </button>
               <CustomLink v-else-if="!hasSubmenu" :to="item.route" v-slot="{ navigate }">
                  <button
                     @click="navigate"
                     v-bind="props.action"
                     class="account_popover__menu_item_button"
                  >
                     <span class="account_popover__menu_item_icon" :class="item.icon" />
                     <span class="account_popover__menu_item_label" v-text="item.label" />
                  </button>
               </CustomLink>
               <div v-bind="props.action" v-else class="account_popover__menu_group">
                  <span :class="item.icon" />
                  <label class="account_popover__menu_item_label" v-text="item.label" />
                  <span
                     v-if="hasSubmenu"
                     :class="PrimeIcons.ANGLE_RIGHT"
                     class="account_popover__submenu_icon"
                  />
               </div>
            </span>
         </template>
      </TieredMenu>
   </Popover>
</template>

<style lang="scss">
.account_popover {
   &__user_info {
      @apply flex m-4 gap-4 flex-col items-center;
   }

   &__avatar {
      @apply w-24 aspect-square rounded-[var(--content-border-radius)] overflow-hidden;
   }

   &__email {
      @apply text-sm;
   }

   &__menu {
      @apply border-0 !important;

      &_item {
         @apply hover:text-primary-emphasis;

         &--active {
            @apply text-primary-emphasis hover:!text-current !important;
         }

         &_button {
            @apply flex items-center gap-2;
         }

         &_icon {
            @apply text-inherit !important;
         }

         &_label {
            @apply ms-2;
         }
      }
   }

   &__menu_group {
      @apply flex items-center;
   }

   &__submenu_icon {
      @apply ms-auto;
   }
}
</style>
