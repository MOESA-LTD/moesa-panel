import type { CsvDelimiter } from '@/lib/csv/parse';

/**
 * Writes a CSV text (RFC 4180, CRLF line endings): a field holding the delimiter, a quote or a
 * line break is put in double quotes, its quotes doubled.
 */
export function serializeCsv(
   header: readonly string[],
   rows: readonly (readonly string[])[],
   { delimiter = ',' }: { delimiter?: CsvDelimiter } = {}
): string {
   const quote = (field: string) =>
      field.includes(delimiter) || /["\r\n]/.test(field)
         ? `"${field.replaceAll('"', '""')}"`
         : field;

   return [header, ...rows].map((row) => `${row.map(quote).join(delimiter)}\r\n`).join('');
}
