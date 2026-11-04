import {
   acceptanceHints,
   defaultWarehouseId,
   documentChecklist,
   etaState,
   isShipmentLocked,
   nextShipmentStatuses,
   remainingQuantity,
   S15_STEPS,
   SHIPMENT_SELECT,
   SHIPMENT_STATUSES,
   shipmentEventSchema,
   shipmentLineSchema,
   shipmentSchema,
   shipmentStatusHints,
   toShipmentEventFormValues,
   toShipmentEventPayload,
   toShipmentFormValues,
   toShipmentLineFormValues,
   toShipmentLinePayload,
   toShipmentPayload,
   useLinkPurchaseOrder,
   useSetShipmentStatus,
   useShipmentIds,
   useShipmentOverview,
   useUnlinkPurchaseOrder
} from '@/api/shipment';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

// Every builder call as [method, ...args]; throwOnError resolves with `response`.
const recorded: unknown[][] = [];
let response: unknown = null;
const builder: object = new Proxy(
   {},
   {
      get: (_, method: string) =>
         method === 'then'
            ? undefined
            : (...args: unknown[]) => {
                 recorded.push([method, ...args]);
                 return method === 'throwOnError'
                    ? Promise.resolve({ data: response, error: null })
                    : builder;
              }
   }
);
vi.mock('@/lib/supabase', () => ({
   supabase: {
      from: (table: string) => {
         recorded.push(['from', table]);
         return builder;
      }
   }
}));
vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => computed(() => 't1') }));

const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const W = '00000000-0000-4000-8000-000000000003';
const SHIPMENT = '00000000-0000-4000-8000-000000000004';
const ORDER = '00000000-0000-4000-8000-000000000005';
const ORDER_LINE = '00000000-0000-4000-8000-000000000006';

