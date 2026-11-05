import {
   productResource,
   productSchema,
   toProductFormValues,
   toProductPayload,
   type ProductRow
} from '@/api/product';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useCustomerFilter } from '@/store/customerFilter';
import { inject, type InjectionKey } from 'vue';

export type ProductFormTab = 'general' | 'dimensions' | 'cost';

/** The product card's tabs: the form's, then the documents and the media. */
export const PRODUCT_CARD_TABS = [
   'general',
   'dimensions',
   'cost',
   'orders',
   'documents',
   'media'
] as const;
export type ProductCardTab = (typeof PRODUCT_CARD_TABS)[number];

const DIMENSION_FIELDS = new Set([
   'unit_dims_mm',
   'unit_net_g',
   'pack_qty',
   'pack_dims_mm',
   'pack_gross_g',
   'carton_pack_qty',
   'carton_dims_mm',
   'carton_net_kg',
   'carton_gross_kg',
   'pallet_carton_qty',
   'pallet_type',
   'lot_rule'
]);

const COST_FIELDS = new Set([
   'purchase_price',
   'purchase_currency',
   'purchase_incoterm',
   'landed_cost_eur',
   'landed_cost_on',
   'target_price_eur',
   'company_price_eur',
   'price_list_version'
]);

/** The card tab that shows a field (a top-level column name). */
export const tabForField = (field: string): ProductFormTab =>
   DIMENSION_FIELDS.has(field) ? 'dimensions' : COST_FIELDS.has(field) ? 'cost' : 'general';

/**
 * The product card's one form: the general, dimensions and cost tabs each show their part of it.
 * A new product starts with the customer the lists are filtered by. Once a new product is saved,
 * its "new" draft is dropped: the card goes on under the product's id (see ProductCard).
 */
export function useProductForm(
   id: () => string | null | undefined,
   onSaved?: (product: ProductRow) => void
) {
   const customerFilter = useCustomerFilter();
   const isNew = !id();

   const form = useUpsertForm({
      id,
      prefill: () => ({ customer_id: customerFilter.customerId ?? undefined }),
      useRow: productResource.useOne,
      useSaveRow: productResource.useSave,
      subject: 'product',
      schema: productSchema,
      toFormValues: toProductFormValues,
      toPayload: toProductPayload,
      onSaved: (product) => {
         if (isNew) form.discardDraft();
         onSaved?.(product);
      }
   });
   return form;
}

/** The card's form with a submit that opens the tab of the first error. */
export type ProductForm = ReturnType<typeof useProductForm> & { submit: () => Promise<void> };

export const PRODUCT_FORM: InjectionKey<ProductForm> = Symbol('product-form');

/** The form of the product card the tab is in. */
export function injectProductForm() {
   const form = inject(PRODUCT_FORM);
   if (!form) throw new Error('A product form tab must be inside the product card');
   return form;
}
