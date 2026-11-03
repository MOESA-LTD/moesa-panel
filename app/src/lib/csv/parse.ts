export type CsvDelimiter = ',' | ';';

export interface ParsedCsv {
   header: string[];
   rows: string[][];
}

/** The delimiter the header line uses most: a semicolon (European spreadsheets) or a comma. */
const detectDelimiter = (text: string): CsvDelimiter => {
   let commas = 0;
   let semicolons = 0;
   let quoted = false;
   for (const char of text) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && (char === '\n' || char === '\r')) break;
      else if (!quoted && char === ',') commas++;
      else if (!quoted && char === ';') semicolons++;
   }
   return semicolons > commas ? ';' : ',';
};

/**
 * Reads a CSV text (RFC 4180): fields in double quotes may hold the delimiter, line breaks and
 * doubled quotes (""). CRLF or LF line endings; a UTF-8 byte order mark is dropped. Without a
 * `delimiter`, the header line tells whether it is a comma or a semicolon. Rows with nothing in
 * them (blank lines, or only delimiters as spreadsheets write them) are skipped.
 */
export function parseCsv(
   input: string,
   { delimiter }: { delimiter?: CsvDelimiter } = {}
): ParsedCsv {
   const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
   const separator = delimiter ?? detectDelimiter(text);

   const lines: string[][] = [];
   let row: string[] = [];
   let field = '';
   let quoted = false;

   const endField = () => {
      row.push(field);
      field = '';
   };
   const endRow = () => {
      endField();
      if (row.some((cell) => cell !== '')) lines.push(row);
      row = [];
   };

   for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
         if (char !== '"') field += char;
         else if (text[i + 1] === '"') {
            field += '"';
            i++;
         } else quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === separator) endField();
      else if (char === '\n') endRow();
      else if (char === '\r') {
         if (text[i + 1] === '\n') i++;
         endRow();
      } else field += char;
   }
   if (field !== '' || row.length > 0) endRow();

   const [header = [], ...rows] = lines;
   return { header, rows };
}
