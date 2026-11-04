import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { ProductRow } from '@/api/product';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { updateRow } from '@/api/saveRow';
import { useTenantKey } from '@/api/useTenantKey';
import { allValues } from '@/lib/enumValues';
import { dateOnly, optional, parseDateOnly, required } from '@/lib/form/fields';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type MarketCellStatus = Enums['market_cell_status'];
export type MarketCompliance = Enums['market_compliance'];
export type StockSource = Enums['stock_source'];
export type ContentStatus = Enums['content_status'];
export type MarketCellRow = Tables['market_cell']['Row'];
/**
 * A cell with its customer and project codes, its product's SKU, name and GTIN, the platform's
 * name and the S05 cell key (`<platform>_<country>`, cellKey).
 */
export type MarketCellOverviewRow = Views['market_cell_overview']['Row'];

/** A cell as its card loads it (MARKET_CELL_SELECT). */
export type MarketCellCard = MarketCellRow & {
   product: Pick<ProductRow, 'sku' | 'display_name'> | null;
   project: Pick<Tables['project']['Row'], 'code' | 'display_name'> | null;
   platform: Pick<
      Tables['platform']['Row'],
      'display_name' | 'countries' | 'product_id_label'
   > | null;
};

// --- constants ---

export const MARKET_CELL_STATUSES = allValues<MarketCellStatus>()([
   'candidate',
   'planned',
   'preparing',
   'uploaded',
   'live',
   'suppressed',
   'paused',
   'stopped',
   'removed'
]);

export const MARKET_COMPLIANCES = allValues<MarketCompliance>()([
   'green',
   'yellow',
   'red',
   'pending'
]);

export const STOCK_SOURCES = allValues<StockSource>()([
   'customer_warehouse',
   '3pl',
   'platform',
   'pan_eu'
]);

export const CONTENT_STATUSES = allValues<ContentStatus>()([
   'none',
   'en_master',
   'translated',
   'approved'
]);

/** The statuses a customer's market plan counts as targets (the spec's "hedef"). */
export const TARGET_STATUSES: readonly MarketCellStatus[] = [
   'planned',
   'preparing',
   'uploaded',
   'live',
   'suppressed',
   'paused'
];

/** The Tag severity of each status, for the matrix and the card. */
export const MARKET_CELL_STATUS_SEVERITY: Record<
   MarketCellStatus,
   'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast'
> = {
   candidate: 'secondary',
   planned: 'secondary',
   preparing: 'info',
   uploaded: 'info',
   live: 'success',
   suppressed: 'danger',
   paused: 'warn',
   stopped: 'contrast',
   removed: 'contrast'
};

// --- status flow ---

/**
 * The transitions of private.market_cell_guard (034, rule 4), in enum order: S05's "Sonraki durum"
 * plus paused from candidate and planned; stopped is final. A new cell is always a candidate.
 */
const NEXT_STATUSES: Record<MarketCellStatus, MarketCellStatus[]> = {
   candidate: ['planned', 'paused', 'removed'],
   planned: ['preparing', 'paused'],
   preparing: ['uploaded'],
   uploaded: ['live', 'suppressed'],
   live: ['suppressed', 'stopped'],
   suppressed: ['live', 'stopped'],
   paused: ['planned'],
   stopped: [],
   removed: ['candidate']
};

export const nextMarketCellStatuses = (status: MarketCellStatus): MarketCellStatus[] => [
   ...NEXT_STATUSES[status]
];

/** The listing data a live cell keeps (034, rule 5; L-G1). */
export const LIVE_FIELDS = [
   'platform_product_id',
   'platform_sku',
   'price',
   'currency',
   'stock_source',
   'content_status'
] as const;
export type LiveField = (typeof LIVE_FIELDS)[number];

/**
 * The LIVE_FIELDS a cell lacks to go (or stay) live, in their order: an empty or null value is
 * missing, and the content until it is approved. A display hint only; the database decides
 * (market_cell_live_incomplete).
 */
export function liveMissing(cell: Pick<MarketCellRow, LiveField>): LiveField[] {
   return LIVE_FIELDS.filter((field) =>
      field === 'content_status'
         ? cell.content_status !== 'approved'
         : cell[field] === null || cell[field] === undefined || cell[field] === ''
   );
}

// --- the matrix ---

/** The S05 cell key (hucre_id), as market_cell_overview.cell_key: `amazon_DE`. */
export const cellKey = (platformId: string, country: string) => `${platformId}_${country}`;

