import { syncJunction } from '@/api/junction';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import { optional, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

export type Product = Tables['product']['Row'];
export type ProductCategory = Tables['product_category']['Row'];
export type ProductWithCategories = Product & { categories: ProductCategory[] };

export type ProductInput = {
   product: Omit<Tables['product']['Insert'], 'tenant_id'>;
   categoryIds: string[];
};

export const productRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('product')
         .select('*, categories:product_category(*)')
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as ProductWithCategories | null;
   },

   async categoriesByName(names: string[]) {
      const { data } = await supabase
         .from('product_category')
         .select('*')
         .in('display_name', names)
         .throwOnError();
      return data;
   },

   async save({ product, categoryIds }: ProductInput) {
      const { data } = await supabase
         .from('product')
         .upsert(product as Tables['product']['Insert'])
         .select('id')
         .single()
         .throwOnError();

      await syncJunction({
         table: 'product_categories',
         ownerColumn: 'product_id',
         ownerId: data.id,
         itemColumn: 'category_id',
         itemIds: categoryIds
      });

      // Return the row as the form shows it, with its categories.
      return productRepository.get(data.id, new AbortController().signal);
   }
};

export function useProduct(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantId();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'product', toValue(id))),
      queryFn: ({ signal }) => productRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

export function useSaveProduct() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: productRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['product', 'product_categories'])
   });
}

export const productSchema = z.object({
   id: z.string().optional(),
   tenant_id: z.string().nullish(),
   display_name: requiredText(),
   brand: optional(z.string()),
   details: optional(z.string()),
   categories: z.array(z.looseObject({ id: z.string() })).min(1)
});

export type ProductFormValues = z.input<typeof productSchema>;

export const toProductFormValues = (
   product?: Partial<ProductWithCategories> | null
): ProductFormValues => ({
   id: product?.id ?? undefined,
   tenant_id: product?.tenant_id ?? null,
   display_name: product?.display_name ?? '',
   brand: product?.brand ?? '',
   details: product?.details ?? '',
   categories: product?.categories ?? []
});

export const toProductPayload = ({
   categories,
   tenant_id: _tenantId,
   ...product
}: z.output<typeof productSchema>): ProductInput => ({
   // tenant_id is set by customFetch; shared catalogue products (no tenant) are read-only.
   product,
   categoryIds: categories.map(({ id }) => id)
});
