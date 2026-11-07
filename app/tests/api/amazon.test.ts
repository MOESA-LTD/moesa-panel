import {
   AMAZON_COUNTRIES,
   AMAZON_LANGUAGE_TAGS,
   AmazonApiError,
   amazonErrorText,
   amazonIssueSchema,
   API_CONNECTIONS,
   checkCell,
   checkResultSchema,
   connectAmazon,
   deleteListing,
   disconnectAmazon,
   fetchDefinition,
   issueField,
   LISTING_STATE_SEVERITY,
   LISTING_STATES,
   marketplaceIdFor,
   listingStateSeverity,
   orderAmazonCells,
   publishBulk,
   publishCell,
   refreshCellStatus,
   searchProductTypes,
   submissionSchema,
   useCellCheck,
   useDefinition,
   useProductIsParent,
   useListingSubmissions,
   usePublishCell,
   validateCell
} from '@/api/amazon';
import { MARKETPLACE_IDS, type AmazonSchema } from '@edge-shared/listingCompleteness';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { ZodError } from 'zod';

const mock = vi.hoisted(() => ({
   invoke: vi.fn(),
   cache: null as unknown,
   fromCalls: [] as unknown[][],
   rows: null as unknown,
   count: null as number | null,
   tenant: 't1' as string | null
}));

vi.mock('@/lib/supabase', () => ({
   supabase: {
      functions: { invoke: (...args: unknown[]) => mock.invoke(...args) },
      from: (table: string) => {
         mock.fromCalls.push(['from', table]);
         const builder: Record<string, unknown> = new Proxy(
            {},
            {
               get: (_target, method: string) => {
                  if (method === 'throwOnError')
                     return () => Promise.resolve({ data: mock.rows, count: mock.count });
                  if (method === 'then') return undefined;
                  return (...rest: unknown[]) => {
                     mock.fromCalls.push([
                        method,
                        ...rest.filter((a) => !(a instanceof AbortSignal))
                     ]);
                     return method === 'maybeSingle'
                        ? { throwOnError: () => Promise.resolve({ data: mock.cache }) }
                        : builder;
                  };
               }
            }
         );
         return builder;
      }
   }
}));

vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({ currentTenant: mock.tenant ? { id: mock.tenant } : null })
}));
vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => ({ value: 't1' }) }));

const fixture = JSON.parse(
   readFileSync(
      resolve(__dirname, '../../../supabase/seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json'),
      'utf8'
   )
) as { schema: AmazonSchema };

const HEADERS = { 'x-tenant-id': 't1' };

const cellRow = {
   id: 'c1',
   status: 'uploaded',
   listing_state: 'submitted',
   listing_match: { asin: null, restricted: false, reasons: [] },
   listing_checked_at: '2026-11-06T10:00:00Z',
   listing_language: 'de_DE',
   fulfillment_channel: 'fbm',
   platform_product_id: null,
   platform_sku: 'SKU-DE',
   open_issue: null,
   price: 19.9,
   currency: 'EUR',
   product_id: 'p1'
};
const submissionRow = {
   id: 's1',
   tenant_id: 't1',
   cell_id: 'c1',
   kind: 'create',
   sku: 'SKU-DE',
   marketplace_id: 'A1PA6795UKMFR9',
   payload: { productType: 'LUGGAGE' },
   amazon_submission_id: 'a1',
   status: 'accepted',
   issues: [{ code: '18027', message: 'No image', severity: 'WARNING' }],
   created_by: null,
   created_at: '2026-11-06T10:00:00Z',
   updated_at: '2026-11-06T10:00:00Z'
};

beforeEach(() => {
   mock.invoke.mockReset();
   mock.fromCalls.length = 0;
   mock.cache = null;
   mock.rows = null;
   mock.count = null;
   mock.tenant = 't1';
});

describe('constants', () => {
   it('lists the enum values, the countries and their language tags in step', () => {
      expect(LISTING_STATES).toEqual(['draft', 'ready', 'submitted', 'live', 'issues']);
      expect(API_CONNECTIONS).toEqual(['none', 'connected', 'revoked']);
      expect(AMAZON_COUNTRIES).toHaveLength(AMAZON_LANGUAGE_TAGS.length);
      expect(LISTING_STATE_SEVERITY.issues).toBe('danger');
      expect(listingStateSeverity('brand_new')).toBe('secondary');
      expect(listingStateSeverity(null)).toBe('secondary');
   });
});

