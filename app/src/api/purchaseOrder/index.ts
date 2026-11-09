import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { DocumentEntity, DocumentStatus, DocumentType } from '@/api/document';
import type { ProductRow } from '@/api/product';
import type { Figures } from '@/api/purchaseOrder/figures';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { updateRow } from '@/api/saveRow';
import { useTenantKey } from '@/api/useTenantKey';
import { allValues } from '@/lib/enumValues';
import { dateOnly, optional, parseDateOnly, required, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type PurchaseOrderStatus = Enums['purchase_order_status'];
export type PaymentKind = Enums['payment_kind'];
export type PaymentPayer = Enums['payment_payer'];
export type PurchaseOrderRow = Tables['purchase_order']['Row'];
export type PurchaseOrderLineRow = Tables['purchase_order_line']['Row'];
export type PurchaseOrderPaymentRow = Tables['purchase_order_payment']['Row'];
export type PurchaseOrderUpdateRow = Tables['purchase_order_update']['Row'];
export type PurchaseOrderOverviewRow = Views['purchase_order_overview']['Row'];

/** A line as the order card loads it: with its product and its spec sheet. */
export type PurchaseOrderCardLine = PurchaseOrderLineRow & {
   product: Pick<
      ProductRow,
      'id' | 'sku' | 'display_name' | 'status' | 'purchase_price' | 'purchase_currency'
   > | null;
   spec_document: Pick<Tables['document']['Row'], 'id' | 'version' | 'status'> | null;
};

/** An order as its card loads it (PURCHASE_ORDER_SELECT). */
export type PurchaseOrderCard = PurchaseOrderRow & {
   customer: Pick<Tables['customer']['Row'], 'code' | 'display_name'> | null;
   supplier: Pick<
      Tables['supplier']['Row'],
      'code' | 'display_name' | 'default_incoterm' | 'deposit_rate'
   > | null;
   project: Pick<Tables['project']['Row'], 'code' | 'display_name'> | null;
   purchase_order_line: PurchaseOrderCardLine[];
   purchase_order_payment: PurchaseOrderPaymentRow[];
};

// --- constants ---

export const PURCHASE_ORDER_STATUSES = allValues<PurchaseOrderStatus>()([
   'draft',
   'sent',
   'pi_received',
   'pi_approved',
   'deposit_paid',
   'in_production',
   'ready',
   'balance_paid',
   'closed',
   'cancelled'
]);

/** The Tag severity of each status, for lists and the card. */
export const PURCHASE_ORDER_STATUS_SEVERITY: Record<PurchaseOrderStatus, string> = {
   draft: 'secondary',
   sent: 'info',
   pi_received: 'info',
   pi_approved: 'info',
   deposit_paid: 'warn',
   in_production: 'warn',
   ready: 'warn',
   balance_paid: 'success',
   closed: 'secondary',
   cancelled: 'danger'
};

/** An amount for display, with two decimals and its currency (no arithmetic). */
export const formatAmount = (value: number | null | undefined, currency?: string | null) =>
   value === null || value === undefined ? '' : `${value.toFixed(2)} ${currency ?? ''}`.trim();

export const PAYMENT_KINDS = allValues<PaymentKind>()(['deposit', 'balance', 'other']);

export const PAYMENT_PAYERS = allValues<PaymentPayer>()(['company', 'customer']);

/** The eleven Incoterms 2020 terms (S09 item 12; private.incoterm_valid). */
export const INCOTERMS = [
   'EXW',
   'FCA',
   'FAS',
   'FOB',
   'CFR',
   'CIF',
   'CPT',
   'CIP',
   'DAP',
   'DPU',
   'DDP'
] as const;
export type Incoterm = (typeof INCOTERMS)[number];

/** The 30 items of the S09 §B PI checklist (the keys of pi_check). */
export const PI_CHECK_KEYS = [
   '1',
   '2',
   '3',
   '4',
   '5',
   '6',
   '7',
   '8',
   '9',
   '10',
   '11',
   '12',
   '13',
   '14',
   '15',
   '16',
   '17',
   '18',
   '19',
   '20',
   '21',
   '22',
   '23',
   '24',
   '25',
   '26',
   '27',
   '28',
   '29',
   '30'
] as const;
export const PI_CHECK_STATUSES = ['ok', 'error', 'missing'] as const;
export type PiCheckKey = (typeof PI_CHECK_KEYS)[number];
export type PiCheckStatus = (typeof PI_CHECK_STATUSES)[number];

/** The terms and the PI, fixed from pi_approved on (rule 2 of purchase_order_guard, po_locked). */
export const PO_LOCKED_FIELDS = [
   'currency',
   'incoterm',
   'incoterm_place',
   'deposit_rate',
   'pi_document_id',
   'pi_number',
   'pi_subtotal',
   'pi_extra_amount',
   'pi_discount_amount',
   'pi_total',
   'pi_deposit_amount',
   'pi_balance_amount',
   'pi_check'
] as const satisfies readonly (keyof PurchaseOrderRow)[];

// --- status flow ---

const statusIndex = (status: PurchaseOrderStatus) => PURCHASE_ORDER_STATUSES.indexOf(status);

/** The terms and the lines are locked from pi_approved on, closed and cancelled included. */
export const isPurchaseOrderLocked = (status: PurchaseOrderStatus) =>
   statusIndex(status) >= statusIndex('pi_approved');

/**
 * Where the order may go (rule 1 of purchase_order_guard): the next step, then cancelled. Without a
 * deposit (rate 0) pi_approved goes straight to in_production; when the rate is masked (null) both
 * are offered and the database refuses the wrong one. Closed and cancelled are final.
 */
export function nextPurchaseOrderStatuses({
   status,
   deposit_rate
}: Pick<PurchaseOrderRow, 'status' | 'deposit_rate'>): PurchaseOrderStatus[] {
   if (status === 'closed' || status === 'cancelled') return [];
   if (status !== 'pi_approved') {
      return [PURCHASE_ORDER_STATUSES[statusIndex(status) + 1]!, 'cancelled'];
   }
   if (deposit_rate === null) return ['deposit_paid', 'in_production', 'cancelled'];
   return [deposit_rate > 0 ? 'deposit_paid' : 'in_production', 'cancelled'];
}

/** All 30 PI check items are "ok", as approving the PI requires (po_pi_checklist_incomplete). */
export function piChecklistComplete(check: Json): boolean {
   if (!check || typeof check !== 'object' || Array.isArray(check)) return false;
   return PI_CHECK_KEYS.every((key) => check[key] === 'ok');
}

/** A ready order without an approved PSI: a warning before the balance (M7), not a rule. */
export const psiWarning = ({
   status,
   has_approved_psi
}: Pick<PurchaseOrderOverviewRow, 'status' | 'has_approved_psi'>) =>
   status === 'ready' && !has_approved_psi;

/** What a new order takes from its supplier; an Incoterm that is not Incoterms 2020 is left out. */
export const supplierDefaults = ({
   default_incoterm,
   deposit_rate
}: Pick<Tables['supplier']['Row'], 'default_incoterm' | 'deposit_rate'>): {
   incoterm: Incoterm | null;
   deposit_rate: number | null;
} => ({
   incoterm: (INCOTERMS as readonly string[]).includes(default_incoterm ?? '')
      ? (default_incoterm as Incoterm)
      : null,
   deposit_rate: deposit_rate ?? null
});

// --- order ---

/** The card's order, its parties and its lines and payments, embedded by their composite keys. */
export const PURCHASE_ORDER_SELECT = [
   '*',
   'customer!purchase_order_customer_fkey(code, display_name)',
   'supplier(code, display_name, default_incoterm, deposit_rate)',
   'project!purchase_order_project_fkey(code, display_name)',
   'purchase_order_line!purchase_order_line_po_fkey(*, product!purchase_order_line_product_fkey(id, sku, display_name, status, purchase_price, purchase_currency), spec_document:document!purchase_order_line_spec_fkey(id, version, status))',
   'purchase_order_payment!purchase_order_payment_po_fkey(*)'
].join(', ');

export const purchaseOrderResource = defineResource<'purchase_order', PurchaseOrderCard>(
   'purchase_order',
   { select: PURCHASE_ORDER_SELECT }
);

/** The order's overview row: has_approved_psi, spec_missing_line_ids and the system_* figures. */
export function usePurchaseOrderOverview(id: MaybeRefOrGetter<string | null>) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.detail(tenantId.value, 'purchase_order_overview', toValue(id))
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('purchase_order_overview')
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

/**
 * The ids of the orders with a line of the product (purchase_order_overview.product_ids), for the
 * order lists of a product. Disabled without a product.
 */
export function usePurchaseOrderIds(filter: MaybeRefOrGetter<{ productId?: string }>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'purchase_order_overview', {
            view: 'ids',
            ...toValue(filter)
         })
      ),
      queryFn: async ({ signal }) => {
         const { productId } = toValue(filter);
         const { data } = await supabase
            .from('purchase_order_overview')
            .select('id')
            .contains('product_ids', [productId!])
            .abortSignal(signal)
            .throwOnError();
         return data.flatMap(({ id }) => (id ? [id] : []));
      },
      enabled: computed(() => !!toValue(filter).productId)
   });
}