export type MarketMatrixColumn = {
   key: string;
   platformId: string;
   platformName: string;
   country: string;
};
export type MarketMatrixRow = {
   productId: string;
   sku: string;
   productName: string;
   cells: Record<string, MarketCellOverviewRow>;
};
export type MarketMatrix = { columns: MarketMatrixColumn[]; rows: MarketMatrixRow[] };

/**
 * Pivots the cells: a column per platform and country that has a cell, by platform name then
 * country; a row per product, by SKU, with its cells by column key.
 */
export function buildMatrix(cells: readonly MarketCellOverviewRow[]): MarketMatrix {
   const columns = new Map<string, MarketMatrixColumn>();
   const rows = new Map<string, MarketMatrixRow>();

   for (const cell of cells) {
      if (!cell.product_id || !cell.platform_id || !cell.country) continue;
      const key = cell.cell_key ?? cellKey(cell.platform_id, cell.country);
      if (!columns.has(key))
         columns.set(key, {
            key,
            platformId: cell.platform_id,
            platformName: cell.platform_name ?? cell.platform_id,
            country: cell.country
         });
      let row = rows.get(cell.product_id);
      if (!row) {
         row = {
            productId: cell.product_id,
            sku: cell.sku ?? '',
            productName: cell.product_name ?? '',
            cells: {}
         };
         rows.set(cell.product_id, row);
      }
      row.cells[key] = cell;
   }

   return {
      columns: [...columns.values()].sort(
         (a, b) =>
            a.platformName.localeCompare(b.platformName) ||
            a.platformId.localeCompare(b.platformId) ||
            a.country.localeCompare(b.country)
      ),
      rows: [...rows.values()].sort((a, b) => a.sku.localeCompare(b.sku))
   };
}

/** Per customer, its live cells and its target cells (TARGET_STATUSES, live included). */
export function matrixCounts(
   cells: readonly Pick<MarketCellRow, 'customer_id' | 'status'>[]
): Record<string, { live: number; target: number }> {
   const counts: Record<string, { live: number; target: number }> = {};
   for (const { customer_id, status } of cells) {
      const count = (counts[customer_id] ??= { live: 0, target: 0 });
      if (status === 'live') count.live += 1;
      if (TARGET_STATUSES.includes(status)) count.target += 1;
   }
   return counts;
}

export type NewMarketCell = { product_id: string; platform_id: string; country: string };

/**
 * The cells of the products on the platform in the countries that are not open yet, by product
 * (in the given order) then country: what a bulk "open cells" adds.
 */
export function missingCells(
   existing: readonly Pick<MarketCellRow, 'product_id' | 'platform_id' | 'country'>[],
   productIds: readonly string[],
   platformId: string,
   countries: readonly string[]
): NewMarketCell[] {
   const open = new Set(
      existing
         .filter((cell) => cell.platform_id === platformId)
         .map((cell) => `${cell.product_id}|${cell.country}`)
   );
   return productIds.flatMap((product_id) =>
      countries
         .filter((country) => !open.has(`${product_id}|${country}`))
         .map((country) => ({ product_id, platform_id: platformId, country }))
   );
}

// --- cell ---

/** The card's cell, its product, project and platform (with the platform's product ID label). */
export const MARKET_CELL_SELECT =
   '*, product!market_cell_product_fkey(sku, display_name), project!market_cell_project_fkey(code, display_name), platform!market_cell_platform_fkey(display_name, countries, product_id_label)';

export const marketCellResource = defineResource<'market_cell', MarketCellCard>('market_cell', {
   select: MARKET_CELL_SELECT
});

const text = () => optional(z.string().trim());

export const marketCellSchema = z
   .object({
      id: z.string().optional(),
      product_id: required(z.uuid()),
      project_id: optional(z.uuid()),
      platform_id: required(z.string().min(1)),
      country: required(z.string().regex(/^[A-Z]{2}$/)),
      priority: z.number().int().min(1).max(3).default(2),
      compliance: z.enum(MARKET_COMPLIANCES).default('pending'),
      compliance_note: text(),
      platform_product_id: text(),
      platform_sku: text(),
      price: optional(z.number().min(0)),
      currency: optional(
         z
            .string()
            .trim()
            .regex(/^[A-Z]{3}$/)
      ),
      stock_source: z.enum(STOCK_SOURCES).nullish(),
      content_status: z.enum(CONTENT_STATUSES).default('none'),
      target_launch_on: optional(dateOnly()),
      launched_on: optional(dateOnly()),
      last_checked_on: optional(dateOnly()),
      open_issue: text(),
      notes: text()
   })
   // Mirrors market_cell_compliance_note_required, so it shows before saving.
   .superRefine((cell, ctx) => {
      if ((cell.compliance === 'yellow' || cell.compliance === 'red') && !cell.compliance_note)
         ctx.addIssue({
            code: 'custom',
            path: ['compliance_note'],
            message: i18n.t('errors.market_cell_compliance_note_required')
         });
   });

