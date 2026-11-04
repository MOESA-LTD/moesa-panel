import type { DocumentRow, DocumentStatus } from '@/api/document';
import {
   defaultWarehouseId,
   isShipmentLocked,
   shipmentResource,
   shipmentSchema,
   shipmentStatusHints,
   toShipmentFormValues,
   toShipmentPayload,
   type ShipmentCard,
   type ShipmentOverviewRow,
   type ShipmentStatus
} from '@/api/shipment';
import { useLookup } from '@/api/useLookup';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useCustomerFilter } from '@/store/customerFilter';
import {
   computed,
   inject,
   ref,
   toValue,
   watch,
   type InjectionKey,
   type MaybeRefOrGetter,
   type Ref
} from 'vue';

/**
 * The shipment card's tabs: the form's general, dates and acceptance (S16) tabs, the orders on the
 * shipment with their lines, the S15 event log, then the documents and the media.
 */
export const SHIPMENT_CARD_TABS = [
   'general',
   'dates',
   'orders',
   'events',
   'acceptance',
   'documents',
   'media'
] as const;
export type ShipmentCardTab = (typeof SHIPMENT_CARD_TABS)[number];

/** The seven dates of the Dates tab, in the order the goods go. */
export const SHIPMENT_DATE_FIELDS = [
   'ready_on',
   'booking_confirmed_on',
   'etd',
   'eta',
   'customs_cleared_on',
   'planned_delivery_on',
   'delivered_at'
] as const;

/** The S16 fields of the Acceptance tab. */
export const SHIPMENT_ACCEPTANCE_FIELDS = [
   'accepted_by',
   'quantity_matches',
   'has_damage',
   'dispute_deadline_at'
] as const;

/** The card tab that shows a field of the shipment form (a top-level column name). */
export const tabForField = (field: string): 'general' | 'dates' | 'acceptance' => {
   if ((SHIPMENT_DATE_FIELDS as readonly string[]).includes(field)) return 'dates';
   if ((SHIPMENT_ACCEPTANCE_FIELDS as readonly string[]).includes(field)) return 'acceptance';
   return 'general';
};

/** A delivery warehouse as the card offers it, with its S14 receiving rules. */
export type WarehouseOption = Pick<
   Tables['customer_warehouse']['Row'],
   'id' | 'display_name' | 'city' | 'is_default' | 'dock_hours' | 'appointment_rule'
>;

/**
 * The shipment card's one form: the general, dates and acceptance tabs each show their part of
 * it. A new shipment starts with the customer the lists are filtered by; once a customer is chosen,
 * it goes to that customer's default warehouse (or the only one). Once a new shipment is saved,
 * its "new" draft is dropped: the card goes on under the shipment's id (see ShipmentCard).
 */
export function useShipmentForm(
   id: () => string | null | undefined,
   onSaved?: (shipment: ShipmentCard) => void
) {
   const customerFilter = useCustomerFilter();
   const isNew = !id();

   const form = useUpsertForm({
      id,
      prefill: () => (customerFilter.customerId ? { customer_id: customerFilter.customerId } : {}),
      useRow: shipmentResource.useOne,
      useSaveRow: shipmentResource.useSave,
      subject: 'shipment',
      schema: shipmentSchema,
      toFormValues: toShipmentFormValues,
      // The deadline goes only when edited: compared with the values the form was loaded with.
      toPayload: (values) => toShipmentPayload(values, form.initialValues.value),
      onSaved: (shipment) => {
         if (isNew) form.discardDraft();
         onSaved?.(shipment);
      }
   });

   // The customer's warehouses; an empty `in` would list every customer's, so none until chosen.
   const customerId = computed(() => form.values.value.customer_id ?? null);
   const { data: warehouses } = useLookup<WarehouseOption>(
      'customer_warehouse',
      () => ({
         select: 'id, display_name, city, is_default, dock_hours, appointment_rule',
         order: 'display_name',
         in: { column: 'customer_id', values: customerId.value ? [customerId.value] : [] }
      }),
      () => !!customerId.value
   );

   // The list is the current customer's: a warehouse that is not on it (none yet, or another
   // customer's) gives way to the default one. A saved shipment keeps its own.
   if (isNew)
      watch(
         warehouses,
         (list) => {
            if (!list || !customerId.value) return;
            const current = form.values.value.delivery_warehouse_id;
            if (current && list.some((warehouse) => warehouse.id === current)) return;
            form.values.value.delivery_warehouse_id = defaultWarehouseId(list);
         },
         { immediate: true }
      );

   return { ...form, warehouses: computed(() => warehouses.value ?? []) };
}

