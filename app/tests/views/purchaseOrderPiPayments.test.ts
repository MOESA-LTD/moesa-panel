import '../setup/mockMain';
import {
   PI_CHECK_KEYS,
   toPurchaseOrderFormValues,
   type PurchaseOrderCard,
   type PurchaseOrderCardLine,
   type PurchaseOrderOverviewRow,
   type PurchaseOrderPaymentRow,
   type PurchaseOrderStatus
} from '@/api/purchaseOrder';
import PiArithmeticTable from '@/components/service-components/pi-arithmetic/PiArithmeticTable.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import Payments from '@/views/pages/ops/purchase-order/tabs/Payments.vue';
import Pi from '@/views/pages/ops/purchase-order/tabs/Pi.vue';
import Production from '@/views/pages/ops/purchase-order/tabs/Production.vue';
import {
   PURCHASE_ORDER_FORM,
   PURCHASE_ORDER_OVERVIEW,
   purchaseOrderPiCheck
} from '@/views/pages/ops/purchase-order/usePurchaseOrderForm';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Tooltip from 'primevue/tooltip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

const api = vi.hoisted(() => ({
   updateRow: vi.fn(),
   invalidateTables: vi.fn(),
   savePayment: vi.fn(),
   updates: [] as Record<string, unknown>[]
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@tanstack/vue-query', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@tanstack/vue-query')>()),
   useQueryClient: () => ({})
}));
vi.mock('@/api/saveRow', () => ({ updateRow: api.updateRow }));
vi.mock('@/api/queryKeys', async (importOriginal) => ({
   ...(await importOriginal<typeof import('@/api/queryKeys')>()),
   invalidateTables: api.invalidateTables
}));
vi.mock('@/api/project', async (importOriginal) => {
   const { computed } = await import('vue');
   return {
      ...(await importOriginal<typeof import('@/api/project')>()),
      useMemberOptions: () => computed(() => [{ value: 'u1', label: 'Akif' }])
   };
});
vi.mock('@/api/purchaseOrder', async (importOriginal) => {
   const { computed, ref } = await import('vue');
   const actual = await importOriginal<typeof import('@/api/purchaseOrder')>();
   return {
      ...actual,
      useEntityDocumentOptions: () => computed(() => []),
      usePurchaseOrderUpdates: () => ({ data: ref(api.updates) }),
      purchaseOrderPaymentResource: {
         ...actual.purchaseOrderPaymentResource,
         repository: { ...actual.purchaseOrderPaymentResource.repository, save: api.savePayment }
      }
   };
});

const Slot = defineComponent({
   setup:
      (_, { slots }) =>
      () =>
         h('div', slots.default?.({}))
});
const CustomLink = defineComponent({
   props: ['to'],
   setup:
      (props, { slots }) =>
      () =>
         h('span', { 'data-link': props.to.name }, slots.default?.({ navigate: () => {} }))
});

const line = (
   id: string,
   quantity: number | null,
   unit_price: number | null,
   pi_line_total: number | null = null
): PurchaseOrderCardLine =>
   ({
      id,
      position: Number(id.slice(1)),
      quantity,
      unit_price,
      pi_line_total,
      line_total: 2000,
      product: { id: `p-${id}`, sku: `SKU-${id}` },
      spec_document: null
   }) as unknown as PurchaseOrderCardLine;

const payment = (kind: string, amount: number): PurchaseOrderPaymentRow =>
   ({
      id: `pay-${kind}`,
      kind,
      amount,
      currency: 'USD',
      planned_on: null,
      paid_on: null,
      paid_by: 'moesa',
      notes: null,
      created_at: '2026-11-01T00:00:00Z'
   }) as unknown as PurchaseOrderPaymentRow;

const order = (
   status: PurchaseOrderStatus,
   extra: Partial<PurchaseOrderCard> = {}
): PurchaseOrderCard =>
   ({
      id: 'o1',
      code: 'PO-THO-2026-001',
      status,
      currency: 'USD',
      deposit_rate: 30,
      pi_extra_amount: 0,
      pi_discount_amount: 0,
      pi_subtotal: 2000,
      pi_total: 2000,
      pi_deposit_amount: 600,
      pi_balance_amount: 1400,
      pi_check: {},
      pi_checked_by: null,
      pi_checked_at: null,
      purchase_order_line: [line('l1', 1000, 2, 2000)],
      purchase_order_payment: [],
      ...extra
   }) as unknown as PurchaseOrderCard;