/** Runs a composable inside a component with its own query client. */
const withSetup = <T>(composable: () => T): T => {
   let result!: T;
   mount(
      defineComponent({
         setup() {
            result = composable();
            return () => h('div');
         }
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
   );
   return result;
};

beforeEach(() => {
   recorded.length = 0;
   response = null;
});

describe('nextShipmentStatuses', () => {
   it('follows the transitions of shipment_guard (031)', () => {
      expect(nextShipmentStatuses('planned')).toEqual(['booked', 'cancelled']);
      expect(nextShipmentStatuses('booked')).toEqual(['loaded', 'cancelled']);
      expect(nextShipmentStatuses('loaded')).toEqual(['in_transit']);
      expect(nextShipmentStatuses('in_transit')).toEqual(['at_customs', 'delivered']);
      expect(nextShipmentStatuses('at_customs')).toEqual(['delivered']);
      expect(nextShipmentStatuses('delivered')).toEqual(['accepted', 'disputed']);
      expect(nextShipmentStatuses('disputed')).toEqual(['accepted']);
      expect(nextShipmentStatuses('accepted')).toEqual([]);
      expect(nextShipmentStatuses('cancelled')).toEqual([]);
   });

   it('lists the statuses in enum order and locks from loaded on, cancelled included', () => {
      expect(SHIPMENT_STATUSES[0]).toBe('planned');
      expect(SHIPMENT_STATUSES.at(-1)).toBe('cancelled');
      expect(SHIPMENT_STATUSES.filter(isShipmentLocked)).toEqual([
         'loaded',
         'in_transit',
         'at_customs',
         'delivered',
         'accepted',
         'disputed',
         'cancelled'
      ]);
   });
});

describe('shipmentStatusHints', () => {
   const ready = {
      purchase_order_ids: [ORDER],
      booking_confirmed_on: '2027-01-02',
      etd: '2027-01-03',
      eta: '2027-01-20',
      delivered_at: '2027-01-21T10:00:00Z',
      quantity_matches: true,
      has_damage: false
   };

   it('names the data a status needs before the database refuses it', () => {
      const empty = {
         ...ready,
         purchase_order_ids: [],
         booking_confirmed_on: null,
         etd: null,
         delivered_at: null
      };
      expect(shipmentStatusHints('booked', empty, null)).toEqual([
         'shipment_po_required',
         'shipment_booking_date_required'
      ]);
      expect(shipmentStatusHints('in_transit', empty, null)).toEqual(['shipment_eta_required']);
      expect(shipmentStatusHints('delivered', empty, null)).toEqual([
         'shipment_delivery_time_required'
      ]);
      expect(shipmentStatusHints('accepted', empty, 'draft')).toEqual([
         'shipment_delivery_receipt_required'
      ]);
   });

   it('names nothing when the data is there or the status needs none', () => {
      for (const status of SHIPMENT_STATUSES)
         expect(shipmentStatusHints(status, ready, 'signed')).toEqual([]);
   });
});

describe('remainingQuantity', () => {
   it('caps at the ordered quantity plus the tolerance, never below 0', () => {
      expect(remainingQuantity(1000, 5, 1000)).toBe(50);
      expect(remainingQuantity(1000, null, 1200)).toBe(0);
      expect(remainingQuantity(1000, 0, 400)).toBe(600);
   });

   it('floors the tolerance as the database does, without float error', () => {
      // floor(333 × 1.025) = floor(341.325) = 341.
      expect(remainingQuantity(333, 2.5, 0)).toBe(341);
      // 1.15 × 100 is 114.99999999999999 in floats.
      expect(remainingQuantity(100, 15, 0)).toBe(115);
   });
});

describe('defaultWarehouseId', () => {
   it('takes the default warehouse, else the only one', () => {
      expect(
         defaultWarehouseId([
            { id: 'a', is_default: false },
            { id: 'b', is_default: true }
         ])
      ).toBe('b');
      expect(defaultWarehouseId([{ id: 'a', is_default: false }])).toBe('a');
      expect(
         defaultWarehouseId([
            { id: 'a', is_default: false },
            { id: 'c', is_default: false }
         ])
      ).toBeNull();
      expect(defaultWarehouseId([])).toBeNull();
   });
});

describe('documentChecklist', () => {
   it("gives each shipping document's newest status that is not superseded", () => {
      const list = documentChecklist(
         [
            { type: 'packing_list', status: 'superseded', version: 1 },
            { type: 'packing_list', status: 'approved', version: 2 },
            { type: 'commercial_invoice', status: 'superseded', version: 1 },
            { type: 'customs', status: 'signed', version: 1 },
            { type: 'customs', status: 'draft', version: 2 },
            { type: 'pi', status: 'approved', version: 1 }
         ],
         false
      );
      expect(list).toEqual(
         expect.arrayContaining([
            { type: 'packing_list', status: 'approved' },
            { type: 'bill_of_lading', status: null }
         ])
      );
      expect(list).toEqual([
         { type: 'commercial_invoice', status: null },
         { type: 'packing_list', status: 'approved' },
         { type: 'bill_of_lading', status: null },
         { type: 'certificate', status: null },
         { type: 'customs', status: 'draft' }
      ]);
   });

   it('asks for the SDS of hazardous goods only', () => {
      expect(documentChecklist([], false).map((r) => r.type)).not.toContain('sds');
      expect(documentChecklist([], true).map((r) => r.type)).toContain('sds');
   });
});

describe('acceptanceHints', () => {
   it('names what keeps the shipment from being accepted', () => {
      expect(acceptanceHints({ quantity_matches: true, has_damage: false }, null)).toEqual([
         'shipment_delivery_receipt_required'
      ]);
      expect(acceptanceHints({ quantity_matches: true, has_damage: true }, 'approved')).toEqual([
         'shipment_acceptance_issue'
      ]);
      expect(acceptanceHints({ quantity_matches: null, has_damage: false }, 'signed')).toEqual([
         'shipment_acceptance_issue'
      ]);
      expect(acceptanceHints({ quantity_matches: true, has_damage: false }, 'signed')).toEqual([]);
      expect(acceptanceHints({ quantity_matches: false, has_damage: null }, 'draft')).toEqual([
         'shipment_delivery_receipt_required',
         'shipment_acceptance_issue'
      ]);
   });
});

describe('etaState', () => {
   it('flags a late or close ETA until the goods are delivered', () => {
      expect(etaState({ eta: '2027-01-09', status: 'in_transit' }, '2027-01-10')).toBe('late');
      expect(etaState({ eta: '2027-01-15', status: 'loaded' }, '2027-01-10')).toBe('this_week');
      expect(etaState({ eta: '2027-01-17', status: 'booked' }, '2027-01-10')).toBe('this_week');
      expect(etaState({ eta: '2027-01-18', status: 'booked' }, '2027-01-10')).toBe('later');
      expect(etaState({ eta: '2027-01-10', status: 'at_customs' }, '2027-01-10')).toBe('this_week');
      expect(etaState({ eta: '2027-01-09', status: 'delivered' }, '2027-01-10')).toBeNull();
      expect(etaState({ eta: '2027-01-09', status: 'cancelled' }, '2027-01-10')).toBeNull();
      expect(etaState({ eta: null, status: 'planned' }, '2027-01-10')).toBeNull();
   });
});

describe('shipment form', () => {
   it('sends the customer with a new shipment and the delivery time as an instant', () => {
      expect(
         toShipmentPayload(
            shipmentSchema.parse({
               ...toShipmentFormValues({
                  customer_id: CUSTOMER,
                  mode: 'fcl20',
                  delivery_warehouse_id: W
               }),
               delivered_at: new Date('2027-01-10T10:00:00Z')
            })
         )
      ).toMatchObject({ customer_id: CUSTOMER, delivered_at: '2027-01-10T10:00:00.000Z' });
   });

   it("never sends a saved shipment's customer, code, status or acceptance date", () => {
      const payload = toShipmentPayload(
         shipmentSchema.parse(
            toShipmentFormValues({
               id: SHIPMENT,
               code: 'SHP-THO-2027-001',
               status: 'delivered',
               accepted_on: '2027-01-12',
               customer_id: CUSTOMER,
               mode: 'road',
               delivery_warehouse_id: W,
               incoterm_buy: 'FOB',
               eta: '2027-01-09',
               dispute_deadline_at: '2027-01-12T10:00:00+00:00',
               volume_m3: 12.5,
               forwarder: ''
            })
         )
      );
      expect(payload).toMatchObject({
         id: SHIPMENT,
         mode: 'road',
         delivery_warehouse_id: W,
         incoterm_buy: 'FOB',
         incoterm_sell: null,
         eta: '2027-01-09',
         delivered_at: null,
         dispute_deadline_at: '2027-01-12T10:00:00.000Z',
         volume_m3: 12.5,
         forwarder: null,
         is_insured: false
      });
      for (const key of ['customer_id', 'code', 'status', 'accepted_on'])
         expect(payload).not.toHaveProperty(key);
   });

   it('refuses a term that is not Incoterms 2020 and requires the mode and warehouse', () => {
      const values = toShipmentFormValues({ customer_id: CUSTOMER });
      expect(shipmentSchema.safeParse(values).success).toBe(false);
      expect(
         shipmentSchema.safeParse({ ...values, mode: 'air', delivery_warehouse_id: W }).success
      ).toBe(true);
      expect(
         shipmentSchema.safeParse({
            ...values,
            mode: 'air',
            delivery_warehouse_id: W,
            incoterm_sell: 'DAT'
         }).success
      ).toBe(false);
   });
});

describe('shipment line form', () => {
   const line = {
      shipment_id: SHIPMENT,
      purchase_order_id: ORDER,
      purchase_order_line_id: ORDER_LINE,
      quantity: 500
   };

   it('sends the shipment with a new line only', () => {
      expect(
         toShipmentLinePayload(shipmentLineSchema.parse(toShipmentLineFormValues(line)))
      ).toEqual({ ...line, carton_count: null });
      expect(
         toShipmentLinePayload(
            shipmentLineSchema.parse(
               toShipmentLineFormValues({ ...line, id: 'l1', carton_count: 20 })
            )
         )
      ).toEqual({
         id: 'l1',
         purchase_order_id: ORDER,
         purchase_order_line_id: ORDER_LINE,
         quantity: 500,
         carton_count: 20
      });
   });

   it('ships at least one piece', () => {
      expect(shipmentLineSchema.safeParse({ ...line, quantity: 0 }).success).toBe(false);
      expect(shipmentLineSchema.safeParse({ ...line, quantity: 1.5 }).success).toBe(false);
   });
});

describe('shipment event form', () => {
   it('sends the time as an instant and "other" as no step', () => {
      const values = toShipmentEventFormValues({
         shipment_id: SHIPMENT,
         happened_at: '2027-01-03T08:30:00+00:00',
         step: 4,
         channel: 'e-mail'
      });
      expect(toShipmentEventPayload(shipmentEventSchema.parse(values))).toEqual({
         shipment_id: SHIPMENT,
         happened_at: '2027-01-03T08:30:00.000Z',
         step: 4,
         from_party: null,
         to_party: null,
         channel: 'e-mail',
         note: null
      });
      expect(
         toShipmentEventPayload(shipmentEventSchema.parse({ ...values, step: null })).step
      ).toBeNull();
   });

   it('takes the S15 steps 1 to 20 only, and requires the time', () => {
      expect(S15_STEPS).toHaveLength(20);
      const values = toShipmentEventFormValues({ shipment_id: SHIPMENT });
      expect(shipmentEventSchema.safeParse(values).success).toBe(false);
      const timed = { ...values, happened_at: new Date() };
      expect(shipmentEventSchema.safeParse({ ...timed, step: 20 }).success).toBe(true);
      expect(shipmentEventSchema.safeParse({ ...timed, step: 21 }).success).toBe(false);
   });
});

describe('SHIPMENT_SELECT', () => {
   it('embeds by the composite foreign keys', () => {
      for (const embed of [
         'customer!shipment_customer_fkey(',
         'customer_warehouse!shipment_warehouse_fkey(',
         'shipment_purchase_order!shipment_purchase_order_shipment_fkey(',
         'purchase_order!shipment_purchase_order_po_fkey(',
         'purchase_order_line!purchase_order_line_po_fkey(',
         'product!purchase_order_line_product_fkey(sku, display_name, is_hazmat)',
         'shipment_line!shipment_line_shipment_fkey(*)'
      ])
         expect(SHIPMENT_SELECT).toContain(embed);
   });
});

describe('useShipmentIds', () => {
   it('finds the shipments of any of the orders', async () => {
      response = [{ id: 's1' }, { id: 's2' }];
      const query = withSetup(() => useShipmentIds({ purchaseOrderIds: [ORDER, 'p2'] }));
      await flushPromises();

      expect(recorded).toEqual(
         expect.arrayContaining([
            ['from', 'shipment_overview'],
            ['select', 'id'],
            ['overlaps', 'purchase_order_ids', [ORDER, 'p2']]
         ])
      );
      expect(recorded.map(([method]) => method)).not.toContain('contains');
      expect(query.data.value).toEqual(['s1', 's2']);
   });

   it('finds the shipments of a product', async () => {
      response = [{ id: 's3' }];
      const query = withSetup(() => useShipmentIds({ productId: 'p1' }));
      await flushPromises();

      expect(recorded).toContainEqual(['contains', 'product_ids', ['p1']]);
      expect(recorded.map(([method]) => method)).not.toContain('overlaps');
      expect(query.data.value).toEqual(['s3']);
   });

   it('asks nothing for no orders, and yields no shipments', async () => {
      const query = withSetup(() => useShipmentIds({ purchaseOrderIds: [] }));
      await flushPromises();

      expect(recorded).toEqual([]);
      expect(query.data.value).toEqual([]);
   });
});

describe('useShipmentOverview', () => {
   it('reads one row of shipment_overview', async () => {
      response = { id: SHIPMENT, psi_missing_po_codes: [] };
      const query = withSetup(() => useShipmentOverview(SHIPMENT));
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'shipment_overview'],
         ['select', '*'],
         ['eq', 'id', SHIPMENT],
         ['abortSignal', expect.anything()],
         ['maybeSingle'],
         ['throwOnError']
      ]);
      expect(query.data.value).toEqual(response);
   });
});