/** The card's form with a submit that opens the tab of the first error. */
export type ShipmentForm = ReturnType<typeof useShipmentForm> & {
   submit: () => Promise<void>;
};

export const SHIPMENT_FORM: InjectionKey<ShipmentForm> = Symbol('shipment-form');

/** The shipment's overview row (order ids and codes, psi_missing_po_codes), loaded once by the card. */
export const SHIPMENT_OVERVIEW: InjectionKey<Ref<ShipmentOverviewRow | null | undefined>> =
   Symbol('shipment-overview');

/** The form of the shipment card the tab is in. */
export function injectShipmentForm() {
   const form = inject(SHIPMENT_FORM);
   if (!form) throw new Error('A shipment tab must be inside the shipment card');
   return form;
}

/** The overview row of the shipment card the tab is in (null until loaded or for a new one). */
export const injectShipmentOverview = () => inject(SHIPMENT_OVERVIEW, () => ref(null), true);

/** Whether the card's saved shipment has its orders and lines fixed (loaded on, or cancelled). */
export const useShipmentLocked = (form: Pick<ShipmentForm, 'row'>) =>
   computed(() => !!form.row.value && isShipmentLocked(form.row.value.status));

export type ShipmentDocument = Pick<
   DocumentRow,
   'id' | 'entity_type' | 'type' | 'status' | 'version'
>;

/**
 * The shipment's documents (type, status, version), for the checklist and the delivery receipt.
 * The documents tab lists them in full.
 */
export function useShipmentDocuments(id: MaybeRefOrGetter<string | null | undefined>) {
   const { data } = useLookup<ShipmentDocument>(
      'document',
      () => ({
         select: 'id, entity_type, type, status, version',
         in: { column: 'entity_id', values: toValue(id) ? [toValue(id)] : [] }
      }),
      () => !!toValue(id)
   );
   return computed(() =>
      (data.value ?? []).filter(({ entity_type }) => entity_type === 'shipment')
   );
}

/** The status of the newest delivery receipt that is not superseded (S16), or null. */
export function receiptStatus(documents: readonly ShipmentDocument[]): DocumentStatus | null {
   const newest = documents
      .filter(({ type, status }) => type === 'delivery_receipt' && status !== 'superseded')
      .reduce<ShipmentDocument | null>(
         (best, doc) => (!best || doc.version > best.version ? doc : best),
         null
      );
   return newest?.status ?? null;
}

/** Whether a line on the shipment is of a hazardous product, so the SDS is a shipping document. */
export function shipmentHazmat(shipment: ShipmentCard | null | undefined): boolean {
   if (!shipment) return false;
   const onShipment = new Set(shipment.shipment_line.map((line) => line.purchase_order_line_id));
   return shipment.shipment_purchase_order.some(({ purchase_order }) =>
      purchase_order?.purchase_order_line.some(
         (line) => onShipment.has(line.id) && !!line.product?.is_hazmat
      )
   );
}

type Translate = (key: string, named?: Record<string, unknown>) => string;

/**
 * The confirmation warnings of the next statuses: the data the database will ask for
 * (shipmentStatusHints) and, on loading, the orders without an approved PSI (K3: a warning only).
 */
export function shipmentStatusWarnings(
   next: readonly ShipmentStatus[],
   overview: ShipmentOverviewRow | null | undefined,
   receipt: DocumentStatus | null,
   t: Translate
): Partial<Record<ShipmentStatus, string>> {
   const warnings: Partial<Record<ShipmentStatus, string>> = {};
   if (!overview) return warnings;
   for (const status of next) {
      const texts = shipmentStatusHints(status, overview, receipt).map((code) =>
         t(`errors.${code}`)
      );
      const codes = overview.psi_missing_po_codes ?? [];
      if (status === 'loaded' && codes.length)
         texts.push(t('ops.shipment.psi_warning', { codes: codes.join(', ') }));
      if (texts.length) warnings[status] = texts.join(' ');
   }
   return warnings;
}