const text = () => optional(z.string().trim());
const currency = () =>
   z.string().regex(/^[A-Z]{3}$/, { error: () => i18n.t('form.invalid_value') });
const percent = () => z.number().min(0).max(100);

export const purchaseOrderSchema = z.object({
   id: z.string().optional(),
   customer_id: required(z.uuid()),
   supplier_id: required(z.uuid()),
   project_id: optional(z.uuid()),
   packing_instruction_document_id: optional(z.uuid()),
   pi_document_id: optional(z.uuid()),
   currency: currency(),
   // required(): a new order's form starts without one.
   incoterm: required(z.enum(INCOTERMS)),
   incoterm_place: text(),
   penalty_rule: text(),
   pi_number: text(),
   notes: text(),
   deposit_rate: required(percent()),
   ready_on: optional(dateOnly()),
   tolerance_pct: optional(percent()),
   pi_subtotal: optional(z.number()),
   pi_total: optional(z.number()),
   pi_deposit_amount: optional(z.number()),
   pi_balance_amount: optional(z.number()),
   pi_extra_amount: z.number().default(0),
   pi_discount_amount: z.number().min(0).default(0),
   pi_check: z.partialRecord(z.enum(PI_CHECK_KEYS), z.enum(PI_CHECK_STATUSES)).default({})
});

