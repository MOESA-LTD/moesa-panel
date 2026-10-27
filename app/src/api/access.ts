import type { PermissionClaim } from '@plugins/casl';
import { supabase } from '@/lib/supabase';

export type Tenant = { id: string; display_name: string };

/** The signed-in user's tenants, the tenant in use and its permissions (public.my_access). */
export type Access = {
   tenant_id: string | null;
   tenants: Tenant[];
   permissions: PermissionClaim[];
};

/**
 * Reads the user's access from the database, which RLS also enforces on every request. `requested`
 * is the tenant to work in; the database falls back to another of the user's tenants when the
 * user does not belong to it (any more).
 */
export async function fetchAccess(requested: string | null): Promise<Access | null> {
   const { data } = await supabase.rpc('my_access', requested ? { requested } : {}).throwOnError();
   return data as Access | null;
}
