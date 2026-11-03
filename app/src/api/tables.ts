import { invalidateTables } from '@/api/queryKeys';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export type RowMatch = Record<string, string | number | null | undefined>;

/**
 * Deletes rows of `table` matching the given columns (by default `{ id }`) and invalidates the
 * table, what cascades from it and the views derived from them.
 */
export function useDeleteRow(table: keyof Tables) {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (match: RowMatch) => {
         await supabase.from(table).delete().match(match).throwOnError();
      },
      onSuccess: () => invalidateTables(queryClient, [table])
   });
}