describe('parsing', () => {
   it('reads an issue without attributeNames as an empty list', () => {
      const issue = amazonIssueSchema.parse({ code: '18027', message: 'x', severity: 'ERROR' });
      expect(issue.attributeNames).toEqual([]);
   });

   it('reads an unknown severity as unknown and keeps the message verbatim', () => {
      const issue = amazonIssueSchema.parse({
         code: 'c',
         message: 'Ünïcode  as is',
         severity: 'FATAL'
      });
      expect(issue.severity).toBe('unknown');
      expect(issue.message).toBe('Ünïcode  as is');
   });

   it('reads an unknown listing state as unknown, and keeps the issues of a submission', () => {
      const result = checkResultSchema.parse({ missing: [], match: null, state: 'teleported' });
      expect(result.state).toBe('unknown');
      const submission = submissionSchema.parse({ ...submissionRow, status: 'lost' });
      expect(submission.status).toBe('unknown');
      expect(submission.issues[0]!.attributeNames).toEqual([]);
   });

   it('rejects a malformed check result', async () => {
      expect(() => checkResultSchema.parse({ missing: 'no', match: null, state: 'draft' })).toThrow(
         ZodError
      );
      mock.invoke.mockResolvedValue({ data: { missing: [{ attribute: 1 }] }, error: null });
      await expect(checkCell('c1')).rejects.toBeInstanceOf(ZodError);
   });
});

describe('issueField', () => {
   const schema = fixture.schema;
   it('names the schema title, the attribute, or General', () => {
      const issue = (attributeNames: string[]) =>
         amazonIssueSchema.parse({ code: 'c', message: 'm', severity: 'ERROR', attributeNames });
      expect(issueField(issue(['condition_type']), schema)).toBe('Item Condition');
      expect(issueField(issue(['size']), schema)).toBe('size');
      expect(issueField(issue(['condition_type']), null)).toBe('condition_type');
      expect(issueField(issue([]), schema)).toBeNull();
   });
});

