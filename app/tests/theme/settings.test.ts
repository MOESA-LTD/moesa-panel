import {
   DEFAULT_SETTINGS,
   LEGACY_SETTINGS_KEY,
   migrateLegacySettings,
   parseSettings,
   SETTINGS_KEY
} from '@/lib/theme/settings';
import { describe, expect, it } from 'vitest';

const memoryStorage = (entries: Record<string, string> = {}) => {
   const items = new Map(Object.entries(entries));
   return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      items
   } as unknown as Storage & { items: Map<string, string> };
};

describe('parseSettings', () => {
   it('falls back to the defaults for missing or unreadable settings', () => {
      expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
      expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
   });

   it('gives each profile its own object, so editing one leaves the other alone', () => {
      const settings = parseSettings(null);
      expect(settings.light).not.toBe(settings.dark);
      expect(parseSettings(null)).not.toBe(settings);
   });

   it('replaces only the values that are not valid', () => {
      const settings = parseSettings(
         JSON.stringify({
            linked: false,
            light: { preset: 'lara', primary: 'no-such-colour', uiScale: 9, sidebarMode: 'mini' }
         })
      );

      expect(settings.linked).toBe(false);
      expect(settings.light).toEqual({
         preset: 'lara',
         primary: DEFAULT_SETTINGS.light.primary,
         surface: DEFAULT_SETTINGS.light.surface,
         uiScale: DEFAULT_SETTINGS.light.uiScale,
         sidebarMode: 'mini'
      });
      expect(settings.dark).toEqual(DEFAULT_SETTINGS.dark);
   });
});

describe('migrateLegacySettings', () => {
   const legacy = {
      isDark: true,
      isLinked: false,
      sidebarActive: true,
      activeMenuItem: { '1': true, '4_2': true, branch: true, client: false },
      // On a phone the stored mode had been switched to overlay.
      sidebarMode: 'overlay',
      sidebarModeDesktop: 'mini',
      preset: 'nora',
      primary: 'emerald',
      surface: 'zinc',
      UIScale: 0.85,
      dark: {
         preset: 'material',
         primary: 'noir',
         surface: 'soho',
         UIScale: 1.05,
         sidebarMode: 'reveal'
      }
   };

   it('moves app-state to the new settings and removes it', () => {
      const storage = memoryStorage({ [LEGACY_SETTINGS_KEY]: JSON.stringify(legacy) });

      migrateLegacySettings(storage);

      expect(storage.items.has(LEGACY_SETTINGS_KEY)).toBe(false);
      expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual({
         linked: false,
         light: {
            preset: 'nora',
            primary: 'emerald',
            surface: 'zinc',
            uiScale: 0.85,
            sidebarMode: 'mini'
         },
         dark: {
            preset: 'material',
            primary: 'noir',
            surface: 'soho',
            uiScale: 1.05,
            sidebarMode: 'reveal'
         },
         sidebarActive: true,
         // Positional keys no longer match any entry.
         expandedMenu: { branch: true, client: false }
      });
   });

   it('keeps settings that already exist', () => {
      const current = JSON.stringify({ ...DEFAULT_SETTINGS, linked: false });
      const storage = memoryStorage({
         [LEGACY_SETTINGS_KEY]: JSON.stringify(legacy),
         [SETTINGS_KEY]: current
      });

      migrateLegacySettings(storage);

      expect(storage.getItem(SETTINGS_KEY)).toBe(current);
      expect(storage.items.has(LEGACY_SETTINGS_KEY)).toBe(false);
   });

   it('starts from the defaults when app-state is unreadable', () => {
      const storage = memoryStorage({ [LEGACY_SETTINGS_KEY]: '{broken' });

      migrateLegacySettings(storage);

      expect(JSON.parse(storage.getItem(SETTINGS_KEY)!)).toEqual(DEFAULT_SETTINGS);
   });

   it('does nothing without app-state', () => {
      const storage = memoryStorage();
      migrateLegacySettings(storage);
      expect(storage.items.size).toBe(0);
   });
});
