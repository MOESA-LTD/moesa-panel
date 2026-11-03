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
