import '../setup/mockMain';
import { toIncidentFormValues, type IncidentCard as IncidentRow } from '@/api/incident';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import IncidentCard from '@/views/pages/ops/incident/IncidentCard.vue';
import Closure from '@/views/pages/ops/incident/tabs/Closure.vue';
import General from '@/views/pages/ops/incident/tabs/General.vue';
import Log from '@/views/pages/ops/incident/tabs/Log.vue';
import {
   INCIDENT_FORM,
   INCIDENT_OVERVIEW,
   tabForField
} from '@/views/pages/ops/incident/useIncidentForm';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense } from 'vue';

// The card's form is useUpsertForm: a stand-in holds the incident it would load, so what the
// incident card adds (tabs, hints, locks) is what is checked.
const api = vi.hoisted(() => ({ row: null as unknown }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/customerFilter', () => ({ useCustomerFilter: () => ({ customerId: null }) }));
vi.mock('@/api/project', async (importOriginal) => {
   const { computed } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/project')>()),
      useMemberOptions: () => computed(() => [])
   };
});
vi.mock('@/api/incident', async (importOriginal) => {
   const { computed, ref } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/incident')>()),
      useIncidentOverview: () => ({ data: ref(null) }),
      useIncidentEntityOptions: () => computed(() => []),
      useSetIncidentStatus: () => ({ mutateAsync: vi.fn() })
   };
});
vi.mock('@/views/pages/ops/incident/useIncidentForm', async (importOriginal) => {
   const { ref } = await import('vue');
   const original =
      await importOriginal<typeof import('@/views/pages/ops/incident/useIncidentForm')>();
   return {
      ...original,
      useIncidentForm: () => ({
         values: ref({}),
         errors: ref({}),
         isDirty: ref(false),
         isSubmitting: ref(false),
         readonly: ref(false),
         reset: () => {},
         save: () => Promise.resolve(),
         ready: Promise.resolve(),
         draft: {},
         row: ref(api.row)
      })
   };
});

const I1 = '00000000-0000-4000-8000-000000000011';

const incident = (values: Partial<IncidentRow> = {}) =>
   ({
      id: I1,
      tenant_id: 't1',
      code: 'OL-THO-2026-001',
      customer_id: '00000000-0000-4000-8000-000000000001',
      customer: { code: 'THO', display_name: 'Thomas' },
      family: 'ol',
      severity: 's2',
      status: 'open',
      title: 'Pallets short',
      what_happened: 'Two pallets missing',
      affected_parties: [],
      incident_log: [],
      incident_deadline: [],
      project_gate: [],
      ...values
   }) as unknown as IncidentRow;

/** The card's form as the tabs inject it: values from the row, or a new incident's empty ones. */
const standInForm = (row: IncidentRow | null, values: Record<string, unknown> = {}) => ({
   values: ref({ ...toIncidentFormValues(row), ...values }),
   errors: ref({}),
   isDirty: ref(false),
   isSubmitting: ref(false),
   readonly: ref(false),
   reset: vi.fn(),
   submit: vi.fn(),
   draft: {},
   row: ref(row)
});

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});
const Stub = (name: string) =>
   defineComponent({ name, props: ['modelValue'], setup: () => () => h('span') });
const CustomLink = defineComponent({
   props: ['to'],
   setup:
      (props, { slots }) =>
      () =>
         h(
            'span',
            { 'data-link': props.to.name, 'data-query': JSON.stringify(props.to.query ?? {}) },
            slots.default?.({ navigate: () => {} })
         )
});

const plugins = () => [
   i18NPlugin,
   PrimeVue,
   ConfirmationService,
   ToastService,
   [abilitiesPlugin, ability, { useGlobalProperties: true }] as const
];

