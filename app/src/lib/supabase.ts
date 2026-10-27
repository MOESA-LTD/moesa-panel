/// <reference types="vite/client" />

// app/src/lib/supabase.ts

import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';

/** Adds the current tenant to every request. */
const customFetch = async (
   url: string | URL,
   options: RequestInit & Request
): Promise<Response> => {
   // Read on every request, so it is always the tenant selected now.
   const { currentTenant } = useAuthStore();

   // The tenant RLS works in (private.tenant_id); the database checks the user belongs to it.
   if (currentTenant?.id) options?.headers?.set?.('x-tenant-id', currentTenant.id);

   if (currentTenant?.id && _isString(options?.body) && !_includes(url as string, 'rpc/')) {
      const body = JSON.parse(options.body || '{}');

      if (!_isNil(body) && !_isEmpty(body) && !_isArray(body)) {
         _merge(body, { tenant_id: currentTenant?.id });
         options.body = JSON.stringify(body) as BodyInit & ReadableStream<Uint8Array<ArrayBuffer>>;
      }
   }

   return fetch(url, options);
};

const supabaseOptions: SupabaseClientOptions<'public'> = {
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

export const supabase = createClient<Db>(
   env.VITE_SUPABASE_PROJECT_URL,
   env.VITE_SUPABASE_PROJECT_ANON_KEY,
   supabaseOptions
);
