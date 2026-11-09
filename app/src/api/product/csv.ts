import {
   PRODUCT_SKU,
   PURCHASE_CURRENCIES,
   type ComplianceStatus,
   type ProductRow,
   type ProductStatus
} from '@/api/product';
import type { FieldAccess } from '@/composables/useFieldAccess';
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
   | 'sku_duplicate'
   | 'csv_column_not_writable';

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

/**
 * The keys a list value is looked up by: lower case by plain and by Turkish rules (an English
 * ARCHIVED and a Turkish SİPARİŞTE alike), Turkish letters folded to ASCII, spaces collapsed.
 */
const listKeys = (value: string) => [
   ...new Set(
      [value.toLowerCase(), value.toLocaleLowerCase('tr-TR')].map((lowered) =>
         lowered
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .replaceAll('ı', 'i')
            .replace(/\s+/g, ' ')
            .trim()
      )
   )
];

/** A value of a list column: looked up in `values` by its keys. */
const listValue =
   <T>(values: Record<string, T>): Reader<T> =>
   (value) => {
      const key = listKeys(value).find((candidate) => Object.hasOwn(values, candidate));
      return key === undefined ? INVALID : values[key];
   };

/** A list column (empty keeps the product's own value). */
const list = <T>(values: Record<string, T>) => cell(listValue(values), { keepWhenEmpty: true });

// The S10 template's lists ("Yok / Var (UN no)", "Tam / Eksik / Süresi geçmiş", the statuses
// from Fizibilite to Karantina) and the panel's own values, keyed as listKeys folds them.
const HAZMAT: Record<string, boolean> = {
   yok: false,
   hayir: false,
   false: false,
   '0': false,
   no: false,
   var: true,
   evet: true,
   true: true,
   '1': true,
   yes: true
};

/** "Var" followed by anything, e.g. "Var (UN 1203)": hazardous, the UN number goes to the notes. */
const readHazmat: Reader<boolean> = (value) => {
   const known = listValue(HAZMAT)(value);
   if (known !== INVALID) return known;
   return listKeys(value).some((key) => key.startsWith('var')) ? true : INVALID;
};

const COMPLIANCE: Record<string, ComplianceStatus> = {
   yok: 'none',
   none: 'none',
   eksik: 'partial',
   partial: 'partial',
   'suresi gecmis': 'partial',
   expired: 'partial',
   tam: 'complete',
   complete: 'complete'
};

const STATUS: Record<string, ProductStatus> = {
   fizibilite: 'concept',
   concept: 'concept',
   gelistirme: 'development',
   development: 'development',
   numune: 'development',
   sample: 'development',
   'onayli spec': 'approved',
   approved: 'approved',
   sipariste: 'ordering',
   siparis: 'ordering',
   ordering: 'ordering',
   depoda: 'ordering',
   in_warehouse: 'ordering',
   yayinda: 'on_sale',
   on_sale: 'on_sale',
   'satistan kalkti': 'paused',
   paused: 'paused',
   karantina: 'paused',
   quarantine: 'paused',
   arsiv: 'archived',
   archived: 'archived'
};

/** Template values the panel has no status for: saved as the nearest one, with a row warning. */
const APPROXIMATED: Partial<Record<ImportField, Record<string, ImportWarningCode>>> = {
   compliance_status: {
      'suresi gecmis': 'compliance_expired_as_partial',
      expired: 'compliance_expired_as_partial'
   },
   status: {
      depoda: 'status_depoda_as_ordering',
      in_warehouse: 'status_depoda_as_ordering',
      karantina: 'status_karantina_as_paused',
      quarantine: 'status_karantina_as_paused'
   }
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
   compliance_status: list(COMPLIANCE),
   is_hazmat: cell(readHazmat, { keepWhenEmpty: true }),
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
   company_price_eur: decimal(),
   price_list_version: text(),
   status: list(STATUS),
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
   moesa_fiyat_eur: 'company_price_eur',
   fiyat_listesi_surumu: 'price_list_version',
   durum: 'status',
   not: 'notes'
};

