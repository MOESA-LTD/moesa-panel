import '../setup/mockMain';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import Index from '@/views/pages/dashboard/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
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
