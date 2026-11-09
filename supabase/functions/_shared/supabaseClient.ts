import type { Database } from './database.types.ts';
import { createClient, type SupabaseClient } from './deps.ts';

const requireEnv = (name: string) => {
   const value = Deno.env.get(name);
   if (!value) throw new Error(`Missing environment variable: ${name}`);
   return value;
};

const options = {
   auth: {
      autoRefreshToken: false,
      persistSession: false
   }
};

// Service reads never depend on the order of the exposed schemas: pin the profile to public.
const serviceOptions = { ...options, db: { schema: 'public' as const } };

const FORWARDED_HEADERS = ['Authorization', 'x-tenant-id', 'x-tenant-ids'];

let admin: SupabaseClient<Database> | undefined;

/** Service-role client. Bypasses RLS, so every call must be scoped by the caller explicitly. */
export const supabaseAdmin = () =>
   (admin ??= createClient<Database>(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      serviceOptions
   ));

/** The functions that may label their service-role writes in the audit (046 audit_service_actor). */
export type AuditRole =
   | 'amazon-auth'
   | 'amazon-listing'
   | 'amazon-schema'
   | 'amazon-poll'
   | 'amazon-schema-refresh';

/**
 * A service-role client whose audited writes name the function (actor_role) and, when it acts for
 * one, the user (actor_id). Bypasses RLS like supabaseAdmin: the user path wraps it in
 * _shared/serviceRole.ts, which exposes only the operations no user may perform.
 */
export const supabaseService = (audit: { role: AuditRole; actorId?: string }) =>
   createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      ...serviceOptions,
      global: {
         headers: {
            'x-audit-role': audit.role,
            ...(audit.actorId ? { 'x-audit-actor': audit.actorId } : {})
         }
      }
   });

/**
 * Client acting as the requesting user, so RLS applies. Tables are read through the `api` schema,
 * where a sensitive field the user may not read comes back NULL (supabase/migrations/053+); RPCs
 * are in `public`: call them as `.schema('public').rpc(...)`. Typed as `public` (the same columns,
 * not nullable) because the app's own types for api views are all nullable.
 */
export const supabaseClient = (req: Request) =>
   createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      ...options,
      db: { schema: 'api' as 'public' },
      global: {
         headers: Object.fromEntries(
            FORWARDED_HEADERS.flatMap((name) => {
               const value = req.headers.get(name);
               return value ? [[name, value]] : [];
            })
         )
      }
   });