const standInForm = (row: PurchaseOrderCard) => ({
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

const S09_OVERVIEW = {
   currency: 'USD',
   system_subtotal: 2000,
   system_total: 2000,
   system_deposit: 600,
   system_balance: 1400
} as Partial<PurchaseOrderOverviewRow>;

const mountTab = (
   component: typeof Pi | typeof Payments | typeof Production,
   form: ReturnType<typeof standInForm>,
   overview: Partial<PurchaseOrderOverviewRow> | null = null,
   props: Record<string, unknown> = {},
   realFields = false
) =>
   mount(component, {
      props,
      global: {
         plugins: [i18NPlugin, PrimeVue, [abilitiesPlugin, ability, { useGlobalProperties: true }]],
         provide: {
            [PURCHASE_ORDER_FORM as symbol]: form,
            [PURCHASE_ORDER_OVERVIEW as symbol]: ref(overview)
         },
         directives: { focustrap: {}, tooltip: realFields ? Tooltip : {} },
         stubs: { FormBox: Slot, ...(realFields ? {} : { FormField: Slot }), CustomLink }
      }
   });

beforeAll(() => i18n.setLocaleMessage('en', en));

beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.updateRow.mockReset().mockResolvedValue({});
   api.invalidateTables.mockReset().mockResolvedValue(undefined);
   api.savePayment.mockReset().mockResolvedValue({});
   api.updates = [];
});

describe('purchaseOrderPiCheck', () => {
   it('leaves out incomplete lines and treats cleared inputs as missing, without throwing', () => {
      const check = purchaseOrderPiCheck(
         [line('l1', 1000, 2), line('l2', null, 2), line('l3', 5, null)],
         {
            deposit_rate: null,
            pi_extra_amount: null,
            pi_discount_amount: null,
            pi_subtotal: null,
            pi_total: 2000
         }
      );
      expect(check.rows.filter(({ key }) => key === 'line')).toHaveLength(1);
      expect(check.rows.find(({ key }) => key === 'subtotal')).toMatchObject({
         system: 2000,
         pi: null
      });
      expect(check.matches).toBe(false);
   });

   it('prefers the typed line totals over the saved ones', () => {
      const lines = [line('l1', 1000, 2, 2000)];
      const saved = order('pi_received');
      expect(purchaseOrderPiCheck(lines, saved).matches).toBe(true);
      expect(purchaseOrderPiCheck(lines, saved, { l1: 2500 }).matches).toBe(false);
   });
});

describe('PI tab', () => {
   it('renders with cleared figures and an incomplete line', async () => {
      const form = standInForm(
         order('pi_received', {
            purchase_order_line: [line('l1', 1000, 2), line('l2', null, null)]
         })
      );
      const wrapper = mountTab(Pi, form);

      // Cleared InputNumbers are null.
      form.values.value.pi_extra_amount = null as unknown as number;
      form.values.value.pi_total = null;
      form.values.value.deposit_rate = null;
      await flushPromises();

      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.pi.mismatch'));
      // The complete line and the six figures; the line without quantity or price is left out.
      const rows = wrapper.getComponent(PiArithmeticTable).findAll('tbody tr');
      expect(rows).toHaveLength(7);
      expect(rows[0]!.text()).toContain('SKU-l1');
      expect(wrapper.getComponent(PiArithmeticTable).text()).not.toContain('SKU-l2');
   });

   it("marks the S09 line whose PI total is 2500 against the system's 2000", () => {
      const wrapper = mountTab(
         Pi,
         standInForm(order('pi_received', { purchase_order_line: [line('l1', 1000, 2, 2500)] }))
      );
      const marked = wrapper.findAll('[data-test="pi-diff"]');
      expect(marked).toHaveLength(1);
      expect(marked[0]!.text()).toContain('SKU-l1');
      expect(marked[0]!.text()).toContain('500.00 USD');
   });

   it('explains PI and S09 in the PI tab', () => {
      const wrapper = mountTab(Pi, standInForm(order('pi_received')), null, {}, true);
      const label = wrapper.get(
         `label[title="${i18n.t('ops.purchase_order.fields.pi_document')}"]`
      );

      expect(label.find('abbr[data-term="PI"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="pi-checklist"] abbr[data-term="S09"]').exists()).toBe(true);
   });

   it('says the PI matches when every figure agrees', () => {
      const wrapper = mountTab(Pi, standInForm(order('pi_received')));
      expect(wrapper.text()).toContain(i18n.t('ops.purchase_order.pi.matches'));
   });

   it('lists the 30 checklist items and records a status in the form', async () => {
      const form = standInForm(order('pi_received'));
      const wrapper = mountTab(Pi, form);

      const items = wrapper.findAll('[data-check]');
      expect(items).toHaveLength(PI_CHECK_KEYS.length);
      expect(items[11]!.text()).toContain(i18n.t('ops.purchase_order.pi_check.items.12'));

      await items[11]!.findAll('[role="radio"], button')[0]!.trigger('click');
      expect(form.values.value.pi_check).toEqual({ '12': 'ok' });
      expect(wrapper.get('[data-test="pi-checklist-count"]').text()).toBe('1 / 30');
   });

   /** The line's PI total input, once the table has settled (its first render re-creates cells). */
   const lineTotalInput = async (wrapper: ReturnType<typeof mountTab>) => {
      await flushPromises();
      return wrapper.get('[data-line-total="l1"] input');
   };

   it("saves a line's PI total when its input is left, then refreshes the lines", async () => {
      const wrapper = mountTab(Pi, standInForm(order('pi_received')));
      const input = await lineTotalInput(wrapper);

      // Typed, then left: InputNumber reports the blur before it parses the value into the model.
      (input.element as HTMLInputElement).value = '2001';
      await input.trigger('blur');
      await flushPromises();

      expect(api.updateRow).toHaveBeenCalledOnce();
      expect(api.updateRow).toHaveBeenCalledWith('purchase_order_line', 'l1', {
         pi_line_total: 2001
      });
      expect(api.invalidateTables).toHaveBeenCalledWith({}, ['purchase_order_line']);
      // The recalculation follows the typed total.
      expect(wrapper.get('[data-test="pi-diff"]').text()).toContain('1.00 USD');
   });

   it('leaves an unchanged line total unsaved', async () => {
      const wrapper = mountTab(Pi, standInForm(order('pi_received')));
      await (await lineTotalInput(wrapper)).trigger('blur');
      await flushPromises();
      expect(api.updateRow).not.toHaveBeenCalled();
   });

   it('is read-only once approved and shows who checked it and when', () => {
      const wrapper = mountTab(
         Pi,
         standInForm(
            order('pi_approved', {
               pi_checked_by: 'u1',
               pi_checked_at: '2026-11-03T10:15:00Z'
            })
         )
      );
      expect(wrapper.get('[data-field="pi_total"] input').attributes()).toHaveProperty('disabled');
      expect(wrapper.find('[data-line-total]').exists()).toBe(false);
      expect(wrapper.get('[data-test="pi-checked"]').text()).toContain('Akif');
      expect(wrapper.get('[data-test="pi-checked"]').text()).toContain('2026-11-03');
   });
});

