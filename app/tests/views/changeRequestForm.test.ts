import '../setup/mockMain';
import {
   toChangeRequestFormValues,
   type ChangeRequestCard,
   type ChangeRequestValues
} from '@/api/changeRequest';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import ChangeRequestCardView from '@/views/pages/ops/change-request/ChangeRequestCard.vue';
import Decision from '@/views/pages/ops/change-request/tabs/Decision.vue';
import {
   CHANGE_REQUEST_FORM,
   tabForField,
   useChangeRequestForm
} from '@/views/pages/ops/change-request/useChangeRequestForm';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, Suspense } from 'vue';

// The card's form is useUpsertForm: a stand-in records what useChangeRequestForm gives it (and
// builds its save the way the real one does), so what the change request card adds is checked.
const api = vi.hoisted(() => ({
   row: null as unknown,
   options: undefined as
      | undefined
      | {
           toPayload: (values: ChangeRequestValues) => unknown;
           useSaveRow: () => { mutateAsync: (payload: unknown) => Promise<unknown> };
        },
   save: undefined as undefined | ((payload: unknown) => Promise<unknown>),
   saveRow: vi.fn(),
   setProducts: vi.fn(),
   setStatus: vi.fn(),
   reportError: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/appErrorHandler', () => ({ appErrorHandler: api.reportError }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/customerFilter', () => ({ useCustomerFilter: () => ({ customerId: null }) }));
vi.mock('@/api/useLookup', async () => {
   const { computed } = await import('vue');
   return { useLookup: () => ({ data: computed(() => undefined) }) };
});
vi.mock('@/api/project', async (importOriginal) => {
   const { computed } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/project')>()),
      useMemberOptions: () => computed(() => [])
   };
});
vi.mock('@/api/purchaseOrder', async (importOriginal) => {
   const { computed } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/purchaseOrder')>()),
      useEntityDocumentOptions: () => computed(() => [])
   };
});
vi.mock('@/api/changeRequest', async (importOriginal) => {
   const { computed } = await import('vue');
   const original = await importOriginal<typeof import('@/api/changeRequest')>();
   return {
      ...original,
      changeRequestResource: {
         ...original.changeRequestResource,
         useSave: () => ({ mutateAsync: api.saveRow })
      },
      useNewerDocumentOptions: () => computed(() => []),
      useSetChangeRequestProducts: () => ({ mutateAsync: api.setProducts }),
      useSetChangeRequestStatus: () => ({ mutateAsync: api.setStatus })
   };
});
vi.mock('@/composables/useUpsertForm', async () => {
   const { ref } = await import('vue');
   return {
      useUpsertForm: (given: NonNullable<typeof api.options>) => {
         api.options = given;
         api.save = given.useSaveRow().mutateAsync;
         return {
            values: ref(toChangeRequestFormValues(api.row as ChangeRequestCard | null)),
            errors: ref({}),
            isDirty: ref(false),
            isSubmitting: ref(false),
            readonly: ref(false),
            reset: () => {},
            save: () => Promise.resolve(),
            ready: Promise.resolve(),
            draft: {},
            row: ref(api.row),
            discardDraft: vi.fn()
         };
      }
   };
});

const CR = '00000000-0000-4000-8000-000000000021';
const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const PROJECT = '00000000-0000-4000-8000-000000000002';

const card = (values: Partial<ChangeRequestCard> = {}) =>
   ({
      id: CR,
      tenant_id: 't1',
      code: 'CR-THO-2026-001',
      customer_id: CUSTOMER,
      customer: { code: 'THO', display_name: 'Thomas' },
      project_id: PROJECT,
      project: {
         code: 'PRJ-THO-001',
         display_name: 'Pilot',
         project_gate: [{ code: 'G1', status: 'passed', needs_customer_approval: true }]
      },
      title: 'Thicker mop head',
      source: 'customer',
      urgency: 'normal',
      status: 'open',
      change_kinds: ['spec'],
      current_value: '300 g',
      requested_value: '350 g',
      reason: 'Reviews',
      affected_gate_code: 'G1',
      affected_document_id: null,
      affected_document: null,
      result_document_id: null,
      result_document: null,
      customer_approved_on: null,
      customer_approval_document_id: null,
      decision_note: null,
      decision_due_on: '2026-11-11',
      moesa_approved_on: null,
      moesa_approved_by: null,
      closed_on: null,
      change_request_product: [],
      ...values
   }) as unknown as ChangeRequestCard;

