/// <reference types="vite/client" />

// app/src/lib/supabase.ts

import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';

/** Adds the current tenant to every request. */
const customFetch = async (
   url: string | URL,
   options: RequestInit & Request
): Promise<Response> => {
   // Read on every request, so it is always the tenants selected now. The active tenant
   // (private.tenant_id) and the tenants read together (private.tenant_scope); the database keeps
   // only those the user may use.
   const { currentTenant, scopeTenants } = useAuthStore();
   // A request may name its tenant itself (forTenant, e.g. a form's lookups).
   const headers = options?.headers as Headers | undefined;
   if (!headers?.has?.('x-tenant-id') && currentTenant?.id) {
      headers?.set?.('x-tenant-id', currentTenant.id);
      if (scopeTenants.length > 1) {
         headers?.set?.('x-tenant-ids', scopeTenants.map(({ id }) => id).join(','));
      }
   }

   // A new row goes to the active tenant unless it names one, also each row of a bulk insert. Only
   // inserts (POST to a table): an update keeps the row's tenant, which may be another of the
   // tenants read together. A bulk insert gets "tenant_id" in its ?columns=, so a future bulk
   // insert into a table without tenant_id needs an opt-out here.
   const isInsert = options?.method === 'POST' && /\/rest\/v1\/(?!rpc\/)/.test(String(url));
   if (currentTenant?.id && isInsert && _isString(options?.body)) {
      const body = JSON.parse(options.body || '{}');
      const rows: unknown[] = Array.isArray(body) ? body : [body];
      let changed = false;

      for (const row of rows) {
         if (_isPlainObject(row) && !_isEmpty(row) && !(row as { tenant_id?: unknown }).tenant_id) {
            (row as { tenant_id?: string }).tenant_id = currentTenant.id;
            changed = true;
         }
      }
      if (changed) {
         options.body = JSON.stringify(body) as BodyInit & ReadableStream<Uint8Array<ArrayBuffer>>;
         // A bulk insert names its columns (?columns=…); PostgREST ignores any other key.
         const target = new URL(String(url));
         const columns = target.searchParams.get('columns');
         if (columns && !columns.split(',').includes('"tenant_id"')) {
            target.searchParams.set('columns', `${columns},"tenant_id"`);
            url = target.toString();
         }
      }
   }

   return fetch(url, options);
};

const supabaseOptions: SupabaseClientOptions<'api'> = {
   db: { schema: 'api' },
   auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
   },
   global: {
      fetch: customFetch as typeof fetch
   }
};

const env = import.meta.env;

/**
 * Tables are read and written through the `api` schema: one view per table, which masks the fields
 * the user may not read (they come back null) and refuses writes to those they may not write.
 */
export const supabase = createClient<Db, 'api'>(
   env.VITE_SUPABASE_PROJECT_URL,
   env.VITE_SUPABASE_PROJECT_ANON_KEY,
   supabaseOptions
);

/** The functions (RPCs) stay in `public`. */
export const publicSchema = supabase.schema('public');
