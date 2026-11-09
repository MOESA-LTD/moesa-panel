import {
   DEFERRED_COLUMNS,
   S10_COLUMNS,
   S10_FIELD_OF,
   S10_TO_PRODUCT,
   mapS10Rows,
   toS10Csv,
   type ProductExportRow
} from '@/api/product/csv';
import { parseCsv } from '@/lib/csv/parse';
import { describe, expect, it } from 'vitest';

const ALL = { canRead: () => true, canWrite: () => true };
const mapAll = (header: readonly string[], rows: readonly (readonly string[])[]) =>
   mapS10Rows(header, rows, ALL);

const HEADER = ['musteri_kodu', 'sku', 'urun_adi'];

describe('S10 columns', () => {
   it('maps, defers or ignores every column of the template', () => {
      const ignored = S10_COLUMNS.filter(
         (column) => !(column in S10_TO_PRODUCT) && !DEFERRED_COLUMNS.includes(column)
      );
      expect(ignored).toEqual(['gtin_kontrol']);
      expect(S10_COLUMNS).toHaveLength(69);
   });
});

describe('mapS10Rows', () => {
   it('maps the columns to the product, whatever their order', () => {
      const { rows, warnings, errors } = mapAll(
         ['urun_adi', 'sku', 'musteri_kodu', 'tedarikci_kodu', 'urun_olcu_mm'],
         [['Mop 40 cm', 'tho-mop40', 'tho', 'CN1', '400x120x30']]
      );
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
      expect(rows).toEqual([
         {
            display_name: 'Mop 40 cm',
            sku: 'THO-MOP40',
            customer_code: 'THO',
            supplier_code: 'CN1',
            unit_dims_mm: '400x120x30'
         }
      ]);
   });

   it('reads numbers with a decimal comma', () => {
      const { rows, errors } = mapAll(
         [...HEADER, 'alis_fiyati', 'paket_adet', 'koli_brut_kg'],
         [['THO', 'THO-1', 'Mop', '1,90', '12', '8.5']]
      );
      expect(errors).toEqual([]);
      expect(rows[0]).toMatchObject({ purchase_price: 1.9, pack_qty: 12, carton_gross_kg: 8.5 });
   });

   it('reports a number it cannot read, and a quantity that is not whole', () => {
      const { errors } = mapAll(
         [...HEADER, 'alis_fiyati', 'paket_adet'],
         [['THO', 'THO-1', 'Mop', '1.000,50', '2,5']]
      );
      expect(errors).toEqual([
         { row: 1, field: 'purchase_price', code: 'invalid_value' },
         { row: 1, field: 'pack_qty', code: 'invalid_value' }
      ]);
   });

   it('reads dates as DD.MM.YYYY or YYYY-MM-DD', () => {
      const { rows, errors } = mapAll(
         [...HEADER, 'altin_numune_tarihi', 'landed_cost_tarihi'],
         [['THO', 'THO-1', 'Mop', '03.11.2026', '2026-10-01']]
      );
      expect(errors).toEqual([]);
      expect(rows[0]).toMatchObject({
         golden_sample_on: '2026-11-03',
         landed_cost_on: '2026-10-01'
      });
      expect(
         mapAll([...HEADER, 'altin_numune_tarihi'], [['THO', 'THO-1', 'Mop', '31.02.2026']]).errors
      ).toEqual([{ row: 1, field: 'golden_sample_on', code: 'invalid_value' }]);
   });

   it('reads yes/no and the statuses, in English or Turkish', () => {
      const { rows, errors } = mapAll(
         [...HEADER, 'tehlikeli_madde', 'uyum_belge_durumu', 'durum'],
         [
            ['THO', 'THO-1', 'Mop', 'evet', 'tam', 'Yayında'],
            ['THO', 'THO-2', 'Mop', 'false', 'partial', 'on_sale'],
            ['THO', 'THO-3', 'Mop', '', '', '']
         ]
      );
      expect(errors).toEqual([]);
      expect(
         rows.map(({ is_hazmat, compliance_status, status }) => [
            is_hazmat,
            compliance_status,
            status
         ])
      ).toEqual([
         [true, 'complete', 'on_sale'],
         [false, 'partial', 'on_sale'],
         [undefined, undefined, undefined]
      ]);
      expect(mapAll([...HEADER, 'durum'], [['THO', 'THO-1', 'Mop', 'maybe']]).errors).toEqual([
         { row: 1, field: 'status', code: 'invalid_value' }
      ]);
   });

   it("reads the S10 template's own list values", () => {
      const { rows, warnings, errors } = mapAll(
         [...HEADER, 'tehlikeli_madde', 'uyum_belge_durumu', 'durum', 'not'],
         [
            ['THO', 'THO-1', 'Mop', 'Yok', 'Tam', 'Yayında', ''],
            ['THO', 'THO-2', 'Mop', 'Var (UN 1203)', 'Süresi geçmiş', 'Depoda', 'Fragile'],
            ['THO', 'THO-3', 'Mop', 'VAR', 'EKSİK', 'Karantina', ''],
            ['THO', 'THO-4', 'Mop', 'hayir', 'PARTIAL', 'ARCHIVED', ''],
            ['THO', 'THO-5', 'Mop', 'Var (UN 1993)', 'yok', 'ORDERING', ''],
            ['THO', 'THO-6', 'Mop', 'no', 'none', 'Fizibilite', ''],
            ['THO', 'THO-7', 'Mop', '1', 'complete', 'Numune', ''],
            ['THO', 'THO-8', 'Mop', '0', 'expired', 'Onaylı spec', ''],
            ['THO', 'THO-9', 'Mop', 'yes', 'Tam', 'SİPARİŞTE', ''],
            ['THO', 'THO-10', 'Mop', 'false', 'Tam', 'satistan kalkti', ''],
            ['THO', 'THO-11', 'Mop', 'Evet', 'Tam', 'gelistirme', ''],
            ['THO', 'THO-12', 'Mop', 'true', 'Tam', 'Arşiv', '']
         ]
      );
      expect(errors).toEqual([]);
      expect(
         rows.map(({ is_hazmat, compliance_status, status }) => [
            is_hazmat,
            compliance_status,
            status
         ])
      ).toEqual([
         [false, 'complete', 'on_sale'],
         [true, 'partial', 'ordering'],
         [true, 'partial', 'paused'],
         [false, 'partial', 'archived'],
         [true, 'none', 'ordering'],
         [false, 'none', 'concept'],
         [true, 'complete', 'development'],
         [false, 'partial', 'approved'],
         [true, 'complete', 'ordering'],
         [false, 'complete', 'paused'],
         [true, 'complete', 'development'],
         [true, 'complete', 'archived']
      ]);
      expect(rows.map(({ notes }) => notes)).toEqual([
         null,
         'Fragile; UN: 1203',
         null,
         null,
         'UN: 1993',
         null,
         null,
         null,
         null,
         null,
         null,
         null
      ]);
      expect(warnings).toEqual([
         { row: 2, column: 'uyum_belge_durumu', code: 'compliance_expired_as_partial' },
         { row: 2, column: 'durum', code: 'status_depoda_as_ordering' },
         { row: 3, column: 'durum', code: 'status_karantina_as_paused' },
         { row: 8, column: 'uyum_belge_durumu', code: 'compliance_expired_as_partial' }
      ]);
   });

   it('takes an empty cell as no value, and leaves out the columns the file does not have', () => {
      const { rows } = mapAll(
         [...HEADER, 'marka', 'alis_fiyati'],
         [['THO', 'THO-1', 'Mop', '', '']]
      );
      expect(rows[0]).toEqual({
         customer_code: 'THO',
         sku: 'THO-1',
         display_name: 'Mop',
         brand: null,
         purchase_price: null
      });
   });

   it('lets gtin_kontrol be empty and checks the GTIN itself', () => {
      const { rows, errors, warnings } = mapAll(
         [...HEADER, 'gtin', 'gtin_kontrol'],
         [
            ['THO', 'THO-1', 'Mop', '4260696025800', ''],
            ['THO', 'THO-2', 'Mop', '4260696025801', 'OK']
         ]
      );
      expect(warnings).toEqual([]);
      expect(rows[0]).toMatchObject({ gtin: '4260696025800' });
      expect(errors).toEqual([{ row: 2, field: 'gtin', code: 'gtin_invalid' }]);
   });

   it('warns once for each unknown column', () => {
      const { warnings, errors } = mapAll(
         [...HEADER, 'renk', 'renk_kodu'],
         [
            ['THO', 'THO-1', 'Mop', 'blue', '1'],
            ['THO', 'THO-2', 'Mop', 'red', '2']
         ]
      );
      expect(errors).toEqual([]);
      expect(warnings).toEqual([
         { column: 'renk', code: 'unknown_column' },
         { column: 'renk_kodu', code: 'unknown_column' }
      ]);
   });

   it('warns about the deferred columns that hold values, and never maps them', () => {
      const { rows, warnings } = mapAll(
         [...HEADER, 'asin_de', 'fnsku', 'spec_surumu'],
         [
            ['THO', 'THO-1', 'Mop', 'B0ABC', '', ''],
            ['THO', 'THO-2', 'Mop', 'B0DEF', '', '']
         ]
      );
      expect(warnings).toEqual([{ column: 'asin_de', code: 'deferred_column' }]);
      expect(rows[0]).toEqual({ customer_code: 'THO', sku: 'THO-1', display_name: 'Mop' });
   });

   it('reports a missing required value on its row and field', () => {
      const { rows, errors } = mapAll(HEADER, [
         ['THO', 'THO-1', 'Mop'],
         ['THO', '', 'Bucket']
      ]);
      expect(errors).toEqual([{ row: 2, field: 'sku', code: 'required' }]);
      expect(rows).toHaveLength(1);
   });

   it('reports a required column the file does not have on every row', () => {
      const { errors } = mapAll(['musteri_kodu', 'sku'], [['THO', 'THO-1']]);
      expect(errors).toEqual([{ row: 1, field: 'display_name', code: 'required' }]);
   });

   it('checks the customer code and the SKU', () => {
      const { errors } = mapAll(HEADER, [['THOR', 'THO 1', 'Mop']]);
      expect(errors).toEqual([
         { row: 1, field: 'customer_code', code: 'invalid_value' },
         { row: 1, field: 'sku', code: 'invalid_value' }
      ]);
   });
});