/** The card's form as the tabs inject it. */
const standInForm = (row: ChangeRequestCard | null) => ({
   values: ref(toChangeRequestFormValues(row)),
   errors: ref({}),
   isDirty: ref(false),
   isSubmitting: ref(false),
   readonly: ref(false),
   reset: vi.fn(),
   submit: vi.fn(),
   draft: {},
   row: ref(row)
});

// FormField shows its label, so a field is found by what it is called.
const FormField = defineComponent({
   props: ['label'],
   setup:
      (props, { slots }) =>
      () =>
         h('div', [h('label', props.label), slots.default?.({})])
});
const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});

const plugins = () => [
   i18NPlugin,
   PrimeVue,
   ConfirmationService,
   ToastService,
   VueQueryPlugin,
   [abilitiesPlugin, ability, { useGlobalProperties: true }] as const
];

const mountDecision = (row: ChangeRequestCard) =>
   mount(Decision, {
      global: {
         plugins: plugins() as never,
         provide: { [CHANGE_REQUEST_FORM as symbol]: standInForm(row) },
         directives: { focustrap: {}, tooltip: {} },
         stubs: { FormBox: Slot, FormField, teleport: true }
      }
   });

/** Sets up the card's form outside a card, for its save. */
const mountForm = (id: string | null) =>
   mount(
      defineComponent({
         setup() {
            useChangeRequestForm(() => id);
            return () => h('div');
         }
      }),
      { global: { plugins: plugins() as never } }
   );

enableAutoUnmount(afterEach);
beforeAll(() => i18n.setLocaleMessage('en', en));
beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.row = null;
   api.options = undefined;
   api.save = undefined;
   api.saveRow.mockReset();
   api.setProducts.mockReset().mockResolvedValue(undefined);
   api.setStatus.mockReset();
   api.reportError.mockReset();
});

