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

const getUser = (req: Request, id: string) =>
   withAuthorization(req, [['select', 'user']], async (context) => {
      await assertManageable(context, id);

      const { data, error } = await supabaseAdmin().auth.admin.getUserById(id);
      if (error) throw error;

      return json(data);
   });

const createUser = (req: Request) =>
   withAuthorization(req, [['insert', 'user']], async ({ tenantId }: AuthContext) => {
      const { email, user_metadata } = createUserSchema.parse(await req.json());
      const service = supabaseAdmin();

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

const updateUser = (req: Request, id: string) =>
   withAuthorization(req, [['update', 'user']], async (context) => {
      await assertManageable(context, id);

      const { user_metadata } = updateUserSchema.parse(await req.json());

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

serve(async (req) => {
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
});
