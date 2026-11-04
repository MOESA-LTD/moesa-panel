import AppConfigurator from '@/components/layout/AppConfigurator.vue';
import { PRIMARY_COLORS, SURFACES } from '@/lib/theme/palettes';
import en from '@/plugins/i18n/locales/en/index.json';
import { useThemeStore } from '@/store/theme';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import ToggleButton from 'primevue/togglebutton';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const replace = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ isSignedIn: ref(true) }) }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRouter: () => ({ replace })
}));

const mountConfigurator = async () => {
   const wrapper = mount(AppConfigurator, {
      global: {
         plugins: [i18NPlugin, PrimeVue],
         directives: { focustrap: {}, tooltip: {} },
         mocks: { $router: { replace } }
      }
   });
   await flushPromises();
   return wrapper;
};

describe('AppConfigurator', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      localStorage.clear();
      setActivePinia(createPinia());
   });

   it('renders a colour button per primary and surface colour', async () => {
      const wrapper = await mountConfigurator();
      expect(wrapper.findAll('.app-configurator__color-button')).toHaveLength(
         PRIMARY_COLORS.length + SURFACES.length
      );
   });

   it('renders one language select', async () => {
      const wrapper = await mountConfigurator();
      const section = wrapper.get('.app-configurator__language-section');
      expect(section.findAllComponents(Select)).toHaveLength(1);
   });

   it('renders the dark-mode and linked toggles in the legend', async () => {
      const wrapper = await mountConfigurator();
      const header = wrapper.get('.app-configurator__header');
      expect(header.findAllComponents(ToggleButton)).toHaveLength(2);
   });

   it('changes the surface colour from its button', async () => {
      const wrapper = await mountConfigurator();
      const surfaceButtons = wrapper
         .findAll('.app-configurator__color-button')
         .slice(PRIMARY_COLORS.length);
      expect(useThemeStore().profile.surface).not.toBe(SURFACES[0]!.name);

      await surfaceButtons[0]!.trigger('click');

      expect(useThemeStore().profile.surface).toBe(SURFACES[0]!.name);
   });
});
