import { supabase } from '@/lib/supabase';
import { ability } from '@plugins/casl';

/**
 * Leaves out the fields the user may not write (my_access.fields): a form keeps a masked field as
 * null, which must not overwrite the stored value. The `api` views refuse them anyway.
 */
function writable<T extends object>(table: string, action: 'insert' | 'update', values: T): T {
   if (!ability.can(action, table)) return values;
   return Object.fromEntries(
      Object.entries(values).filter(([field]) => ability.can(action, table, field))
   ) as T;
}

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
         ? query.update(writable(table, 'update', changes)).eq('id', id)
         : query.insert(writable(table, 'insert', tenant_id ? { ...changes, tenant_id } : changes))
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
      .update(writable(table, 'update', patch as object))
      .eq('id', id)
      .select()
      .single()
      .throwOnError()
      .then(({ data }) => data);
}