describe('edge calls', () => {
   it('publishCell posts the publish action with the tenant header and returns cell and submission', async () => {
      mock.invoke.mockResolvedValue({
         data: { cell: cellRow, submission: submissionRow },
         error: null
      });
      const result = await publishCell('c1');
      expect(mock.invoke).toHaveBeenCalledWith('amazon-listing', {
         method: 'POST',
         body: { action: 'publish', cell_id: 'c1' },
         headers: HEADERS
      });
      expect(result.cell).toMatchObject({ id: 'c1', product_id: 'p1', listing_state: 'submitted' });
      expect(result.submission.status).toBe('accepted');
   });

   it('posts check, validate and delete with their action', async () => {
      mock.invoke.mockResolvedValueOnce({
         data: {
            missing: [{ attribute: 'brand', group: null, reason: 'required' }],
            match: null,
            state: 'draft'
         },
         error: null
      });
      expect((await checkCell('c1')).missing[0]!.attribute).toBe('brand');
      mock.invoke.mockResolvedValueOnce({ data: { status: 'INVALID', issues: [] }, error: null });
      expect((await validateCell('c1')).status).toBe('INVALID');
      mock.invoke.mockResolvedValueOnce({
         data: { cell: cellRow, submission: { ...submissionRow, kind: 'delete' } },
         error: null
      });
      expect((await deleteListing('c1')).submission.kind).toBe('delete');
      expect(mock.invoke.mock.calls.map(([, init]) => init.body.action)).toEqual([
         'check',
         'validate',
         'delete'
      ]);
   });

   it('publishBulk sends 10 products per call and joins the results', async () => {
      const ids = Array.from({ length: 25 }, (_, i) => `p${i}`);
      mock.invoke.mockImplementation(
         async (_name: string, init: { body: { product_ids: string[] } }) => ({
            data: {
               results: init.body.product_ids.map((id) => ({
                  product_id: id,
                  cell_id: null,
                  result: id === 'p0' ? 'weird' : 'skipped_no_cell'
               }))
            },
            error: null
         })
      );
      const results = await publishBulk(ids, 'DE');
      expect(mock.invoke).toHaveBeenCalledTimes(3);
      expect(mock.invoke.mock.calls[0]![1]).toEqual({
         method: 'POST',
         body: { action: 'publish_bulk', product_ids: ids.slice(0, 10), country: 'DE' },
         headers: HEADERS
      });
      expect(results).toHaveLength(25);
      expect(results[0]!.result).toBe('error');
   });

   it('publishBulk sends again what a call left in remaining, in order (C4)', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
      // The first call runs out of time after three products.
      mock.invoke.mockImplementation(
         async (_name: string, init: { body: { product_ids: string[] } }) => {
            const sent = init.body.product_ids;
            const done = mock.invoke.mock.calls.length === 1 ? sent.slice(0, 3) : sent;
            return {
               data: {
                  results: done.map((id) => ({
                     product_id: id,
                     cell_id: 'c',
                     result: 'submitted'
                  })),
                  remaining: sent.slice(done.length)
               },
               error: null
            };
         }
      );
      const results = await publishBulk(ids, 'DE');
      expect(mock.invoke.mock.calls.map(([, init]) => init.body.product_ids)).toEqual([
         ids.slice(0, 10),
         ids.slice(3, 12)
      ]);
      expect(results.map(({ product_id }) => product_id)).toEqual(ids);
      expect(results.every(({ result }) => result === 'submitted')).toBe(true);
   });

   it('publishBulk keeps earlier results when a call fails and marks the rest failed (C4)', async () => {
      const ids = Array.from({ length: 15 }, (_, i) => `p${i}`);
      mock.invoke
         .mockResolvedValueOnce({
            data: {
               results: ids
                  .slice(0, 10)
                  .map((id) => ({ product_id: id, cell_id: 'c', result: 'submitted' })),
               remaining: []
            },
            error: null
         })
         .mockResolvedValueOnce({
            data: null,
            error: {
               context: { json: async () => ({ message: 'amazon_throttled' }) }
            }
         });
      const results = await publishBulk(ids, 'DE');
      expect(results).toHaveLength(15);
      expect(results.slice(0, 10).every(({ result }) => result === 'submitted')).toBe(true);
      expect(results.slice(10)).toEqual(
         ids.slice(10).map((id) => ({
            product_id: id,
            cell_id: null,
            result: 'error',
            code: 'amazon_throttled'
         }))
      );
   });

   it('refreshCellStatus asks for the status of the cell (C3)', async () => {
      mock.invoke.mockResolvedValueOnce({
         data: { cell: cellRow, submission: submissionRow },
         error: null
      });
      const answer = await refreshCellStatus('c1');
      expect(mock.invoke).toHaveBeenCalledWith('amazon-listing', {
         method: 'POST',
         body: { action: 'status', cell_id: 'c1' },
         headers: HEADERS
      });
      expect(answer.cell.listing_state).toBe('submitted');
   });

   it('connectAmazon returns the redirect in production and the account in sandbox', async () => {
      mock.invoke.mockResolvedValueOnce({
         data: { redirect: 'https://amazon.test/c' },
         error: null
      });
      expect(await connectAmazon('a1', '/ops/customer/1')).toEqual({
         redirect: 'https://amazon.test/c'
      });
      expect(mock.invoke).toHaveBeenCalledWith('amazon-auth', {
         method: 'POST',
         body: { action: 'connect', account_id: 'a1', return_to: '/ops/customer/1' },
         headers: HEADERS
      });
      mock.invoke.mockResolvedValueOnce({
         data: { account: { id: 'a1', api_connection: 'connected' } },
         error: null
      });
      expect(await connectAmazon('a1', '/x')).toEqual({
         account: { id: 'a1', api_connection: 'connected' }
      });
      mock.invoke.mockResolvedValueOnce({ data: { account: { id: 'a1' } }, error: null });
      await disconnectAmazon('a1');
      expect(mock.invoke).toHaveBeenLastCalledWith('amazon-auth', {
         method: 'POST',
         body: { action: 'disconnect', account_id: 'a1' },
         headers: HEADERS
      });
   });

   it('searchProductTypes asks the schema function with the tenant header', async () => {
      mock.invoke.mockResolvedValue({
         data: { productTypes: [{ name: 'LUGGAGE', displayName: 'Luggage' }] },
         error: null
      });
      const found = await searchProductTypes({ keywords: 'bag', country: 'DE', customerId: 'cu1' });
      expect(found).toEqual([{ name: 'LUGGAGE', displayName: 'Luggage' }]);
      const [name, init] = mock.invoke.mock.calls[0]!;
      expect(name).toBe('amazon-schema?action=search&keywords=bag&country=DE&customer_id=cu1');
      expect(init).toEqual({ method: 'GET', headers: HEADERS });
   });

   it('throws the error code of a failed call with its details', async () => {
      const details = [{ attribute: 'brand', group: null, reason: 'required' }];
      mock.invoke.mockResolvedValue({
         data: null,
         error: {
            name: 'FunctionsHttpError',
            message: 'Edge Function returned a non-2xx status code',
            context: { json: async () => ({ message: 'listing_incomplete', details }) }
         }
      });
      const error = await publishCell('c1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AmazonApiError);
      expect(error).toMatchObject({
         message: 'listing_incomplete',
         code: 'listing_incomplete',
         details
      });
      expect(amazonErrorText(error)).toBeTruthy();
   });
});

