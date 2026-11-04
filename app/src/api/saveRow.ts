import { supabase } from '@/lib/supabase';

/**
 * Inserts a new row (it goes to the active tenant, see customFetch) or updates the existing one
 * (`values.id`). An update never sends tenant_id, so a row of another of the tenants read together
 * stays in its tenant; an upsert would have moved it to the active one.
 */
export function saveRow<Row>(table: keyof Tables, values: object, select = '*') {
   const { id, tenant_id, ...changes } = values as { id?: string | null; tenant_id?: unknown };
   // The table is a parameter, so the row type comes from the caller.
   const query = supabase.from(table) as any;

   return (
      id
         ? query.update(changes).eq('id', id)
         : query.insert(tenant_id ? { ...changes, tenant_id } : changes)
   )
      .select(select)
      .single()
      .throwOnError()
      .then(({ data }: { data: Row }) => data) as Promise<Row>;
}

type PatchBuilder<Row> = {
   update(patch: object): {
      eq(
         column: 'id',
         id: string
      ): {
         select(): { single(): { throwOnError(): Promise<{ data: Row }> } };
      };
   };
};

/**
 * Patches some columns of one row: a status, a PI line total, a single field. Unlike saveRow it
 * takes a partial row, which repository.save (a whole form) cannot carry.
 */
export function updateRow<T extends keyof Tables>(
   table: T,
   id: string,
   patch: Tables[T]['Update']
): Promise<Tables[T]['Row']> {
   // supabase-js cannot narrow the row type for a table name held in a generic, so the builder is
   // typed by this function's signature.
   const query = supabase.from(table as keyof Tables) as unknown as PatchBuilder<Tables[T]['Row']>;

   return query
      .update(patch)
      .eq('id', id)
      .select()
      .single()
      .throwOnError()
      .then(({ data }) => data);
}
