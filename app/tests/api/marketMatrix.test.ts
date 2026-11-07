import {
   buildMatrix,
   cellKey,
   CONTENT_STATUSES,
   LIVE_FIELDS,
   liveMissing,
   MARKET_CELL_SELECT,
   MARKET_CELL_STATUS_SEVERITY,
   MARKET_CELL_STATUSES,
   MARKET_COMPLIANCES,
   marketCellSchema,
   matrixCounts,
   missingCells,
   nextMarketCellStatuses,
   STOCK_SOURCES,
   TARGET_STATUSES,
   toMarketCellFormValues,
   toMarketCellPayload,
   useAddMarketCells,
   useMarketCells,
   useSetMarketCellStatus,
   type MarketCellOverviewRow,
   type MarketCellRow
} from '@/api/marketMatrix';
import i18n from '@plugins/i18n';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h } from 'vue';

// Every builder call as [method, ...args]; throwOnError resolves with `response`.
const recorded: unknown[][] = [];
let response: unknown = null;
const builder: object = new Proxy(
   {},
   {
      get: (_, method: string) =>
         method === 'then'
            ? undefined
            : (...args: unknown[]) => {
                 recorded.push([method, ...args]);
                 return method === 'throwOnError'
                    ? Promise.resolve({ data: response, error: null })
                    : builder;
              }
   }
);
vi.mock('@/lib/supabase', () => ({
   supabase: {
      from: (table: string) => {
         recorded.push(['from', table]);
         return builder;
      }
   }
}));
vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => computed(() => 't1') }));

const P = '00000000-0000-4000-8000-000000000001';
const PROJECT = '00000000-0000-4000-8000-000000000002';

