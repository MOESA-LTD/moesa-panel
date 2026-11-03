import type { SidebarMode } from '@/lib/theme/settings';
import { useThemeStore } from '@/store/theme';
import { breakpointsTailwind, createSharedComposable, useBreakpoints } from '@vueuse/core';
import { computed } from 'vue';

/** The dashboard sidebar: its mode, whether it is open and which groups are expanded. */
export const useSidebar = createSharedComposable(() => {
   const theme = useThemeStore();

   /** Below Tailwind's `sm` the sidebar is always an overlay. */
   const isMobile = useBreakpoints(breakpointsTailwind).smaller('sm');

   /** The mode in effect; the chosen one (theme.profile.sidebarMode) is kept for larger screens. */
   const mode = computed<SidebarMode>(() =>
      isMobile.value ? 'overlay' : theme.profile.sidebarMode
   );

   const active = computed({
      get: () => theme.settings.sidebarActive,
      set: (value) => (theme.settings.sidebarActive = value)
   });

   /** PanelMenu's expanded groups, by route name. */
   const expandedKeys = computed({
      get: () => theme.settings.expandedMenu,
      set: (value) => (theme.settings.expandedMenu = value)
   });

   return {
      isMobile,
      mode,
      active,
      expandedKeys,
      setMode: (value: SidebarMode) => (theme.profile.sidebarMode = value),
      toggle: () => (active.value = !active.value),
      close: () => (active.value = false)
   };
});
