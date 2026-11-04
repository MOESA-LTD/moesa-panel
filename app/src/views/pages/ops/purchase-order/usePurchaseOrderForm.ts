import {
   isPurchaseOrderLocked,
   purchaseOrderResource,
   purchaseOrderSchema,
   toPurchaseOrderFormValues,
   toPurchaseOrderPayload,
   type PurchaseOrderCard,
   type PurchaseOrderCardLine,
   type PurchaseOrderOverviewRow
} from '@/api/purchaseOrder';
import { piDifferences, type FigureLine } from '@/api/purchaseOrder/figures';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useCustomerFilter } from '@/store/customerFilter';
import { computed, inject, ref, type InjectionKey, type Ref } from 'vue';
import { useRoute } from 'vue-router';

/**
 * The purchase order card's tabs: the form's general tab, the lines, the PI check (the form's PI
 * fields), payments and production updates, then the documents and the media.
 */
export const PO_CARD_TABS = [
   'general',
   'lines',
   'pi',
   'payments',
   'production',
   'documents',
   'media'
] as const;
export type PurchaseOrderCardTab = (typeof PO_CARD_TABS)[number];

/** The card tab that shows a field of the order form (a top-level column name). */
export const tabForField = (field: string): 'general' | 'pi' =>
   field.startsWith('pi_') ? 'pi' : 'general';

const queryValue = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/**
 * The order card's one form: the general and PI tabs each show their part of it. A new order
 * starts with the customer the lists are filtered by, or the customer and project a link names
 * (?customer_id=…&project_id=…). Once a new order is saved, its "new" draft is dropped: the card
 * goes on under the order's id (see PurchaseOrderCard).
 */
export function usePurchaseOrderForm(
   id: () => string | null | undefined,
   onSaved?: (order: PurchaseOrderCard) => void
) {
   const customerFilter = useCustomerFilter();
   const route = useRoute();
   const isNew = !id();

   const prefill = () => {
      const customerId = queryValue(route.query.customer_id) ?? customerFilter.customerId;
      const projectId = queryValue(route.query.project_id);
      return {
         ...(customerId ? { customer_id: customerId } : {}),
         ...(projectId ? { project_id: projectId } : {})
      };
   };

   const form = useUpsertForm({
      id,
      prefill,
      useRow: purchaseOrderResource.useOne,
      useSaveRow: purchaseOrderResource.useSave,
      subject: 'purchase_order',
      schema: purchaseOrderSchema,
      toFormValues: toPurchaseOrderFormValues,
      // The locked terms are left out once the saved order's status locks them.
      toPayload: (data) => toPurchaseOrderPayload(data, form.row.value?.status),
      onSaved: (order) => {
         if (isNew) form.discardDraft();
         onSaved?.(order);
      }
   });
   return form;
}

/** The card's form with a submit that opens the tab of the first error. */
export type PurchaseOrderForm = ReturnType<typeof usePurchaseOrderForm> & {
   submit: () => Promise<void>;
};

export const PURCHASE_ORDER_FORM: InjectionKey<PurchaseOrderForm> = Symbol('purchase-order-form');

/** The order's overview row (spec_missing_line_ids, system_* figures), loaded once by the card. */
export const PURCHASE_ORDER_OVERVIEW: InjectionKey<
   Ref<PurchaseOrderOverviewRow | null | undefined>
> = Symbol('purchase-order-overview');

/** The form of the order card the tab is in. */
export function injectPurchaseOrderForm() {
   const form = inject(PURCHASE_ORDER_FORM);
   if (!form) throw new Error('A purchase order tab must be inside the purchase order card');
   return form;
}

/** The overview row of the order card the tab is in (null until loaded or for a new order). */
export const injectPurchaseOrderOverview = () =>
   inject(PURCHASE_ORDER_OVERVIEW, () => ref(null), true);

/** Whether the card's saved order has its terms and lines locked (pi_approved on). */
export const useOrderLocked = (form: Pick<PurchaseOrderForm, 'row'>) =>
   computed(() => !!form.row.value && isPurchaseOrderLocked(form.row.value.status));

/** A finite number, or null: a cleared InputNumber is null, and the figures must never see it. */
const finite = (value: unknown): number | null =>
   typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The order fields the PI check reads, as the form or the saved row holds them. */
export type PiCheckInput = Partial<
   Record<
      | 'deposit_rate'
      | 'pi_subtotal'
      | 'pi_total'
      | 'pi_deposit_amount'
      | 'pi_balance_amount'
      | 'pi_extra_amount'
      | 'pi_discount_amount',
      unknown
   >
>;

/**
 * The S09 PI check (piDifferences) of an order's lines against its PI fields. The figures throw on
 * what is not a decimal, so a line without a whole quantity or a unit price is left out, and a
 * cleared figure counts as missing (a cleared extra, discount or rate as 0). `lineTotals` are the
 * PI line totals as typed, by line id, over the saved ones.
 */
export function purchaseOrderPiCheck(
   lines: readonly PurchaseOrderCardLine[],
   order: PiCheckInput,
   lineTotals: Readonly<Record<string, number | null | undefined>> = {}
) {
   const complete = [...lines]
      .sort((a, b) => a.position - b.position)
      .flatMap((line): FigureLine[] => {
         const unitPrice = finite(line.unit_price);
         if (!Number.isInteger(line.quantity) || unitPrice === null) return [];
         return [
            {
               quantity: line.quantity,
               unit_price: unitPrice,
               pi_line_total: finite(
                  line.id in lineTotals ? lineTotals[line.id] : line.pi_line_total
               ),
               ...(line.product?.sku ? { label: line.product.sku } : {})
            }
         ];
      });
   const extra = finite(order.pi_extra_amount) ?? 0;
   const discount = finite(order.pi_discount_amount) ?? 0;
   return piDifferences(
      complete,
      {
         deposit_rate: finite(order.deposit_rate) ?? 0,
         pi_extra_amount: extra,
         pi_discount_amount: discount
      },
      {
         pi_subtotal: finite(order.pi_subtotal),
         pi_total: finite(order.pi_total),
         pi_deposit_amount: finite(order.pi_deposit_amount),
         pi_balance_amount: finite(order.pi_balance_amount),
         pi_extra_amount: extra,
         pi_discount_amount: discount
      }
   );
}
