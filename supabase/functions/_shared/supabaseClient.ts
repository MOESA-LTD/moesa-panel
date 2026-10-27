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

const FORWARDED_HEADERS = ['Authorization', 'x-tenant-id'];

let admin: SupabaseClient<Database> | undefined;

/** Service-role client. Bypasses RLS, so every call must be scoped by the caller explicitly. */
export const supabaseAdmin = () =>
   (admin ??= createClient<Database>(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      options
   ));

/** Client acting as the requesting user, so RLS applies. */
export const supabaseClient = (req: Request) =>
   createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      ...options,
      global: {
         headers: Object.fromEntries(
            FORWARDED_HEADERS.flatMap((name) => {
               const value = req.headers.get(name);
               return value ? [[name, value]] : [];
            })
         )
      }
   });
