import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { DocumentRow, DocumentStatus, DocumentType } from '@/api/document';
import type { ProductRow } from '@/api/product';
import { INCOTERMS, type PurchaseOrderLineRow, type PurchaseOrderRow } from '@/api/purchaseOrder';
import { toUnits } from '@/api/purchaseOrder/figures';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { updateRow } from '@/api/saveRow';
import { useTenantKey } from '@/api/useTenantKey';
import { allValues } from '@/lib/enumValues';
import { dateOnly, optional, parseDateOnly, required } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import dayjs from 'dayjs';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type ShipmentStatus = Enums['shipment_status'];
export type ShipmentMode = Enums['shipment_mode'];
export type ShipmentRow = Tables['shipment']['Row'];
export type ShipmentLineRow = Tables['shipment_line']['Row'];
export type ShipmentEventRow = Tables['shipment_event']['Row'];
/**
 * A shipment with its customer code, warehouse name, order ids and codes, product ids and
 * psi_missing_po_codes. The view is security_invoker, so psi_missing_po_codes follows the caller's
 * document visibility: a user who cannot read documents sees every order flagged. Show it as a
 * warning only (ops.shipment.psi_warning), never as a rule.
 */
export type ShipmentOverviewRow = Views['shipment_overview']['Row'];

/** An order on the shipment as the card loads it: with its lines and their products. */
export type ShipmentCardOrder = Pick<
   PurchaseOrderRow,
   'id' | 'code' | 'status' | 'tolerance_pct'
> & {
   purchase_order_line: (Pick<PurchaseOrderLineRow, 'id' | 'quantity'> & {
      product: Pick<ProductRow, 'sku' | 'display_name' | 'is_hazmat'> | null;
   })[];
};

/** A shipment as its card loads it (SHIPMENT_SELECT). */
export type ShipmentCard = ShipmentRow & {
   customer: Pick<Tables['customer']['Row'], 'code' | 'display_name'> | null;
   customer_warehouse: Pick<
      Tables['customer_warehouse']['Row'],
      'display_name' | 'city' | 'dock_hours' | 'appointment_rule'
   > | null;
   shipment_purchase_order: { purchase_order: ShipmentCardOrder | null }[];
   shipment_line: ShipmentLineRow[];
};

// --- constants ---

export const SHIPMENT_STATUSES = allValues<ShipmentStatus>()([
   'planned',
   'booked',
   'loaded',
   'in_transit',
   'at_customs',
   'delivered',
   'accepted',
   'disputed',
   'cancelled'
]);

/** The Tag severity of each status, for lists and the card. */
export const SHIPMENT_STATUS_SEVERITY: Record<ShipmentStatus, string> = {
   planned: 'secondary',
   booked: 'info',
   loaded: 'info',
   in_transit: 'warn',
   at_customs: 'warn',
   delivered: 'warn',
   accepted: 'success',
   disputed: 'danger',
   cancelled: 'secondary'
};

export const SHIPMENT_MODES = allValues<ShipmentMode>()([
   'fcl20',
   'fcl40',
   'lcl',
   'road',
   'courier',
   'air'
]);

/** The S15 §B rows an event may name (shipment_event.step); no step means "other". */
export const S15_STEPS = [
   1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
] as const;
export type S15Step = (typeof S15_STEPS)[number];

/**
 * The shipping documents of M8: CI, packing list, B/L or CMR, the origin certificate or A.TR
 * (certificate), the customs instruction (customs) and, for hazardous goods, the SDS.
 */
export const SHIPMENT_DOCUMENT_TYPES = [
   'commercial_invoice',
   'packing_list',
   'bill_of_lading',
   'certificate',
   'customs',
   'sds'
] as const satisfies readonly DocumentType[];

// --- status flow ---

const statusIndex = (status: ShipmentStatus) => SHIPMENT_STATUSES.indexOf(status);

/** From loaded on (cancelled included) the orders and lines no longer change (shipment_locked). */
export const isShipmentLocked = (status: ShipmentStatus) =>
   statusIndex(status) >= statusIndex('loaded');

