import router from '@/router';
import { useAuthStore } from '@/store/auth';
import { ability } from '@plugins/casl';
import i18n from '@plugins/i18n';
import { createSharedComposable } from '@vueuse/core';
import { computed } from 'vue';
import { buildMenu, type NavigationItem } from './buildMenu';

export type { NavigationItem };

/** The app's menu, built once and shared; follows the language and the user's permissions. */
export const useNavigationMenu = createSharedComposable(() => {
   const authStore = useAuthStore();
   const menu = computed(() =>
      buildMenu(router.getRoutes(), {
         can: (action, subject) => ability.can(action, subject),
         t: (key) => i18n.t(key),
         lockedModule: authStore.lockedModule
      })
   );

   /** The entry of a named route, e.g. a section whose children make its menu bar. */
   const find = (name: string, items = menu.value): NavigationItem | undefined => {
      for (const item of items) {
         if (item.name === name) return item;
         const found = item.items && find(name, item.items);
         if (found) return found;
      }
   };

   return { menu, find };
});

/** The entry of a named route (and its children), kept up to date. */
export const useMenuSection = (name: string) => {
   const { find } = useNavigationMenu();
   return computed(() => find(name));
};
