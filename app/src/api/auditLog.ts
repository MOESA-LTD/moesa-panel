import { invalidateTables, type TableName } from '@/api/queryKeys';
import { publicSchema } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

/**
 * Undoes everything a transaction changed. Fails with 409 `audit_conflict` when a row was changed
 * since, and `audit_already_reverted` when it was undone already.
 */
export function useRevertAuditTransaction() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (transactionId: string) => {
         const { data } = await publicSchema
            .rpc('revert_audit_transaction', { transaction_id: transactionId })
            .throwOnError();
         return data;
      },
      // The tables the revert wrote to.
      onSuccess: (tables) => invalidateTables(queryClient, tables as TableName[])
   });
}
