import { queryKeys, type TableName } from '@/api/queryKeys';
import { forTenant, useFormTenant } from '@/api/formTenant';
import { useTenantKey } from '@/api/useTenantKey';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export type LookupOptions = {
   select?: string;
   /** Column to sort by, ascending. */
   order?: string;
   /** Restricts rows to those whose `column` is one of `values` (skipped when empty). */
   in?: { column: string; values: readonly unknown[] };
};

/**
 * Options for pickers (Select / MultiSelect) from a table or view. Cached like any other query and
 * refreshed when the table is invalidated, so pickers no longer listen for update events.
 */
export function useLookup<Row = Record<string, any>>(
   table: TableName,
   options: MaybeRefOrGetter<LookupOptions> = {},
   /** Loads only while true, e.g. while the picker is shown. */
   enabled: MaybeRefOrGetter<boolean> = true
) {
   const tenantKey = useTenantKey();
   // Inside a form, the form's tenant alone (see provideFormTenant).
   const formTenant = useFormTenant();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(formTenant?.value ?? tenantKey.value, table, {
            view: 'lookup',
            ...toValue(options)
         })
      ),
      queryFn: async ({ signal }) => {
         const { select = '*', order, in: within } = toValue(options);

         // The row type of a table name held in a variable cannot be inferred; callers type it.
         let query = forTenant(
            (supabase.from(table as keyof Tables) as any).select(select).abortSignal(signal),
            formTenant?.value
         );
         if (order) query = query.order(order);
         if (within?.values.length) query = query.in(within.column, within.values);

         const { data } = await query.throwOnError();
         return data as Row[];
      },
      enabled: computed(() => toValue(enabled))
   });
}
