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
 * Errors named by their constraint or raised message, and the one field and message they belong to.
 * Checked before the generic mapping, which would e.g. mark every column of a unique key.
 */
const NAMED_ERRORS: { code: string; name: string; field: string; message: string }[] = [
   {
      code: '23505',
      name: 'unique_document_version',
      field: 'version',
      message: 'errors.document_version_exists'
   },
   {
      code: '23514',
      name: 'document_signed_incomplete',
      field: 'status',
      message: 'errors.document_signed_incomplete'
   },
   { code: '23514', name: 'document_has_file', field: 'url', message: 'form.required' },
   { code: '23505', name: 'product_gtin_active', field: 'gtin', message: 'errors.gtin_in_use' },
   {
      code: '23505',
      name: 'product_customer_id_sku_key',
      field: 'sku',
      message: 'errors.sku_in_use'
   }
];

/**
 * Maps a database error to messages for the form fields it concerns, so e.g. a duplicate national
 * id shows under that field instead of as a generic toast. Returns null when no field matches.
 */
export function mapPostgrestError(error: unknown, fields: string[]): Record<string, string> | null {
   const { code, message, details } = (error ?? {}) as PostgrestLikeError;

   const named = NAMED_ERRORS.find(
      (entry) =>
         entry.code === code && message?.includes(entry.name) && fields.includes(entry.field)
   );
   if (named) return { [named.field]: i18n.t(named.message) };

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
