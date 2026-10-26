import { z } from '../_shared/deps.ts';
import { json, serve } from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts';

// Public endpoint: only these fields are accepted, so callers cannot inject app_metadata, roles etc.
const createAccountSchema = z.object({
   account: z.object({
      email: z.string().trim().email(),
      password: z.string().min(8)
   }),
   company: z.object({
      display_name: z.string().trim().min(3),
      email: z.string().trim().email(),
      phone: z.string().trim().nullish()
   })
});

serve(async (req) => {
   const { account, company } = createAccountSchema.parse(await req.json());
   const service = supabaseAdmin();

   const { data: tenant } = await service
      .from('tenant')
      .insert(company)
      .select('id, display_name')
      .single()
      .throwOnError();

   let userId: string | undefined;

   try {
      const { data, error } = await service.auth.admin.createUser({
         email: account.email,
         password: account.password,
         email_confirm: true
      });
      if (error) throw error;
      userId = data.user.id;

      await service
         .from('tenant_owner')
         .insert({ tenant_id: tenant.id, user_id: userId })
         .throwOnError();

      await service
         .from('tenant_user')
         .insert({ tenant_id: tenant.id, user_id: userId })
         .throwOnError();

      return json({ user: { id: userId, email: data.user.email }, tenant });
   } catch (error) {
      // Compensate so a failed registration does not leave an orphan user or tenant behind.
      if (userId) await service.auth.admin.deleteUser(userId);
      await service.from('tenant').delete().eq('id', tenant.id);
      throw error;
   }
});
