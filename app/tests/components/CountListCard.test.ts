import CountListCard from '@/components/service-components/dashboard/CountListCard.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mountCard = (props: {
   count: number;
   empty?: boolean;
   labels?: string[];
   guideTask?: string;
}) =>
   mount(CountListCard, {
      props: {
         title: 'Market matrix: live',
         icon: 'pi pi-table',
         count: props.count,
         ...(props.empty === undefined ? {} : { empty: props.empty }),
         ...(props.guideTask === undefined ? {} : { guideTask: props.guideTask }),
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

describe('CountListCard guide link', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => setActivePinia(createPinia()));

   const guideButton = (wrapper: ReturnType<typeof mountCard>) =>
      wrapper.findAll('button').find((b) => b.text() === i18n.t('guide.panel.close_card'));

   it('links a box to its guide', async () => {
      const show = vi.spyOn(useGuideStore(), 'show');
      const wrapper = mountCard({ count: 1, labels: ['THO'], guideTask: 'close_gates' });

      await guideButton(wrapper)!.trigger('click');

      expect(show).toHaveBeenCalledWith('dashboard', 'close_gates');
   });

   it('has no guide link without a task', () => {
      expect(guideButton(mountCard({ count: 1, labels: ['THO'] }))).toBeUndefined();
   });
});