describe('shipment mutations', () => {
   it('patches the status only', async () => {
      response = { id: SHIPMENT, status: 'booked' };
      const mutation = withSetup(useSetShipmentStatus);
      await mutation.mutateAsync({ id: SHIPMENT, status: 'booked' });

      expect(recorded).toEqual(
         expect.arrayContaining([
            ['from', 'shipment'],
            ['update', { status: 'booked' }],
            ['eq', 'id', SHIPMENT]
         ])
      );
   });

   it('links an order without its customer, which the database takes from the shipment', async () => {
      const mutation = withSetup(useLinkPurchaseOrder);
      await mutation.mutateAsync({ shipmentId: SHIPMENT, purchaseOrderId: ORDER });

      expect(recorded).toEqual([
         ['from', 'shipment_purchase_order'],
         ['insert', { shipment_id: SHIPMENT, purchase_order_id: ORDER }],
         ['throwOnError']
      ]);
   });

   it("links an order in the shipment's tenant when it is given", async () => {
      const mutation = withSetup(useLinkPurchaseOrder);
      await mutation.mutateAsync({ shipmentId: SHIPMENT, purchaseOrderId: ORDER, tenantId: 't2' });

      expect(recorded).toContainEqual([
         'insert',
         { shipment_id: SHIPMENT, purchase_order_id: ORDER, tenant_id: 't2' }
      ]);
   });

   it('unlinks an order by its two keys', async () => {
      const mutation = withSetup(useUnlinkPurchaseOrder);
      await mutation.mutateAsync({ shipmentId: SHIPMENT, purchaseOrderId: ORDER });

      expect(recorded).toEqual([
         ['from', 'shipment_purchase_order'],
         ['delete'],
         ['match', { shipment_id: SHIPMENT, purchase_order_id: ORDER }],
         ['throwOnError']
      ]);
   });
});
