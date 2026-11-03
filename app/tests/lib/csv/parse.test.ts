import { parseCsv } from '@/lib/csv/parse';
import { describe, expect, it } from 'vitest';

describe('parseCsv', () => {
   it('reads the header and the rows', () => {
      expect(parseCsv('sku,urun_adi\nTHO-1,Mop\nTHO-2,Bucket\n')).toEqual({
         header: ['sku', 'urun_adi'],
         rows: [
            ['THO-1', 'Mop'],
            ['THO-2', 'Bucket']
         ]
      });
   });

   it('keeps a delimiter inside quotes and unescapes doubled quotes', () => {
      expect(parseCsv('a,b\n"Mop, 40 cm","say ""hi"""\n').rows).toEqual([
         ['Mop, 40 cm', 'say "hi"']
      ]);
   });

   it('keeps line breaks inside quotes', () => {
      expect(parseCsv('a,b\n"line 1\nline 2",x').rows).toEqual([['line 1\nline 2', 'x']]);
   });

   it('takes CRLF line endings and no trailing newline', () => {
      expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual({
         header: ['a', 'b'],
         rows: [
            ['1', '2'],
            ['3', '4']
         ]
      });
   });

   it('detects a semicolon delimiter from the header', () => {
      expect(parseCsv('sku;alis_fiyati\nTHO-1;1,90\n')).toEqual({
         header: ['sku', 'alis_fiyati'],
         rows: [['THO-1', '1,90']]
      });
   });

   it('uses the delimiter it is given', () => {
      expect(parseCsv('a;b,c\n1;2,3', { delimiter: ',' }).header).toEqual(['a;b', 'c']);
   });

   it('strips a UTF-8 byte order mark', () => {
      expect(parseCsv(String.fromCharCode(0xfeff) + 'sku,ad\nTHO-1,Süpürge').header).toEqual([
         'sku',
         'ad'
      ]);
   });

   it('keeps empty cells and skips rows with nothing in them', () => {
      expect(parseCsv('a,b,c\n1,,3\n,,\n\n4,5,\n').rows).toEqual([
         ['1', '', '3'],
         ['4', '5', '']
      ]);
   });

   it('reads an empty text as no header and no rows', () => {
      expect(parseCsv('')).toEqual({ header: [], rows: [] });
   });
});
