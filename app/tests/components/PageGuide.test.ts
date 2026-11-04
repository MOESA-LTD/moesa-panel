import '../setup/mockMain';
import PageGuide from '@/components/service-components/page-guide/PageGuide.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import { stripTerms } from '@/constants/terms';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const mountPanel = async () => {
   const wrapper = mount(PageGuide, {
      global: {
         plugins: [
            pinia,
            router,
            i18NPlugin,
            PrimeVue,
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ] as never,
         stubs: {
            teleport: true,
            CustomLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' }
         }
      }
   });
   await nextTick();
   await nextTick();
   return wrapper;
};

const mountGuide = async (focusTask?: string) => {
   useGuideStore().show('dashboard', focusTask);
   return mountPanel();
};

const footerTo = (wrapper: Awaited<ReturnType<typeof mountPanel>>) => {
   const links = wrapper.findAll('a[data-to]');
   return JSON.parse(links[links.length - 1]!.attributes('data-to')!) as Record<string, unknown>;
};

const DASHBOARD = 'guide.pages.dashboard.tasks';

describe('PageGuide', () => {
   beforeEach(() => {
      i18n.setLocaleMessage('en', structuredClone(en));
      Element.prototype.scrollIntoView = vi.fn();
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

   it("lists the page's terms with their short line", async () => {
      useGuideStore().show('purchase_order');
      const wrapper = await mountPanel();
      expect(wrapper.find('#guide-term-S09').exists()).toBe(true);
      expect(wrapper.text()).toContain(stripTerms(i18n.t('terms.S09.short')));
      expect(wrapper.find('#guide-term-PI').exists()).toBe(true);
   });

   it('opens on a focused term', async () => {
      const store = useGuideStore();
      store.followRoute('purchase_order');
      store.showTerm('PSI');
      const wrapper = await mountPanel();
      expect(wrapper.find('#guide-term-PSI').attributes('aria-current')).toBe('true');
      expect(wrapper.text()).toContain(stripTerms(i18n.t('terms.PSI.long')));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
   });

   it('focuses a glossary row of the page', async () => {
      const store = useGuideStore();
      store.followRoute('dashboard');
      store.showTerm('G1');
      const wrapper = await mountPanel();
      const dt = wrapper.find('#guide-term-G1');
      expect(dt.element.tagName).toBe('DT');
      expect(dt.text()).toBe(i18n.t('ops.project.gate.G1'));
      expect(dt.attributes('aria-current')).toBe('true');
   });

   it('shows a term on a route without a guide', async () => {
      const store = useGuideStore();
      store.followRoute(null);
      store.showTerm('CMR');
      const wrapper = await mountPanel();
      expect(wrapper.text()).toContain(stripTerms(i18n.t('terms.CMR.short')));
      expect(wrapper.text()).not.toContain(i18n.t('guide.panel.purpose'));
   });

   it('links to the system guide on the focused term', async () => {
      const store = useGuideStore();
      store.showTerm('S09');
      const wrapper = await mountPanel();
      expect(footerTo(wrapper)).toEqual({ name: 'guide', hash: '#term-S09' });
      store.show('dashboard');
      await nextTick();
      expect(footerTo(wrapper)).toEqual({ name: 'guide' });
   });

   it('renders the guide copy with its terms', async () => {
      try {
         i18n.mergeLocaleMessage('en', {
            guide: {
               pages: {
                  dashboard: {
                     tasks: {
                        close_incident: {
                           title: 'Close [[S1]]',
                           steps: { 1: 'Open the incident; [[S1]] first.' }
                        }
                     }
                  }
               }
            }
         });
         const wrapper = await mountGuide('close_incident');
         const panel = wrapper
            .findAllComponents({ name: 'AccordionPanel' })
            .find((p) => p.props('value') === 'close_incident')!;
         const step = panel.find('ol abbr[data-term="S1"]');
         expect(step.attributes('role')).toBe('button');
         const header = panel
            .findComponent({ name: 'AccordionHeader' })
            .find('abbr[data-term="S1"]');
         expect(header.exists()).toBe(true);
         expect(header.attributes('role')).toBeUndefined();
         expect(wrapper.text()).not.toContain('[[');
      } finally {
         i18n.setLocaleMessage('en', structuredClone(en));
      }
      expect(i18n.t(`${DASHBOARD}.close_incident.title`)).toBe(
         en.guide.pages.dashboard.tasks.close_incident.title
      );
      expect(i18n.t(`${DASHBOARD}.close_incident.steps.1`)).toBe(
         en.guide.pages.dashboard.tasks.close_incident.steps['1']
      );
   });
});
