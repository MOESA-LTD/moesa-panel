import i18n from '@plugins/i18n';
import dayjs from 'dayjs';
import { isValidPhoneNumber } from 'libphonenumber-js';
import * as z from 'zod';

/** Reusable field schemas for forms. Inputs may be empty strings; payloads use null instead. */

export const requiredText = () =>
   z
      .string({ error: () => i18n.t('form.required') })
      .trim()
      .min(1);

/** An optional field: an empty input becomes null, anything else must match `schema`. */
export const optional = <S extends z.ZodType>(schema: S) =>
   z
      .union([z.literal(''), schema])
      .nullish()
      .transform((value) => (value === '' ? null : value));

/** Empty input reports "required"; anything else must be a valid address. */
export const email = () =>
   z
      .string()
      .trim()
      .min(1)
      .pipe(z.email({ error: () => i18n.t('errors.invalid_email') }));

export const phone = () =>
   z.string().refine((value) => isValidPhoneNumber(value), {
      error: () => i18n.t('errors.invalid_phone')
   });

/**
 * A required field whose form starts empty (null), e.g. a select or a date. The input type allows
 * null so an empty form type-checks; submitting it empty reports "required", and the output is
 * never null. Other errors still come from `schema`.
 */
export const required = <S extends z.ZodType>(schema: S) =>
   schema.nullable().transform((value, ctx) => {
      if (value === null) {
         ctx.addIssue({ code: 'custom', message: i18n.t('form.required') });
         return z.NEVER;
      }
      return value as z.output<S>;
   });

/** A calendar date edited with DatePicker (a Date) and stored as YYYY-MM-DD. */
export const dateOnly = () =>
   required(z.date()).transform((date) => dayjs(date).format('YYYY-MM-DD'));

/** Parses a stored YYYY-MM-DD as a local date for DatePicker. */
export const parseDateOnly = (value?: string | null) => (value ? dayjs(value).toDate() : null);
