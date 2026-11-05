import {
   defaultSettings,
   migrateLegacySettings,
   parseSettings,
   SETTINGS_KEY,
   type ThemeProfile
} from '@/lib/theme/settings';
import { storageOrMemory } from '@/lib/storage';
import { useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, nextTick } from 'vue';

/**
 * The user's look and layout choices, kept in localStorage. The theme itself is applied by
 * setupTheme (lib/theme/setup.ts).
 */
export const useThemeStore = defineStore('theme', () => {
   migrateLegacySettings();

   // With storage blocked the settings live in memory for this page load.
   const settings = useStorage(SETTINGS_KEY, defaultSettings(), storageOrMemory(), {
      serializer: { read: parseSettings, write: (value) => JSON.stringify(value) }
   });

   /** The single source of dark mode: the `dark` class on :root, stored as color-scheme. */
   const isDark = useDark({
      selector: ':root',
      valueDark: 'dark',
      valueLight: '',
      storageKey: 'color-scheme',
      storage: storageOrMemory()
   });

   /** The profile in use: the dark one only while dark mode is on and the two are not linked. */
   const profile = computed<ThemeProfile>(() =>
      !settings.value.linked && isDark.value ? settings.value.dark : settings.value.light
   );

   /** Switches dark mode, with a view transition where the browser has them. */
   const toggleDark = (value = !isDark.value) => {
      if (!document.startViewTransition) {
         isDark.value = value;
         return;
      }
      // The class is set by a watcher; the transition captures the page once it has run.
      return document.startViewTransition(async () => {
         isDark.value = value;
         await nextTick();
      });
   };

   return { settings, isDark, profile, toggleDark };
});
