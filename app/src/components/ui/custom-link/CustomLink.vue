<script setup lang="ts">
import { DIALOG_POSITIONS } from '@/constants/router';
import type { MenuItem } from 'primevue/menuitem';
import { useI18n } from 'vue-i18n';
import { RouteLocationNormalized, RouterLink, RouterLinkProps } from 'vue-router';

defineOptions({
   inheritAttrs: false
});

export type CustomLinkProps = {
   contextMenuItems?: MenuItem[];
} & RouterLinkProps;

const props = withDefaults(defineProps<CustomLinkProps>(), {
   contextMenuItems: () => []
});
const { t, te } = useI18n();

const router = useRouter();

const { ability } = useAuthStore();

const { href, route } = useLink(props);

const isExternalLink = computed<boolean>(() => {
   try {
      new URL(href.value);
   } catch (error) {
      return false;
   }
   return true;
});

const dialogRef = inject('dialogRef', null);

const contextMenu = ref();

const contextMenuItems = computed<MenuItem[]>(() => {
   const items = [...props.contextMenuItems];

   if (!route?.value?.query?.showDialog) {
      return _concat(
         [
            {
               label: t('router.action.open_in_window'),
               route: {
                  ...route.value,
                  query: {
                     ...route.value?.query,
                     showDialog: DIALOG_POSITIONS.CENTER
                  }
               }
            }
         ],
         items
      );
   }
   return items;
});

const itemClick = (item: RouteLocationNormalized) => {
   if (dialogRef) {
      item.query.showDialog = DIALOG_POSITIONS.CENTER;
   }

   router.push(item);
};

const checkVisibility = (item: RouteLocationNormalized) => {
   return (
      item?.meta?.visible ||
      (item?.meta?.requiredPermissions as any)?.every?.(({ action, subject }: any) =>
         ability.can?.(action, subject)
      )
   );
};

const getItemLabel = (item: MenuItem) =>
   te(item.label.toString() || '') ? t(item.label.toString() || '') : item.label;
</script>

<template>
   <a
      v-if="isExternalLink"
      v-ripple
      v-bind="$attrs"
      :href="href"
      target="_blank"
      class="custom_link custom_link__external"
   >
      <slot />
   </a>
   <template v-else-if="checkVisibility(route)">
      <router-link v-bind="props" custom v-slot="{ isExactActive, isActive }">
         <a
            :href="href"
            @click.exact.capture.prevent=""
            @contextmenu="(e) => contextMenu.show(e)"
            @click.ctrl.capture.prevent.stop="
               $router.push({ ...route, query: { showDialog: DIALOG_POSITIONS.CENTER } })
            "
            class="custom_link__internal"
            :class="{
               'custom_link__internal--cursor-context': contextMenuItems.length,
               ..._get($attrs, 'class', null)
            }"
         >
            <slot
               v-bind="{
                  ...$attrs,
                  href,
                  navigate: itemClick.bind(null, route),
                  isExactActive,
                  isActive,
                  route
               }"
            />
         </a>
      </router-link>
      <ContextMenu
         class="custom_link__context-menu"
         v-if="!isExternalLink && contextMenuItems?.length"
         ref="contextMenu"
         :model="contextMenuItems"
      >
         <template #item="{ item, props }">
            <RouterLink v-if="item.route" v-slot="{ href, route }" :to="item.route" custom>
               <a
                  v-ripple
                  :href="href"
                  v-bind="props.action"
                  @click.prevent="() => itemClick(route)"
                  class="custom_link__context-menu-item"
                  :class="{
                     'custom_link__internal--cursor-context': contextMenuItems.length
                  }"
               >
                  <span v-if="item.icon" :class="item.icon" class="custom_link__icon" />
                  <span class="custom_link__label" v-text="getItemLabel(item)" />
               </a>
            </RouterLink>
            <a
               v-else
               v-ripple
               :href="item.url"
               :target="item.target"
               v-bind="props.action"
               class="custom_link__context-menu-item"
            >
               <span v-if="item.icon" :class="item.icon" class="custom_link__icon" />
               <span class="custom_link__label" v-text="getItemLabel(item)" />
            </a>
         </template>
      </ContextMenu>
   </template>
</template>

<style lang="scss">
.custom_link {
   &__internal {
      @apply flex flex-col;
      &--cursor-context {
         @apply cursor-alias [&>*]:!cursor-alias !important;
      }
   }

   &__context-menu-item {
      @apply flex items-center gap-4;
   }

   &__label {
      @apply first-letter:uppercase;
   }
}
</style>
