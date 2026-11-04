import {
   changeRequestResource,
   changeRequestSchema,
   toChangeRequestFormValues,
   toChangeRequestPayload,
   useSetChangeRequestProducts,
   type ChangeRequestCard,
   type ChangeRequestGate,
   type ChangeRequestRow
} from '@/api/changeRequest';
import type { ResourceInput } from '@/api/defineResource';
import { GATE_CODES } from '@/api/project';
import { useLookup } from '@/api/useLookup';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useCustomerFilter } from '@/store/customerFilter';
import { useMutation } from '@tanstack/vue-query';
import { computed, inject, type InjectionKey } from 'vue';

/**
 * The change request card's tabs: the form's request (S08 A–C), impact (S08 D) and decision
 * (S08 E) tabs, then the request's documents (the customer's written approval among them).
 */
export const CHANGE_REQUEST_CARD_TABS = ['general', 'impact', 'decision', 'documents'] as const;
export type ChangeRequestCardTab = (typeof CHANGE_REQUEST_CARD_TABS)[number];

/** The S08 D fields of the impact tab. */
export const CHANGE_REQUEST_IMPACT_FIELDS = [
   'cost_impact',
   'cost_payer',
   'delay_days',
   'quality_impact',
   'listing_impact',
   'other_documents'
] as const;

/** The S08 E fields of the decision tab. */
export const CHANGE_REQUEST_DECISION_FIELDS = [
   'decision_note',
   'customer_approved_on',
   'customer_approval_document_id',
   'result_document_id'
] as const;

/** The card tab that shows a field of the change request form (a top-level column name). */
export const tabForField = (field: string): 'general' | 'impact' | 'decision' => {
   if ((CHANGE_REQUEST_IMPACT_FIELDS as readonly string[]).includes(field)) return 'impact';
   if ((CHANGE_REQUEST_DECISION_FIELDS as readonly string[]).includes(field)) return 'decision';
   return 'general';
};

/** Whether an open request's decision date has passed (`today` as YYYY-MM-DD, UTC). */
export const isDecisionOverdue = (
   cr: Pick<ChangeRequestRow, 'status' | 'decision_due_on'>,
   today = new Date().toISOString().slice(0, 10)
) => cr.status === 'open' && !!cr.decision_due_on && cr.decision_due_on < today;

/** What the card's form saves: the row, then the request's products. */
type ChangeRequestSave = { row: ResourceInput<'change_request'>; productIds: string[] };

const productIdsOf = (cr: Pick<ChangeRequestCard, 'change_request_product'> | null | undefined) =>
   cr?.change_request_product?.map(({ product_id }) => product_id) ?? [];

/**
 * Saves the row, then sets its products (the saved row's products before, the form's after). The
 * products need the request's id, so a new request's go once it is saved. The result carries the
 * new products, so the form is reset to them, not to the ones the row was saved with. When a new
 * request's products fail, the error is shown and the saved request returned as it is, so the card
 * moves to its id instead of inserting it again on the next save.
 */
function useSaveChangeRequest() {
   const { mutateAsync: saveRow } = changeRequestResource.useSave();
   const { mutateAsync: setProducts } = useSetChangeRequestProducts();

   return useMutation({
      mutationFn: async ({ row, productIds }: ChangeRequestSave) => {
         const saved = await saveRow(row);
         if (!saved) return saved;
         const embed = saved.change_request_product ?? [];
         const before = productIdsOf(saved);
         try {
            await setProducts({
               id: saved.id,
               tenantId: saved.tenant_id,
               before,
               after: productIds
            });
         } catch (error) {
            // An existing request's save can simply be retried. A new one is inserted by now: it
            // must go on under its id, or the retry would insert a second request (requests are
            // never deleted). Its products stay as saved; the form shows that, and the error.
            if (row.id) throw error;
            void appErrorHandler(error);
            return saved;
         }
         return {
            ...saved,
            change_request_product: productIds.map(
               (product_id) =>
                  embed.find((line) => line.product_id === product_id) ?? {
                     product_id,
                     product: null
                  }
            )
         };
      }
   });
}

/**
 * The change request card's one form: the request, impact and decision tabs each show their part
 * of it. A new request starts with the customer the lists are filtered by, or the one a link names
 * (the route's query, as props: a route dialog renders the page outside the router). Once a new
 * request is saved, its "new" draft is dropped: the card goes on under its id.
 */
export function useChangeRequestForm(
   id: () => string | null | undefined,
   onSaved?: (cr: ChangeRequestCard) => void,
   prefill: ChangeRequestPrefill = {}
) {
   const customerFilter = useCustomerFilter();
   const isNew = !id();

   const initial = () => {
      const customerId = queryValue(prefill.customer_id) ?? customerFilter.customerId;
      const projectId = queryValue(prefill.project_id);
      return {
         ...(customerId ? { customer_id: customerId } : {}),
         ...(customerId && projectId ? { project_id: projectId } : {})
      };
   };

   const form = useUpsertForm({
      id,
      prefill: initial,
      useRow: changeRequestResource.useOne,
      useSaveRow: useSaveChangeRequest,
      subject: 'change_request',
      schema: changeRequestSchema,
      toFormValues: toChangeRequestFormValues,
      toPayload: (values): ChangeRequestSave => ({
         row: toChangeRequestPayload(values),
         productIds: values.product_ids
      }),
      onSaved: (cr) => {
         if (isNew) form.discardDraft();
         onSaved?.(cr);
      }
   });
   return form;
}

/** A new request's customer and project, when a link names them. */
export type ChangeRequestPrefill = { customer_id?: string | null; project_id?: string | null };

const queryValue = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** The card's form with a submit that opens the tab of the first error. */
export type ChangeRequestForm = ReturnType<typeof useChangeRequestForm> & {
   submit: () => Promise<void>;
};

export const CHANGE_REQUEST_FORM: InjectionKey<ChangeRequestForm> = Symbol('change-request-form');

/** The form of the change request card the tab is in. */
export function injectChangeRequestForm() {
   const form = inject(CHANGE_REQUEST_FORM);
   if (!form) throw new Error('A change request tab must be inside the change request card');
   return form;
}

const GATE_ORDER = new Map<string, number>(GATE_CODES.map((code, index) => [code, index]));

/**
 * The gates of the project the form names, in the process order: the saved project's come with
 * the request; another project's are loaded.
 */
export function useChangeRequestGates(form: Pick<ChangeRequestForm, 'values' | 'row'>) {
   const projectId = computed(() => form.values.value.project_id ?? null);
   const savedProject = computed(
      () => !!projectId.value && projectId.value === form.row.value?.project_id
   );

   const { data: loaded } = useLookup<ChangeRequestGate>(
      'project_gate',
      () => ({
         select: 'code, status, needs_customer_approval',
         order: 'code',
         in: { column: 'project_id', values: projectId.value ? [projectId.value] : [] }
      }),
      () => !!projectId.value && !savedProject.value
   );

   return computed<ChangeRequestGate[]>(() => {
      if (!projectId.value) return [];
      const gates = savedProject.value
         ? (form.row.value?.project?.project_gate ?? [])
         : (loaded.value ?? []);
      return [...gates].sort(
         (a, b) => (GATE_ORDER.get(a.code) ?? 99) - (GATE_ORDER.get(b.code) ?? 99)
      );
   });
}
