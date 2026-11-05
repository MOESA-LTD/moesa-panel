import '../setup/mockMain';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import Index from '@/views/pages/dashboard/Index.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
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

beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => setActivePinia(createPinia()));
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