describe('toS10Csv', () => {
   const product = {
      id: 'p1',
      parent_id: null,
      sku: 'THO-MOP40',
      display_name: 'Mop, 40 cm',
      gtin: '4260696025800',
      purchase_price: 1.9,
      is_hazmat: false,
      status: 'on_sale',
      compliance_status: 'complete',
      golden_sample_on: '2026-11-03',
      customer: { code: 'THO' },
      supplier: { code: 'CN1' }
   } as unknown as ProductExportRow;
   const variant = {
      ...product,
      id: 'p2',
      parent_id: 'p1',
      sku: 'THO-MOP40-2P',
      gtin: null,
      supplier: null
   } as unknown as ProductExportRow;

   it('writes the template header and the products in its columns', () => {
      const { header, rows } = parseCsv(toS10Csv([product, variant], ALL));
      expect(header).toEqual([...S10_COLUMNS]);
      const cell = (row: string[], column: string) =>
         row[(S10_COLUMNS as readonly string[]).indexOf(column)];
      expect(cell(rows[0], 'musteri_kodu')).toBe('THO');
      expect(cell(rows[0], 'urun_adi')).toBe('Mop, 40 cm');
      expect(cell(rows[0], 'tedarikci_kodu')).toBe('CN1');
      expect(cell(rows[0], 'alis_fiyati')).toBe('1.9');
      expect(cell(rows[0], 'tehlikeli_madde')).toBe('Yok');
      expect(cell(rows[1], 'parent_sku')).toBe('THO-MOP40');
      expect(DEFERRED_COLUMNS.every((column) => cell(rows[0], column) === '')).toBe(true);
   });

   it('reads back into the same rows', () => {
      const { header, rows } = parseCsv(toS10Csv([product], ALL));
      const mapped = mapAll(header, rows);
      expect(mapped.errors).toEqual([]);
      expect(mapped.rows[0]).toMatchObject({
         customer_code: 'THO',
         sku: 'THO-MOP40',
         display_name: 'Mop, 40 cm',
         supplier_code: 'CN1',
         purchase_price: 1.9,
         is_hazmat: false,
         status: 'on_sale',
         golden_sample_on: '2026-11-03'
      });
   });
});