export type PurchaseOrderFormValues = z.input<typeof purchaseOrderSchema>;
export type PurchaseOrderValues = z.output<typeof purchaseOrderSchema>;

export const toPurchaseOrderFormValues = (
   po?: Partial<PurchaseOrderRow> | null
): PurchaseOrderFormValues => ({
   id: po?.id ?? undefined,
   customer_id: po?.customer_id ?? null,
   supplier_id: po?.supplier_id ?? null,
   project_id: po?.project_id ?? null,
   packing_instruction_document_id: po?.packing_instruction_document_id ?? null,
   pi_document_id: po?.pi_document_id ?? null,
   currency: po?.currency ?? '',
   incoterm: (po?.incoterm ?? null) as PurchaseOrderFormValues['incoterm'],
   incoterm_place: po?.incoterm_place ?? '',
   penalty_rule: po?.penalty_rule ?? '',
   pi_number: po?.pi_number ?? '',
   notes: po?.notes ?? '',
   deposit_rate: po?.deposit_rate ?? null,
   ready_on: parseDateOnly(po?.ready_on),
   tolerance_pct: po?.tolerance_pct ?? null,
   pi_subtotal: po?.pi_subtotal ?? null,
   pi_total: po?.pi_total ?? null,
   pi_deposit_amount: po?.pi_deposit_amount ?? null,
   pi_balance_amount: po?.pi_balance_amount ?? null,
   pi_extra_amount: po?.pi_extra_amount ?? 0,
   pi_discount_amount: po?.pi_discount_amount ?? 0,
   pi_check: (po?.pi_check ?? {}) as PurchaseOrderFormValues['pi_check']
});

/**
 * The row to save, empty fields as null. The customer and supplier never change, so they go with a
 * new order only. The status (useSetPurchaseOrderStatus), the code and the PI check stamp are the
 * database's; the locked terms (PO_LOCKED_FIELDS) are left out once the order's `status` locks them.
 */
export function toPurchaseOrderPayload(
   { id, customer_id, supplier_id, ...values }: PurchaseOrderValues,
   status?: PurchaseOrderStatus
): ResourceInput<'purchase_order'> {
   const editable: Partial<Record<keyof typeof values, unknown>> = {
      project_id: values.project_id ?? null,
      packing_instruction_document_id: values.packing_instruction_document_id ?? null,
      pi_document_id: values.pi_document_id ?? null,
      currency: values.currency,
      incoterm: values.incoterm,
      incoterm_place: values.incoterm_place ?? null,
      penalty_rule: values.penalty_rule ?? null,
      pi_number: values.pi_number ?? null,
      notes: values.notes ?? null,
      deposit_rate: values.deposit_rate,
      ready_on: values.ready_on ?? null,
      tolerance_pct: values.tolerance_pct ?? null,
      pi_subtotal: values.pi_subtotal ?? null,
      pi_total: values.pi_total ?? null,
      pi_deposit_amount: values.pi_deposit_amount ?? null,
      pi_balance_amount: values.pi_balance_amount ?? null,
      pi_extra_amount: values.pi_extra_amount,
      pi_discount_amount: values.pi_discount_amount,
      pi_check: values.pi_check
   };
   if (status && isPurchaseOrderLocked(status))
      for (const field of PO_LOCKED_FIELDS) delete editable[field];

   if (id) return { id, ...editable } as ResourceInput<'purchase_order'>;
   return { ...editable, customer_id, supplier_id } as ResourceInput<'purchase_order'>;
}

