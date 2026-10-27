import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { optional, required, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';
import { saveRow } from '@/api/saveRow';

type StockView = Views['stock_view']['Row'];
type StockProduct = { category?: Array<{ id: string; display_name: string }> };
/** A stock row as the form loads it: the view's columns plus the product's categories. */
export type StockWithProduct = StockView & { product?: StockProduct | null };

export type StockInput = Omit<Tables['stock']['Insert'], 'tenant_id'>;

const DETAIL_SELECT = '*, product:product!inner(category:product_category!inner(id,display_name))';

export const stockRepository = {
   async get(id: string, signal: AbortSignal) {
      const { data } = await supabase
         .from('stock_view')
         .select(DETAIL_SELECT)
         .eq('id', id)
         .abortSignal(signal)
         .maybeSingle()
         .throwOnError();
      return data as StockWithProduct | null;
   },

   async save(values: StockInput) {
      const data = await saveRow<{ id: string }>('stock', values, 'id');

      // Return the row as the form shows it (view columns and product categories).
      return stockRepository.get(data.id, new AbortController().signal);
   }
};

export function useStock(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'stock', toValue(id))),
      queryFn: ({ signal }) => stockRepository.get(toValue(id)!, signal),
      enabled: computed(() => !!toValue(id))
   });
}

export function useSaveStock() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: stockRepository.save,
      onSuccess: () => invalidateTables(queryClient, ['stock'])
   });
}

const amount = () => z.number().min(0);

export const stockSchema = z
   .object({
      id: z.string().optional(),
      product_id: requiredText(),
      /** The joined product; only used to filter the product picker by category. */
      product: z.unknown().optional(),
      serial_number: optional(z.string()),
      barcode: optional(z.string()),
      vendor: optional(z.string()),
      details: optional(z.string()),
      unit_type: requiredText(),
      currency_code: requiredText(),
      unit_cost: amount(),
      unit_discount: amount(),
      unit_tax: amount(),
      quantity: required(z.number().min(1)),
      stocked_at: z.date().nullish()
   })
   .superRefine((stock, ctx) => {
      if (stock.unit_discount > stock.unit_cost) {
         ctx.addIssue({
            code: 'too_big',
            origin: 'number',
            maximum: stock.unit_cost,
            inclusive: true,
            input: stock.unit_discount,
            path: ['unit_discount']
         });
      }
      // A serial number identifies a single item.
      if (stock.serial_number && stock.quantity > 1) {
         ctx.addIssue({
            code: 'too_big',
            origin: 'number',
            maximum: 1,
            inclusive: true,
            input: stock.quantity,
            path: ['quantity']
         });
      }
   });

export type StockFormValues = z.input<typeof stockSchema>;

export const toStockFormValues = (stock?: Partial<StockWithProduct> | null): StockFormValues => ({
   id: stock?.id ?? undefined,
   product_id: stock?.product_id ?? '',
   product: stock?.product ?? undefined,
   serial_number: stock?.serial_number ?? '',
   barcode: stock?.barcode ?? '',
   vendor: stock?.vendor ?? '',
   details: stock?.details ?? '',
   unit_type: stock?.unit_type ?? 'pcs',
   currency_code: stock?.currency_code ?? 'TRY',
   unit_cost: Number(stock?.unit_cost ?? 0),
   unit_discount: Number(stock?.unit_discount ?? 0),
   unit_tax: Number(stock?.unit_tax ?? 0),
   quantity: Number(stock?.quantity ?? 1),
   stocked_at: stock?.stocked_at ? new Date(stock.stocked_at) : new Date()
});

export const toStockPayload = ({
   product: _product,
   stocked_at,
   unit_type,
   ...stock
}: z.output<typeof stockSchema>): StockInput => ({
   ...stock,
   unit_type: unit_type as StockInput['unit_type'],
   stocked_at: stocked_at?.toISOString() ?? null
});
