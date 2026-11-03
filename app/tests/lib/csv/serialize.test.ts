import { parseCsv } from '@/lib/csv/parse';
import { serializeCsv } from '@/lib/csv/serialize';
import { describe, expect, it } from 'vitest';

describe('serializeCsv', () => {
   it('writes the header and rows, one line each', () => {
      expect(serializeCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
   });

   it('quotes fields holding the delimiter, quotes or line breaks', () => {
      expect(
         serializeCsv(['a'], [['Mop, 40 cm'], ['say "hi"'], ['line 1\nline 2'], ['plain']])
      ).toBe('a\r\n"Mop, 40 cm"\r\n"say ""hi"""\r\n"line 1\nline 2"\r\nplain\r\n');
   });

   it('quotes by the delimiter it is given', () => {
      expect(serializeCsv(['a', 'b'], [['1,90', 'x;y']], { delimiter: ';' })).toBe(
         'a;b\r\n1,90;"x;y"\r\n'
      );
   });

   it('reads back what it wrote', () => {
      const header = ['sku', 'urun_adi', 'not'];
      const rows = [
         ['THO-1', 'Mop, 40 cm', 'say "hi"\nthen go'],
         ['THO-2', '', 'Süpürge']
      ];
      expect(parseCsv(serializeCsv(header, rows))).toEqual({ header, rows });
   });
});