const mountTab = (
   component: typeof General | typeof Log | typeof Closure,
   form: ReturnType<typeof standInForm>,
   realFields = false
) =>
   mount(component, {
      global: {
         plugins: plugins() as never,
         provide: {
            [INCIDENT_FORM as symbol]: form,
            [INCIDENT_OVERVIEW as symbol]: ref(null)
         },
         directives: { focustrap: {}, tooltip: realFields ? Tooltip : {} },
         stubs: {
            FormBox: Slot,
            ...(realFields ? {} : { FormField: Slot }),
            SelectCustomer: Stub('SelectCustomer'),
            CustomLink,
            teleport: true
         }
      }
   });

const selectOf = (wrapper: VueWrapper, field: string) =>
   wrapper
      .findAllComponents({ name: 'Select' })
      .find((select) => select.attributes('data-field') === field)!;

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
});

describe('incident card', () => {
   it('routes closure fields to the closure tab', () => {
      expect(tabForField('preventive_action')).toBe('closure');
      expect(tabForField('severity')).toBe('general');
   });

   it("offers the family's Y10 cards", () => {
      const wrapper = mountTab(General, standInForm(null, { family: 'ou' }));
      const options = selectOf(wrapper, 'incident_type').props('options') as { value: string }[];

      expect(options.map(({ value }) => value)).toEqual([
         'OU-01',
         'OU-02',
         'OU-03',
         'OU-04',
         'OU-05',
         'OU-06'
      ]);
   });

   it('explains Y10 at the incident type', () => {
      const general = mountTab(General, standInForm(null), true);
      const label = general.get(`label[title="${i18n.t('ops.incident.fields.incident_type')}"]`);
      expect(label.find('abbr[data-term="Y10"]').exists()).toBe(true);

      const closure = mountTab(Closure, standInForm(null));
      const hint = closure.get('[data-test="preventive-hint"]');
      expect(hint.find('abbr[data-term="S17"]').exists()).toBe(true);
      expect(hint.text()).not.toContain('[[');
   });

   it('waits for the entity type', () => {
      const wrapper = mountTab(General, standInForm(null, { entity_type: null }));

      expect(selectOf(wrapper, 'entity_id').props('disabled')).toBe(true);
   });

   it('locks the log of a closed incident', () => {
      const closed = mountTab(Log, standInForm(incident({ status: 'closed' })));
      expect(closed.find('[data-link="ops-incident-log-add"]').exists()).toBe(false);

      const open = mountTab(
         Log,
         standInForm(
            incident({
               incident_log: [
                  {
                     id: 'l1',
                     incident_id: I1,
                     logged_at: '2026-11-04T09:00:00Z',
                     note: 'Asked the carrier',
                     cost_amount: 120,
                     cost_currency: 'EUR',
                     cost_payer: 'customer',
                     customer_approved: false
                  }
               ] as IncidentRow['incident_log']
            })
         )
      );
      expect(open.find('[data-link="ops-incident-log-add"]').exists()).toBe(true);
      expect(open.text()).toContain(i18n.t('ops.incident.log.needs_customer_approval'));
   });

   it('joins the hints of a status', async () => {
      api.row = incident({
         severity: 's1',
         management_notified_at: null,
         outcome: null,
         root_cause: null,
         preventive_action: null,
         status: 'open'
      });
      ability.update([
         { action: 'select', subject: 'incident' },
         { action: 'update', subject: 'incident' }
      ]);

      const wrapper = mount(
         {
            render: () => h(Suspense, null, { default: () => h(IncidentCard, { id: I1 }) })
         },
         {
            global: {
               plugins: plugins() as never,
               stubs: {
                  General: true,
                  Log: true,
                  Deadlines: true,
                  Closure: true,
                  Documents: true,
                  Media: true,
                  teleport: true
               }
            }
         }
      );
      await flushPromises();

      expect(wrapper.findComponent({ name: 'StatusActions' }).props('warnings')).toEqual({
         contained: i18n.t('errors.incident_management_notice_required'),
         closed: [
            i18n.t('errors.incident_management_notice_required'),
            i18n.t('errors.incident_closure_incomplete'),
            i18n.t('errors.incident_close_management')
         ].join('; ')
      });
   });
});
