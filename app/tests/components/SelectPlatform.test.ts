import SelectPlatform from '@/components/service-components/select-platform/SelectPlatform.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/customer', async () => {
   const { ref } = await import('vue');
   return { usePlatformOptions: () => ({ data: ref([]) }) };
});

describe('SelectPlatform', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('passes showClear to the select', () => {
      const mountSelect = (props: { showClear?: boolean }) =>
         mount(SelectPlatform, { props, global: { plugins: [i18NPlugin, PrimeVue] } });

      const cleared = mountSelect({ showClear: true });
      // A declared prop, not an attribute that happens to fall through to the root.
      expect(cleared.props('showClear')).toBe(true);
      expect(cleared.getComponent(Select).props('showClear')).toBe(true);
      expect(mountSelect({}).getComponent(Select).props('showClear')).toBe(false);
   });
});
