import { email, optional, phone, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import type { User } from '@supabase/supabase-js';
import * as z from 'zod';

/** The signed-in user's own profile; changes go through Supabase Auth, not the database. */
export const profileSchema = z.object({
   display_name: optional(z.string()),
   email: email(),
   phone: optional(phone())
});

export type ProfileFormValues = z.input<typeof profileSchema>;

export const toProfileFormValues = (user?: Partial<User> | null): ProfileFormValues => ({
   display_name: user?.user_metadata?.display_name ?? '',
   email: user?.email ?? '',
   phone: user?.phone ?? ''
});

export async function updateProfile({
   display_name,
   email,
   phone
}: z.output<typeof profileSchema>) {
   // user_metadata is merged, so other keys (e.g. avatar_url) are kept.
   const { data, error } = await supabase.auth.updateUser({
      email,
      phone: phone ?? undefined,
      data: { display_name }
   });
   if (error) throw error;
   return data.user;
}

export const passwordSchema = z
   .object({
      password: z.string().min(8),
      password_confirmation: requiredText()
   })
   .refine(({ password, password_confirmation }) => password === password_confirmation, {
      path: ['password_confirmation'],
      error: () => i18n.t('form.passwords_do_not_match')
   });

export async function updatePassword({ password }: z.output<typeof passwordSchema>) {
   const { error } = await supabase.auth.updateUser({ password });
   if (error) throw error;
}

/** Ends every session of the user except this one. */
export async function signOutOtherSessions() {
   const { error } = await supabase.auth.signOut({ scope: 'others' });
   if (error) throw error;
}
