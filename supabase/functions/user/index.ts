import { type AuthContext, withAuthorization } from '../_shared/auth.ts';
import {
   accountReach,
   belongsToCompany,
   companyTenants,
   isManageable
} from '../_shared/company.ts';
import { z } from '../_shared/deps.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { supabaseAdmin, supabaseClient } from '../_shared/supabaseClient.ts';

const userMetadata = z
   .object({
      display_name: z.string().trim().min(1)
   })
   .partial()
   .optional();

// Only these attributes may be written through the admin API; anything else in the body is dropped.
// Email, phone and password are sign-in credentials: a tenant admin never sets them for someone
// else, users change their own through their session (account settings).
const createUserSchema = z.object({
   email: z.string().trim().toLowerCase().email(),
   user_metadata: userMetadata
});
const updateUserSchema = z.object({ user_metadata: userMetadata });

/** The columns a member is read with; personal data come masked from api.user (053). */
export const USER_COLUMNS = 'id, email, phone, user_metadata, created_at';

/** The user fields the admin API writes (the field catalog's personal_data of public.user). */
type UserField = 'email' | 'user_metadata';

/**
 * The admin API writes with the service role, which the database's field write guard (051) trusts
 * on purpose. So the function checks the caller's right to write the field itself, in the database
 * and as the caller (their token and tenant scope): a user always writes their own, another's only
 * with the field's write right. A null target is an account not yet created (an invitation).
 */
const assertFieldWrite = async (req: Request, target: string | null, fields: UserField[]) => {
   const client = supabaseClient(req).schema('public');
   for (const field of fields) {
      const { data, error } = await client.rpc('can_write_user_field', {
         p_user: target as string,
         p_field: field
      });
      if (error) throw error;
      if (data !== true) throw new HttpError(403, 'field_write_forbidden', { field });
   }
};

const assertTenantMember = async (tenantId: string, userId: string) => {
   const { count } = await supabaseAdmin()
      .from('tenant_user')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .throwOnError();

   if (!count) throw new HttpError(404, 'user_not_found');
};

/**
 * A member may be managed here only if nothing outside the caller's company relies on the
 * account: a membership row alone is not enough, as one can be added for any account. Callers
 * acting on their own account are let through.
 */
const assertManageable = async ({ tenantId, userId }: AuthContext, id: string) => {
   await assertTenantMember(tenantId, id);
   if (id === userId) return;

   const [reach, company] = await Promise.all([accountReach(id), companyTenants(tenantId)]);
   if (!isManageable(reach, company)) throw new HttpError(403, 'user_not_allowed');
};

export const getUser = (req: Request, id: string) =>
   withAuthorization(req, [['select', 'user']], async (context) => {
      await assertManageable(context, id);

      // As the caller, through api: a personal field the caller may not read comes back NULL. The
      // admin API would return every field of the account.
      const { data } = await supabaseClient(req)
         .from('user')
         .select(USER_COLUMNS)
         .eq('id', id)
         .maybeSingle()
         .throwOnError();
      if (!data) throw new HttpError(404, 'user_not_found');

      return json(data);
   });

export const createUser = (req: Request) =>
   withAuthorization(req, [['insert', 'user']], async ({ tenantId }: AuthContext) => {
      const { email, user_metadata } = createUserSchema.parse(await req.json());
      const service = supabaseAdmin();
      const written: UserField[] = user_metadata ? ['email', 'user_metadata'] : ['email'];

      const { data: existing } = await service
         .from('user')
         .select('id, email')
         .eq('email', email)
         .maybeSingle()
         .throwOnError();

      let user = existing;
      let invited = false;

      if (user) {
         // An existing account is only added to another branch of a company it is already in;
         // anyone else's account is never linked without their consent.
         const [reach, company] = await Promise.all([
            accountReach(user.id),
            companyTenants(tenantId)
         ]);
         if (!belongsToCompany(reach, company)) throw new HttpError(409, 'user_exists_elsewhere');
      } else {
         // The invitation writes the new account's e-mail and metadata (admin API).
         await assertFieldWrite(req, null, written);
         const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
            data: user_metadata
         });
         if (error) throw error;
         user = { id: data.user.id, email: data.user.email ?? email };
         invited = true;
      }

      try {
         // Runs as the caller, so RLS also checks the tenant membership insert (and the database
         // may refuse it, e.g. plan_limit_users).
         await supabaseClient(req)
            .from('tenant_user')
            .insert({ user_id: user.id, tenant_id: tenantId })
            .throwOnError();
      } catch (error) {
         // The account was made for this membership alone; do not leave it behind.
         if (invited) {
            const { error: cleanup } = await service.auth.admin.deleteUser(user.id);
            if (cleanup) console.error(cleanup);
         }
         throw error;
      }

      return json({ user }, 201);
   });

export const updateUser = (req: Request, id: string) =>
   withAuthorization(req, [['update', 'user']], async (context) => {
      await assertManageable(context, id);

      const { user_metadata } = updateUserSchema.parse(await req.json());
      if (user_metadata) await assertFieldWrite(req, id, ['user_metadata']);

      const { data, error } = await supabaseAdmin().auth.admin.updateUserById(id, {
         ...(user_metadata ? { user_metadata } : {})
      });
      if (error) throw error;

      return json({ user: { id: data.user.id, email: data.user.email } });
   });

const deleteUser = (req: Request, id: string) =>
   withAuthorization(req, [['delete', 'user']], async (context) => {
      const { tenantId } = context;
      await assertTenantMember(tenantId, id);

      const { count } = await supabaseAdmin()
         .from('tenant_owner')
         .select('user_id', { count: 'exact', head: true })
         .eq('user_id', id)
         .eq('tenant_id', tenantId)
         .throwOnError();

      if (count) throw new HttpError(403, 'cannot_delete_owner');

      await assertManageable(context, id);

      await supabaseClient(req)
         .from('tenant_user')
         .delete()
         .eq('user_id', id)
         .eq('tenant_id', tenantId)
         .throwOnError();

      return json(null, 204);
   });

const userPattern = new URLPattern({ pathname: '/user/:id' });

const handler = async (req: Request) => {
   const id = userPattern.exec(req.url)?.pathname.groups.id;

   switch (true) {
      case !!id && req.method === 'GET':
         return await getUser(req, id!);

      case !!id && req.method === 'PUT':
         return await updateUser(req, id!);

      case !!id && req.method === 'DELETE':
         return await deleteUser(req, id!);

      case !id && req.method === 'POST':
         return await createUser(req);

      case !id && req.method !== 'POST':
         throw new HttpError(400, 'user_id_required');
   }

   throw new HttpError(405, 'method_not_allowed');
};

if (import.meta.main) serve(handler);
