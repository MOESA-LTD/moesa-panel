import i18n from '@plugins/i18n';

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

/** `Key (national_id)=(123) already exists.` → ['national_id'] */
const keyColumns = (details?: string | null) =>
   /Key \(([^)]+)\)=/
      .exec(details ?? '')?.[1]
      .split(',')
      .map((column) => column.trim()) ?? [];

/** A constraint is named after its table and columns, e.g. client_national_id_key. */
const constraintColumns = (message: string | undefined, fields: string[]) => {
   const constraint = /constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? '';
   return fields.filter((field) => constraint.includes(field));
};

/**
 * Maps a database error to messages for the form fields it concerns, so e.g. a duplicate national
 * id shows under that field instead of as a generic toast. Returns null when no field matches.
 */
export function mapPostgrestError(error: unknown, fields: string[]): Record<string, string> | null {
   const { code, message, details } = (error ?? {}) as PostgrestLikeError;

   let columns: string[] = [];
   let text: string;

   switch (code) {
      case '23505': // unique_violation
         columns = keyColumns(details);
         if (!columns.length) columns = constraintColumns(message, fields);
         text = i18n.t('form.already_exists');
         break;
      case '23503': // foreign_key_violation
         columns = keyColumns(details);
         text = i18n.t('form.invalid_reference');
         break;
      case '23502': // not_null_violation
         columns = [/column "([^"]+)"/.exec(message ?? '')?.[1] ?? ''];
         text = i18n.t('form.required');
         break;
      case '23514': // check_violation
         columns = constraintColumns(message, fields);
         text = i18n.t('form.invalid_value');
         break;
      default:
         return null;
   }

   const known = columns.filter((column) => fields.includes(column));
   return known.length ? Object.fromEntries(known.map((column) => [column, text])) : null;
}
