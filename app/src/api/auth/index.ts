import { email, optional, phone, requiredText } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import { FunctionsHttpError, type VerifyOtpParams } from '@supabase/supabase-js';
import * as z from 'zod';

const passwordsMatch = ({
   password,
   password_confirmation
}: {
   password: string;
   password_confirmation: string;
}) => password === password_confirmation;

export const loginSchema = z.object({
   email: email(),
   password: requiredText()
});

/** A single e-mail address, e.g. to send a reset link or a new code to. */
export const emailSchema = z.object({ email: email() });

export const otpSchema = z.object({
   email: email(),
   code: z.string().length(6)
});

export const registerSchema = z.object({
   account: z
      .object({
         email: email(),
         password: z.string().min(8),
         password_confirmation: requiredText()
      })
      .refine(passwordsMatch, {
         path: ['password_confirmation'],
         error: () => i18n.t('form.passwords_do_not_match')
      }),
   company: z.object({
      display_name: z.string().trim().min(3),
      email: email(),
      phone: optional(phone())
   })
});

export type RegisterFormValues = z.input<typeof registerSchema>;

/** Creates the owner account and its tenant (supabase/functions/create-account). */
export async function createAccount({ account, company }: z.output<typeof registerSchema>) {
   const { error } = await supabase.functions.invoke('create-account', {
      body: { account: { email: account.email, password: account.password }, company }
   });
   if (!error) return;

   // Show "already registered" on the e-mail field instead of a generic toast.
   if (error instanceof FunctionsHttpError) {
      const body = await error.context
         .clone()
         .json()
         .catch(() => null);
      if (['email_exists', 'user_already_exists'].includes(body?.code)) {
         throw Object.assign(new Error(body.code), {
            fieldErrors: { 'account.email': i18n.t('errors.user_already_registered') }
         });
      }
   }
   throw error;
}

export async function verifyOtp(email: string, code: string, type: VerifyOtpParams['type']) {
   const { error } = await supabase.auth.verifyOtp({ email, token: code, type } as VerifyOtpParams);
   if (error) throw error;
}
