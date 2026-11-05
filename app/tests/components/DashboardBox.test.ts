import '../setup/mockMain';
import DashboardBox from '@/components/service-components/dashboard/DashboardBox.vue';
import {
   DASHBOARD_AREA_CLASSES,
   DASHBOARD_EDITING,
   type BoxSize,
   type DashboardBoxDef,
   type DashboardRow
} from '@/constants/dashboard';
import en from '@/plugins/i18n/locales/en/index.json';
import { useGuideStore } from '@/store/guide';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';

const navigate = vi.fn();
const CustomLink = defineComponent({
   props: ['to'],
   setup: (props) => ({ navigate, toJson: computed(() => JSON.stringify(props.to)) }),
   template: '<a :data-to="toJson"><slot :navigate="navigate" /></a>'
});
const box = (overrides: Partial<DashboardBoxDef> = {}): DashboardBoxDef => ({
   id: 'tasks_overdue',
   title: 'dashboard.ops.tasks_overdue',
   icon: 'pi pi-clock',
   area: 'projects',
   size: 'narrow',
   permission: 'project_task',
   component: {},
   ...overrides
});
const rowsOf = (n: number): DashboardRow[] =>
   Array.from({ length: n }, (_, i) => ({ code: `P${i}`, to: { name: 'dashboard' } }));
const mountBox = (
   props: {
      count: number;
      box?: DashboardBoxDef;
      size?: BoxSize;
      rows?: DashboardRow[];
      empty?: boolean;
   },
   options: { editing?: boolean; slot?: string } = {}
) =>
   mount(DashboardBox, {
      props: { box: box(), size: 'narrow', ...props },
      slots: options.slot ? { default: options.slot } : {},
      global: {
         plugins: [i18NPlugin, PrimeVue],
         provide: { [DASHBOARD_EDITING]: ref(options.editing ?? false) },
         stubs: { CustomLink }
      }
   });
const buttonByText = (w: VueWrapper, text: string) =>
   w.findAll('button').find((b) => b.text() === text);

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   navigate.mockReset();
});

it('caps rows at four when narrow and eight when wide, the badge keeps the full count', () => {
   expect(mountBox({ size: 'narrow', count: 10, rows: rowsOf(10) }).findAll('li')).toHaveLength(4);
   const wide = mountBox({ size: 'wide', count: 10, rows: rowsOf(10) });
   expect(wide.findAll('li')).toHaveLength(8);
   expect(wide.get('[data-test="box-badge"]').text()).toBe('10');
});
it('shows the code bold, the context grey and the tag', () => {
   const li = mountBox({
      count: 1,
      rows: [
         {
            code: 'PRJ-1',
            context: 'G2 · THO',
            tag: '3 days late',
            urgent: true,
            to: { name: 'dashboard' }
         }
      ]
   }).get('li');
   expect(li.get('.font-semibold').text()).toBe('PRJ-1');
   expect(li.get('.text-muted-color').text()).toBe('G2 · THO');
   expect(li.text()).toContain('3 days late');
});
it('says None at zero count, and lists rows at zero count when empty is false', () => {
   const none = mountBox({ count: 0, rows: rowsOf(2) });
   expect(none.text()).toContain(i18n.t('dashboard.ops.none'));
   expect(none.findAll('li')).toHaveLength(0);
   expect(mountBox({ count: 0, empty: false, rows: rowsOf(2) }).findAll('li')).toHaveLength(2);
});
it('colours the icon and the badge by area', () => {
   const w = mountBox({ count: 1, box: box({ area: 'products' }) });
   const { icon, badge } = DASHBOARD_AREA_CLASSES.products;
   expect(w.get('[data-test="box-icon"]').classes()).toEqual(
      expect.arrayContaining(icon.split(' '))
   );
   expect(w.get('[data-test="box-badge"]').classes()).toEqual(
      expect.arrayContaining(badge.split(' '))
   );
});
it('shows "Open all" only when the box has a route, and it navigates', async () => {
   const w = mountBox({ count: 1, box: box({ to: { name: 'ops-project-list' } }) });
   const openAll = buttonByText(w, i18n.t('dashboard.layout.open_all'))!;
   expect(openAll.element.closest('a')!.getAttribute('data-to')).toContain('ops-project-list');
   await openAll.trigger('click');
   expect(navigate).toHaveBeenCalledOnce();
   expect(
      buttonByText(mountBox({ count: 1 }), i18n.t('dashboard.layout.open_all'))
   ).toBeUndefined();
});
it('links to the guide task when the box has one', async () => {
   const show = vi.spyOn(useGuideStore(), 'show');
   await buttonByText(
      mountBox({ count: 1, box: box({ guideTask: 'close_tasks' }) }),
      i18n.t('guide.panel.close_card')
   )!.trigger('click');
   expect(show).toHaveBeenCalledWith('dashboard', 'close_tasks');
   expect(buttonByText(mountBox({ count: 1 }), i18n.t('guide.panel.close_card'))).toBeUndefined();
});
it("runs the row's onSelect before navigating", async () => {
   const calls: string[] = [];
   navigate.mockImplementation(() => calls.push('navigate'));
   await mountBox({
      count: 1,
      rows: [{ code: 'THO', to: { name: 'dashboard' }, onSelect: () => calls.push('select') }]
   })
      .get('li button')
      .trigger('click');
   expect(calls).toEqual(['select', 'navigate']);
});
it('renders the slot with the size limit instead of rows', () => {
   const w = mountBox(
      { count: 3, size: 'wide', rows: rowsOf(3) },
      { slot: '<template #default="{ limit }"><p>{{ limit }}</p></template>' }
   );
   expect(w.get('p').text()).toBe('8');
   expect(w.findAll('li')).toHaveLength(0);
});
it('makes every link inert while the dashboard is edited', async () => {
   const onSelect = vi.fn();
   const w = mountBox(
      {
         count: 1,
         box: box({ to: { name: 'ops-project-list' }, guideTask: 'close_tasks' }),
         rows: [{ code: 'THO', to: { name: 'dashboard' }, onSelect }]
      },
      { editing: true }
   );
   expect(w.findAll('a')).toHaveLength(0);
   expect(w.get('li [aria-disabled="true"]').text()).toContain('THO');
   await w.get('li [aria-disabled="true"]').trigger('click');
   expect(onSelect).not.toHaveBeenCalled();
   expect(navigate).not.toHaveBeenCalled();
   expect(
      buttonByText(w, i18n.t('dashboard.layout.open_all'))!.attributes('disabled')
   ).toBeDefined();
   expect(buttonByText(w, i18n.t('guide.panel.close_card'))!.attributes('disabled')).toBeDefined();
});