describe('tenant and cell parsing', () => {
   it('refuses to call without an active tenant', async () => {
      mock.tenant = null;
      await expect(checkCell('c1')).rejects.toMatchObject({ code: 'tenant_not_allowed' });
      expect(mock.invoke).not.toHaveBeenCalled();
   });

   it('rejects a cell without its status and reads an unknown listing state', async () => {
      const noStatus: Partial<typeof cellRow> = { ...cellRow };
      delete noStatus.status;
      mock.invoke.mockResolvedValueOnce({
         data: { cell: noStatus, submission: submissionRow },
         error: null
      });
      await expect(publishCell('c1')).rejects.toBeInstanceOf(ZodError);
      mock.invoke.mockResolvedValueOnce({
         data: { cell: { ...cellRow, listing_state: 'beamed' }, submission: submissionRow },
         error: null
      });
      expect((await publishCell('c1')).cell.listing_state).toBe('unknown');
   });
});

describe('marketplaceIdFor', () => {
   it('reads the one marketplace map the edge functions use (C17)', () => {
      expect(Object.keys(MARKETPLACE_IDS)).toEqual([...AMAZON_COUNTRIES]);
      expect(AMAZON_COUNTRIES.map(marketplaceIdFor)).toEqual(
         AMAZON_COUNTRIES.map((country) => MARKETPLACE_IDS[country])
      );
   });

   it('orders cells by the EU country order, then id (B1)', () => {
      const cells = [
         { id: 'c3', country: 'IT' },
         { id: 'c9', country: 'NL' },
         { id: 'c2', country: 'DE' },
         { id: 'c1', country: 'DE' },
         { id: 'c0', country: 'US' }
      ];
      expect(orderAmazonCells(cells).map(({ id }) => id)).toEqual(['c1', 'c2', 'c3', 'c9', 'c0']);
   });

   it('maps every country the app publishes to', () => {
      expect(AMAZON_COUNTRIES.map(marketplaceIdFor)).toEqual([
         'A1PA6795UKMFR9',
         'A13V1IB3VIYZZH',
         'APJ6JRA9NG5V4',
         'A1RKKUPIHCS9HS',
         'A1805IZSGTT6HS',
         'A1C3SOZRARQ6R3',
         'A2NODRKZP88ZB9',
         'AMEN7PMS3EDWL',
         'A1F83G8C2ARO7P'
      ]);
      expect(marketplaceIdFor('de')).toBe('A1PA6795UKMFR9');
      expect(marketplaceIdFor('US')).toBeNull();
   });
});

describe('fetchDefinition', () => {
   const args = { productType: 'LUGGAGE', country: 'DE', locale: 'de_DE', customerId: 'cu1' };
   const row = {
      marketplace_id: 'A1PA6795UKMFR9',
      product_type: 'LUGGAGE',
      locale: 'de_DE',
      version: '1.0',
      display_name: 'Luggage',
      schema: fixture.schema,
      property_groups: [{ key: 'g', title: 'G', propertyNames: ['brand'] }],
      fetched_at: '2026-11-06T10:00:00Z'
   };

   it('reads the cache before calling the edge function', async () => {
      mock.cache = row;
      const definition = await fetchDefinition(args);
      expect(definition.version).toBe('1.0');
      expect(mock.fromCalls[0]).toEqual(['from', 'amazon_product_type_definition']);
      expect(mock.fromCalls).toContainEqual(['eq', 'marketplace_id', 'A1PA6795UKMFR9']);
      expect(mock.fromCalls).toContainEqual(['eq', 'product_type', 'LUGGAGE']);
      expect(mock.fromCalls).toContainEqual(['eq', 'locale', 'de_DE']);
      expect(mock.invoke).not.toHaveBeenCalled();
   });

   it('falls back to the edge function on a cache miss', async () => {
      mock.invoke.mockResolvedValue({ data: row, error: null });
      const definition = await fetchDefinition(args);
      expect(definition.product_type).toBe('LUGGAGE');
      const [name, init] = mock.invoke.mock.calls[0]!;
      expect(name).toBe(
         'amazon-schema?action=definition&product_type=LUGGAGE&country=DE&locale=de_DE&customer_id=cu1'
      );
      expect(init).toEqual({ method: 'GET', headers: HEADERS });
   });

   it('refuses a country without a marketplace before any request', async () => {
      await expect(fetchDefinition({ ...args, country: 'US' })).rejects.toMatchObject({
         code: 'amazon_marketplace_unsupported'
      });
      expect(mock.fromCalls).toEqual([]);
      expect(mock.invoke).not.toHaveBeenCalled();
   });

   it('rejects a definition without properties', async () => {
      mock.cache = { ...row, schema: { required: [] } };
      await expect(fetchDefinition(args)).rejects.toBeInstanceOf(ZodError);
   });
});

