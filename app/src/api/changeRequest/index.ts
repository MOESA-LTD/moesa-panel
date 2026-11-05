import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { DocumentRow } from '@/api/document';
import { COST_PAYERS } from '@/api/incident';
import type { ProductRow } from '@/api/product';
import { GATE_CODES, type ProjectGateRow } from '@/api/project';
import { toDocumentOptions } from '@/api/purchaseOrder';
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
export type ChangeRequestStatus = Enums['change_request_status'];
export type ChangeRequestSource = Enums['change_request_source'];
export type ChangeRequestUrgency = Enums['change_request_urgency'];
export type ChangeKind = Enums['change_kind'];
export type ChangeRequestRow = Tables['change_request']['Row'];

/** A request as its card loads it (CHANGE_REQUEST_SELECT). */
export type ChangeRequestCard = ChangeRequestRow & {
   customer: Pick<Tables['customer']['Row'], 'code' | 'display_name'> | null;
   project:
      | (Pick<Tables['project']['Row'], 'code' | 'display_name'> & {
           project_gate: Pick<ProjectGateRow, 'code' | 'status' | 'needs_customer_approval'>[];
        })
      | null;
   change_request_product: {
      product_id: string;
      product: Pick<ProductRow, 'sku' | 'display_name'> | null;
   }[];
   affected_document: Pick<
      DocumentRow,
      'id' | 'entity_type' | 'entity_id' | 'type' | 'version' | 'status'
   > | null;
   result_document: Pick<DocumentRow, 'id' | 'type' | 'version' | 'status'> | null;
};

/** A project gate as the approval rule reads it. */
export type ChangeRequestGate = { code: string; status: string; needs_customer_approval: boolean };

// --- constants ---

export const CHANGE_REQUEST_STATUSES = allValues<ChangeRequestStatus>()([
   'open',
   'approved',
   'rejected',
   'applied'
]);

export const CHANGE_REQUEST_SOURCES = allValues<ChangeRequestSource>()([
   'customer',
   'supplier',
   'company',
   'regulation'
]);

export const CHANGE_REQUEST_URGENCIES = allValues<ChangeRequestUrgency>()(['normal', 'urgent']);

export const CHANGE_KINDS = allValues<ChangeKind>()([
   'spec',
   'design',
   'packaging',
   'price',
   'deadline',
   'supplier',
   'content'
]);

// --- status flow ---

/** The transitions of private.change_request_guard (037, rule 4); rejected and applied are final. */
const NEXT_STATUSES: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
   open: ['approved', 'rejected'],
   approved: ['applied'],
   rejected: [],
   applied: []
};

export const nextChangeRequestStatuses = (status: ChangeRequestStatus): ChangeRequestStatus[] => [
   ...NEXT_STATUSES[status]
];

/**
 * Whether approving needs the customer's written approval (037, rule 5; S08 §4): the request
 * touches a gate of its project (`gates`, the card's project_gate) that is passed and needs the
 * customer's approval. Without a project there are no gates, so none is needed.
 */
export function needsCustomerApproval(
   cr: Pick<ChangeRequestRow, 'affected_gate_code'>,
   gates: readonly ChangeRequestGate[]
): boolean {
   return (
      !!cr.affected_gate_code &&
      gates.some(
         (gate) =>
            gate.code === cr.affected_gate_code &&
            gate.status === 'passed' &&
            gate.needs_customer_approval
      )
   );
}

export type ChangeRequestStatusHint =
   | 'change_request_customer_approval_required'
   | 'change_request_decision_note_required'
   | 'change_request_new_version_required';

/**
 * What a move to `status` lacks (037, rules 5–7), as errors.<code> keys: approving after a passed
 * (M) gate needs the customer's approval date and document, rejecting a decision note, applying a
 * request that changes a document its new version. A display hint only; the database decides
 * (it also checks that the new version is a higher one of the same document).
 */