export type MarketCellFormValues = z.input<typeof marketCellSchema>;
export type MarketCellValues = z.output<typeof marketCellSchema>;

export const toMarketCellFormValues = (
   cell?: Partial<MarketCellRow> | null
): MarketCellFormValues => ({
   id: cell?.id ?? undefined,
   product_id: cell?.product_id ?? null,
   project_id: cell?.project_id ?? null,
   platform_id: cell?.platform_id ?? null,
   country: cell?.country ?? null,
   priority: cell?.priority ?? 2,
   compliance: cell?.compliance ?? 'pending',
   compliance_note: cell?.compliance_note ?? '',
   platform_product_id: cell?.platform_product_id ?? '',
   platform_sku: cell?.platform_sku ?? '',
   price: cell?.price ?? null,
   currency: cell?.currency ?? '',
   stock_source: cell?.stock_source ?? null,
   content_status: cell?.content_status ?? 'none',
   target_launch_on: parseDateOnly(cell?.target_launch_on),
   launched_on: parseDateOnly(cell?.launched_on),
   last_checked_on: parseDateOnly(cell?.last_checked_on),
   open_issue: cell?.open_issue ?? '',
   notes: cell?.notes ?? ''
});

/**
 * The row to save, every empty field as NULL (the guard's reason and note rules test IS NULL). The
 * product, platform and country never change, so they go with a new cell only; the customer is
 * the product's and the status moves by useSetMarketCellStatus (a new cell is a candidate), so
 * neither is sent. The launch date goes only when set: entering live dates it in the database, and
 * a form loaded before that must not clear it.
 */
export function toMarketCellPayload(
   { id: valuesId, product_id, platform_id, country, launched_on, ...values }: MarketCellValues,
   id?: string | null
): ResourceInput<'market_cell'> {
   const rowId = id ?? valuesId;
   const editable = {
      project_id: values.project_id ?? null,
      priority: values.priority,
      compliance: values.compliance,
      compliance_note: values.compliance_note ?? null,
      platform_product_id: values.platform_product_id ?? null,
      platform_sku: values.platform_sku ?? null,
      price: values.price ?? null,
      currency: values.currency ?? null,
      stock_source: values.stock_source ?? null,
      content_status: values.content_status,
      target_launch_on: values.target_launch_on ?? null,
      ...(launched_on ? { launched_on } : {}),
      last_checked_on: values.last_checked_on ?? null,
      open_issue: values.open_issue ?? null,
      notes: values.notes ?? null
   };
   // customer_id is set by the database (market_cell_customer).
   if (rowId) return { id: rowId, ...editable } as ResourceInput<'market_cell'>;
   return { ...editable, product_id, platform_id, country } as ResourceInput<'market_cell'>;
}

/** Moves a cell to another status; the database checks the flow and its data (034). */
export function useSetMarketCellStatus() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: ({ id, status }: { id: string; status: MarketCellStatus }) =>
         updateRow('market_cell', id, { status }),
      onSuccess: () => invalidateTables(queryClient, ['market_cell'])
   });
}

export type MarketCellsFilter = { customerId: string | null; platformId?: string | null };

/** The matrix's cells (market_cell_overview), of one customer and platform when given. */
export function useMarketCells(filter: MaybeRefOrGetter<MarketCellsFilter>) {
   const tenantKey = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, 'market_cell_overview', {
            view: 'matrix',
            ...toValue(filter)
         })
      ),
      queryFn: async ({ signal }) => {
         const { customerId, platformId } = toValue(filter);
         let query = supabase.from('market_cell_overview').select('*');
         if (customerId) query = query.eq('customer_id', customerId);
         if (platformId) query = query.eq('platform_id', platformId);
         const { data } = await query.abortSignal(signal).throwOnError();
         return data;
      }
   });
}

export type AddMarketCell = NewMarketCell & { priority: number; project_id: string | null };

/**
 * Opens cells in one insert (each a candidate; the customer is each product's) and yields how
 * many were added.
 */
export function useAddMarketCells() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (rows: AddMarketCell[]) => {
         const { data } = await supabase
            .from('market_cell')
            // customer_id is set by the database (market_cell_customer).
            .insert(rows as Tables['market_cell']['Insert'][])
            .select('id')
            .throwOnError();
         return data.length;
      },
      onSuccess: () => invalidateTables(queryClient, ['market_cell'])
   });
}