/** Moves an order to another status; the database checks the flow and its gates (030). */
export function useSetPurchaseOrderStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) =>
         updateRow('purchase_order', id, { status }),
      onSuccess: () => invalidateTables(queryClient, ['purchase_order'])
   });
}

// --- documents ---

export type DocumentOptionsParams = {
   entityType: DocumentEntity;
   entityId: string | null;
   type?: DocumentType;
   statuses?: DocumentStatus[];
};

/**
 * Document versions as select options: 'v03 — Signed', in the order given. With `withType` (a
 * picker over every type of a record's documents) each is prefixed with its type:
 * 'Spec sheet · v03 — Signed'.
 */
export const toDocumentOptions = (
   documents: readonly (Pick<Tables['document']['Row'], 'id' | 'version' | 'status'> & {
      type?: DocumentType;
   })[],
   { withType = false }: { withType?: boolean } = {}
) =>
   documents.map(({ id, type, version, status }) => {
      const label = `v${String(version).padStart(2, '0')} — ${i18n.t(`ops.document.status.${status}`)}`;
      return {
         value: id,
         label: withType && type ? `${i18n.t(`ops.document.type.${type}`)} · ${label}` : label
      };
   });

/**
 * A record's documents as options, newest version first: the spec sheet picker (a product's
 * signed or approved spec sheets), the PI picker and the packing instruction picker (an order's).
 * Without a `type`, the record's documents of every type are offered, each labelled with its type.
 */
export function useEntityDocumentOptions(params: MaybeRefOrGetter<DocumentOptionsParams>) {
   const tenantId = useTenantKey();

   const { data } = useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantId.value, 'document', { view: 'options', ...toValue(params) })
      ),
      queryFn: async ({ signal }) => {
         const { entityType, entityId, type, statuses } = toValue(params);
         let query = supabase
            .from('document')
            .select('id, type, version, status')
            .eq('entity_type', entityType)
            .eq('entity_id', entityId!);
         if (type) query = query.eq('type', type);
         if (statuses) query = query.in('status', statuses);
         const { data } = await query
            .order('version', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(params).entityId)
   });

   return computed(() => toDocumentOptions(data.value ?? [], { withType: !toValue(params).type }));
}

// --- lines ---

export const purchaseOrderLineResource = defineResource('purchase_order_line');

export const purchaseOrderLineSchema = z.object({
   id: z.string().optional(),
   purchase_order_id: required(z.uuid()),
   product_id: required(z.uuid()),
   quantity: required(z.number().int().min(1)),
   unit_price: required(z.number().min(0)),
   pi_line_total: optional(z.number()),
   spec_document_id: optional(z.uuid()),
   position: z.number().int().min(0),
   notes: text()
});

export type PurchaseOrderLineFormValues = z.input<typeof purchaseOrderLineSchema>;

export const toPurchaseOrderLineFormValues = (
   line?: Partial<PurchaseOrderLineRow> | null
): PurchaseOrderLineFormValues => ({
   id: line?.id ?? undefined,
   purchase_order_id: line?.purchase_order_id ?? null,
   product_id: line?.product_id ?? null,
   quantity: line?.quantity ?? null,
   unit_price: line?.unit_price ?? null,
   pi_line_total: line?.pi_line_total ?? null,
   spec_document_id: line?.spec_document_id ?? null,
   position: line?.position ?? 0,
   notes: line?.notes ?? ''
});

/**
 * The line to save. Its customer is the order's (set by the database) and line_total is generated,
 * so neither is sent; a line stays on its order, so the order goes with a new line only.
 */
export const toPurchaseOrderLinePayload = ({
   id,
   purchase_order_id,
   ...values
}: z.output<typeof purchaseOrderLineSchema>): ResourceInput<'purchase_order_line'> => {
   const editable = {
      product_id: values.product_id,
      quantity: values.quantity,
      unit_price: values.unit_price,
      pi_line_total: values.pi_line_total ?? null,
      spec_document_id: values.spec_document_id ?? null,
      position: values.position,
      notes: values.notes ?? null
   };
   if (id) return { id, ...editable } as ResourceInput<'purchase_order_line'>;
   return { purchase_order_id, ...editable } as ResourceInput<'purchase_order_line'>;
};