export function changeRequestStatusHints(
   cr: Pick<
      ChangeRequestRow,
      | 'affected_gate_code'
      | 'customer_approved_on'
      | 'customer_approval_document_id'
      | 'decision_note'
      | 'affected_document_id'
      | 'result_document_id'
   >,
   status: ChangeRequestStatus,
   gates: readonly ChangeRequestGate[]
): ChangeRequestStatusHint[] {
   switch (status) {
      case 'approved':
         return needsCustomerApproval(cr, gates) &&
            (!cr.customer_approved_on || !cr.customer_approval_document_id)
            ? ['change_request_customer_approval_required']
            : [];
      case 'rejected':
         return cr.decision_note?.trim() ? [] : ['change_request_decision_note_required'];
      case 'applied':
         return cr.affected_document_id && !cr.result_document_id
            ? ['change_request_new_version_required']
            : [];
      default:
         return [];
   }
}

// --- request ---

/**
 * The card's request: its customer, its project with the gates (for the approval rule), its
 * products, the affected document and the new version.
 */
export const CHANGE_REQUEST_SELECT =
   '*, customer!change_request_customer_fkey(code, display_name), project!change_request_project_fkey(code, display_name, project_gate!project_gate_project_fkey(code, status, needs_customer_approval)), change_request_product!change_request_product_cr_fkey(product_id, product!change_request_product_product_fkey(sku, display_name)), affected_document:document!change_request_affected_document_fkey(id, entity_type, entity_id, type, version, status), result_document:document!change_request_result_document_fkey(id, type, version, status)';

export const changeRequestResource = defineResource<'change_request', ChangeRequestCard>(
   'change_request',
   { select: CHANGE_REQUEST_SELECT }
);

const text = () => optional(z.string().trim());

export const changeRequestSchema = z.object({
   id: z.string().optional(),
   customer_id: required(z.uuid()),
   project_id: optional(z.uuid()),
   title: requiredText(),
   source: required(z.enum(CHANGE_REQUEST_SOURCES)),
   urgency: z.enum(CHANGE_REQUEST_URGENCIES).default('normal'),
   // Mirrors change_request_kinds_required.
   change_kinds: z
      .array(z.enum(CHANGE_KINDS))
      .min(1, { error: () => i18n.t('errors.change_request_kinds_required') }),
   current_value: requiredText(),
   requested_value: requiredText(),
   reason: requiredText(),
   affected_gate_code: optional(z.enum(GATE_CODES)),
   affected_document_id: optional(z.uuid()),
   other_documents: text(),
   cost_impact: text(),
   cost_payer: optional(z.enum(COST_PAYERS)),
   delay_days: optional(z.number().int().min(0)),
   quality_impact: text(),
   listing_impact: text(),
   decision_note: text(),
   customer_approved_on: optional(dateOnly()),
   customer_approval_document_id: optional(z.uuid()),
   result_document_id: optional(z.uuid()),
   // The form's product picker; saved by useSetChangeRequestProducts, never with the row.
   product_ids: z.array(z.uuid()).default([])
});

export type ChangeRequestFormValues = z.input<typeof changeRequestSchema>;
export type ChangeRequestValues = z.output<typeof changeRequestSchema>;

export const toChangeRequestFormValues = (
   cr?: Partial<ChangeRequestCard> | null
): ChangeRequestFormValues => ({
   id: cr?.id ?? undefined,
   customer_id: cr?.customer_id ?? null,
   project_id: cr?.project_id ?? null,
   title: cr?.title ?? '',
   source: cr?.source ?? null,
   urgency: cr?.urgency ?? 'normal',
   change_kinds: cr?.change_kinds ?? [],
   current_value: cr?.current_value ?? '',
   requested_value: cr?.requested_value ?? '',
   reason: cr?.reason ?? '',
   affected_gate_code: cr?.affected_gate_code ?? null,
   affected_document_id: cr?.affected_document_id ?? null,
   other_documents: cr?.other_documents ?? '',
   cost_impact: cr?.cost_impact ?? '',
   cost_payer: cr?.cost_payer ?? null,
   delay_days: cr?.delay_days ?? null,
   quality_impact: cr?.quality_impact ?? '',
   listing_impact: cr?.listing_impact ?? '',
   decision_note: cr?.decision_note ?? '',
   customer_approved_on: parseDateOnly(cr?.customer_approved_on),
   customer_approval_document_id: cr?.customer_approval_document_id ?? null,
   result_document_id: cr?.result_document_id ?? null,
   product_ids: cr?.change_request_product?.map(({ product_id }) => product_id) ?? []
});

