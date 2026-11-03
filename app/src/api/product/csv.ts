import {
   COMPLIANCE_STATUSES,
   PRODUCT_SKU,
   PRODUCT_STATUSES,
   PURCHASE_CURRENCIES,
   type ComplianceStatus,
   type ProductRow,
   type ProductStatus
} from '@/api/product';
import { serializeCsv } from '@/lib/csv/serialize';
import { gtinValid } from '@/lib/gtin';
import * as z from 'zod';

/** The header of the S10 product spreadsheet ("Ürün ana tablosu"), in its order. */
export const S10_COLUMNS = [
   'sku',
   'parent_sku',
   'gtin',
   'gtin_kontrol',
   'gs1_onek_sahibi',
   'urun_adi',
   'varyant',
   'kategori',
   'musteri_kodu',
   'marka',
   'proje_kodu',
   'art_no',
   'tedarikci_kodu',
   'tedarikci_urun_kodu',
   'spec_surumu',
   'spec_tarihi',
   'spec_dosya',
   'spec_imzali',
   'altin_numune_tarihi',
   'altin_numune_yerleri',
   'kalip',
   'uyum_belge_durumu',
   'uyum_eksikler',
   'uyum_dosya',
   'tehlikeli_madde',
   'sorumlu_kisi_ab',
   'hs_kodu',
   'hs_teyit',
   'mense',
   'urun_olcu_mm',
   'urun_net_g',
   'paket_adet',
   'paket_olcu_mm',
   'paket_brut_g',
   'koli_paket_adet',
   'koli_olcu_mm',
   'koli_net_kg',
   'koli_brut_kg',
   'palet_koli_adet',
   'palet_tipi_olcu',
   'lot_kurali',
   'alis_fiyati',
   'alis_para_birimi',
   'alis_incoterm',
   'landed_cost_eur',
   'landed_cost_tarihi',
   'satis_fiyati_hedef_eur',
   'moesa_fiyat_eur',
   'fiyat_listesi_surumu',
   'son_po',
   'asin_de',
   'asin_fr',
   'asin_it',
   'asin_es',
   'asin_nl',
   'asin_pl',
   'asin_se',
   'fnsku',
   'kaufland_de_id',
   'ebay_de_id',
   'listing_dosya',
   'durum',
   'kapi_son',
   'olusturma_tarihi',
   'olusturan_rol',
   'guncelleme_tarihi',
   'guncelleyen_rol',
   'son_cr',
   'not'
] as const;

/**
 * Columns read but not saved yet: their data goes to the marketplace cells, the documents and the
 * records of Phase 2. A file holding values in them is imported with a warning.
 */
export const DEFERRED_COLUMNS: readonly string[] = [
   'proje_kodu',
   'spec_surumu',
   'spec_tarihi',
   'spec_dosya',
   'spec_imzali',
   'kalip',
   'uyum_eksikler',
   'uyum_dosya',
   'hs_teyit',
   'son_po',
   'asin_de',
   'asin_fr',
   'asin_it',
   'asin_es',
   'asin_nl',
   'asin_pl',
   'asin_se',
   'fnsku',
   'kaufland_de_id',
   'ebay_de_id',
   'listing_dosya',
   'kapi_son',
   'olusturma_tarihi',
   'olusturan_rol',
   'guncelleme_tarihi',
   'guncelleyen_rol',
   'son_cr'
];

/** Columns read and dropped without a warning: the database checks the GTIN itself. */
const IGNORED_COLUMNS: readonly string[] = ['gtin_kontrol'];

// Cells

const INVALID = Symbol('invalid');
type Reader<T> = (value: string) => T | typeof INVALID;

/** What an import error says is wrong, translated under ops.product.import.errors. */
export type ImportErrorCode =
   | 'required'
   | 'invalid_value'
   | 'gtin_invalid'
   | 'customer_unknown'
   | 'supplier_unknown'
   | 'parent_unknown'
   | 'gtin_in_use'
   | 'gtin_duplicate'
   | 'sku_duplicate';

