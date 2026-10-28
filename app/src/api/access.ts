import type { PermissionClaim } from '@plugins/casl';
import { supabase } from '@/lib/supabase';

export type Tenant = {
   id: string;
   display_name: string;
   /** The tenant above it, if the user may use that one too (else it is a root for them). */
   parent_id?: string | null;
   /** Whether the user owns it (directly or through a tenant above). */
   owned?: boolean;
   /** The user's permissions in it. */
   permissions?: PermissionClaim[];
};

/** The limits of a plan (a missing one is unlimited), see public.plan_limit. */
export type PlanLimits = Partial<Record<'max_branches' | 'max_users', number>>;

/** Where a subscription stands (public.status); `none` for a company without one. */
export type SubscriptionStatus =
   | 'none'
   | 'scheduled'
   | 'trialing'
   | 'active'
   | 'expired'
   | 'canceled';

/** The subscription of the active tenant's company (private.subscription_summary). */
export type SubscriptionSummary = {
   company_id: string;
   plan: { id: string; display_name: string } | null;
   status: SubscriptionStatus;
   starts_at: string | null;
   /** When it ends or ended (or was canceled); null: no end. */
   ends_at: string | null;
   /** Whether the company may write; once it ended or was canceled, it is read-only. */
   writable: boolean;
   /** The modules the company may use: the core ones and its plan's. */
   modules: string[];
   /** Permission subjects of the modules outside the plan, by module: their pages are locked. */
   locked: Record<string, string>;
   limits: PlanLimits;
   usage: { branches: number; users: number };
};

/** The signed-in user's tenants, the tenant in use and its permissions (public.my_access). */
export type Access = {
   tenant_id: string | null;
   tenants: Tenant[];
   permissions: PermissionClaim[];
   subscription: SubscriptionSummary | null;
   is_super_admin: boolean;
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
