import { forTenant } from '@/api/formTenant';
import type { ImportError, ProductImportRow } from '@/api/product/csv';
import { invalidateTables } from '@/api/queryKeys';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

/** What public.import_products answers: the counts when saved, else every error and nothing saved. */
export type ImportResult =
   | { ok: true; inserted: number; updated: number }
   | { ok: false; errors: ImportError[] };

/**
 * Saves the rows of an S10 file in one call (public.import_products), in the active tenant alone:
 * its customer codes are looked up there, not among the other branches shown.
 */
export function useImportProducts() {
   const queryClient = useQueryClient();
   const authStore = useAuthStore();

   return useMutation({
      mutationFn: async (rows: ProductImportRow[]) => {
         const { data } = await forTenant(
            supabase.rpc('import_products', { rows: rows as Json }),
            authStore.currentTenant?.id
         ).throwOnError();
         return data as ImportResult;
      },
      onSuccess: (result) => (result.ok ? invalidateTables(queryClient, ['product']) : undefined)
   });
}
