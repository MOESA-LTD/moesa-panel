import '../setup/mockMain';
import { toIncidentDeadlineFormValues, toIncidentLogFormValues } from '@/api/incident';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import DeadlineUpsert from '@/views/pages/ops/incident/DeadlineUpsert.vue';
import LogUpsert from '@/views/pages/ops/incident/LogUpsert.vue';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, Suspense, type Component } from 'vue';

// A new log line or deadline goes to its incident's tenant, which may be another of the branches
// shown than the active one. The incident query and the form are stand-ins.
const api = vi.hoisted(() => ({
   values: null as unknown,
   options: undefined as undefined | { toPayload: (data: unknown) => Record<string, unknown> }
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/api/incident', async (importOriginal) => {
   const { ref } = await import('vue');
   const original = await importOriginal<typeof import('@/api/incident')>();
   return {
      ...original,
      incidentResource: {
         ...original.incidentResource,
         useOne: () => ({ data: ref({ id: 'i1', tenant_id: 't2' }) })
      }
   };
});
vi.mock('@/composables/useUpsertForm', async () => {
   const { ref } = await import('vue');
   return {
      useUpsertForm: (options: typeof api.options) => {
         api.options = options;
         return {
            values: ref(api.values),
            errors: ref({}),
            isDirty: ref(false),
            isSubmitting: ref(false),
            readonly: ref(false),
            reset: vi.fn(),
            save: vi.fn(),
            ready: Promise.resolve(),
            draft: {}
         };
      }
   };
});

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});

const mountDialog = async (page: Component, props: Record<string, unknown>) => {
   const wrapper = mount(
      defineComponent({
         render: () => h(Suspense, null, { default: () => h(page, props) })
      }),
      {
         global: {
            plugins: [
               i18NPlugin,
               PrimeVue,
               [abilitiesPlugin, ability, { useGlobalProperties: true }]
            ],
            directives: { focustrap: {}, tooltip: {} },
            stubs: { FormBox: Slot, FormField: Slot }
         }
      }
   );
   await flushPromises();
   return wrapper;
};

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.options = undefined;
});

describe('incident log and deadline dialogs', () => {
   it("adds a log line to the incident's tenant", async () => {
      api.values = toIncidentLogFormValues();
      await mountDialog(LogUpsert, { incidentId: 'i1' });

      const payload = api.options!.toPayload({
         logged_at: new Date('2026-11-04T10:00:00Z'),
         note: 'Called the carrier',
         customer_approved: false
      });
      expect(payload).toMatchObject({ incident_id: 'i1', tenant_id: 't2' });
   });

   it("adds a deadline to the incident's tenant", async () => {
      api.values = toIncidentDeadlineFormValues();
      await mountDialog(DeadlineUpsert, { incidentId: 'i1' });

      const payload = api.options!.toPayload({ kind: 'carrier_claim' });
      expect(payload).toMatchObject({ incident_id: 'i1', tenant_id: 't2' });
   });

   it('leaves an edited line in its own tenant', async () => {
      api.values = toIncidentLogFormValues();
      await mountDialog(LogUpsert, { id: 'l1' });

      const payload = api.options!.toPayload({
         id: 'l1',
         incident_id: 'i1',
         logged_at: new Date('2026-11-04T10:00:00Z'),
         note: 'Called the carrier',
         customer_approved: false
      });
      expect(payload).not.toHaveProperty('tenant_id');
   });
});