/** The transitions of private.shipment_guard (031, rule 2); accepted and cancelled are final. */
const NEXT_STATUSES: Record<ShipmentStatus, ShipmentStatus[]> = {
   planned: ['booked', 'cancelled'],
   booked: ['loaded', 'cancelled'],
   loaded: ['in_transit'],
   in_transit: ['at_customs', 'delivered'],
   at_customs: ['delivered'],
   delivered: ['accepted', 'disputed'],
   disputed: ['accepted'],
   accepted: [],
   cancelled: []
};

export const nextShipmentStatuses = (status: ShipmentStatus): ShipmentStatus[] => [
   ...NEXT_STATUSES[status]
];

export type AcceptanceHint = 'shipment_delivery_receipt_required' | 'shipment_acceptance_issue';

/**
 * What keeps a delivered shipment from being accepted (031, rule 6): the delivery receipt
 * (`receiptStatus`, signed or approved) and no reservation. A display hint only; the DB decides.
 */
export function acceptanceHints(
   { quantity_matches, has_damage }: Pick<ShipmentRow, 'quantity_matches' | 'has_damage'>,
   receiptStatus: DocumentStatus | null
): AcceptanceHint[] {
   const hints: AcceptanceHint[] = [];
   if (receiptStatus !== 'signed' && receiptStatus !== 'approved')
      hints.push('shipment_delivery_receipt_required');
   if (quantity_matches !== true || has_damage !== false) hints.push('shipment_acceptance_issue');
   return hints;
}

export type StatusHint =
   | AcceptanceHint
   | 'shipment_po_required'
   | 'shipment_booking_date_required'
   | 'shipment_eta_required'
   | 'shipment_delivery_time_required';

/**
 * The data the database requires on entering `status` (031, rules 3–6) that the shipment lacks, as
 * errors.<code> keys, in the guard's order. A display hint only; the DB decides.
 */
export function shipmentStatusHints(
   status: ShipmentStatus,
   shipment: Pick<
      ShipmentOverviewRow,
      | 'purchase_order_ids'
      | 'booking_confirmed_on'
      | 'etd'
      | 'eta'
      | 'delivered_at'
      | 'quantity_matches'
      | 'has_damage'
   >,
   receiptStatus: DocumentStatus | null
): StatusHint[] {
   switch (status) {
      case 'booked':
         return [
            ...(shipment.purchase_order_ids?.length ? [] : ['shipment_po_required' as const]),
            ...(shipment.booking_confirmed_on ? [] : ['shipment_booking_date_required' as const])
         ];
      case 'in_transit':
         return shipment.etd && shipment.eta ? [] : ['shipment_eta_required'];
      case 'delivered':
         return shipment.delivered_at ? [] : ['shipment_delivery_time_required'];
      case 'accepted':
         return acceptanceHints(shipment, receiptStatus);
      default:
         return [];
   }
}

/** The ETA's urgency for the list, until the goods are delivered. `today` is YYYY-MM-DD. */
export function etaState(
   { eta, status }: Pick<ShipmentRow, 'eta' | 'status'>,
   today: string
): 'late' | 'this_week' | 'later' | null {
   if (!eta || ['delivered', 'accepted', 'disputed', 'cancelled'].includes(status)) return null;
   if (eta < today) return 'late';
   return eta <= dayjs(today).add(7, 'day').format('YYYY-MM-DD') ? 'this_week' : 'later';
}

// --- quantities and documents ---

/** The default warehouse, else the only one, else none. */
export function defaultWarehouseId(
   warehouses: readonly Pick<Tables['customer_warehouse']['Row'], 'id' | 'is_default'>[]
): string | null {
   return (
      warehouses.find(({ is_default }) => is_default)?.id ??
      (warehouses.length === 1 ? warehouses[0]!.id : null)
   );
}

/**
 * What may still be shipped of an order line: floor(ordered × (1 + tolerance / 100)) minus what the
 * other shipments that are not cancelled carry (shipment_quantity_exceeds_po), never below 0. The
 * tolerance is counted in integer units, so the floor is the database's.
 */
export function remainingQuantity(
   ordered: number,
   tolerancePct: number | null,
   shippedElsewhere: number
): number {
   // tolerance_pct is NUMERIC(5, 2): hundredths of a percent, over 10 000.
   const tolerance = BigInt(toUnits(tolerancePct ?? 0, 2));
   const cap = Number((BigInt(ordered) * (10000n + tolerance)) / 10000n);
   return Math.max(0, cap - shippedElsewhere);
}

