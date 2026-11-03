import SelectEnum from '@/components/service-components/select-enum/SelectEnum.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import { beforeAll, describe, expect, it } from 'vitest';

describe('SelectEnum', () => {
   // The app loads its messages at start-up; the English ones are enough here.
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('offers each value with its translated label', () => {
      const wrapper = mount(SelectEnum, {
         props: {
            values: ['draft', 'signed'],
            i18nPrefix: 'ops.document.status',
            modelValue: 'signed'
         },
         global: { plugins: [i18NPlugin, PrimeVue] }
      });

      const select = wrapper.findComponent(Select);
      expect(select.props('options')).toEqual([
         { value: 'draft', label: i18n.t('ops.document.status.draft') },
         { value: 'signed', label: i18n.t('ops.document.status.signed') }
      ]);
      // Labels are real translations, not the keys.
      expect(select.props('options')?.[0]?.label).not.toBe('ops.document.status.draft');
      expect(select.props('optionValue')).toBe('value');
      expect(select.props('optionLabel')).toBe('label');
      expect(select.props('modelValue')).toBe('signed');
   });
});
