import '../setup/mockMain';
import {
   toPurchaseOrderFormValues,
   type PurchaseOrderCard,
   type PurchaseOrderCardLine,
   type PurchaseOrderOverviewRow,
   type PurchaseOrderStatus
} from '@/api/purchaseOrder';
import { ability } from '@/plugins/casl';
import FormField from '@/components/ui/form/form-field/FormField.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import General from '@/views/pages/ops/purchase-order/tabs/General.vue';
import Lines from '@/views/pages/ops/purchase-order/tabs/Lines.vue';
import {
   PURCHASE_ORDER_FORM,
   PURCHASE_ORDER_OVERVIEW,
   tabForField,
   usePurchaseOrderForm
} from '@/views/pages/ops/purchase-order/usePurchaseOrderForm';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

const api = vi.hoisted(() => ({
   query: {} as Record<string, string>,
   customerId: null as string | null,
   options: undefined as
      | undefined
      | {
           prefill: () => Record<string, unknown>;
           toPayload: (data: Record<string, unknown>) => Record<string, unknown>;
           onSaved?: (row: { id: string }) => void;
        },
   row: { value: null as unknown }
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: api.query }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/customerFilter', () => ({
   useCustomerFilter: () => ({ customerId: api.customerId })
}));
// The card's form is useUpsertForm; what usePurchaseOrderForm adds is checked against a stand-in.
vi.mock('@/composables/useUpsertForm', () => ({
   useUpsertForm: (given: NonNullable<typeof api.options>) => {
      api.options = given;
      return { discardDraft: vi.fn(), row: api.row };
   }
}));
vi.mock('@/api/purchaseOrder', async (importOriginal) => {
   const { computed } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/purchaseOrder')>()),
      useEntityDocumentOptions: () => computed(() => [])
   };
});

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});
const SelectSupplier = defineComponent({
   name: 'SelectSupplier',
   props: ['modelValue'],
   emits: ['update:modelValue', 'pick'],
   setup: () => () => h('span', { 'data-select': 'supplier' })
});
const Stub = (name: string) =>
   defineComponent({ name, props: ['modelValue'], setup: () => () => h('span') });
const CustomLink = defineComponent({
   props: ['to'],
   setup:
      (props, { slots }) =>
      () =>
         h('span', { 'data-link': props.to.name }, slots.default?.({ navigate: () => {} }))
});

const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const SUPPLIER = '00000000-0000-4000-8000-000000000002';

const line = (id: string, position: number): PurchaseOrderCardLine =>
   ({
      id,
      position,
      quantity: 100,
      unit_price: 1.9,
      line_total: 190,
      product: { id: `p-${id}`, sku: `SKU-${id}`, display_name: `Product ${id}` },
      spec_document: null
   }) as unknown as PurchaseOrderCardLine;

const order = (status: PurchaseOrderStatus, lines: PurchaseOrderCardLine[] = []) =>
   ({
      id: 'o1',
      code: 'PO-THO-2026-001',
      status,
      currency: 'USD',
      customer_id: CUSTOMER,
      supplier_id: SUPPLIER,
      incoterm: 'EXW',
      deposit_rate: 30,
      supplier: { code: 'TR1' },
      purchase_order_line: lines,
      purchase_order_payment: []
   }) as unknown as PurchaseOrderCard;

/** The card's form as the tabs inject it: values from the row, or a new order's empty ones. */
const standInForm = (row: PurchaseOrderCard | null) => ({
   values: ref(toPurchaseOrderFormValues(row)),
   errors: ref({}),
   isDirty: ref(false),
   isSubmitting: ref(false),
   readonly: ref(false),
   reset: vi.fn(),
   submit: vi.fn(),
   draft: {},
   row: ref(row)
});