describe('field rights', () => {
   const ROW = {
      id: 'p1',
      sku: 'S1',
      display_name: 'A',
      supplier_product_code: 'SPC-1',
      purchase_price: 12.5
   } as unknown as ProductExportRow;

   it('maps every header to a product field or null', () => {
      expect(Object.keys(S10_FIELD_OF).sort()).toEqual([...S10_COLUMNS].sort());
      expect(S10_FIELD_OF.tedarikci_kodu).toBe('supplier_id');
      expect(S10_FIELD_OF.tedarikci_urun_kodu).toBe('supplier_product_code');
      expect(S10_FIELD_OF.art_no).toBe('manufacturer_art_no');
      expect(S10_FIELD_OF.alis_fiyati).toBe('purchase_price');
      expect(S10_FIELD_OF.spec_dosya).toBeNull();
   });

   it('drops columns the reader cannot read from the export', () => {
      const header = toS10Csv([ROW], {
         canRead: (f) => !['purchase_price', 'supplier_product_code'].includes(f)
      }).split('\n')[0];
      expect(header).not.toContain('tedarikci_urun_kodu');
      expect(header).not.toContain('alis_fiyati');
      expect(header).toContain('sku');
   });

   const file = (fill: Record<string, string>) => [
      [...S10_COLUMNS],
      S10_COLUMNS.map((c) => fill[c] ?? '')
   ];

   it('refuses an import that fills a column the writer cannot write', () => {
      const [header, row] = file({ sku: 'S1', tedarikci_urun_kodu: 'SPC-9' });
      const result = mapS10Rows(header, [row], {
         canWrite: (f) => f !== 'supplier_product_code'
      });
      expect(result.errors).toContainEqual({
         row: 0,
         field: 'tedarikci_urun_kodu',
         code: 'csv_column_not_writable'
      });
   });

   it('accepts an empty cell in a column the writer cannot write, and the same file with the right', () => {
      const [header, row] = file({ sku: 'S1' });
      const deny = (f: string) => f !== 'supplier_product_code';
      expect(
         mapS10Rows(header, [row], { canWrite: deny }).errors.filter(
            (e) => e.code === 'csv_column_not_writable'
         )
      ).toEqual([]);
      const [h2, r2] = file({ sku: 'S1', tedarikci_urun_kodu: 'SPC-9' });
      expect(
         mapS10Rows(h2, [r2], { canWrite: () => true }).errors.filter(
            (e) => e.code === 'csv_column_not_writable'
         )
      ).toEqual([]);
   });
});