/**
 * A cell of a column the file has (a column it lacks stays undefined: the product keeps its value).
 * An empty cell clears the value (null), or with `keepWhenEmpty` is left out like a missing column;
 * anything else is read by `read` or reported as `code`.
 */
const cell = <T>(
   read: Reader<T>,
   {
      keepWhenEmpty = false,
      code = 'invalid_value'
   }: { keepWhenEmpty?: boolean; code?: ImportErrorCode } = {}
) =>
   z
      .string()
      .optional()
      .transform((raw, ctx): T | null | undefined => {
         if (raw === undefined) return undefined;
         const value = raw.trim();
         if (!value) return keepWhenEmpty ? undefined : null;
         const result = read(value);
         if (result === INVALID) {
            ctx.addIssue({ code: 'custom', message: code });
            return z.NEVER;
         }
         return result;
      });

/** A cell every row must fill. */
const requiredCell = <T>(read: Reader<T>) =>
   z
      .string()
      .optional()
      .transform((raw, ctx): T => {
         const value = raw?.trim();
         const result = value ? read(value) : INVALID;
         if (result === INVALID) {
            ctx.addIssue({ code: 'custom', message: value ? 'invalid_value' : 'required' });
            return z.NEVER;
         }
         return result;
      });

const matching =
   (pattern: RegExp, normalize = (value: string) => value): Reader<string> =>
   (value) =>
      pattern.test(normalize(value)) ? normalize(value) : INVALID;

const upper = (value: string) => value.toUpperCase();
const lower = (value: string) => value.toLocaleLowerCase('tr-TR');

const text = () => cell((value) => value);

/** A decimal comma or point; no thousands separators. */
const decimal = () =>
   cell((value) => (/^\d+([.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : INVALID));

const whole = () => cell((value) => (/^\d+$/.test(value) ? Number(value) : INVALID));

/** DD.MM.YYYY or YYYY-MM-DD, stored as YYYY-MM-DD; the day must exist. */
const date = () =>
   cell((value) => {
      const match =
         /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)?.slice(1).reverse() ??
         /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)?.slice(1);
      if (!match) return INVALID;
      const [year, month, day] = match.map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return parsed.getUTCFullYear() === year &&
         parsed.getUTCMonth() === month - 1 &&
         parsed.getUTCDate() === day
         ? parsed.toISOString().slice(0, 10)
         : INVALID;
   });

/** One of `values`, or a synonym (lower case) of one. Empty keeps the product's own value. */
const oneOf = <T extends string>(values: readonly T[], synonyms: Record<string, T> = {}) =>
   cell<T>(
      (value) => {
         const key = lower(value);
         return (values as readonly string[]).includes(key)
            ? (key as T)
            : (synonyms[key] ?? INVALID);
      },
      { keepWhenEmpty: true }
   );

const YES_NO: Record<string, boolean> = {
   evet: true,
   hayır: false,
   hayir: false,
   yes: true,
   no: false,
   true: true,
   false: false,
   '1': true,
   '0': false
};

const STATUS_SYNONYMS: Record<string, ProductStatus> = {
   konsept: 'concept',
   geliştirme: 'development',
   onaylı: 'approved',
   onaylandı: 'approved',
   sipariş: 'ordering',
   siparişte: 'ordering',
   satışta: 'on_sale',
   durduruldu: 'paused',
   arşiv: 'archived',
   arşivlendi: 'archived'
};

const COMPLIANCE_SYNONYMS: Record<string, ComplianceStatus> = {
   yok: 'none',
   eksik: 'partial',
   kısmi: 'partial',
   tam: 'complete',
   tamam: 'complete'
};