const mountTab = (
   component: typeof General | typeof Lines,
   form: ReturnType<typeof standInForm>,
   overview: Partial<PurchaseOrderOverviewRow> | null = null
) =>
   mount(component, {
      global: {
         plugins: [i18NPlugin, PrimeVue, [abilitiesPlugin, ability, { useGlobalProperties: true }]],
         provide: {
            [PURCHASE_ORDER_FORM as symbol]: form,
            [PURCHASE_ORDER_OVERVIEW as symbol]: ref(overview)
         },
         directives: { focustrap: {}, tooltip: {} },
         stubs: {
            FormBox: Slot,
            FormField: Slot,
            SelectCustomer: Stub('SelectCustomer'),
            SelectSupplier,
            ProjectSelect: Stub('ProjectSelect'),
            CustomLink
         }
      }
   });

beforeAll(() => i18n.setLocaleMessage('en', en));

beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.query = {};
   api.customerId = null;
   api.row.value = null;
});

describe('tabForField', () => {
   it('opens the PI tab for a PI field and the general tab for the rest', () => {
      expect(tabForField('pi_total')).toBe('pi');
      expect(tabForField('pi_check')).toBe('pi');
      expect(tabForField('incoterm')).toBe('general');
      expect(tabForField('currency')).toBe('general');
   });
});

describe('usePurchaseOrderForm', () => {
   it('starts a new order on the filtered customer', () => {
      api.customerId = 'c-filter';
      usePurchaseOrderForm(() => null);
      expect(api.options!.prefill()).toEqual({ customer_id: 'c-filter' });
   });

   it("takes the customer and project from the link's props over the filter", () => {
      api.customerId = 'c-filter';
      usePurchaseOrderForm(() => null, undefined, { customerId: 'c-link', projectId: 'pr1' });
      expect(api.options!.prefill()).toEqual({ customer_id: 'c-link', project_id: 'pr1' });
   });

   it('ignores the query of the page under a route dialog', () => {
      api.query = { customer_id: 'c-under', project_id: 'pr-under' };
      usePurchaseOrderForm(() => null);
      expect(api.options!.prefill()).toEqual({});
   });

   it('leaves the locked terms out of the payload of an approved order', () => {
      api.row.value = order('pi_approved');
      usePurchaseOrderForm(() => 'o1');
      const payload = api.options!.toPayload({
         ...toPurchaseOrderFormValues(order('pi_approved')),
         id: 'o1',
         ready_on: null,
         notes: 'late'
      });
      expect(payload).toMatchObject({ id: 'o1', notes: 'late' });
      expect(payload).not.toHaveProperty('currency');
      expect(payload).not.toHaveProperty('incoterm');
   });
});

describe('general tab', () => {
   it('disables the locked terms from pi_approved on', () => {
      const wrapper = mountTab(General, standInForm(order('pi_approved')));
      expect(wrapper.get('[data-field="currency"]').classes()).toContain('p-disabled');
      expect(wrapper.get('[data-field="ready_on"] input').attributes()).not.toHaveProperty(
         'disabled'
      );
   });

   it('keeps the terms of a sent order editable', () => {
      const wrapper = mountTab(General, standInForm(order('sent')));
      expect(wrapper.get('[data-field="currency"]').classes()).not.toContain('p-disabled');
   });

   it("fills an empty incoterm and deposit from the picked supplier's defaults", async () => {
      const form = standInForm(null);
      const wrapper = mountTab(General, form);

      wrapper.getComponent(SelectSupplier).vm.$emit('pick', {
         default_incoterm: 'FOB',
         deposit_rate: 30
      });

      expect(form.values.value.incoterm).toBe('FOB');
      expect(form.values.value.deposit_rate).toBe(30);
   });

   it('keeps an incoterm already set', async () => {
      const form = standInForm(null);
      form.values.value.incoterm = 'EXW';
      const wrapper = mountTab(General, form);

      wrapper.getComponent(SelectSupplier).vm.$emit('pick', {
         default_incoterm: 'FOB',
         deposit_rate: 30
      });

      expect(form.values.value.incoterm).toBe('EXW');
      expect(form.values.value.deposit_rate).toBe(30);
   });
});

