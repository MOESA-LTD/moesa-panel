import { invalidateTables, type TableName } from '@/api/queryKeys';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

/** Reverts the change recorded under an audit log entry (and those correlated with it). */
export function useRevertAuditLog() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ correlationId }: { correlationId: string; tableName: string }) => {
         await supabase
            .rpc('revert_audit_log', { target_correlation_id: correlationId })
            .throwOnError();
      },
      // The revert rewrites rows of the logged table.
      onSuccess: (_, { tableName }) =>
         invalidateTables(queryClient, [tableName.replace(/^public\./, '') as TableName])
   });
}
