import { supabaseAdmin } from './supabaseClient.ts';

/** Where an account is used: whether it is a super admin, and the tenants it owns or belongs to. */
export type AccountReach = {
   isSuperAdmin: boolean;
   owns: string[];
   memberOf: string[];
};

/**
 * The tenants of the company `tenantId` is in: the top-level tenant above it and every branch
 * below that. Read with the service role, as the caller may not see all of them.
 */
export const companyTenants = async (tenantId: string) => {
   const service = supabaseAdmin();

   let root = tenantId;
   const path = new Set([root]);
   for (;;) {
      const { data } = await service
         .from('tenant')
         .select('parent_id')
         .eq('id', root)
         .maybeSingle()
         .throwOnError();
      // A cycle should never get in, but must not loop forever if it does.
      if (!data?.parent_id || path.has(data.parent_id)) break;
      root = data.parent_id;
      path.add(root);
   }

   const tenants = new Set([root]);
   let frontier = [root];
   while (frontier.length) {
      const { data } = await service
         .from('tenant')
         .select('id')
         .in('parent_id', frontier)
         .throwOnError();
      frontier = (data ?? []).map(({ id }) => id).filter((id) => !tenants.has(id));
      frontier.forEach((id) => tenants.add(id));
   }

   return tenants;
};

/** Reads where an account is used, with the service role so nothing is hidden by RLS. */
export const accountReach = async (userId: string): Promise<AccountReach> => {
   const service = supabaseAdmin();

   const [owners, members, superAdmin] = await Promise.all([
      service.from('tenant_owner').select('tenant_id').eq('user_id', userId).throwOnError(),
      service.from('tenant_user').select('tenant_id').eq('user_id', userId).throwOnError(),
      // auth.users is out of the API's reach; an error is thrown, so the check fails closed.
      service.rpc('is_super_admin', { user_id: userId }).throwOnError()
   ]);

   return {
      isSuperAdmin: superAdmin.data === true,
      owns: (owners.data ?? []).map(({ tenant_id }) => tenant_id),
      memberOf: (members.data ?? []).map(({ tenant_id }) => tenant_id)
   };
};

/** Whether the account belongs to the company at all, as a member or an owner of one of its tenants. */
export const belongsToCompany = ({ owns, memberOf }: AccountReach, company: Set<string>) =>
   [...owns, ...memberOf].some((id) => company.has(id));

/**
 * Whether a tenant admin may manage the account: never a super admin or an owner (they manage
 * themselves), nor someone who also belongs to another company, whose admins would share it.
 */
export const isManageable = (
   { isSuperAdmin, owns, memberOf }: AccountReach,
   company: Set<string>
) => !isSuperAdmin && owns.length === 0 && memberOf.every((id) => company.has(id));
