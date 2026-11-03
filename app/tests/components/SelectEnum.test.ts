import { PACKAGES } from '@/api/customer';
import SelectEnum from '@/components/service-components/select-enum/SelectEnum.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import Tooltip from 'primevue/tooltip';
import { beforeAll, describe, expect, it } from 'vitest';

type Props = InstanceType<typeof SelectEnum>['$props'];

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

   describe('glossary', () => {
      const mountGlossary = (props: Props) =>
         mount(SelectEnum, {
            props,
            global: { plugins: [i18NPlugin, PrimeVue], directives: { tooltip: Tooltip } }
         });
      const docProps: Props = {
         values: ['draft', 'signed'],
         i18nPrefix: 'ops.document.status',
         glossary: 'document_status'
      };

      it('adds the description to each option', () => {
         const select = mountGlossary(docProps).findComponent(Select);
         expect(select.props('options')?.[0]).toEqual({
            value: 'draft',
            label: i18n.t('ops.document.status.draft'),
            description: i18n.t('glossary.document_status.draft')
         });
         expect(i18n.t('glossary.document_status.draft')).not.toBe(
            'glossary.document_status.draft'
         );
      });

      it('shows an info icon with the description of the selected value', () => {
         const wrapper = mountGlossary({ ...docProps, modelValue: 'signed' });
         const icon = wrapper.find('[data-test="glossary-info"]');
         expect(icon.exists()).toBe(true);
         expect(icon.attributes('aria-label')).toBe(i18n.t('glossary.document_status.signed'));
         expect(wrapper.text()).toContain(i18n.t('ops.document.status.signed'));
      });

      it('shows no info icon without a selection or without a glossary', () => {
         expect(mountGlossary(docProps).find('[data-test="glossary-info"]').exists()).toBe(false);
         const plain = mountGlossary({
            values: ['draft', 'signed'],
            i18nPrefix: 'ops.document.status',
            modelValue: 'signed'
         });
         expect(plain.find('[data-test="glossary-info"]').exists()).toBe(false);
      });

      it('renders the descriptions under the labels when the list is open', async () => {
         const wrapper = mountGlossary(docProps);
         (wrapper.findComponent(Select).vm as unknown as { show: () => void }).show();
         await wrapper.vm.$nextTick();
         const html = document.body.innerHTML;
         expect(html).toContain(i18n.t('glossary.document_status.draft'));
         wrapper.unmount();
      });

      it('renders a MultiSelect for multiple, with the package descriptions', () => {
         const wrapper = mountGlossary({
            values: PACKAGES,
            glossary: 'package',
            multiple: true,
            modelValue: []
         });
         const multi = wrapper.findComponent(MultiSelect);
         expect(multi.exists()).toBe(true);
         expect(wrapper.findComponent(Select).exists()).toBe(false);
         expect(multi.props('options')?.[1]).toEqual({
            value: 'A1',
            label: 'A1',
            description: i18n.t('glossary.package.A1')
         });
      });
   });
});
