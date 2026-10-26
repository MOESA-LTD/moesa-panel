import { email } from '@/lib/form/fields';
import { setZodLocale } from '@/lib/form/zod';
import i18n from '@plugins/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import * as z from 'zod';

const messageOf = (schema: z.ZodType, value: unknown) => {
   const result = schema.safeParse(value);
   return result.success ? null : result.error.issues[0].message;
};

beforeAll(() => setZodLocale('en'));

describe('zod messages', () => {
   it('reports empty values as required whatever the minimum', () => {
      const required = i18n.t('form.required');
      expect(messageOf(z.string().min(1), '')).toBe(required);
      expect(messageOf(z.string().length(6), '')).toBe(required);
      expect(messageOf(z.array(z.string()).min(2), [])).toBe(required);
      expect(messageOf(z.number(), undefined)).toBe(required);
      expect(messageOf(email(), '')).toBe(required);
   });

   it('keeps the specific message for values that are present but wrong', () => {
      expect(messageOf(z.string().length(6), '123')).not.toBe(i18n.t('form.required'));
      expect(messageOf(email(), 'not-an-email')).toBe(i18n.t('errors.invalid_email'));
   });

   it('follows the app locale', () => {
      setZodLocale('tr');
      const turkish = messageOf(z.string().length(6), '123');
      setZodLocale('en');
      expect(turkish).not.toBe(messageOf(z.string().length(6), '123'));
   });
});
