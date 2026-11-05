import './mockMain';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';

vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ replace: vi.fn() })
}));

const NAMES = ['localStorage', 'sessionStorage'] as const;
const saved = NAMES.map(
   (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

/** Chrome with site data blocked: reading the property itself throws a SecurityError. */
const blockStorage = () => {
   for (const name of NAMES) {
      Object.defineProperty(globalThis, name, {
         configurable: true,
         get() {
            throw new DOMException(`Access to '${name}' is denied`, 'SecurityError');
         }
      });
   }
};

// main.ts cannot be imported here (top-level await, router guard), so this covers what it loads
// before app.mount: one throw there leaves a blank page.
describe('startup with browser storage blocked', () => {
   beforeEach(() => {
      vi.resetModules();
      setActivePinia(createPinia());
      blockStorage();
   });

   afterEach(() => {
      for (const [name, descriptor] of saved) Object.defineProperty(globalThis, name, descriptor!);
   });

   it('loads the i18n plugin and guesses a locale', async () => {
      const { guessUserLocale } = await import('@/plugins/i18n');
      expect(guessUserLocale.value).toBeTruthy();
   });

   it('skips the legacy theme migration', async () => {
      const { migrateLegacySettings } = await import('@/lib/theme/settings');
      expect(() => migrateLegacySettings()).not.toThrow();
   });

   it('creates the theme store with settings in memory', async () => {
      const { useThemeStore } = await import('@/store/theme');
      const theme = effectScope().run(() => useThemeStore());
      expect(theme?.settings.linked).toBeTypeOf('boolean');
   });

   it('creates the auth store', async () => {
      const { useAuthStore } = await import('@/store/auth');
      expect(() => effectScope().run(() => useAuthStore())).not.toThrow();
   });

   it.each(['local', 'session'] as const)(
      'keeps %s table state in memory',
      async (stateStorage) => {
         const { useTableMeta } = await import('@/components/ui/custom-table/useTableMeta');
         const table = effectScope().run(() =>
            useTableMeta({
               stateStorage,
               stateKey: 'blocked',
               columns: [],
               rows: ref(10),
               getFilters: () => undefined,
               onChange: () => {}
            })
         );
         expect(table?.meta.value.rows).toBe(10);
      }
   );
});