/** Runs a composable inside a component with its own query client. */
const withSetup = <T>(composable: () => T): T => {
   let result!: T;
   mount(
      defineComponent({
         setup() {
            result = composable();
            return () => h('div');
         }
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
   );
   return result;
};

beforeEach(() => {
   recorded.length = 0;
   response = null;
});

describe('market cell enums', () => {
   it('lists every value in enum order, with the targets and severities', () => {
      expect(MARKET_CELL_STATUSES).toEqual([
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
      expect(MARKET_COMPLIANCES).toEqual(['green', 'yellow', 'red', 'pending']);
      expect(STOCK_SOURCES).toEqual(['customer_warehouse', '3pl', 'platform', 'pan_eu']);
      expect(CONTENT_STATUSES).toEqual(['none', 'en_master', 'translated', 'approved']);
      expect(TARGET_STATUSES).toEqual([
         'planned',
         'preparing',
         'uploaded',
         'live',
         'suppressed',
         'paused'
      ]);
      expect(MARKET_CELL_STATUS_SEVERITY).toEqual({
         candidate: 'secondary',
         planned: 'secondary',
         preparing: 'info',
         uploaded: 'info',
         live: 'success',
         suppressed: 'danger',
         paused: 'warn',
         stopped: 'contrast',
         removed: 'contrast'
      });
   });
});

describe('nextMarketCellStatuses', () => {
   it('follows the transitions of market_cell_guard (034, rule 4)', () => {
      expect(nextMarketCellStatuses('candidate')).toEqual(['planned', 'paused', 'removed']);
      expect(nextMarketCellStatuses('planned')).toEqual(['preparing', 'paused']);
      expect(nextMarketCellStatuses('preparing')).toEqual(['uploaded']);
      expect(nextMarketCellStatuses('uploaded')).toEqual(['live', 'suppressed']);
      expect(nextMarketCellStatuses('live')).toEqual(['suppressed', 'stopped']);
      expect(nextMarketCellStatuses('suppressed')).toEqual(['live', 'stopped']);
      expect(nextMarketCellStatuses('paused')).toEqual(['planned']);
      expect(nextMarketCellStatuses('stopped')).toEqual([]);
      expect(nextMarketCellStatuses('removed')).toEqual(['candidate']);
   });

   it('returns a copy', () => {
      nextMarketCellStatuses('candidate').push('live');
      expect(nextMarketCellStatuses('candidate')).toEqual(['planned', 'paused', 'removed']);
   });
});

describe('liveMissing', () => {
   it('names the listing data live needs (L-G1), empty or null counting as missing', () => {
      expect(LIVE_FIELDS).toEqual([
         'platform_product_id',
         'platform_sku',
         'price',
         'currency',
         'stock_source',
         'content_status'
      ]);
      expect(
         liveMissing({
            platform_product_id: 'B0X',
            platform_sku: 'S',
            price: 12.99,
            currency: 'EUR',
            stock_source: 'platform',
            content_status: 'translated'
         })
      ).toEqual(['content_status']);
      expect(
         liveMissing({
            platform_product_id: '',
            platform_sku: null,
            price: 0,
            currency: 'EUR',
            stock_source: 'platform',
            content_status: 'approved'
         })
      ).toEqual(['platform_product_id', 'platform_sku']);
      expect(
         liveMissing({
            platform_product_id: null,
            platform_sku: null,
            price: null,
            currency: null,
            stock_source: null,
            content_status: 'none'
         })
      ).toEqual([...LIVE_FIELDS]);
   });
});

describe('buildMatrix', () => {
   const cell = (
      id: string,
      product: string,
      sku: string,
      platform: string,
      name: string,
      country: string
   ) =>
      ({
         id,
         product_id: product,
         sku,
         product_name: sku,
         platform_id: platform,
         platform_name: name,
         country,
         cell_key: `${platform}_${country}`
      }) as MarketCellOverviewRow;

   it('keys a cell by platform and country', () => {
      expect(cellKey('amazon', 'DE')).toBe('amazon_DE');
   });

   it('pivots the cells: a column per platform and country, a row per product', () => {
      const m = buildMatrix([
         cell('c1', 'p2', 'THO-TIPS', 'ebay', 'eBay', 'DE'),
         cell('c2', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'FR'),
         cell('c3', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'DE')
      ]);
      expect(m.columns.map((c) => c.key)).toEqual(['amazon_DE', 'amazon_FR', 'ebay_DE']);
      expect(m.columns[2]).toEqual({
         key: 'ebay_DE',
         platformId: 'ebay',
         platformName: 'eBay',
         country: 'DE'
      });
      expect(m.rows.map((r) => r.sku)).toEqual(['THO-MOP', 'THO-TIPS']);
      expect(m.rows[0]!.productId).toBe('p1');
      expect(m.rows[0]!.productName).toBe('THO-MOP');
      expect(m.rows[0]!.cells.amazon_DE!.id).toBe('c3');
      expect(m.rows[1]!.cells.amazon_DE).toBeUndefined();
      expect(m.rows[1]!.cells.ebay_DE!.id).toBe('c1');
   });

   it('is empty without cells', () => {
      expect(buildMatrix([])).toEqual({ columns: [], rows: [] });
   });
});

describe('matrixCounts', () => {
   it('counts the live and the target cells per customer', () => {
      expect(
         matrixCounts([
            { customer_id: 'k', status: 'live' },
            { customer_id: 'k', status: 'candidate' },
            { customer_id: 'k', status: 'paused' }
         ])
      ).toEqual({ k: { live: 1, target: 2 } });
      expect(
         matrixCounts([
            { customer_id: 'a', status: 'removed' },
            { customer_id: 'b', status: 'suppressed' },
            { customer_id: 'b', status: 'stopped' }
         ])
      ).toEqual({ a: { live: 0, target: 0 }, b: { live: 0, target: 1 } });
   });
});

describe('missingCells', () => {
   it('lists the combinations not opened yet, by product then country', () => {
      expect(
         missingCells(
            [{ product_id: 'p1', platform_id: 'amazon', country: 'DE' }],
            ['p1', 'p2'],
            'amazon',
            ['DE', 'FR']
         )
      ).toEqual([
         { product_id: 'p1', platform_id: 'amazon', country: 'FR' },
         { product_id: 'p2', platform_id: 'amazon', country: 'DE' },
         { product_id: 'p2', platform_id: 'amazon', country: 'FR' }
      ]);
      // A cell on another platform does not count.
      expect(
         missingCells(
            [{ product_id: 'p1', platform_id: 'ebay', country: 'DE' }],
            ['p1'],
            'amazon',
            ['DE']
         )
      ).toEqual([{ product_id: 'p1', platform_id: 'amazon', country: 'DE' }]);
   });
});

describe('marketCellSchema', () => {
   const base = () =>
      toMarketCellFormValues({ product_id: P, platform_id: 'amazon', country: 'DE' });

   it('starts a new cell with the defaults', () => {
      expect(base()).toMatchObject({
         product_id: P,
         project_id: null,
         platform_id: 'amazon',
         country: 'DE',
         priority: 2,
         compliance: 'pending',
         content_status: 'none',
         compliance_note: '',
         open_issue: '',
         notes: ''
      });
      expect(marketCellSchema.safeParse(base()).success).toBe(true);
   });

   it('needs a compliance note for yellow and red (S12)', () => {
      expect(marketCellSchema.safeParse({ ...base(), compliance: 'red' }).success).toBe(false);
      const yellow = marketCellSchema.safeParse({ ...base(), compliance: 'yellow' });
      expect(yellow.error?.issues).toEqual([
         expect.objectContaining({
            path: ['compliance_note'],
            message: i18n.t('errors.market_cell_compliance_note_required')
         })
      ]);
      expect(
         marketCellSchema.safeParse({ ...base(), compliance: 'yellow', compliance_note: '  ' })
            .success
      ).toBe(false);
      expect(
         marketCellSchema.safeParse({ ...base(), compliance: 'red', compliance_note: 'CE' }).success
      ).toBe(true);
   });

   it('checks the country, currency, priority and price', () => {
      expect(marketCellSchema.safeParse({ ...base(), country: 'de' }).success).toBe(false);
      expect(marketCellSchema.safeParse({ ...base(), currency: 'eur' }).success).toBe(false);
      expect(marketCellSchema.safeParse({ ...base(), currency: 'EUR' }).success).toBe(true);
      expect(marketCellSchema.safeParse({ ...base(), priority: 4 }).success).toBe(false);
      expect(marketCellSchema.safeParse({ ...base(), priority: 1.5 }).success).toBe(false);
      expect(marketCellSchema.safeParse({ ...base(), price: -1 }).success).toBe(false);
      expect(marketCellSchema.safeParse({ ...base(), product_id: null }).success).toBe(false);
      expect(marketCellSchema.parse({ ...base(), priority: undefined }).priority).toBe(2);
   });
});

describe('toMarketCellPayload', () => {
   it('sends the identity only with a new cell, never the customer or the status', () => {
      const values = marketCellSchema.parse(
         toMarketCellFormValues({ product_id: P, platform_id: 'amazon', country: 'DE' })
      );
      const payload = toMarketCellPayload(values, 'c1');
      for (const key of ['product_id', 'platform_id', 'country', 'customer_id', 'status'])
         expect(payload).not.toHaveProperty(key);
      expect(payload).toHaveProperty('id', 'c1');

      const created = toMarketCellPayload(values);
      expect(created).toMatchObject({ product_id: P, platform_id: 'amazon', country: 'DE' });
      expect(created).not.toHaveProperty('id');
      expect(created).not.toHaveProperty('customer_id');
      expect(created).not.toHaveProperty('status');
   });

   it('toMarketCellPayload never sends the server-only listing columns', () => {
      // A cell loaded with its Amazon columns: the form must not write them back (the functions
      // own the state, the match and the check time; the drawer saves the language and channel).
      const cell = {
         product_id: P,
         platform_id: 'amazon',
         country: 'DE',
         listing_state: 'live',
         listing_checked_at: '2026-11-06T10:00:00Z',
         listing_match: { asin: 'B0TEST', restricted: false, reasons: [] },
         listing_language: 'de_DE',
         fulfillment_channel: 'fbm'
      } as Partial<MarketCellRow>;
      const values = marketCellSchema.parse({ ...toMarketCellFormValues(cell), ...cell });
      for (const payload of [toMarketCellPayload(values, 'c1'), toMarketCellPayload(values)]) {
         for (const key of [
            'listing_state',
            'listing_checked_at',
            'listing_match',
            'listing_language',
            'fulfillment_channel'
         ])
            expect(payload).not.toHaveProperty(key);
      }
   });

   it('sends NULL, never an empty string, for the empty text fields', () => {
      const payload = toMarketCellPayload(
         marketCellSchema.parse({
            ...toMarketCellFormValues({ product_id: P, platform_id: 'amazon', country: 'DE' }),
            open_issue: '   ',
            notes: '',
            compliance_note: ''
         }),
         'c1'
      );
      expect(payload).toMatchObject({
         project_id: null,
         compliance_note: null,
         platform_product_id: null,
         platform_sku: null,
         open_issue: null,
         notes: null,
         price: null,
         currency: null,
         stock_source: null,
         target_launch_on: null,
         last_checked_on: null
      });
      expect(Object.values(payload)).not.toContain('');
   });

   it('sends the launch date only when one is set', () => {
      const loaded = toMarketCellFormValues({
         id: 'c1',
         product_id: P,
         project_id: PROJECT,
         platform_id: 'amazon',
         country: 'DE',
         status: 'live',
         launched_on: '2027-03-01',
         open_issue: 'Category approval'
      });
      const values = marketCellSchema.parse(loaded);
      expect(toMarketCellPayload(values, 'c1')).toMatchObject({
         launched_on: '2027-03-01',
         project_id: PROJECT,
         open_issue: 'Category approval'
      });
      expect(
         toMarketCellPayload(marketCellSchema.parse({ ...loaded, launched_on: null }), 'c1')
      ).not.toHaveProperty('launched_on');
   });
});

describe('MARKET_CELL_SELECT', () => {
   it('embeds the product, project and platform by their foreign keys', () => {
      expect(MARKET_CELL_SELECT).toBe(
         '*, product!market_cell_product_fkey(sku, display_name), project!market_cell_project_fkey(code, display_name), platform!market_cell_platform_fkey(display_name, countries, product_id_label)'
      );
   });
});

describe('useMarketCells', () => {
   it('reads the overview of one customer and platform', async () => {
      response = [{ id: 'c1' }];
      const query = withSetup(() => useMarketCells({ customerId: 'k1', platformId: 'amazon' }));
      await flushPromises();

      expect(recorded).toEqual([
         ['from', 'market_cell_overview'],
         ['select', '*'],
         ['eq', 'customer_id', 'k1'],
         ['eq', 'platform_id', 'amazon'],
         ['abortSignal', expect.anything()],
         ['throwOnError']
      ]);
      expect(query.data.value).toEqual([{ id: 'c1' }]);
   });

   it('reads every cell without a filter', async () => {
      response = [];
      withSetup(() => useMarketCells({ customerId: null, platformId: null }));
      await flushPromises();

      expect(recorded[0]).toEqual(['from', 'market_cell_overview']);
      expect(recorded.map(([method]) => method)).not.toContain('eq');
   });
});

describe('market cell mutations', () => {
   it('patches the status only', async () => {
      response = { id: 'c1', status: 'planned' };
      const mutation = withSetup(useSetMarketCellStatus);
      await mutation.mutateAsync({ id: 'c1', status: 'planned' });

      expect(recorded).toEqual(
         expect.arrayContaining([
            ['from', 'market_cell'],
            ['update', { status: 'planned' }],
            ['eq', 'id', 'c1']
         ])
      );
   });

   it('opens the cells in one insert and returns how many', async () => {
      response = [{ id: 'c1' }, { id: 'c2' }];
      const rows = [
         { product_id: P, platform_id: 'amazon', country: 'DE', priority: 1, project_id: null },
         { product_id: P, platform_id: 'amazon', country: 'FR', priority: 1, project_id: PROJECT }
      ];
      const mutation = withSetup(useAddMarketCells);
      expect(await mutation.mutateAsync(rows)).toBe(2);

      expect(recorded).toEqual([
         ['from', 'market_cell'],
         ['insert', rows],
         ['select', 'id'],
         ['throwOnError']
      ]);
   });
});
