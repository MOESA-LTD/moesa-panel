import i18n from '@plugins/i18n';
import * as z from 'zod';

const ZOD_LOCALES: Record<string, () => { localeError: z.core.$ZodErrorMap }> = {
   'ar-ae': z.locales.ar,
   de: z.locales.de,
   en: z.locales.en,
   es: z.locales.es,
   fr: z.locales.fr,
   it: z.locales.it,
   ja: z.locales.ja,
   ko: z.locales.ko,
   pl: z.locales.pl,
   ru: z.locales.ru,
   tr: z.locales.tr,
   zh: z.locales.zhCN
};

const isEmpty = (input: unknown) => input === undefined || input === null || input === '';

/** zod's own message for an empty value ("expected string to have >=1 characters") reads poorly. */
const customError: z.core.$ZodErrorMap = (issue) => {
   const missing =
      (issue.code === 'invalid_type' && isEmpty(issue.input)) ||
      (issue.code === 'too_small' &&
         issue.minimum === 1 &&
         (issue.origin === 'string' || issue.origin === 'array'));

   return missing ? i18n.t('form.required') : undefined;
};

/** Localizes zod messages; called whenever the app locale changes. */
export function setZodLocale(locale: string) {
   z.config((ZOD_LOCALES[locale] ?? z.locales.en)());
   z.config({ customError });
}
