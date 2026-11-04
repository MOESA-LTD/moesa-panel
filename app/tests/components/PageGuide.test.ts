import '../setup/mockMain';
import PageGuide from '@/components/service-components/page-guide/PageGuide.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

const ROUTES = [
   'dashboard',
   'ops-project',
   'ops-purchase-order',
   'ops-shipment',
   'ops-incident',
   'ops-market'
];

const router = createRouter({
   history: createMemoryHistory(),
   routes: [
      { path: '/', component: { template: '<div />' } },
      ...ROUTES.map((name) => ({
         path: `/${name}`,
         name,
         meta: { label: `route.label.${name.replace(/-/g, '_')}` },
         component: { template: '<div />' }
      }))
   ]
});

let pinia: Pinia;

const mountGuide = async (focusTask?: string) => {
   useGuideStore().show('dashboard', focusTask);
   const wrapper = mount(PageGuide, {
      global: {
         plugins: [
            pinia,
            router,
            i18NPlugin,
            PrimeVue,
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ] as never,
         stubs: { teleport: true, CustomLink: { template: '<a><slot /></a>' } }
      }
   });
   await nextTick();
   return wrapper;
};

const DASHBOARD = 'guide.pages.dashboard.tasks';

describe('PageGuide', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));
   beforeEach(() => {
      pinia = createPinia();
      setActivePinia(pinia);
      ability.update([{ action: 'update', subject: 'incident' }]);
   });

   it('shows only the tasks the role may do', async () => {
      const text = (await mountGuide()).text();

      expect(text).toContain(i18n.t(`${DASHBOARD}.close_incident.title`));
      const steps = [1, 2, 3].map((n) =>
         text.indexOf(i18n.t(`${DASHBOARD}.close_incident.steps.${n}`))
      );
      expect(steps.every((at) => at >= 0)).toBe(true);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      expect(text).toContain(
         i18n.t('guide.panel.needs', {
            action: i18n.t('guide.actions.update'),
            subject: i18n.t('fields.incident')
         })
      );
      expect(text).not.toContain(i18n.t(`${DASHBOARD}.close_gates.title`));
   });

   it('opens on the focused task', async () => {
      const wrapper = await mountGuide('close_incident');
      expect(wrapper.findComponent({ name: 'Accordion' }).props('value')).toBe('close_incident');
   });

   it('does not block the page', async () => {
      const drawer = (await mountGuide()).findComponent({ name: 'Drawer' });
      expect(drawer.props('modal')).toBe(false);
      expect(drawer.props('position')).toBe('right');
   });
});