/** A product's purchase price as a line's unit price, when it is in the order's currency. */
export const defaultUnitPrice = (
   { purchase_price, purchase_currency }: Pick<ProductRow, 'purchase_price' | 'purchase_currency'>,
   orderCurrency: string
): number | null =>
   purchase_price !== null && purchase_currency === orderCurrency ? purchase_price : null;

// --- payments ---

export const purchaseOrderPaymentResource = defineResource('purchase_order_payment');

export const purchaseOrderPaymentSchema = z.object({
   id: z.string().optional(),
   purchase_order_id: required(z.uuid()),
   kind: z.enum(PAYMENT_KINDS),
   amount: required(z.number().positive()),
   currency: currency(),
   planned_on: optional(dateOnly()),
   paid_on: optional(dateOnly()),
   paid_by: z.enum(PAYMENT_PAYERS),
   notes: text()
});

export type PurchaseOrderPaymentFormValues = z.input<typeof purchaseOrderPaymentSchema>;

export const toPurchaseOrderPaymentFormValues = (
   payment?: Partial<PurchaseOrderPaymentRow> | null
): PurchaseOrderPaymentFormValues => ({
   id: payment?.id ?? undefined,
   purchase_order_id: payment?.purchase_order_id ?? null,
   kind: payment?.kind ?? 'deposit',
   amount: payment?.amount ?? null,
   currency: payment?.currency ?? '',
   planned_on: parseDateOnly(payment?.planned_on),
   paid_on: parseDateOnly(payment?.paid_on),
   paid_by: payment?.paid_by ?? 'company',
   notes: payment?.notes ?? ''
});

export const toPurchaseOrderPaymentPayload = ({
   id,
   ...values
}: z.output<typeof purchaseOrderPaymentSchema>): ResourceInput<'purchase_order_payment'> => ({
   ...(id ? { id } : {}),
   ...values,
   planned_on: values.planned_on ?? null,
   paid_on: values.paid_on ?? null,
   notes: values.notes ?? null
});

export type SuggestedPayment = {
   kind: PaymentKind;
   amount: number;
   currency: string;
   paid_by: PaymentPayer;
};

/** The deposit (when there is one) and the balance the order has no payment row for yet. */
export function suggestPayments(
   figures: Figures,
   currency: string,
   existing: readonly Pick<PurchaseOrderPaymentRow, 'kind'>[]
): SuggestedPayment[] {
   const has = (kind: PaymentKind) => existing.some((payment) => payment.kind === kind);
   const suggested: SuggestedPayment[] = [];
   if (figures.deposit > 0 && !has('deposit'))
      suggested.push({ kind: 'deposit', amount: figures.deposit, currency, paid_by: 'company' });
   if (!has('balance'))
      suggested.push({ kind: 'balance', amount: figures.balance, currency, paid_by: 'company' });
   return suggested;
}

// --- production updates ---

export const purchaseOrderUpdateResource = defineResource('purchase_order_update');

export const purchaseOrderUpdateSchema = z.object({
   id: z.string().optional(),
   purchase_order_id: required(z.uuid()),
   happened_on: dateOnly(),
   note: requiredText()
});

export type PurchaseOrderUpdateFormValues = z.input<typeof purchaseOrderUpdateSchema>;

export const toPurchaseOrderUpdateFormValues = (
   update?: Partial<PurchaseOrderUpdateRow> | null
): PurchaseOrderUpdateFormValues => ({
   id: update?.id ?? undefined,
   purchase_order_id: update?.purchase_order_id ?? null,
   happened_on: parseDateOnly(update?.happened_on),
   note: update?.note ?? ''
});

export const toPurchaseOrderUpdatePayload = ({
   id,
   ...values
}: z.output<typeof purchaseOrderUpdateSchema>): ResourceInput<'purchase_order_update'> => ({
   ...(id ? { id } : {}),
   ...values
});

/** An order's production updates, newest first (by date, then by when they were written). */
export function usePurchaseOrderUpdates(purchaseOrderId: MaybeRefOrGetter<string | null>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'purchase_order_update', {
            purchaseOrderId: toValue(purchaseOrderId)
         })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('purchase_order_update')
            .select('*')
            .eq('purchase_order_id', toValue(purchaseOrderId)!)
            .order('happened_on', { ascending: false })
            .order('created_at', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(purchaseOrderId))
   });
}