/**
 * Per shipping document type (SHIPMENT_DOCUMENT_TYPES; the SDS only for hazardous goods), the
 * status of its newest version that is not superseded, or null when there is none.
 */
export function documentChecklist(
   docs: readonly Pick<DocumentRow, 'type' | 'status' | 'version'>[],
   hazmat: boolean
): { type: DocumentType; status: DocumentStatus | null }[] {
   return SHIPMENT_DOCUMENT_TYPES.filter((type) => hazmat || type !== 'sds').map((type) => {
      const newest = docs
         .filter((doc) => doc.type === type && doc.status !== 'superseded')
         .reduce<
            (typeof docs)[number] | null
         >((best, doc) => (!best || doc.version > best.version ? doc : best), null);
      return { type, status: newest?.status ?? null };
   });
}

// --- shipment ---

/** The card's shipment, its customer and warehouse, its orders with their lines, and its lines. */
export const SHIPMENT_SELECT = [
   '*',
   'customer!shipment_customer_fkey(code, display_name)',
   'customer_warehouse!shipment_warehouse_fkey(display_name, city, dock_hours, appointment_rule)',
   'shipment_purchase_order!shipment_purchase_order_shipment_fkey(purchase_order!shipment_purchase_order_po_fkey(id, code, status, tolerance_pct, purchase_order_line!purchase_order_line_po_fkey(id, quantity, product!purchase_order_line_product_fkey(sku, display_name, is_hazmat))))',
   'shipment_line!shipment_line_shipment_fkey(*)'
].join(', ');

export const shipmentResource = defineResource<'shipment', ShipmentCard>('shipment', {
   select: SHIPMENT_SELECT
});

/** The shipment's overview row (see ShipmentOverviewRow for psi_missing_po_codes). */
export function useShipmentOverview(id: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantKey.value, 'shipment_overview', toValue(id))),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('shipment_overview')
            .select('*')
            .eq('id', toValue(id)!)
            .abortSignal(signal)
            .maybeSingle()
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(id))
   });
}

export type ShipmentIdsFilter = { purchaseOrderIds?: string[]; productId?: string };

/**
 * The ids of the shipments carrying any of the orders (purchase_order_ids) and, or, a product
 * (product_ids), for the shipment lists of an order or a product. With no orders to look for
 * (an empty purchaseOrderIds) or no filter at all it asks nothing and yields [].
 */
export function useShipmentIds(filter: MaybeRefOrGetter<ShipmentIdsFilter>) {
   const tenantKey = useTenantKey();
   const enabled = computed(() => {
      const { purchaseOrderIds, productId } = toValue(filter);
      return purchaseOrderIds ? purchaseOrderIds.length > 0 : !!productId;
   });

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'shipment_overview', { view: 'ids', ...toValue(filter) })
      ),
      queryFn: async ({ signal }) => {
         const { purchaseOrderIds, productId } = toValue(filter);
         let query = supabase.from('shipment_overview').select('id');
         if (purchaseOrderIds) query = query.overlaps('purchase_order_ids', purchaseOrderIds);
         if (productId) query = query.contains('product_ids', [productId]);
         const { data } = await query.abortSignal(signal).throwOnError();
         return data.flatMap(({ id }) => (id ? [id] : []));
      },
      enabled,
      placeholderData: () => (enabled.value ? undefined : [])
   });
}

const text = () => optional(z.string().trim());
const count = () => optional(z.number().int().min(0));
const amount = () => optional(z.number().min(0));

export const shipmentSchema = z.object({
   id: z.string().optional(),
   customer_id: required(z.uuid()),
   mode: required(z.enum(SHIPMENT_MODES)),
   delivery_warehouse_id: required(z.uuid()),
   forwarder: text(),
   customs_broker: text(),
   carrier: text(),
   incoterm_buy: z.enum(INCOTERMS).nullish(),
   incoterm_sell: z.enum(INCOTERMS).nullish(),
   is_insured: z.boolean().default(false),
   ready_on: optional(dateOnly()),
   booking_confirmed_on: optional(dateOnly()),
   etd: optional(dateOnly()),
   eta: optional(dateOnly()),
   customs_cleared_on: optional(dateOnly()),
   planned_delivery_on: optional(dateOnly()),
   delivered_at: optional(z.date()),
   container_no: text(),
   seal_no: text(),
   free_days_port: count(),
   free_days_detention: count(),
   demurrage_note: text(),
   carton_count: count(),
   pallet_count: count(),
   volume_m3: amount(),
   gross_kg: amount(),
   accepted_by: text(),
   quantity_matches: z.boolean().nullish(),
   has_damage: z.boolean().nullish(),
   dispute_deadline_at: optional(z.date()),
   notes: text()
});