describe('hooks', () => {
   const run = async <T>(setup: () => T) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let result!: T;
      mount(
         defineComponent({
            setup() {
               result = setup();
               return () => h('div');
            }
         }),
         { global: { plugins: [[VueQueryPlugin, { queryClient }]] } }
      );
      await flushPromises();
      return { result, queryClient };
   };

   it('useCellCheck calls check for the cell and waits for a cell id', async () => {
      mock.invoke.mockResolvedValue({
         data: { missing: [], match: null, state: 'ready' },
         error: null
      });
      const { result } = await run(() => useCellCheck(() => 'c1'));
      expect(result.data.value?.state).toBe('ready');
      mock.invoke.mockClear();
      await run(() => useCellCheck(() => null));
      expect(mock.invoke).not.toHaveBeenCalled();
   });

   it('a publish does not run the check again', async () => {
      mock.invoke.mockImplementation((_name: string, init: { body?: { action?: string } }) =>
         Promise.resolve({
            data:
               init.body?.action === 'check'
                  ? { missing: [], match: null, state: 'ready' }
                  : { cell: cellRow, submission: submissionRow },
            error: null
         })
      );
      const { result } = await run(() => ({
         check: useCellCheck(() => 'c1'),
         publish: usePublishCell()
      }));
      const checks = () =>
         mock.invoke.mock.calls.filter(([, init]) => init.body?.action === 'check').length;
      expect(checks()).toBe(1);

      await result.publish.mutateAsync('c1');
      await flushPromises();
      expect(mock.invoke.mock.calls.some(([, init]) => init.body?.action === 'publish')).toBe(true);
      expect(checks()).toBe(1);
   });

   it('useDefinition leaves its error to the reader (silent)', async () => {
      mock.cache = null;
      mock.invoke.mockResolvedValue({ data: null, error: new Error('down') });
      const { queryClient } = await run(() =>
         useDefinition({
            productType: 'LUGGAGE',
            country: 'DE',
            locale: 'en_GB',
            customerId: 'cu1'
         })
      );
      const [query] = queryClient.getQueryCache().getAll();
      expect(query!.meta).toEqual({ silent: true });
   });

   it('useProductIsParent counts the products that name it as parent', async () => {
      mock.count = 2;
      const { result } = await run(() => useProductIsParent(() => 'p1'));
      expect(result.data.value).toBe(true);
      expect(mock.fromCalls).toContainEqual(['eq', 'parent_id', 'p1']);

      mock.count = 0;
      const { result: single } = await run(() => useProductIsParent(() => 'p2'));
      expect(single.data.value).toBe(false);
   });

   it('useListingSubmissions reads the cell newest first and parses the issues', async () => {
      mock.rows = [submissionRow];
      const { result } = await run(() => useListingSubmissions(() => 'c1'));
      expect(result.data.value?.[0]!.issues[0]!.severity).toBe('WARNING');
      expect(mock.fromCalls).toContainEqual(['eq', 'cell_id', 'c1']);
      expect(mock.fromCalls).toContainEqual(['order', 'created_at', { ascending: false }]);
   });

   it('usePublishCell invalidates the cells and submissions, also when the publish fails', async () => {
      const { result, queryClient } = await run(() => usePublishCell());
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      mock.invoke.mockResolvedValue({
         data: { cell: cellRow, submission: submissionRow },
         error: null
      });
      await result.mutateAsync('c1');
      expect(invalidate).toHaveBeenCalledTimes(1);
      const predicate = invalidate.mock.calls[0]![0]!.predicate!;
      const keyed = (table: string) =>
         predicate({ queryKey: ['tenant', 't1', table, 'list', {}] } as never);
      expect(keyed('market_cell')).toBe(true);
      expect(keyed('listing_submission')).toBe(true);
      expect(keyed('supplier')).toBe(false);
      mock.invoke.mockResolvedValue({
         data: null,
         error: { context: { json: async () => ({ message: 'amazon_unavailable' }) } }
      });
      await expect(result.mutateAsync('c1')).rejects.toBeInstanceOf(AmazonApiError);
      expect(invalidate).toHaveBeenCalledTimes(2);
   });
});
