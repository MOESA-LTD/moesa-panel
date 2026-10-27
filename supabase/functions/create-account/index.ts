import { z } from '../_shared/deps.ts';
import { HttpError, json, serve } from '../_shared/http.ts';
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

/** Unique company fields, so the form can point at the one that is already registered. */
const COMPANY_CONFLICTS: Record<string, string> = {
   tenant_email_key: 'company_email_exists',
   tenant_phone_key: 'company_phone_exists'
};

serve(async (req) => {
   const { account, company } = createAccountSchema.parse(await req.json());
   const service = supabaseAdmin();

   // The Auth API cannot join a database transaction, so the user comes first and is removed again
   // if the company cannot be registered.
   const { data, error } = await service.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true
   });
   if (error) throw error;
   const user = data.user;

   try {
      // Company, ownership and membership in one transaction (supabase/migrations/009_init_rpc.sql).
      // Returns the tenant row itself (a single composite, not a set).
      const { data: tenant } = await service
         .rpc('register_tenant', { owner_id: user.id, company })
         .throwOnError();

      return json({
         user: { id: user.id, email: user.email },
         tenant: { id: tenant.id, display_name: tenant.display_name }
      });
   } catch (error) {
      await service.auth.admin.deleteUser(user.id);

      const { code, message } = (error ?? {}) as { code?: string; message?: string };
      const constraint = /constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? '';
      if (code === '23505' && COMPANY_CONFLICTS[constraint]) {
         throw new HttpError(409, COMPANY_CONFLICTS[constraint], { code: COMPANY_CONFLICTS[constraint] });
      }
      throw error;
   }
});