export type ShipmentFormValues = z.input<typeof shipmentSchema>;
export type ShipmentValues = z.output<typeof shipmentSchema>;

const parseInstant = (value?: string | null) => (value ? new Date(value) : null);

export const toShipmentFormValues = (
   shipment?: Partial<ShipmentRow> | null
): ShipmentFormValues => ({
   id: shipment?.id ?? undefined,
   customer_id: shipment?.customer_id ?? null,
   mode: shipment?.mode ?? null,
   delivery_warehouse_id: shipment?.delivery_warehouse_id ?? null,
   forwarder: shipment?.forwarder ?? '',
   customs_broker: shipment?.customs_broker ?? '',
   carrier: shipment?.carrier ?? '',
   incoterm_buy: (shipment?.incoterm_buy ?? null) as ShipmentFormValues['incoterm_buy'],
   incoterm_sell: (shipment?.incoterm_sell ?? null) as ShipmentFormValues['incoterm_sell'],
   is_insured: shipment?.is_insured ?? false,
   ready_on: parseDateOnly(shipment?.ready_on),
   booking_confirmed_on: parseDateOnly(shipment?.booking_confirmed_on),
   etd: parseDateOnly(shipment?.etd),
   eta: parseDateOnly(shipment?.eta),
   customs_cleared_on: parseDateOnly(shipment?.customs_cleared_on),
   planned_delivery_on: parseDateOnly(shipment?.planned_delivery_on),
   delivered_at: parseInstant(shipment?.delivered_at),
   container_no: shipment?.container_no ?? '',
   seal_no: shipment?.seal_no ?? '',
   free_days_port: shipment?.free_days_port ?? null,
   free_days_detention: shipment?.free_days_detention ?? null,
   demurrage_note: shipment?.demurrage_note ?? '',
   carton_count: shipment?.carton_count ?? null,
   pallet_count: shipment?.pallet_count ?? null,
   volume_m3: shipment?.volume_m3 ?? null,
   gross_kg: shipment?.gross_kg ?? null,
   accepted_by: shipment?.accepted_by ?? '',
   quantity_matches: shipment?.quantity_matches ?? null,
   has_damage: shipment?.has_damage ?? null,
   dispute_deadline_at: parseInstant(shipment?.dispute_deadline_at),
   notes: shipment?.notes ?? ''
});

/**
 * The row to save, empty fields as null. The customer never changes, so it goes with a new
 * shipment only; the code, the status (useSetShipmentStatus) and the acceptance date are the
 * database's.
 */
export function toShipmentPayload({
   id,
   customer_id,
   ...values
}: ShipmentValues): ResourceInput<'shipment'> {
   const editable = {
      ...values,
      incoterm_buy: values.incoterm_buy ?? null,
      incoterm_sell: values.incoterm_sell ?? null,
      delivered_at: values.delivered_at?.toISOString() ?? null,
      dispute_deadline_at: values.dispute_deadline_at?.toISOString() ?? null,
      quantity_matches: values.quantity_matches ?? null,
      has_damage: values.has_damage ?? null
   };
   if (id) return { id, ...editable } as ResourceInput<'shipment'>;
   return { ...editable, customer_id };
}

/** Moves a shipment to another status; the database checks the flow and its data (031). */
export function useSetShipmentStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ id, status }: { id: string; status: ShipmentStatus }) =>
         updateRow('shipment', id, { status }),
      onSuccess: () => invalidateTables(queryClient, ['shipment'])
   });
}

// --- orders on the shipment ---

export type ShipmentOrderLink = { shipmentId: string; purchaseOrderId: string };

/**
 * Puts an order on a shipment, in the shipment's tenant (`tenantId`; without it the active tenant,
 * which customFetch adds). The link's customer is the shipment's (set by the database), so it is
 * not sent.
 */