describe('change request card', () => {
   it('routes fields to their tab', () => {
      expect(tabForField('delay_days')).toBe('impact');
      expect(tabForField('cost_payer')).toBe('impact');
      expect(tabForField('result_document_id')).toBe('decision');
      expect(tabForField('customer_approved_on')).toBe('decision');
      expect(tabForField('reason')).toBe('general');
   });

   it('asks for the customer approval on a passed (M) gate', () => {
      const hint = i18n.t('ops.change_request.customer_approval_hint');
      const date = i18n.t('ops.change_request.fields.customer_approved_on');
      const document = i18n.t('ops.change_request.fields.customer_approval_document');

      const needed = mountDecision(card());
      expect(needed.text()).toContain(hint);
      expect(needed.text()).toContain(date);
      expect(needed.text()).toContain(document);

      const none = mountDecision(card({ affected_gate_code: null }));
      expect(none.text()).not.toContain(hint);
      expect(none.text()).not.toContain(date);
      expect(none.text()).not.toContain(document);
   });

   it("keeps the customer's approval once entered on an approved request", () => {
      const approval = (row: ChangeRequestCard) => {
         const wrapper = mountDecision(row);
         const document = wrapper
            .findAllComponents({ name: 'Select' })
            .find((select) => select.attributes('data-field') === 'customer_approval_document_id')!;
         return [
            wrapper.findComponent({ name: 'DatePicker' }).props('disabled'),
            document.props('disabled')
         ];
      };

      // Entered after MOESA approved: still open to fill.
      expect(approval(card({ status: 'approved' }))).toEqual([false, false]);
      // Entered on an approved request: neither changes nor clears.
      expect(
         approval(
            card({
               status: 'approved',
               customer_approved_on: '2026-11-05',
               customer_approval_document_id: '00000000-0000-4000-8000-000000000031'
            })
         )
      ).toEqual([true, true]);
   });

   it('saves the product changes', async () => {
      const loaded = card({
         change_request_product: [
            { product_id: 'p1', product: null },
            { product_id: 'p2', product: null }
         ]
      });
      api.row = loaded;
      api.saveRow.mockResolvedValue(loaded);
      mount(
         defineComponent({
            setup() {
               useChangeRequestForm(() => CR);
               return () => h('div');
            }
         }),
         { global: { plugins: plugins() as never } }
      );

      const values = { ...toChangeRequestFormValues(loaded), product_ids: ['p2', 'p3'] };
      await api.save!(api.options!.toPayload(values as ChangeRequestValues));

      expect(api.saveRow).toHaveBeenCalledOnce();
      expect(api.saveRow.mock.calls[0]![0]).not.toHaveProperty('product_ids');
      expect(api.setProducts).toHaveBeenCalledExactlyOnceWith({
         id: CR,
         before: ['p1', 'p2'],
         after: ['p2', 'p3']
      });
   });

   it("saves a new request's products once it has its id", async () => {
      const saved = card({ change_request_product: [] });
      api.saveRow.mockResolvedValue(saved);
      mountForm(null);

      const values = { ...toChangeRequestFormValues(null), product_ids: ['p1'] };
      const result = await api.save!(api.options!.toPayload(values as ChangeRequestValues));

      expect(api.saveRow.mock.calls[0]![0]).not.toHaveProperty('id');
      expect(api.setProducts).toHaveBeenCalledExactlyOnceWith({
         id: CR,
         before: [],
         after: ['p1']
      });
      expect(result).toMatchObject({
         id: CR,
         change_request_product: [{ product_id: 'p1', product: null }]
      });
   });

   it('keeps a new request when its products fail, so a retry does not insert it again', async () => {
      const saved = card({ change_request_product: [] });
      const refused = Object.assign(new Error('refused'), { code: '42501' });
      api.saveRow.mockResolvedValue(saved);
      api.setProducts.mockRejectedValue(refused);
      mountForm(null);

      const values = { ...toChangeRequestFormValues(null), product_ids: ['p1'] };
      const result = await api.save!(api.options!.toPayload(values as ChangeRequestValues));

      // The saved request comes back (the card moves to its id); the error is shown.
      expect(result).toBe(saved);
      expect(api.reportError).toHaveBeenCalledExactlyOnceWith(refused);
   });

   it("lets an existing request's failed products fail the save", async () => {
      const loaded = card();
      const refused = new Error('refused');
      api.row = loaded;
      api.saveRow.mockResolvedValue(loaded);
      api.setProducts.mockRejectedValue(refused);
      mountForm(CR);

      const values = { ...toChangeRequestFormValues(loaded), product_ids: ['p1'] };
      await expect(api.save!(api.options!.toPayload(values as ChangeRequestValues))).rejects.toBe(
         refused
      );
      expect(api.reportError).not.toHaveBeenCalled();
   });

   it('joins the hints of a status', async () => {
      api.row = card({ decision_note: null });
      ability.update([
         { action: 'select', subject: 'change_request' },
         { action: 'update', subject: 'change_request' }
      ]);

      const wrapper = mount(
         {
            render: () => h(Suspense, null, { default: () => h(ChangeRequestCardView, { id: CR }) })
         },
         {
            global: {
               plugins: plugins() as never,
               stubs: {
                  General: true,
                  Impact: true,
                  Decision: true,
                  Documents: true,
                  teleport: true
               }
            }
         }
      );
      await flushPromises();

      expect(wrapper.text()).toContain('CR-THO-2026-001 — Thicker mop head');
      expect(wrapper.findComponent({ name: 'StatusActions' }).props('warnings')).toEqual({
         approved: i18n.t('errors.change_request_customer_approval_required'),
         rejected: i18n.t('errors.change_request_decision_note_required')
      });
   });
});