describe('payments tab', () => {
   it('plans the deposit and the balance from the recalculated figures', async () => {
      const wrapper = mountTab(Payments, standInForm(order('pi_approved')), S09_OVERVIEW);

      await wrapper.get('[data-test="plan-payments"]').trigger('click');
      await flushPromises();

      expect(api.savePayment.mock.calls.map(([payload]) => payload)).toEqual([
         {
            purchase_order_id: 'o1',
            kind: 'deposit',
            amount: 600,
            currency: 'USD',
            paid_by: 'moesa',
            planned_on: null,
            paid_on: null,
            notes: null
         },
         {
            purchase_order_id: 'o1',
            kind: 'balance',
            amount: 1400,
            currency: 'USD',
            paid_by: 'moesa',
            planned_on: null,
            paid_on: null,
            notes: null
         }
      ]);
      expect(api.invalidateTables).toHaveBeenCalledWith({}, ['purchase_order_payment']);
   });

   it('offers no plan once both payments exist, and marks a deposit that differs', () => {
      const wrapper = mountTab(
         Payments,
         standInForm(
            order('deposit_paid', {
               purchase_order_payment: [payment('deposit', 599.99), payment('balance', 1400)]
            })
         ),
         S09_OVERVIEW
      );
      expect(wrapper.find('[data-test="plan-payments"]').exists()).toBe(false);
      expect(wrapper.findAll('[data-test="deposit-differs"]')).toHaveLength(1);
      expect(wrapper.find('[data-link="ops-purchase-order-payment-add"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-link="ops-purchase-order-payment-edit"]')).toHaveLength(2);
   });

   it('does not mark a deposit equal to the recalculated one', () => {
      const wrapper = mountTab(
         Payments,
         standInForm(order('deposit_paid', { purchase_order_payment: [payment('deposit', 600)] })),
         S09_OVERVIEW
      );
      expect(wrapper.find('[data-test="deposit-differs"]').exists()).toBe(false);
   });

   it('hides planning, adding and editing on a closed order', () => {
      const wrapper = mountTab(
         Payments,
         standInForm(order('closed', { purchase_order_payment: [payment('deposit', 600)] })),
         S09_OVERVIEW
      );
      expect(wrapper.find('[data-test="plan-payments"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-purchase-order-payment-add"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-purchase-order-payment-edit"]').exists()).toBe(false);
   });
});

describe('production tab', () => {
   beforeEach(() => {
      api.updates = [
         { id: 'u2', happened_on: '2026-11-03', note: 'Packing', created_by: 'u1' },
         { id: 'u1', happened_on: '2026-11-01', note: 'Cutting', created_by: null }
      ];
   });

   it('lists the updates as loaded (newest first) with their author', () => {
      const wrapper = mountTab(Production, standInForm(order('in_production')), null, {
         id: 'o1'
      });
      const rows = wrapper.findAll('tbody tr');
      expect(rows.map((row) => row.text())).toEqual([
         expect.stringContaining('Packing'),
         expect.stringContaining('Cutting')
      ]);
      expect(rows[0]!.text()).toContain('Akif');
      expect(wrapper.find('[data-link="ops-purchase-order-update-add"]').exists()).toBe(true);
   });

   it('hides adding and editing on a cancelled order', () => {
      const wrapper = mountTab(Production, standInForm(order('cancelled')), null, { id: 'o1' });
      expect(wrapper.find('[data-link="ops-purchase-order-update-add"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-purchase-order-update-edit"]').exists()).toBe(false);
   });
});