export function useLinkPurchaseOrder() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({
         shipmentId,
         purchaseOrderId,
         tenantId
      }: ShipmentOrderLink & { tenantId?: string | null }) => {
         await supabase
            .from('shipment_purchase_order')
            .insert({
               shipment_id: shipmentId,
               purchase_order_id: purchaseOrderId,
               ...(tenantId ? { tenant_id: tenantId } : {})
               // customer_id is set by the database.
            } as Tables['shipment_purchase_order']['Insert'])
            .throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, ['shipment_purchase_order'])
   });
}

/** Takes an order off a shipment; the database refuses while it has lines on it. */
export function useUnlinkPurchaseOrder() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ shipmentId, purchaseOrderId }: ShipmentOrderLink) => {
         await supabase
            .from('shipment_purchase_order')
            .delete()
            .match({ shipment_id: shipmentId, purchase_order_id: purchaseOrderId })
            .throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, ['shipment_purchase_order'])
   });
}

// --- lines ---

export const shipmentLineResource = defineResource('shipment_line');

export const shipmentLineSchema = z.object({
   id: z.string().optional(),
   shipment_id: required(z.uuid()),
   purchase_order_id: required(z.uuid()),
   purchase_order_line_id: required(z.uuid()),
   quantity: required(z.number().int().min(1)),
   carton_count: count()
});

export type ShipmentLineFormValues = z.input<typeof shipmentLineSchema>;

export const toShipmentLineFormValues = (
   line?: Partial<ShipmentLineRow> | null
): ShipmentLineFormValues => ({
   id: line?.id ?? undefined,
   shipment_id: line?.shipment_id ?? null,
   purchase_order_id: line?.purchase_order_id ?? null,
   purchase_order_line_id: line?.purchase_order_line_id ?? null,
   quantity: line?.quantity ?? null,
   carton_count: line?.carton_count ?? null
});

/** The line to save; a line stays on its shipment, so the shipment goes with a new line only. */
export const toShipmentLinePayload = ({
   id,
   shipment_id,
   ...values
}: z.output<typeof shipmentLineSchema>): ResourceInput<'shipment_line'> => {
   const editable = { ...values, carton_count: values.carton_count ?? null };
   if (id) return { id, ...editable } as ResourceInput<'shipment_line'>;
   return { shipment_id, ...editable };
};

// --- events ---

export const shipmentEventResource = defineResource('shipment_event');

const STEP_LITERALS = S15_STEPS.map((step) => z.literal(step)) as [
   z.ZodLiteral<S15Step>,
   ...z.ZodLiteral<S15Step>[]
];

export const shipmentEventSchema = z.object({
   id: z.string().optional(),
   shipment_id: required(z.uuid()),
   happened_at: required(z.date()),
   // No step: an "other" event.
   step: optional(z.union(STEP_LITERALS)),
   from_party: text(),
   to_party: text(),
   channel: text(),
   note: text()
});

export type ShipmentEventFormValues = z.input<typeof shipmentEventSchema>;

export const toShipmentEventFormValues = (
   event?: Partial<ShipmentEventRow> | null
): ShipmentEventFormValues => ({
   id: event?.id ?? undefined,
   shipment_id: event?.shipment_id ?? null,
   happened_at: parseInstant(event?.happened_at),
   step: (event?.step ?? null) as ShipmentEventFormValues['step'],
   from_party: event?.from_party ?? '',
   to_party: event?.to_party ?? '',
   channel: event?.channel ?? '',
   note: event?.note ?? ''
});

export const toShipmentEventPayload = ({
   id,
   ...values
}: z.output<typeof shipmentEventSchema>): ResourceInput<'shipment_event'> => ({
   ...(id ? { id } : {}),
   ...values,
   happened_at: values.happened_at.toISOString(),
   step: values.step ?? null,
   from_party: values.from_party ?? null,
   to_party: values.to_party ?? null,
   channel: values.channel ?? null,
   note: values.note ?? null
});

/** A shipment's S15 log, newest first. */
export function useShipmentEvents(shipmentId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'shipment_event', { shipmentId: toValue(shipmentId) })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('shipment_event')
            .select('*')
            .eq('shipment_id', toValue(shipmentId)!)
            .order('happened_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(shipmentId))
   });
}
