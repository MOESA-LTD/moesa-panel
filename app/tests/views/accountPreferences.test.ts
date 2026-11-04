import { PRIMARY_COLORS } from '@/lib/theme/palettes';
import en from '@/plugins/i18n/locales/en/index.json';
import { useThemeStore } from '@/store/theme';
import Preferences from '@/views/pages/account/sections/Preferences.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToggleButton from 'primevue/togglebutton';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const replace = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ isSignedIn: ref(true) }) }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRouter: () => ({ replace })
}));

const mountPreferences = async () => {
   const wrapper = mount(Preferences, {
      attachTo: document.body,
      global: {
         plugins: [i18NPlugin, PrimeVue],
         directives: { focustrap: {}, tooltip: {} },
         mocks: { $router: { replace } }
      }
   });
   await flushPromises();
   return wrapper;
};

describe('account Preferences section', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      localStorage.clear();
      setActivePinia(createPinia());
   });
   afterEach(() => {
      document.body.innerHTML = '';
   });

   it('shows the language and appearance forms and where the settings are kept', async () => {
      const wrapper = await mountPreferences();
      const text = wrapper.text();
      expect(text).toContain(i18n.t('account.preferences.language_legend'));
      expect(text).toContain(i18n.t('account.preferences.appearance_legend'));
      expect(text).toContain(i18n.t('account.preferences.stored_locally'));
   });

   it('switches the language through the URL', async () => {
      const wrapper = await mountPreferences();

      await wrapper
         .get('.app-configurator__language-section [data-pc-name="select"]')
         .trigger('click');
      await flushPromises();
      const turkish = document.body.querySelector(
         `[role="option"][aria-label="${i18n.t('app_config.language.option.turkish')}"]`
      );
      // PrimeVue's Select picks an option on mousedown.
      turkish!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flushPromises();

      expect(replace).toHaveBeenCalledWith({ params: { locale: 'tr' } });
      wrapper.unmount();
   });

   it('changes the primary colour from its button', async () => {
      const wrapper = await mountPreferences();
      const target = PRIMARY_COLORS.find(({ name }) => name !== useThemeStore().profile.primary)!;

      await wrapper.get(`.app-configurator__color-button[title="${target.name}"]`).trigger('click');

      expect(useThemeStore().profile.primary).toBe(target.name);
      wrapper.unmount();
   });

   it('toggles dark mode from the appearance legend', async () => {
      const toggleDark = vi.spyOn(useThemeStore(), 'toggleDark');
      const wrapper = await mountPreferences();

      await wrapper.findAllComponents(ToggleButton)[0]!.get('button').trigger('click');

      expect(toggleDark).toHaveBeenCalledOnce();
      wrapper.unmount();
   });
});
