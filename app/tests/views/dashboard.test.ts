import '../setup/mockMain';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import { useDashboardLayout } from '@/store/dashboardLayout';
import DashboardBoxEditBar from '@/views/pages/dashboard/DashboardBoxEditBar.vue';
import Index from '@/views/pages/dashboard/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref, type Ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const ui = vi.hoisted(() => ({ toast: vi.fn(), wideScreen: null as unknown as Ref<boolean> }));
vi.mock('@vueuse/core', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@vueuse/core')>()),
   useMediaQuery: () => ui.wideScreen
}));
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: ui.toast }) }));
vi.mock('@/composables/useDialogRef', async () => {
   const { ref } = await import('vue');
   return { useDialogRef: () => ref(null) };
});
vi.mock('@/constants/dashboard', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@/constants/dashboard')>();
   const { defineComponent, inject, ref } = await import('vue');
   const Stub = defineComponent({
      props: ['box', 'size'],
      setup: () => ({ editing: inject(actual.DASHBOARD_EDITING, ref(false)) }),
      template: '<div data-test="box" :data-editing="String(editing)">{{ box.id }}:{{ size }}</div>'
   });
   const boxes = actual.DASHBOARD_BOXES.map((b) => ({ ...b, component: Stub }));
   return {
      ...actual,
      DASHBOARD_BOXES: boxes,
      boxById: (id: string) => boxes.find((b) => b.id === id)!
   };
});

const allow = (...subjects: string[]) =>
   ability.update(subjects.map((subject) => ({ action: 'select', subject })));
const mountDashboard = async () => {
   document.body.innerHTML = '<span id="page-toolbar"></span>';
   const w = mount(Index, {
      attachTo: document.body,
      global: {
         plugins: [
            i18NPlugin,
            PrimeVue,
            ToastService,
            [abilitiesPlugin, ability, { useGlobalProperties: true }]
         ]
      }
   });
   await flushPromises();
   return w;
};
const boxIds = (w: VueWrapper) => w.findAll('[data-test="box"]').map((b) => b.text().split(':')[0]);

const auth = vi.hoisted(() => ({
   value: null as unknown as { user: { id: string } | null; accessReady: () => Promise<void> }
}));
vi.mock('@/store/auth', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/store/auth')>()),
   useAuthStore: () => auth.value
}));
const stored = new Map<string, string>();
const store = (userId: string, layout: unknown) =>
   stored.set(`dashboard.layout.${userId}`, JSON.stringify(layout));

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   ui.wideScreen = ref(true);
   ui.toast.mockClear();
   setActivePinia(createPinia());
   auth.value = reactive({ user: { id: 'u1' }, accessReady: () => Promise.resolve() });
   stored.clear();
   vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: vi.fn((k: string, v: string) => void stored.set(k, v)),
      removeItem: vi.fn()
   });
});
afterEach(() => {
   ability.update([]);
   vi.unstubAllGlobals();
});

it('shows the permitted boxes in the registry order', async () => {
   allow('project_gate', 'shipment');
   expect(boxIds(await mountDashboard())).toEqual([
      'gates_team',
      'gates_management',
      'gates_customer',
      'shipments_in_transit',
      'shipments_late'
   ]);
});
it('no longer shows the branch, user and role statistics', async () => {
   allow('tenant', 'user', 'role');
   const w = await mountDashboard();
   expect(boxIds(w)).toEqual([]);
   expect(w.text()).not.toContain('Branches');
});

it('shows the stored order, without hidden boxes, wide ones across two columns', async () => {
   allow('project_gate', 'shipment');
   store('u1', {
      order: ['shipments_late', 'gates_team'],
      hidden: ['gates_customer'],
      sizes: { shipments_late: 'wide' }
   });
   const w = await mountDashboard();
   expect(boxIds(w)).toEqual([
      'shipments_late',
      'gates_team',
      'gates_management',
      'shipments_in_transit'
   ]);
   expect(w.get('[data-box-id="shipments_late"]').classes()).toContain('md:col-span-2');
   expect(w.get('[data-box-id="gates_team"]').classes()).not.toContain('md:col-span-2');
   expect(w.get('[data-box-id="shipments_late"]').text()).toBe('shipments_late:wide');
});
it("loads the new user's layout when the account changes", async () => {
   allow('project_gate');
   store('u2', { order: ['gates_customer'] });
   const w = await mountDashboard();
   expect(boxIds(w)[0]).toBe('gates_team');
   auth.value.user = { id: 'u2' };
   await flushPromises();
   expect(boxIds(w)[0]).toBe('gates_customer');
});
it('says when every box is hidden', async () => {
   allow('project_gate');
   store('u1', { order: [], hidden: ['gates_team', 'gates_management', 'gates_customer'] });
   expect((await mountDashboard()).text()).toContain(i18n.t('dashboard.layout.all_hidden'));
});
it('says the role has no box only once the access is loaded', async () => {
   let resolve!: () => void;
   auth.value.accessReady = () => new Promise<void>((r) => (resolve = r));
   const w = await mountDashboard();
   expect(w.text()).not.toContain(i18n.t('dashboard.layout.no_boxes'));
   expect(boxIds(w)).toEqual([]);
   resolve();
   await flushPromises();
   expect(w.text()).toContain(i18n.t('dashboard.layout.no_boxes'));
});

