import { type AuthContext, withAuthorization } from '../_shared/auth.ts';
import { z } from '../_shared/deps.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
import { supabaseAdmin, supabaseClient } from '../_shared/supabaseClient.ts';

// Only these attributes may be written through the admin API; anything else in the body is dropped.
const userAttributes = z.object({
   email: z.string().trim().email(),
   phone: z.string().trim().nullish(),
   password: z.string().min(6).nullish(),
   user_metadata: z
      .object({
         display_name: z.string().trim().min(1)
      })
      .partial()
      .optional()
});

const createUserSchema = userAttributes.pick({ email: true, user_metadata: true });
const updateUserSchema = userAttributes.partial();

const assertTenantMember = async (tenantId: string, userId: string) => {
   const { count } = await supabaseAdmin()
      .from('tenant_user')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .throwOnError();

   if (!count) throw new HttpError(404, 'user_not_found');
};

const getUser = (req: Request, id: string) =>
   withAuthorization(req, [['select', 'user']], async ({ tenantId }) => {
      await assertTenantMember(tenantId, id);

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

      if (!user) {
         const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
            data: user_metadata
         });
         if (error) throw error;
         user = { id: data.user.id, email: data.user.email ?? email };
      }

      // Runs as the caller, so RLS also checks the tenant membership insert.
      await supabaseClient(req)
         .from('tenant_user')
         .insert({ user_id: user.id, tenant_id: tenantId })
         .throwOnError();

      return json({ user }, 201);
   });

const updateUser = (req: Request, id: string) =>
   withAuthorization(req, [['update', 'user']], async ({ tenantId }) => {
      await assertTenantMember(tenantId, id);

      const { password, phone, ...attributes } = updateUserSchema.parse(await req.json());

      const { data, error } = await supabaseAdmin().auth.admin.updateUserById(id, {
         ...attributes,
         ...(phone ? { phone } : {}),
         ...(password ? { password } : {})
      });
      if (error) throw error;

      return json({ user: { id: data.user.id, email: data.user.email } });
   });

const deleteUser = (req: Request, id: string) =>
   withAuthorization(req, [['delete', 'user']], async ({ tenantId }) => {
      await assertTenantMember(tenantId, id);

      const { count } = await supabaseAdmin()
         .from('tenant_owner')
         .select('user_id', { count: 'exact', head: true })
         .eq('user_id', id)
         .eq('tenant_id', tenantId)
         .throwOnError();

      if (count) throw new HttpError(403, 'cannot_delete_owner');

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
