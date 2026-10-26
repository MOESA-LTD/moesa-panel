import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantId } from '@/api/useTenantId';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export type ResourceRow<T extends keyof Tables> = Tables[T]['Row'];
/** What forms send: tenant_id is added to every write by customFetch. */
export type ResourceInput<T extends keyof Tables> = Omit<Tables[T]['Insert'], 'tenant_id'>;

/**
 * Repository and query composables for a table edited by a single form: load one row by id,
 * save (upsert) it, and invalidate the table afterwards.
 */
export function defineResource<T extends keyof Tables, Row = ResourceRow<T>>(
   table: T,
   { select = '*' }: { select?: string } = {}
) {
   // supabase-js cannot narrow the row type for a table name held in a generic, so the queries are
   // typed by their callers' signatures instead.
   const from = () => supabase.from(table as keyof Tables) as any;

   const repository = {
      async get(id: string, signal: AbortSignal): Promise<Row | null> {
         const { data } = await from()
            .select(select)
            .eq('id', id)
            .abortSignal(signal)
            .maybeSingle()
            .throwOnError();
         return data;
      },

      async save(values: ResourceInput<T>): Promise<Row> {
         const { data } = await from().upsert(values).select(select).single().throwOnError();
         return data;
      }
   };

   function useOne(id: MaybeRefOrGetter<string | null | undefined>) {
      const tenantId = useTenantId();

      return useQuery({
         queryKey: computed(() => queryKeys.detail(tenantId.value, table, toValue(id))),
         queryFn: ({ signal }) => repository.get(toValue(id)!, signal),
         enabled: computed(() => !!toValue(id))
      });
   }

   function useSave() {
      const queryClient = useQueryClient();

      return useMutation({
         mutationFn: repository.save,
         onSuccess: () => invalidateTables(queryClient, [table])
      });
   }

   return { table, repository, useOne, useSave };
}
