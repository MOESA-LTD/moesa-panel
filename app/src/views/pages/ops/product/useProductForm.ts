import {
   productResource,
   productSchema,
   toProductFormValues,
   toProductPayload,
   type ProductRow
} from '@/api/product';
import { useUpsertForm } from '@/composables/useUpsertForm';
import { useCustomerFilter } from '@/store/customerFilter';

/**
 * The product card's form. The general, dimensions and cost tabs each edit their part of the same
 * row with it; only the open tab is mounted, so they share one draft without conflict. A new
 * product starts with the customer the lists are filtered by.
 */
export function useProductForm(
   id: () => string | null | undefined,
   onSaved?: (product: ProductRow) => void
) {
   const customerFilter = useCustomerFilter();

   return useUpsertForm({
      id,
      prefill: () => ({ customer_id: customerFilter.customerId ?? undefined }),
      useRow: productResource.useOne,
      useSaveRow: productResource.useSave,
      subject: 'product',
      schema: productSchema,
      toFormValues: toProductFormValues,
      toPayload: toProductPayload,
      onSaved
   });
}