/** One row of the import, under the product's own column names (see public.import_products). */
export const productImportRowSchema = z.object({
   customer_code: requiredCell(matching(/^[A-Z]{3}$/, upper)),
   sku: requiredCell(matching(PRODUCT_SKU, upper)),
   display_name: requiredCell((value) => value),
   parent_sku: cell(matching(PRODUCT_SKU, upper)),
   gtin: cell((value) => (gtinValid(value) ? value : INVALID), { code: 'gtin_invalid' }),
   gs1_prefix_owner: text(),
   variant_label: text(),
   category: text(),
   brand: text(),
   manufacturer_art_no: text(),
   supplier_code: cell(matching(/^[A-Z]{2}[0-9]{1,3}$/, upper)),
   supplier_product_code: text(),
   golden_sample_on: date(),
   golden_sample_locations: text(),
   compliance_status: oneOf(COMPLIANCE_STATUSES, COMPLIANCE_SYNONYMS),
   is_hazmat: cell((value) => YES_NO[lower(value)] ?? INVALID, {
      keepWhenEmpty: true
   }),
   eu_responsible_person: text(),
   hs_code: text(),
   origin_country: text(),
   unit_dims_mm: text(),
   unit_net_g: decimal(),
   pack_qty: whole(),
   pack_dims_mm: text(),
   pack_gross_g: decimal(),
   carton_pack_qty: whole(),
   carton_dims_mm: text(),
   carton_net_kg: decimal(),
   carton_gross_kg: decimal(),
   pallet_carton_qty: whole(),
   pallet_type: text(),
   lot_rule: text(),
   purchase_price: decimal(),
   purchase_currency: cell((value) =>
      (PURCHASE_CURRENCIES as readonly string[]).includes(upper(value)) ? upper(value) : INVALID
   ),
   purchase_incoterm: text(),
   landed_cost_eur: decimal(),
   landed_cost_on: date(),
   target_price_eur: decimal(),
   moesa_price_eur: decimal(),
   price_list_version: text(),
   status: oneOf(PRODUCT_STATUSES, STATUS_SYNONYMS),
   notes: text()
});

export type ProductImportRow = z.output<typeof productImportRowSchema>;
type ImportField = keyof ProductImportRow;

/** The S10 columns saved to the product, and the product column (or code) each goes to. */
export const S10_TO_PRODUCT: Record<string, ImportField> = {
   sku: 'sku',
   parent_sku: 'parent_sku',
   gtin: 'gtin',
   gs1_onek_sahibi: 'gs1_prefix_owner',
   urun_adi: 'display_name',
   varyant: 'variant_label',
   kategori: 'category',
   musteri_kodu: 'customer_code',
   marka: 'brand',
   art_no: 'manufacturer_art_no',
   tedarikci_kodu: 'supplier_code',
   tedarikci_urun_kodu: 'supplier_product_code',
   altin_numune_tarihi: 'golden_sample_on',
   altin_numune_yerleri: 'golden_sample_locations',
   uyum_belge_durumu: 'compliance_status',
   tehlikeli_madde: 'is_hazmat',
   sorumlu_kisi_ab: 'eu_responsible_person',
   hs_kodu: 'hs_code',
   mense: 'origin_country',
   urun_olcu_mm: 'unit_dims_mm',
   urun_net_g: 'unit_net_g',
   paket_adet: 'pack_qty',
   paket_olcu_mm: 'pack_dims_mm',
   paket_brut_g: 'pack_gross_g',
   koli_paket_adet: 'carton_pack_qty',
   koli_olcu_mm: 'carton_dims_mm',
   koli_net_kg: 'carton_net_kg',
   koli_brut_kg: 'carton_gross_kg',
   palet_koli_adet: 'pallet_carton_qty',
   palet_tipi_olcu: 'pallet_type',
   lot_kurali: 'lot_rule',
   alis_fiyati: 'purchase_price',
   alis_para_birimi: 'purchase_currency',
   alis_incoterm: 'purchase_incoterm',
   landed_cost_eur: 'landed_cost_eur',
   landed_cost_tarihi: 'landed_cost_on',
   satis_fiyati_hedef_eur: 'target_price_eur',
   moesa_fiyat_eur: 'moesa_price_eur',
   fiyat_listesi_surumu: 'price_list_version',
   durum: 'status',
   not: 'notes'
};

