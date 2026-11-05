<script setup>
import { useSidebar } from '@/composables/useSidebar';
import { useNavigationMenu } from '@/router/menu';
import ScopeControls from './ScopeControls.vue';

const { mode, active, expandedKeys, close } = useSidebar();
const { menu } = useNavigationMenu();

const outsideClickListener = ref(null);

function bindOutsideClickListener() {
   if (!outsideClickListener.value) {
      outsideClickListener.value = (event) => {
         if (isOutsideClicked(event)) {
            close();
         }
      };
      document.addEventListener('mouseup', outsideClickListener.value);
   }
}

function unbindOutsideClickListener() {
   if (outsideClickListener.value) {
      document.removeEventListener('mouseup', outsideClickListener.value);
      outsideClickListener.value = null;
   }
}

function isOutsideClicked(event) {
   const sidebarEl = document.querySelector('.layout-sidebar');
   const topbarEl = document.querySelector('.layout-sidebar-button');

   return !(
      sidebarEl?.isSameNode(event.target) ||
      sidebarEl?.contains(event.target) ||
      topbarEl?.isSameNode(event.target) ||
      topbarEl?.contains(event.target)
   );
}

watch(
   [active, mode],
   ([isActive, currentMode]) => {
      if (isActive && currentMode === 'overlay') {
         bindOutsideClickListener();
      } else {
         unbindOutsideClickListener();
      }
   },
   { immediate: true }
);

onUnmounted(() => {
   unbindOutsideClickListener();
});
</script>

<template>
   <ScopeControls layout="column" class="md:hidden p-2" />
   <Divider class="md:!hidden !my-2" />
   <PanelMenu class="layout-menu" v-model:expandedKeys="expandedKeys" :model="menu" multiple>
      <template #item="{ item, active, hasSubmenu }">
         <span
            :class="{
               '!text-primary-emphasis hover:!text-current': $route.matched.some(
                  ({ name }) => name === item.route.name
               )
            }"
         >
            <CustomLink
               v-if="!hasSubmenu"
               :to="item.route"
               :title="item.label"
               :contextMenuItems="item.contextMenuItems"
               v-slot="{ navigate }"
            >
               <button
                  v-ripple
                  class="p-panelmenu-header-link flex items-center justify-start !gap-2 !p-4"
                  @click="navigate"
               >
                  <span
                     v-if="item.icon"
                     class="p-panelmenu-header-icon !text-xl !text-inherit"
                     :class="item.icon"
                  />
                  <span
                     class="p-panelmenu-header-label !truncate"
                     v-if="item.label"
                     v-text="item.label"
                  />
                  <span
                     v-if="item.locked"
                     class="pi pi-lock ms-auto text-muted-color"
                     v-tooltip.right="$t('subscription.locked.menu')"
                  />
               </button>
            </CustomLink>
            <div
               v-ripple
               v-else
               class="p-panelmenu-header-link flex items-center !gap-2 !p-4"
               :title="item.label"
               @click.prevent
            >
               <span
                  v-if="item.icon"
                  class="p-panelmenu-header-icon !text-xl !text-inherit"
                  :class="item.icon"
               />
               <span
                  class="p-panelmenu-header-label flex-1 !truncate"
                  v-if="item.label"
                  v-text="item.label"
               />
               <span
                  :class="[
                     {
                        'rotate-90': active
                     },
                     PrimeIcons.ANGLE_RIGHT
                  ]"
                  class="!text-inherit transition-transform duration-300"
               />
            </div>
         </span>
      </template>
   </PanelMenu>
</template>