describe('general tab for a coordinator', () => {
   // Reads the supplier terms but may not write them (supplier_terms read-only).
   beforeEach(() =>
      ability.update([
         { action: 'manage', subject: 'all' },
         ...['incoterm', 'deposit_rate'].flatMap((field) =>
            ['insert', 'update'].map((action) => ({
               action,
               subject: 'purchase_order',
               fields: [field],
               inverted: true
            }))
         )
      ])
   );

   it('shows the incoterm and the deposit read-only', () => {
      const wrapper = mount(General, {
         global: {
            plugins: [
               createPinia(),
               i18NPlugin,
               PrimeVue,
               [abilitiesPlugin, ability, { useGlobalProperties: true }]
            ],
            provide: {
               [PURCHASE_ORDER_FORM as symbol]: standInForm(order('sent')),
               [PURCHASE_ORDER_OVERVIEW as symbol]: ref(null)
            },
            directives: { focustrap: {}, tooltip: {} },
            stubs: {
               FormBox: Slot,
               BlockUI: Slot,
               SelectCustomer: Stub('SelectCustomer'),
               SelectSupplier,
               ProjectSelect: Stub('ProjectSelect'),
               CustomLink
            }
         }
      });
      const blocked = (field: string) =>
         (
            wrapper.findAllComponents(FormField).find((f) => f.props('field') === field)?.vm as
               | { blocked?: boolean }
               | undefined
         )?.blocked;
      expect(blocked('deposit_rate')).toBe(true);
      expect(blocked('incoterm')).toBe(true);
      expect(blocked('incoterm_place')).toBe(false);
   });

   it("does not fill the terms from the picked supplier's defaults", () => {
      const form = standInForm(null);
      const wrapper = mountTab(General, form);

      wrapper.getComponent(SelectSupplier).vm.$emit('pick', {
         default_incoterm: 'FOB',
         deposit_rate: 30
      });

      expect(form.values.value.incoterm).toBeFalsy();
      expect(form.values.value.deposit_rate ?? null).toBeNull();
   });
});

describe('lines tab', () => {
   const lines = [line('l1', 1), line('l2', 2)];

   it('marks the spec sheet missing only for the lines the overview lists', () => {
      const wrapper = mountTab(Lines, standInForm(order('draft', lines)), {
         spec_missing_line_ids: ['l1'],
         system_subtotal: 380,
         currency: 'USD'
      });

      const missing = wrapper.findAll('[data-test="spec-missing"]');
      expect(missing).toHaveLength(1);
      expect(missing[0]!.attributes('data-line')).toBe('l1');
      expect(missing[0]!.text()).toBe(i18n.t('ops.purchase_order.spec_missing'));
      expect(wrapper.text()).toContain('380.00 USD');
   });

   it('shows the version of a line with a spec sheet', () => {
      const withSpec = {
         ...line('l3', 3),
         spec_document: { id: 'd1', version: 3, status: 'signed' }
      } as PurchaseOrderCardLine;
      const wrapper = mountTab(Lines, standInForm(order('draft', [withSpec])), {
         spec_missing_line_ids: []
      });
      expect(wrapper.get('[data-test="spec-version"]').text()).toBe('v03');
      expect(wrapper.find('[data-test="spec-missing"]').exists()).toBe(false);
   });

   it('offers adding and editing lines while the order is open', () => {
      const wrapper = mountTab(Lines, standInForm(order('sent', lines)));
      expect(wrapper.find('[data-link="ops-purchase-order-line-add"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-link="ops-purchase-order-line-edit"]')).toHaveLength(2);
   });

   it('hides adding and editing once the order is locked', () => {
      const wrapper = mountTab(Lines, standInForm(order('pi_approved', lines)));
      expect(wrapper.find('[data-link="ops-purchase-order-line-add"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-purchase-order-line-edit"]').exists()).toBe(false);
   });
});