/**
 * The row to save, empty fields as NULL. The code, the status (useSetChangeRequestStatus), the
 * decision date, MOESA's approval and the closing date are the database's; the customer never
 * changes, so it goes with a new request only; the products are saved by
 * useSetChangeRequestProducts.
 */
export function toChangeRequestPayload(
   { id: valuesId, customer_id, ...values }: ChangeRequestValues,
   id?: string | null
): ResourceInput<'change_request'> {
   const rowId = id ?? valuesId;
   const editable = {
      project_id: values.project_id ?? null,
      title: values.title,
      source: values.source,
      urgency: values.urgency,
      change_kinds: values.change_kinds,
      current_value: values.current_value,
      requested_value: values.requested_value,
      reason: values.reason,
      affected_gate_code: values.affected_gate_code ?? null,
      affected_document_id: values.affected_document_id ?? null,
      other_documents: values.other_documents ?? null,
      cost_impact: values.cost_impact ?? null,
      cost_payer: values.cost_payer ?? null,
      delay_days: values.delay_days ?? null,
      quality_impact: values.quality_impact ?? null,
      listing_impact: values.listing_impact ?? null,
      decision_note: values.decision_note ?? null,
      customer_approved_on: values.customer_approved_on ?? null,
      customer_approval_document_id: values.customer_approval_document_id ?? null,
      result_document_id: values.result_document_id ?? null
   };
   if (rowId) return { id: rowId, ...editable } as ResourceInput<'change_request'>;
   return { ...editable, customer_id };
}

/** Moves a request to another status; the database checks the flow and its data (037). */
export function useSetChangeRequestStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ id, status }: { id: string; status: ChangeRequestStatus }) =>
         updateRow('change_request', id, { status }),
      onSuccess: () => invalidateTables(queryClient, ['change_request'])
   });
}

/**
 * Sets the request's products: adds those in `after` but not `before`, removes those in `before`
 * but not `after`. The row's customer is the request's (set by the database), so it is not sent;
 * a product of another customer fails change_request_product_product_fkey. The rows name the
 * request's tenant, which may be another of the branches shown than the active one.
 */
export function useSetChangeRequestProducts() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({
         id,
         tenantId,
         before,
         after
      }: {
         id: string;
         tenantId: string;
         before: string[];
         after: string[];
      }) => {
         const added = after.filter((productId) => !before.includes(productId));
         const removed = before.filter((productId) => !after.includes(productId));
         if (added.length)
            await supabase
               .from('change_request_product')
               // customer_id is set by the database (change_request_product_customer).
               .insert(
                  added.map((product_id) => ({
                     change_request_id: id,
                     product_id,
                     tenant_id: tenantId
                  })) as Tables['change_request_product']['Insert'][]
               )
               .throwOnError();
         if (removed.length)
            await supabase
               .from('change_request_product')
               .delete()
               .eq('change_request_id', id)
               .in('product_id', removed)
               .throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, ['change_request_product'])
   });
}

/**
 * The newer versions of the affected document (the same record and type, a higher version),
 * newest first, as `v03 — Signed` options: the new version an applied request names. They share
 * the affected document's record, which the guard keeps to the request's customer, so the picker
 * offers only the customer's documents (the guard checks the result document's customer too).
 */
export function useNewerDocumentOptions(
   document: MaybeRefOrGetter<Pick<
      DocumentRow,
      'entity_type' | 'entity_id' | 'type' | 'version'
   > | null>
) {
   const tenantKey = useTenantKey();

   const { data } = useQuery({
      queryKey: computed(() => {
         const doc = toValue(document);
         return queryKeys.list(tenantKey.value, 'document', {
            view: 'newer',
            entityType: doc?.entity_type ?? null,
            entityId: doc?.entity_id ?? null,
            type: doc?.type ?? null,
            version: doc?.version ?? null
         });
      }),
      queryFn: async ({ signal }) => {
         const { entity_type, entity_id, type, version } = toValue(document)!;
         const { data } = await supabase
            .from('document')
            .select('id, version, status')
            .eq('entity_type', entity_type)
            .eq('entity_id', entity_id)
            .eq('type', type)
            .gt('version', version)
            .order('version', { ascending: false })
            .abortSignal(signal)
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(document))
   });

   return computed(() => toDocumentOptions(data.value ?? []));
}
