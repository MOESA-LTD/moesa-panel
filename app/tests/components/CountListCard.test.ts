import CountListCard from '@/components/service-components/dashboard/CountListCard.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it } from 'vitest';

const mountCard = (props: { count: number; empty?: boolean; labels?: string[] }) =>
   mount(CountListCard, {
      props: {
         title: 'Market matrix: live',
         icon: 'pi pi-table',
         count: props.count,
         ...(props.empty === undefined ? {} : { empty: props.empty }),
         items: (props.labels ?? []).map((label) => ({ label, to: { name: 'dashboard' } }))
      },
      global: {
         plugins: [i18NPlugin, PrimeVue],
         stubs: { CustomLink: { template: '<a><slot :navigate="() => {}" /></a>' } }
      }
   });

describe('CountListCard empty state', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   it('lists its rows at a zero count when it is not empty', () => {
      const wrapper = mountCard({ count: 0, empty: false, labels: ['THO', 'ZZZ'] });
      expect(wrapper.findAll('li').map((row) => row.text())).toEqual(['THO', 'ZZZ']);
      expect(wrapper.text()).not.toContain(i18n.t('dashboard.ops.none'));
   });

   it('says there is none at a zero count by default', () => {
      const wrapper = mountCard({ count: 0, labels: ['THO'] });
      expect(wrapper.text()).toContain(i18n.t('dashboard.ops.none'));
      expect(wrapper.findAll('li')).toHaveLength(0);
   });
});
