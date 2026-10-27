import { useThemeStore } from '@/store/theme';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

describe('useThemeStore', () => {
   beforeEach(() => {
      localStorage.clear();
      setActivePinia(createPinia());
   });

   it('uses the light profile while linked, also in dark mode', () => {
      const theme = useThemeStore();
      theme.settings.dark.primary = 'emerald';
      theme.isDark = true;

      expect(theme.profile.primary).toBe(theme.settings.light.primary);
   });

   it('uses the dark profile in dark mode once unlinked', () => {
      const theme = useThemeStore();
      theme.settings.linked = false;
      theme.settings.dark.primary = 'emerald';

      theme.isDark = false;
      expect(theme.profile.primary).toBe(theme.settings.light.primary);

      theme.isDark = true;
      expect(theme.profile.primary).toBe('emerald');
   });

   it('changes the profile in use through profile', () => {
      const theme = useThemeStore();
      theme.settings.linked = false;
      theme.isDark = true;

      theme.profile.uiScale = 0.9;

      expect(theme.settings.dark.uiScale).toBe(0.9);
      expect(theme.settings.light.uiScale).toBe(1);
   });
});