const t = (key: string) => i18n.t(key);
const button = (label: string) =>
   [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as
      | HTMLButtonElement
      | undefined;
const click = async (el: Element | undefined) => {
   expect(el).toBeDefined();
   (el as HTMLElement).click();
   await flushPromises();
};
const inBox = (w: VueWrapper, id: string) => w.get(`[data-box-id="${id}"]`);
const byLabel = (w: VueWrapper, id: string, label: string) =>
   inBox(w, id).get(`button[aria-label="${label}"]`).element;
const menuItem = (w: VueWrapper, id: string, label: string) =>
   inBox(w, id)
      .findAll('[role="menuitem"]')
      .find((i) => i.text() === label)!;
const startEditing = async () => {
   allow('project_gate', 'purchase_order');
   const w = await mountDashboard();
   await click(button(t('dashboard.layout.edit')));
   return w;
};

it('opens the edit toolbar from Edit, and only from md up', async () => {
   const w = await startEditing();
   for (const label of [
      'dashboard.layout.save',
      'dashboard.layout.discard',
      'dashboard.layout.reset'
   ])
      expect(button(t(label))).toBeDefined();
   expect(w.findAllComponents(DashboardBoxEditBar)).toHaveLength(boxIds(w).length);
   ui.wideScreen.value = false;
   await flushPromises();
   expect(button(t('dashboard.layout.edit'))).toBeUndefined();
   expect(button(t('dashboard.layout.save'))).toBeUndefined();
   expect(w.findAllComponents(DashboardBoxEditBar)).toHaveLength(0);
});
it('tells the boxes they are being edited, so their links are inert', async () => {
   const w = await startEditing();
   expect(
      w.findAll('[data-test="box"]').every((b) => b.attributes('data-editing') === 'true')
   ).toBe(true);
   await click(button(t('dashboard.layout.discard')));
   expect(
      w.findAll('[data-test="box"]').every((b) => b.attributes('data-editing') === 'false')
   ).toBe(true);
});
it('hides a box into the strip and brings it back at the end', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'gates_team', t('dashboard.layout.hide')));
   expect(boxIds(w)).not.toContain('gates_team');
   await click(button(t('dashboard.ops.gates_team')));
   expect(boxIds(w).at(-1)).toBe('gates_team');
});
it('switches a box to wide', async () => {
   const w = await startEditing();
   await click(
      inBox(w, 'po_action')
         .findAll('button')
         .find((b) => b.text() === t('dashboard.layout.size_wide'))!.element
   );
   expect(inBox(w, 'po_action').classes()).toContain('md:col-span-2');
   expect(inBox(w, 'po_action').get('[data-test="box"]').text()).toBe('po_action:wide');
});
it('moves a box with the menu, Move left disabled on the first box', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'gates_management', t('dashboard.layout.menu')));
   await click(
      menuItem(w, 'gates_management', t('dashboard.layout.move_left')).get(
         'a, .p-menu-item-content'
      ).element
   );
   expect(boxIds(w).slice(0, 2)).toEqual(['gates_management', 'gates_team']);
   await click(byLabel(w, 'gates_management', t('dashboard.layout.menu')));
   expect(
      menuItem(w, 'gates_management', t('dashboard.layout.move_left')).attributes('aria-disabled')
   ).toBe('true');
});
it('saves the layout and keeps it after a remount', async () => {
   const w = await startEditing();
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.save')));
   expect(JSON.parse(stored.get('dashboard.layout.u1')!).hidden).toEqual(['po_action']);
   expect(button(t('dashboard.layout.save'))).toBeUndefined();
   w.unmount();
   setActivePinia(createPinia());
   expect(boxIds(await mountDashboard())).not.toContain('po_action');
});
it('discard reverts to the saved layout', async () => {
   const w = await startEditing();
   const before = boxIds(w);
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.discard')));
   expect(boxIds(w)).toEqual(before);
   expect(stored.size).toBe(0);
});
it('does not offer a box the user cannot see in the strip', async () => {
   store('u1', { order: [], hidden: ['incidents_open'] });
   const w = await startEditing();
   expect(w.text()).toContain(t('dashboard.layout.hidden_empty'));
   expect(button(t('dashboard.ops.incidents_open'))).toBeUndefined();
});
it('warns when the browser refuses to save', async () => {
   const w = await startEditing();
   vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
         throw new Error('blocked');
      },
      removeItem: vi.fn()
   });
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   await click(button(t('dashboard.layout.save')));
   expect(ui.toast).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn', summary: t('dashboard.layout.not_persisted') })
   );
   expect(boxIds(w)).not.toContain('po_action');
});
it('drops an unsaved draft when the dashboard is left or the screen gets narrow', async () => {
   let w = await startEditing();
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   w.unmount();
   expect(useDashboardLayout().editing).toBe(false);
   expect(useDashboardLayout().layout.order).toContain('po_action');
   w = await mountDashboard();
   await click(button(t('dashboard.layout.edit')));
   await click(byLabel(w, 'po_action', t('dashboard.layout.hide')));
   ui.wideScreen.value = false;
   await flushPromises();
   ui.wideScreen.value = true;
   await flushPromises();
   expect(boxIds(w)).toContain('po_action');
   expect(stored.size).toBe(0);
});