/**
 * The product field (a column of the `product` table, as field rights name it) behind each S10
 * header; null for a header with no field of its own (deferred and computed columns).
 */
export const S10_FIELD_OF: Record<(typeof S10_COLUMNS)[number], string | null> = Object.fromEntries(
   S10_COLUMNS.map((column) => {
      const field = S10_TO_PRODUCT[column] as string | undefined;
      const named =
         { customer_code: 'customer_id', supplier_code: 'supplier_id', parent_sku: 'parent_id' }[
            field ?? ''
         ] ?? field;
      return [column, named ?? null];
   })
) as Record<(typeof S10_COLUMNS)[number], string | null>;

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

/** What an import warning says, translated under ops.product.import.warnings. */
export type ImportWarningCode =
   | 'unknown_column'
   | 'deferred_column'
   | 'compliance_expired_as_partial'
   | 'status_depoda_as_ordering'
   | 'status_karantina_as_paused';

/**
 * A column whose values are not saved (unknown to the template, or deferred to Phase 2), or with
 * `row`, a template value saved as the nearest the panel has.
 */
export interface ImportWarning {
   column: string;
   code: ImportWarningCode;
   row?: number;
}

/** "Var (UN 1203)" → "UN: 1203", added to the row's notes. */
const withHazmatNote = (row: ProductImportRow, hazmat: string | undefined): ProductImportRow => {
   const detail = row.is_hazmat ? /\((.+)\)/.exec(hazmat ?? '')?.[1]?.trim() : undefined;
   if (!detail) return row;
   const note = `UN: ${detail.replace(/^UN\s*:?\s*/i, '')}`;
   return { ...row, notes: row.notes ? `${row.notes}; ${note}` : note };
};

/**
 * Maps the rows of an S10 file, its columns in any order, to the rows of public.import_products.
 * Each row is checked on its own; rows with errors are left out of `rows`.
 */
export function mapS10Rows(
   header: readonly string[],
   rows: readonly (readonly string[])[],
   { canWrite }: Pick<FieldAccess, 'canWrite'>
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

   // A column the user may not write must stay empty; the server refuses it as well (row 0 = the header).
   columns.forEach((column, index) => {
      const field = S10_FIELD_OF[column as (typeof S10_COLUMNS)[number]];
      if (field && !canWrite(field) && rows.some((row) => row[index]?.trim())) {
         errors.push({ row: 0, field: column, code: 'csv_column_not_writable' });
      }
   });
   rows.forEach((row, index) => {
      const input = Object.fromEntries(
         [...fields].map(([field, column]) => [field, row[column] ?? ''])
      );
      const result = productImportRowSchema.safeParse(input);
      if (result.success) {
         const data = withHazmatNote(result.data, input.is_hazmat);
         mapped.push(
            Object.fromEntries(
               Object.entries(data).filter(([, value]) => value !== undefined)
            ) as ProductImportRow
         );
         for (const [field, approximated] of Object.entries(APPROXIMATED)) {
            const key = listKeys(input[field] ?? '').find((candidate) =>
               Object.hasOwn(approximated, candidate)
            );
            if (key !== undefined) {
               warnings.push({
                  row: index + 1,
                  column: PRODUCT_TO_S10[field as ImportField],
                  code: approximated[key]
               });
            }
         }
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
   if (typeof value === 'boolean') return value ? 'Var' : 'Yok';
   return String(value);
};

/**
 * The products as an S10 file: the template's columns in order, the customer and supplier as their
 * codes and the parent as its SKU (among the products given). Deferred columns stay empty; the
 * columns of fields the user may not read are left out.
 */
export function toS10Csv(
   products: readonly ProductExportRow[],
   { canRead }: Pick<FieldAccess, 'canRead'>
): string {
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

   const columns = S10_COLUMNS.filter((column) => {
      const field = S10_FIELD_OF[column];
      return !field || canRead(field);
   });
   return serializeCsv(
      columns,
      products.map((product) => columns.map((column) => formatCell(valueOf(product, column))))
   );
}