/** The S10 column of each import field, to name it to the user. */
export const PRODUCT_TO_S10 = Object.fromEntries(
   Object.entries(S10_TO_PRODUCT).map(([column, field]) => [field, column])
) as Record<ImportField, string>;

// Import

/** A value that cannot be saved; `row` counts the data rows from 1 (the header not included). */
export interface ImportError {
   row: number;
   field: string;
   code: ImportErrorCode;
   /** gtin_in_use: the product holding the GTIN. */
   sku?: string;
}

/** A column whose values are not saved: unknown to the template, or deferred to Phase 2. */
export interface ImportWarning {
   column: string;
   code: 'unknown_column' | 'deferred_column';
}

/**
 * Maps the rows of an S10 file, its columns in any order, to the rows of public.import_products.
 * Each row is checked on its own; rows with errors are left out of `rows`.
 */
export function mapS10Rows(
   header: readonly string[],
   rows: readonly (readonly string[])[]
): { rows: ProductImportRow[]; warnings: ImportWarning[]; errors: ImportError[] } {
   const columns = header.map((column) => column.trim().toLowerCase());
   const warnings: ImportWarning[] = [];
   const fields = new Map<ImportField, number>();

   columns.forEach((column, index) => {
      const field = S10_TO_PRODUCT[column];
      if (field) {
         if (!fields.has(field)) fields.set(field, index);
      } else if (DEFERRED_COLUMNS.includes(column)) {
         if (rows.some((row) => row[index]?.trim())) {
            warnings.push({ column, code: 'deferred_column' });
         }
      } else if (column && !IGNORED_COLUMNS.includes(column)) {
         warnings.push({ column, code: 'unknown_column' });
      }
   });

   // A row's errors in the order of the file's columns; a missing column's after them.
   const position = (field: string) => fields.get(field as ImportField) ?? columns.length;

   const mapped: ProductImportRow[] = [];
   const errors: ImportError[] = [];
   rows.forEach((row, index) => {
      const input = Object.fromEntries(
         [...fields].map(([field, column]) => [field, row[column] ?? ''])
      );
      const result = productImportRowSchema.safeParse(input);
      if (result.success) {
         mapped.push(
            Object.fromEntries(
               Object.entries(result.data).filter(([, value]) => value !== undefined)
            ) as ProductImportRow
         );
         return;
      }
      errors.push(
         ...result.error.issues
            .map(({ path, message }) => ({
               row: index + 1,
               field: String(path[0]),
               code: message as ImportErrorCode
            }))
            .sort((a, b) => position(a.field) - position(b.field))
      );
   });

   return { rows: mapped, warnings, errors };
}

// Export

/** A product with the codes the export writes in place of its ids. */
export type ProductExportRow = ProductRow & {
   customer?: { code: string } | null;
   supplier?: { code: string } | null;
};

const formatCell = (value: unknown) => {
   if (value === null || value === undefined) return '';
   if (typeof value === 'boolean') return value ? 'evet' : 'hayır';
   return String(value);
};

/**
 * The products as an S10 file: the template's columns in order, the customer and supplier as their
 * codes and the parent as its SKU (among the products given). Deferred columns stay empty.
 */
export function toS10Csv(products: readonly ProductExportRow[]): string {
   const skuById = new Map(products.map(({ id, sku }) => [id, sku]));

   const valueOf = (product: ProductExportRow, column: string): unknown => {
      switch (S10_TO_PRODUCT[column]) {
         case undefined:
            return null;
         case 'customer_code':
            return product.customer?.code;
         case 'supplier_code':
            return product.supplier?.code;
         case 'parent_sku':
            return product.parent_id ? skuById.get(product.parent_id) : null;
         default:
            return product[S10_TO_PRODUCT[column] as keyof ProductRow];
      }
   };

   return serializeCsv(
      S10_COLUMNS,
      products.map((product) => S10_COLUMNS.map((column) => formatCell(valueOf(product, column))))
   );
}
