import '../setup/mockMain';
import {
   shipmentLineSchema,
   shipmentSchema,
   toShipmentFormValues,
   toShipmentLineFormValues,
   type ShipmentCard,
   type ShipmentLineFormValues,
   type ShipmentOverviewRow,
   type ShipmentStatus
} from '@/api/shipment';
import ShipmentTable from '@/components/service-components/shipment-table/ShipmentTable.vue';
import { ability } from '@/plugins/casl';
import en from '@/plugins/i18n/locales/en/index.json';
import LineUpsert from '@/views/pages/ops/shipment/LineUpsert.vue';
import Acceptance from '@/views/pages/ops/shipment/tabs/Acceptance.vue';
import Events from '@/views/pages/ops/shipment/tabs/Events.vue';
import General from '@/views/pages/ops/shipment/tabs/General.vue';
import Orders from '@/views/pages/ops/shipment/tabs/Orders.vue';
import {
   SHIPMENT_FORM,
   SHIPMENT_OVERVIEW,
   shipmentStatusWarnings,
   tabForField,
   useShipmentForm
} from '@/views/pages/ops/shipment/useShipmentForm';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { abilitiesPlugin } from '@casl/vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, Suspense, type Ref } from 'vue';

// The card's form is useUpsertForm and the lookups are useLookup: stand-ins hold what they would
// load, so what the shipment card adds (defaults, locks, checklists, payloads) is what is checked.
const api = vi.hoisted(() => ({
   values: null as unknown as { value: Record<string, unknown> },
   initialValues: null as unknown as { value: Record<string, unknown> },
   options: undefined as
      | undefined
      | { toPayload: (data: Record<string, unknown>) => Record<string, unknown> },
   lookups: {} as Record<string, unknown[]>,
   lookupCalls: [] as { table: string; options: Record<string, unknown> }[],
   shipment: null as unknown,
   events: [] as unknown[],
   ids: undefined as string[] | undefined,
   idFilters: [] as unknown[],
   tableMounted: false,
   link: vi.fn(),
   unlink: vi.fn(),
   deleteRow: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('vue-router', async (importOriginal) => ({
   ...(await importOriginal<typeof import('vue-router')>()),
   useRoute: () => ({ query: {} }),
   useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/store/customerFilter', () => ({ useCustomerFilter: () => ({ customerId: null }) }));
vi.mock('@/composables/useUpsertForm', async () => {
   const { ref } = await import('vue');
   return {
      useUpsertForm: (options: typeof api.options) => {
         api.options = options;
         return {
            values: api.values,
            initialValues: api.initialValues,
            errors: ref({}),
            isDirty: ref(false),
            isSubmitting: ref(false),
            readonly: ref(false),
            reset: vi.fn(),
            save: vi.fn(),
            ready: Promise.resolve(),
            draft: {},
            row: ref(null),
            discardDraft: vi.fn()
         };
      }
   };
});
// A lookup with an `in` filter yields its rows only once the filter has values (as the real one
// would load them for that customer, order line or shipment).
vi.mock('@/api/useLookup', async () => {
   const { computed, toValue } = await import('vue');
   return {
      useLookup: (table: string, options: () => Record<string, unknown>) => ({
         data: computed(() => {
            const given = toValue(options) as { in?: { values: unknown[] } };
            api.lookupCalls.push({ table, options: given });
            if (given.in && !given.in.values.length) return undefined;
            return api.lookups[table];
         })
      })
   };
});
vi.mock('@/api/tables', () => ({ useDeleteRow: () => ({ mutateAsync: api.deleteRow }) }));
vi.mock('@/composables/useConfirmDelete', () => ({
   useConfirmDelete: () => () => Promise.resolve(true)
}));
vi.mock('@/api/shipment', async (importOriginal) => {
   const { ref, toValue } = await import('vue');
   const original = await importOriginal<typeof import('@/api/shipment')>();
   return {
      ...original,
      shipmentResource: {
         ...original.shipmentResource,
         useOne: () => ({ data: ref(api.shipment), suspense: () => Promise.resolve() })
      },
      useShipmentIds: (filter: () => unknown) => {
         api.idFilters.push(toValue(filter));
         return { data: ref(api.ids) };
      },
      useShipmentEvents: () => ({ data: ref(api.events) }),
      useLinkPurchaseOrder: () => ({ mutateAsync: api.link }),
      useUnlinkPurchaseOrder: () => ({ mutateAsync: api.unlink })
   };
});

const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const SHIPMENT = '00000000-0000-4000-8000-000000000101';
const PO1 = '00000000-0000-4000-8000-000000000201';
const PO2 = '00000000-0000-4000-8000-000000000202';
const L1 = '00000000-0000-4000-8000-000000000301';
const L2 = '00000000-0000-4000-8000-000000000302';
const L3 = '00000000-0000-4000-8000-000000000303';

const shipment = (
   status: ShipmentStatus,
   { hazmat = false, linesOn = [L1] }: { hazmat?: boolean; linesOn?: string[] } = {}
) =>
   ({
      id: SHIPMENT,
      tenant_id: 't1',
      code: 'SHP-THO-2026-001',
      status,
      customer_id: CUSTOMER,
      delivery_warehouse_id: 'w1',
      quantity_matches: null,
      has_damage: null,
      customer: { code: 'THO', display_name: 'Thomas' },
      customer_warehouse: null,
      shipment_purchase_order: [
         {
            purchase_order: {
               id: PO1,
               code: 'PO-THO-2026-001',
               status: 'deposit_paid',
               tolerance_pct: 10,
               purchase_order_line: [
                  {
                     id: L1,
                     quantity: 100,
                     product: { sku: 'THO-MOP40-2P', display_name: 'Mop 40', is_hazmat: hazmat }
                  },
                  {
                     id: L2,
                     quantity: 50,
                     product: { sku: 'THO-TIPS-6-50', display_name: 'Tips', is_hazmat: false }
                  }
               ]
            }
         },
         {
            purchase_order: {
               id: PO2,
               code: 'PO-THO-2026-002',
               status: 'pi_approved',
               tolerance_pct: 0,
               purchase_order_line: [
                  {
                     id: L3,
                     quantity: 10,
                     product: { sku: 'THO-CONES-100', display_name: 'Cones', is_hazmat: false }
                  }
               ]
            }
         }
      ],
      shipment_line: linesOn.map((lineId, i) => ({
         id: `sl${i}`,
         shipment_id: SHIPMENT,
         purchase_order_id: lineId === L3 ? PO2 : PO1,
         purchase_order_line_id: lineId,
         quantity: 40,
         carton_count: 4
      }))
   }) as unknown as ShipmentCard;

/** The card's form as the tabs inject it: values from the row, or a new shipment's empty ones. */
const standInForm = (row: ShipmentCard | null, warehouses: unknown[] = []) => ({
   values: ref(toShipmentFormValues(row)),
   errors: ref({}),
   isDirty: ref(false),
   isSubmitting: ref(false),
   readonly: ref(false),
   reset: vi.fn(),
   submit: vi.fn(),
   draft: {},
   row: ref(row),
   warehouses: ref(warehouses)
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
            {
               'data-link': props.to.name,
               'data-query': JSON.stringify(props.to.query ?? {}),
               'data-params': JSON.stringify(props.to.params ?? {})
            },
            slots.default?.({ navigate: () => {} })
         )
});

const plugins = () => [
   i18NPlugin,
   PrimeVue,
   [abilitiesPlugin, ability, { useGlobalProperties: true }] as const
];

const mountTab = (
   component: typeof Orders | typeof Acceptance | typeof Events | typeof General,
   form: ReturnType<typeof standInForm>,
   overview: Partial<ShipmentOverviewRow> | null = null
) =>
   mount(component, {
      global: {
         plugins: plugins() as never,
         provide: {
            [SHIPMENT_FORM as symbol]: form,
            [SHIPMENT_OVERVIEW as symbol]: ref(overview)
         },
         directives: { focustrap: {}, tooltip: {} },
         stubs: {
            FormBox: Slot,
            FormField: Slot,
            SelectCustomer: Stub('SelectCustomer'),
            CustomLink,
            teleport: true
         }
      }
   });

// Each test's tabs go before the next one changes the shared stand-ins (and the abilities).
enableAutoUnmount(afterEach);

beforeAll(() => i18n.setLocaleMessage('en', en));

beforeEach(() => {
   setActivePinia(createPinia());
   ability.update([{ action: 'manage', subject: 'all' }]);
   api.values = ref(toShipmentFormValues(null));
   api.initialValues = ref(toShipmentFormValues(null));
   api.options = undefined;
   api.lookups = {};
   api.lookupCalls = [];
   api.shipment = null;
   api.events = [];
   api.ids = undefined;
   api.idFilters = [];
   api.tableMounted = false;
   api.link.mockReset().mockResolvedValue(undefined);
   api.unlink.mockReset().mockResolvedValue(undefined);
   api.deleteRow.mockReset().mockResolvedValue(undefined);
});

describe('tabForField', () => {
   it('opens the dates tab for a date, the acceptance tab for S16 and general for the rest', () => {
      expect(tabForField('eta')).toBe('dates');
      expect(tabForField('delivered_at')).toBe('dates');
      expect(tabForField('has_damage')).toBe('acceptance');
      expect(tabForField('dispute_deadline_at')).toBe('acceptance');
      expect(tabForField('mode')).toBe('general');
   });
});

describe('useShipmentForm', () => {
   it("gives a new shipment the chosen customer's default warehouse", async () => {
      api.lookups.customer_warehouse = [{ id: 'w1', is_default: true }];
      useShipmentForm(() => null);

      api.values.value.customer_id = CUSTOMER;
      await nextTick();

      expect(api.values.value.delivery_warehouse_id).toBe('w1');
      expect(api.lookupCalls.at(-1)).toMatchObject({
         table: 'customer_warehouse',
         options: { in: { column: 'customer_id', values: [CUSTOMER] } }
      });
   });

   it('keeps a warehouse of the customer already chosen', async () => {
      api.lookups.customer_warehouse = [
         { id: 'w1', is_default: true },
         { id: 'w2', is_default: false }
      ];
      useShipmentForm(() => null);

      api.values.value.customer_id = CUSTOMER;
      api.values.value.delivery_warehouse_id = 'w2';
      await nextTick();

      expect(api.values.value.delivery_warehouse_id).toBe('w2');
   });

   it('saves the dispute deadline only when it was edited after loading', () => {
      const loaded = toShipmentFormValues({
         id: SHIPMENT,
         customer_id: CUSTOMER,
         mode: 'road',
         delivery_warehouse_id: '00000000-0000-4000-8000-000000000401',
         dispute_deadline_at: '2027-01-12T10:00:00+00:00'
      });
      api.initialValues = ref(loaded);
      useShipmentForm(() => SHIPMENT);
      const toPayload = (deadline: Date | null) =>
         api.options!.toPayload(shipmentSchema.parse({ ...loaded, dispute_deadline_at: deadline }));

      expect(toPayload(new Date('2027-01-12T10:00:00Z'))).not.toHaveProperty('dispute_deadline_at');
      expect(toPayload(new Date('2027-01-14T10:00:00Z'))).toMatchObject({
         dispute_deadline_at: '2027-01-14T10:00:00.000Z'
      });
   });
});

describe('status warnings', () => {
   const t = (key: string, named?: Record<string, unknown>) => i18n.t(key, named ?? {}) as string;

   it('warns of the orders without a PSI on loading, and of the data a move needs', () => {
      const warnings = shipmentStatusWarnings(
         ['booked', 'loaded', 'cancelled'],
         {
            purchase_order_ids: [],
            product_ids: ['p1'],
            booking_confirmed_on: null,
            psi_missing_po_codes: ['PO-THO-2026-001']
         } as unknown as ShipmentOverviewRow,
         null,
         t
      );

      expect(warnings.loaded).toBe(
         i18n.t('ops.shipment.psi_warning', { codes: 'PO-THO-2026-001' })
      );
      expect(warnings.booked).toContain(i18n.t('errors.shipment_po_required'));
      expect(warnings.booked).toContain(i18n.t('errors.shipment_booking_date_required'));
      expect(warnings).not.toHaveProperty('cancelled');
   });

   it('does not warn on loading when every order has its PSI', () => {
      const warnings = shipmentStatusWarnings(
         ['loaded'],
         { product_ids: ['p1'], psi_missing_po_codes: [] } as unknown as ShipmentOverviewRow,
         null,
         (key) => key
      );
      expect(warnings).toEqual({});
   });

   it('warns that a shipment without lines is not loaded', () => {
      const warnings = shipmentStatusWarnings(
         ['loaded'],
         { product_ids: [], psi_missing_po_codes: [] } as unknown as ShipmentOverviewRow,
         null,
         (key) => key
      );
      expect(warnings).toEqual({ loaded: 'errors.shipment_lines_required' });
   });
});

describe('general tab', () => {
   it("shows the warehouse's dock hours and appointment rule under it", () => {
      const form = standInForm(shipment('planned'), [
         {
            id: 'w1',
            display_name: 'Rosbach',
            city: 'Rosbach',
            is_default: true,
            dock_hours: 'Mo–Fr 07:00–14:00',
            appointment_rule: 'Book 48 h ahead'
         }
      ]);
      const wrapper = mountTab(General, form);

      expect(wrapper.get('[data-test="dock-hours"]').text()).toContain('Mo–Fr 07:00–14:00');
      expect(wrapper.get('[data-test="appointment-rule"]').text()).toContain('Book 48 h ahead');
      expect(wrapper.text()).toContain(i18n.t('ops.shipment.packing_list_hint'));
   });
});

describe('orders tab', () => {
   it('offers no change to orders or lines once the shipment is loaded', () => {
      const wrapper = mountTab(Orders, standInForm(shipment('loaded')));

      expect(wrapper.findAll('[data-order]')).toHaveLength(2);
      expect(wrapper.find('[data-test="add-order"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="remove-order"]').exists()).toBe(false);
      expect(wrapper.find('[data-test="remove-line"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-shipment-line-add"]').exists()).toBe(false);
      expect(wrapper.find('[data-link="ops-shipment-line-edit"]').exists()).toBe(false);
      expect(wrapper.findAll('button')).toHaveLength(0);
   });

   it("adds lines that are not on it, edits those that are, and shows each one's quantity", () => {
      const wrapper = mountTab(Orders, standInForm(shipment('planned')));

      const adds = wrapper.findAll('[data-link="ops-shipment-line-add"]');
      expect(
         adds.map((link) => JSON.parse(link.attributes('data-query')!).purchaseOrderLineId)
      ).toEqual([L2, L3]);
      expect(JSON.parse(adds[0]!.attributes('data-params')!)).toEqual({ shipmentId: SHIPMENT });
      const edits = wrapper.findAll('[data-link="ops-shipment-line-edit"]');
      expect(edits).toHaveLength(1);
      expect(JSON.parse(edits[0]!.attributes('data-params')!)).toEqual({ id: 'sl0' });
      expect(wrapper.get(`[data-line="${L1}"]`).text()).toBe('40');
      expect(wrapper.get(`[data-line="${L2}"]`).text()).toBe('');
   });

   it('removes only an order without lines on the shipment', async () => {
      const wrapper = mountTab(Orders, standInForm(shipment('planned')));

      const remove = (po: string) => wrapper.get(`[data-order="${po}"] [data-test="remove-order"]`);
      expect(remove(PO1).attributes()).toHaveProperty('disabled');
      expect(remove(PO2).attributes()).not.toHaveProperty('disabled');

      await remove(PO2).trigger('click');
      await flushPromises();
      expect(api.unlink).toHaveBeenCalledExactlyOnceWith({
         shipmentId: SHIPMENT,
         purchaseOrderId: PO2
      });
   });

   it('removes a line from the shipment', async () => {
      const wrapper = mountTab(Orders, standInForm(shipment('booked')));
      await wrapper.get(`[data-actions="${L1}"] [data-test="remove-line"]`).trigger('click');
      await flushPromises();
      expect(api.deleteRow).toHaveBeenCalledExactlyOnceWith({ id: 'sl0' });
   });

   it("offers the customer's open orders that are not on it, and links one", async () => {
      api.lookups.purchase_order_overview = [
         { id: PO1, code: 'PO-THO-2026-001', status: 'deposit_paid', customer_id: CUSTOMER },
         { id: 'po3', code: 'PO-THO-2026-003', status: 'ready', customer_id: CUSTOMER },
         { id: 'po4', code: 'PO-XYZ-2026-001', status: 'ready', customer_id: 'other' }
      ];
      const wrapper = mountTab(Orders, standInForm(shipment('planned')), {
         psi_missing_po_codes: ['PO-THO-2026-002']
      });

      expect(wrapper.findAll('[data-test="psi-missing"]')).toHaveLength(1);
      expect(wrapper.find(`[data-order="${PO2}"] [data-test="psi-missing"]`).exists()).toBe(true);

      await wrapper.get('[data-test="add-order"]').trigger('click');
      await flushPromises();

      const { options } = api.lookupCalls.find(({ table }) => table === 'purchase_order_overview')!;
      expect(options).toEqual({
         select: 'id, code, status, customer_id',
         in: {
            column: 'status',
            values: ['pi_approved', 'deposit_paid', 'in_production', 'ready', 'balance_paid']
         }
      });
      const offered = wrapper.findAll('[data-test="order-option"]');
      expect(offered.map((option) => option.attributes('data-option'))).toEqual(['po3']);

      await offered[0]!.trigger('click');
      await flushPromises();
      expect(api.link).toHaveBeenCalledExactlyOnceWith({
         shipmentId: SHIPMENT,
         purchaseOrderId: 'po3',
         tenantId: 't1'
      });
   });
});

describe('acceptance tab', () => {
   it('lists the SDS, still missing, for a shipment with a hazardous line', () => {
      api.lookups.document = [];
      const wrapper = mountTab(Acceptance, standInForm(shipment('in_transit', { hazmat: true })));

      const sds = wrapper.get('[data-doc-type="sds"]');
      expect(sds.attributes('data-status')).toBe('');
      expect(sds.text()).toContain(i18n.t('ops.document.type.sds'));
      expect(sds.text()).toContain(i18n.t('ops.shipment.document_missing'));
   });

   it("leaves the SDS out and shows each document's status otherwise", () => {
      api.lookups.document = [
         {
            id: 'd1',
            entity_type: 'shipment',
            type: 'packing_list',
            status: 'approved',
            version: 2
         },
         {
            id: 'd2',
            entity_type: 'shipment',
            type: 'packing_list',
            status: 'superseded',
            version: 3
         }
      ];
      const wrapper = mountTab(Acceptance, standInForm(shipment('in_transit')));

      expect(wrapper.find('[data-doc-type="sds"]').exists()).toBe(false);
      expect(wrapper.findAll('[data-doc-type]')).toHaveLength(5);
      expect(wrapper.get('[data-doc-type="packing_list"]').attributes('data-status')).toBe(
         'approved'
      );
      expect(api.lookupCalls.find(({ table }) => table === 'document')!.options).toMatchObject({
         in: { column: 'entity_id', values: [SHIPMENT] }
      });
   });

   it('names what keeps a delivered shipment from being accepted', () => {
      api.lookups.document = [];
      const wrapper = mountTab(Acceptance, standInForm(shipment('delivered')));

      expect(wrapper.find('[data-hint="shipment_delivery_receipt_required"]').text()).toBe(
         i18n.t('errors.shipment_delivery_receipt_required')
      );
      expect(wrapper.find('[data-hint="shipment_acceptance_issue"]').exists()).toBe(true);
   });

   it('names nothing once the receipt is signed and the goods are in order', () => {
      api.lookups.document = [
         {
            id: 'd1',
            entity_type: 'shipment',
            type: 'delivery_receipt',
            status: 'signed',
            version: 1
         }
      ];
      const form = standInForm(shipment('delivered'));
      form.values.value.quantity_matches = true;
      form.values.value.has_damage = false;
      const wrapper = mountTab(Acceptance, form);

      expect(wrapper.find('[data-hint]').exists()).toBe(false);
   });
});

describe('events tab', () => {
   it('labels each event with its S15 step, or as other', () => {
      api.events = [
         {
            id: 'e2',
            happened_at: '2026-11-03T10:00:00Z',
            step: 4,
            from_party: 'Forwarder',
            to_party: 'MOESA',
            channel: 'email',
            note: 'Booked'
         },
         {
            id: 'e1',
            happened_at: '2026-11-02T10:00:00Z',
            step: null,
            from_party: null,
            to_party: null,
            channel: null,
            note: 'Call'
         }
      ];
      const wrapper = mountTab(Events, standInForm(shipment('booked')));

      const rows = wrapper.findAll('[data-event]');
      expect(rows.map((row) => row.attributes('data-event'))).toEqual(['e2', 'e1']);
      expect(rows[0]!.text()).toContain(i18n.t('ops.shipment.steps.4'));
      expect(rows[0]!.text()).toContain('Forwarder → MOESA');
      expect(rows[1]!.text()).toContain(i18n.t('ops.shipment.steps.other'));
      expect(wrapper.find('[data-link="ops-shipment-event-add"]').exists()).toBe(true);
      expect(wrapper.findAll('[data-link="ops-shipment-event-edit"]')).toHaveLength(2);
   });
});

describe('shipment table', () => {
   const ResourceTable = defineComponent({
      name: 'ResourceTable',
      props: ['filters', 'from'],
      setup: (props) => {
         api.tableMounted = true;
         return () => h('div', { 'data-table': props.from });
      }
   });

   const mountTable = async (filters: Record<string, unknown>) => {
      const wrapper = mount(ShipmentTable, {
         props: { filters },
         global: { plugins: [i18NPlugin, PrimeVue], stubs: { ResourceTable } }
      });
      await flushPromises();
      return wrapper;
   };

   it('shows no table, but "no shipments", for no orders', async () => {
      api.ids = [];
      const wrapper = await mountTable({ purchaseOrderIds: [] });

      expect(api.idFilters.at(-1)).toEqual({ purchaseOrderIds: [] });
      expect(api.tableMounted).toBe(false);
      expect(wrapper.text()).toContain(i18n.t('ops.shipment.no_rows'));
   });

   it('shows no table while the shipments of a product load', async () => {
      const wrapper = await mountTable({ productId: 'p1' });
      expect(wrapper.find('[data-table]').exists()).toBe(false);
   });
});

describe('shipment line dialog', () => {
   const mountLine = async (
      props: Record<string, unknown>,
      values: Partial<ShipmentLineFormValues> = {}
   ) => {
      api.values = ref({
         ...toShipmentLineFormValues(),
         ...values
      }) as unknown as typeof api.values;
      const wrapper = mount(
         defineComponent({
            render: () => h(Suspense, null, { default: () => h(LineUpsert, props) })
         }),
         {
            global: {
               plugins: [i18NPlugin, PrimeVue],
               directives: { focustrap: {} },
               stubs: { FormBox: Slot, FormField: Slot }
            }
         }
      );
      await flushPromises();
      return wrapper;
   };

   beforeEach(() => {
      api.shipment = shipment('planned');
      api.lookups.shipment_line = [
         { quantity: 30, shipment_id: 'other-1', shipment: { status: 'booked' } },
         { quantity: 50, shipment_id: 'other-2', shipment: { status: 'cancelled' } },
         { quantity: 40, shipment_id: SHIPMENT, shipment: { status: 'planned' } }
      ];
   });

   it('starts a new line at what is still to ship, tolerance included', async () => {
      const wrapper = await mountLine({ shipmentId: SHIPMENT, purchaseOrderLineId: L1 });

      // 100 ordered + 10 % = 110, less the 30 on another shipment that is not cancelled.
      expect((api.values as Ref<ShipmentLineFormValues>).value.quantity).toBe(80);
      expect(wrapper.get('[data-test="remaining"]').text()).toBe(
         i18n.t('ops.shipment.remaining', { count: 80 })
      );
      expect(api.lookupCalls.find(({ table }) => table === 'shipment_line')!.options).toEqual({
         select: 'quantity, shipment_id, shipment!shipment_line_shipment_fkey(status)',
         in: { column: 'purchase_order_line_id', values: [L1] }
      });
   });

   it("saves a new line on the route's shipment, order and order line", async () => {
      await mountLine({ shipmentId: SHIPMENT, purchaseOrderLineId: L1 }, { carton_count: 8 });
      const values = (api.values as Ref<ShipmentLineFormValues>).value;

      expect(api.options!.toPayload(shipmentLineSchema.parse(values))).toEqual({
         shipment_id: SHIPMENT,
         purchase_order_id: PO1,
         purchase_order_line_id: L1,
         quantity: 80,
         carton_count: 8
      });
   });

   it('keeps the quantity of a draft for the same order line', async () => {
      await mountLine(
         { shipmentId: SHIPMENT, purchaseOrderLineId: L1 },
         { purchase_order_line_id: L1, quantity: 12 }
      );
      expect((api.values as Ref<ShipmentLineFormValues>).value.quantity).toBe(12);
   });

   it('restarts a draft left from another order line', async () => {
      await mountLine(
         { shipmentId: SHIPMENT, purchaseOrderLineId: L1 },
         { purchase_order_line_id: L3, purchase_order_id: PO2, quantity: 5, carton_count: 1 }
      );
      const values = (api.values as Ref<ShipmentLineFormValues>).value;
      expect(values).toMatchObject({
         purchase_order_line_id: L1,
         purchase_order_id: PO1,
         quantity: 80,
         carton_count: null
      });
   });
});
