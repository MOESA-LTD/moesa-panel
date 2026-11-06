import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { encodeBase64, encodeHex } from 'jsr:@std/encoding@1';
import { AmazonError, type AmazonEnv, clearTokenCache, type Deps } from '../_shared/amazon.ts';
import type { Database } from '../_shared/database.types.ts';
import { crypto, type SupabaseClient } from '../_shared/deps.ts';
import type {
   AmazonSchema,
   DefinitionRow,
   GetDefinitionResponse
} from '../_shared/listingCompleteness.ts';
import { handler, type HandlerDeps } from '../amazon-schema/index.ts';
import {
   downloadSchema,
   fetchDefinition,
   pickDefinition,
   searchProductTypes,
   toDefinitionRow
} from '../amazon-schema/schema.ts';
import { spapiClient } from '../_shared/amazon.ts';

const fixture: GetDefinitionResponse & { schema: AmazonSchema } = JSON.parse(
   await Deno.readTextFile(
      new URL('../../seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json', import.meta.url)
   )
);

const DE = 'A1PA6795UKMFR9';
const FR = 'A13V1IB3VIYZZH';
const SCHEMA_URL = 'https://schema-url';

/** The sandbox's getDefinitionsProductType answer for LUGGAGE: the fixture's meta with a link. */
const sandboxAnswer = (checksum = 'c'): GetDefinitionResponse => {
   const { schema: _inline, ...meta } = fixture;
   return {
      ...meta,
      schema: { link: { resource: SCHEMA_URL, verb: 'GET' }, checksum },
      metaSchema: { link: { resource: 'https://meta-schema-url', verb: 'GET' }, checksum: 'm' }
   };
};

const ENV: AmazonEnv = {
   env: 'sandbox',
   region: 'eu',
   clientId: 'amzn1.application-oa2-client.test',
   clientSecret: 'shh',
   selfRefreshToken: 'Atzr|self',
   sellerId: 'A2SELLER'
};
const PROD: AmazonEnv = { ...ENV, env: 'production', selfRefreshToken: undefined };

const md5 = async (text: string) =>
   new Uint8Array(await crypto.subtle.digest('MD5', new TextEncoder().encode(text)));

type Call = { url: string; init: RequestInit };

/** A fetch that answers LWA with a token and everything else by URL prefix. */
const fakeFetch = (routes: Record<string, () => Response>) => {
   const calls: Call[] = [];
   const deps: Partial<Deps> = {
      fetch: (input, init) => {
         const url = String(input);
         calls.push({ url, init: init ?? {} });
         if (url === 'https://api.amazon.com/auth/o2/token')
            return Promise.resolve(Response.json({ access_token: 'Atza|t', expires_in: 3600 }));
         const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
         if (!route) throw new Error(`unexpected fetch ${url}`);
         return Promise.resolve(routes[route]());
      },
      now: () => Date.parse('2026-11-06T04:00:00Z'),
      sleep: () => Promise.resolve()
   };
   return { deps, calls };
};

const fixtureRow = (): DefinitionRow => toDefinitionRow(fixture, undefined, 'en_GB');

// --- A minimal Supabase client fake --------------------------------------------------------------

type Op = [method: string, args: unknown[]];
type Query = { table: string; ops: Op[] };
type Result = { data: unknown; error: unknown };

const has = (query: Query, method: string) => query.ops.some(([name]) => name === method);
const arg = (query: Query, method: string, column: string) =>
   query.ops.find(([name, args]) => name === method && args[0] === column)?.[1][1];

/** Every builder method chains; awaiting the builder answers `answer(query)`. */
const fakeDb = (
   answer: (query: Query) => Result,
   rpc: (name: string, args: unknown) => Result = () => ({ data: null, error: null })
) => {
   const queries: Query[] = [];
   const db = {
      from(table: string) {
         const query: Query = { table, ops: [] };
         queries.push(query);
         const builder: unknown = new Proxy(
            {},
            {
               get(_, prop) {
                  if (prop === 'then')
                     return (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
                        Promise.resolve(answer(query)).then(resolve, reject);
                  return (...args: unknown[]) => {
                     query.ops.push([String(prop), args]);
                     return builder;
                  };
               }
            }
         );
         return builder;
      },
      rpc: (name: string, args: unknown) => Promise.resolve(rpc(name, args))
   };
   return { db: db as unknown as SupabaseClient<Database>, queries };
};

const SERVICE_KEY = 'service-key';

const deps = (overrides: Partial<HandlerDeps> = {}): Partial<HandlerDeps> => ({
   env: () => ENV,
   serviceKey: SERVICE_KEY,
   authorize: (_req, required, run) => {
      assertEquals(required, [['update', 'product']]);
      return run({ tenantId: 'tenant-1', userId: 'user-1' });
   },
   ...overrides
});

const get = (query: string) =>
   new Request(`http://localhost/amazon-schema?${query}`, {
      headers: { Authorization: 'Bearer user-jwt' }
   });

const refresh = (authorization?: string, path = 'amazon-schema/refresh', body = '{}') =>
   new Request(`http://localhost/${path}`, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : {},
      body
   });

// --- schema.ts -----------------------------------------------------------------------------------

Deno.test(
   'toDefinitionRow keeps version, groups and display name of the sandbox LUGGAGE answer',
   () => {
      const row = toDefinitionRow(sandboxAnswer(), fixture.schema, 'en_GB');
      assertEquals(row.version, 'UHqSqmb4FNUk=');
      assertEquals(row.property_groups.product_identity.title, 'Product Identity');
      assertEquals(row.display_name, 'Luggage');
      assertEquals(row.marketplace_id, DE);
      assertEquals(row.locale, 'en_GB');
      assertEquals(row.schema, fixture.schema);
   }
);

Deno.test('downloadSchema refuses a checksum mismatch', async () => {
   const { deps } = fakeFetch({ [SCHEMA_URL]: () => new Response(JSON.stringify(fixture.schema)) });
   const error = await assertRejects(
      () => downloadSchema({ resource: SCHEMA_URL }, 'bad', deps),
      AmazonError
   );
   assertEquals([error.code, error.status], ['amazon_schema_checksum', 502]);
});

Deno.test('downloadSchema accepts the md5 of the body', async () => {
   const body = JSON.stringify(fixture.schema);
   const digest = await md5(body);
   const { deps, calls } = fakeFetch({ [SCHEMA_URL]: () => new Response(body) });

   assertEquals(
      await downloadSchema({ resource: SCHEMA_URL }, encodeHex(digest), deps),
      fixture.schema
   );
   // Amazon documents the checksum as Base64 MD5; that form is accepted too.
   assertEquals(
      await downloadSchema({ resource: SCHEMA_URL }, encodeBase64(digest), deps),
      fixture.schema
   );
   // The link is pre-signed: no Amazon token goes with it.
   assertEquals(new Headers(calls[0].init.headers).get('x-amz-access-token'), null);
});

Deno.test('downloadSchema maps an unreachable link to amazon_unavailable', async () => {
   const { deps } = fakeFetch({ [SCHEMA_URL]: () => new Response('nope', { status: 403 }) });
   const error = await assertRejects(
      () => downloadSchema({ resource: SCHEMA_URL }, 'c', deps),
      AmazonError
   );
   assertEquals([error.code, error.status], ['amazon_unavailable', 502]);
});

Deno.test('pickDefinition falls back to the product type in sandbox only', () => {
   const rows = [fixtureRow()];
   const key = { marketplaceId: FR, productType: 'LUGGAGE', locale: 'fr_FR' };
   assertEquals(pickDefinition(rows, key, true)?.marketplace_id, DE);
   assertEquals(pickDefinition(rows, key, false), null);
   assertEquals(
      pickDefinition(rows, { marketplaceId: DE, productType: 'LUGGAGE', locale: 'en_GB' }, false),
      rows[0]
   );
   assertEquals(pickDefinition(rows, { ...key, productType: 'SHOES' }, true), null);
});

Deno.test('searchProductTypes reads name and displayName', async () => {
   clearTokenCache();
   const { deps, calls } = fakeFetch({
      'https://sandbox.sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes': () =>
         Response.json({
            productTypes: [
               { name: 'LUGGAGE', displayName: 'Luggage', marketplaceIds: ['ATVPDKIKX0DER'] }
            ],
            productTypeVersion: 'UHqSqmb4FNUk='
         })
   });
   const call = spapiClient('Atzr|self', ENV, deps);
   assertEquals(await searchProductTypes(call, 'luggage', DE), [
      { name: 'LUGGAGE', displayName: 'Luggage' }
   ]);
   const url = new URL(calls.at(-1)!.url);
   assertEquals(url.pathname, '/definitions/2020-09-01/productTypes');
   assertEquals(url.searchParams.get('keywords'), 'luggage');
   assertEquals(url.searchParams.get('marketplaceIds'), DE);
});

Deno.test(
   'fetchDefinition asks for the LISTING requirements and stores the checked schema',
   async () => {
      clearTokenCache();
      const body = JSON.stringify(fixture.schema);
      const checksum = encodeBase64(await md5(body));
      const { deps, calls } = fakeFetch({
         'https://sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes/LUGGAGE':
            () =>
               Response.json({ ...sandboxAnswer(checksum), marketplaceIds: [FR], locale: 'fr_FR' }),
         [SCHEMA_URL]: () => new Response(body)
      });
      const call = spapiClient('Atzr|prod', PROD, deps);

      const row = await fetchDefinition(
         call,
         { marketplaceId: FR, productType: 'LUGGAGE', locale: 'fr_FR', sellerId: 'S1' },
         deps
      );

      const url = new URL(calls.find((c) => c.url.includes('/productTypes/'))!.url);
      const params: Record<string, string> = {};
      url.searchParams.forEach((value, name) => (params[name] = value));
      assertEquals(params, {
         marketplaceIds: FR,
         sellerId: 'S1',
         requirements: 'LISTING',
         locale: 'fr_FR'
      });
      assertEquals(row.marketplace_id, FR);
      assertEquals(row.locale, 'fr_FR');
      assertEquals(row.version, 'UHqSqmb4FNUk=');
      assertEquals(row.schema, fixture.schema);
   }
);

// --- index.ts ------------------------------------------------------------------------------------

Deno.test('refresh refuses a call without the service key', async () => {
   const res = await handler(refresh(undefined, 'amazon-schema', '{"action":"refresh"}'), deps());
   assertEquals(res.status, 401);
   const wrong = await handler(refresh('Bearer user-jwt'), deps());
   assertEquals(wrong.status, 401);
});

Deno.test('refresh is a no-op in sandbox (the schema links cannot be downloaded)', async () => {
   const { db, queries } = fakeDb(() => ({ data: [], error: null }));
   // 047's call: POST <functions>/amazon-schema/refresh with an empty JSON body.
   const res = await handler(refresh(`Bearer ${SERVICE_KEY}`), deps({ admin: () => db }));
   assertEquals(res.status, 200);
   assertEquals(await res.json(), { refreshed: 0, sandbox: true });
   assertEquals(queries.length, 0);
});

Deno.test(
   'refresh re-fetches stale rows with the latest connected account in production',
   async () => {
      clearTokenCache();
      const body = JSON.stringify(fixture.schema);
      const checksum = encodeHex(await md5(body));
      const { deps: amazon } = fakeFetch({
         'https://sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes/LUGGAGE':
            () =>
               Response.json({ ...sandboxAnswer(checksum), productTypeVersion: { version: 'v2' } }),
         [SCHEMA_URL]: () => new Response(body)
      });
      const stale = { marketplace_id: DE, product_type: 'LUGGAGE', locale: 'en_GB' };
      const { db, queries } = fakeDb(
         (query) => {
            if (query.table === 'amazon_product_type_definition' && has(query, 'upsert'))
               return { data: null, error: null };
            if (query.table === 'amazon_product_type_definition')
               return { data: [stale], error: null };
            if (has(query, 'limit'))
               return { data: [{ customer_id: 'c1', tenant_id: 't1' }], error: null };
            return {
               data: {
                  id: 'acc-1',
                  tenant_id: 't1',
                  customer_id: 'c1',
                  seller_id: 'S1',
                  api_connection: 'connected'
               },
               error: null
            };
         },
         (name) => ({ data: name === 'amazon_account_token' ? 'Atzr|vault' : null, error: null })
      );

      const res = await handler(
         refresh(`Bearer ${SERVICE_KEY}`),
         deps({ env: () => PROD, admin: () => db, amazon })
      );
      assertEquals(res.status, 200);
      assertEquals(await res.json(), { refreshed: 1, failed: 0, sandbox: false });

      const select = queries[0];
      assertEquals(arg(select, 'lt', 'fetched_at'), '2026-10-30T04:00:00.000Z');
      const account = queries[1];
      assertEquals(arg(account, 'eq', 'api_connection'), 'connected');
      assert(account.ops.some(([m, a]) => m === 'order' && a[0] === 'authorized_at'));
      const upsert = queries.find((q) => has(q, 'upsert'))!;
      const [written] = upsert.ops.find(([m]) => m === 'upsert')![1] as [Record<string, unknown>];
      assertEquals(written.version, 'v2');
      assertEquals(written.fetched_at, '2026-11-06T04:00:00.000Z');
   }
);

Deno.test('definition in sandbox serves the fixture row for every marketplace', async () => {
   const { db } = fakeDb(() => ({ data: [fixtureRow()], error: null }));
   const res = await handler(
      get(
         'action=definition&product_type=LUGGAGE&country=FR&customer_id=00000000-0000-4000-8000-000000000001'
      ),
      deps({ userDb: () => db })
   );
   assertEquals(res.status, 200);
   const row = await res.json();
   assertEquals([row.marketplace_id, row.version], [DE, 'UHqSqmb4FNUk=']);
});

Deno.test('definition in sandbox without a cached row is amazon_schema_missing', async () => {
   const { db } = fakeDb(() => ({ data: [], error: null }));
   const res = await handler(
      get(
         'action=definition&product_type=LUGGAGE&country=FR&customer_id=00000000-0000-4000-8000-000000000001'
      ),
      deps({ userDb: () => db })
   );
   assertEquals(res.status, 404);
   assertEquals((await res.json()).message, 'amazon_schema_missing');
});

Deno.test('definition in production fetches a missing row and caches it', async () => {
   clearTokenCache();
   const body = JSON.stringify(fixture.schema);
   const checksum = encodeHex(await md5(body));
   const { deps: amazon, calls } = fakeFetch({
      'https://sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes/LUGGAGE': () =>
         Response.json({ ...sandboxAnswer(checksum), marketplaceIds: [FR], locale: 'fr_FR' }),
      [SCHEMA_URL]: () => new Response(body)
   });
   const { db: user, queries: userQueries } = fakeDb(() => ({ data: [], error: null }));
   const { db: admin, queries } = fakeDb(
      (query) => {
         if (query.table === 'amazon_product_type_definition') {
            const [row] = query.ops.find(([m]) => m === 'upsert')![1] as [DefinitionRow];
            return { data: { ...row, fetched_at: '2026-11-06T04:00:00Z' }, error: null };
         }
         return {
            data: {
               id: 'acc-1',
               tenant_id: 'tenant-1',
               customer_id: 'c1',
               seller_id: 'S1',
               api_connection: 'connected'
            },
            error: null
         };
      },
      () => ({ data: 'Atzr|vault', error: null })
   );

   const res = await handler(
      get(
         'action=definition&product_type=LUGGAGE&country=FR&customer_id=00000000-0000-4000-8000-000000000001'
      ),
      deps({ env: () => PROD, userDb: () => user, admin: () => admin, amazon })
   );
   assertEquals(res.status, 200);
   const row = await res.json();
   assertEquals([row.marketplace_id, row.locale], [FR, 'fr_FR']);

   // The cache is read for the exact key; the account is the caller's tenant's.
   assertEquals(arg(userQueries[0], 'eq', 'marketplace_id'), FR);
   assertEquals(arg(userQueries[0], 'eq', 'locale'), 'fr_FR');
   assertEquals(arg(queries[0], 'eq', 'tenant_id'), 'tenant-1');
   assert(calls.some((c) => c.url.includes('sellerId=S1')));
   assert(queries.some((q) => has(q, 'upsert')));
});

Deno.test('search returns the product types of the country marketplace', async () => {
   clearTokenCache();
   const { deps: amazon } = fakeFetch({
      'https://sandbox.sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes': () =>
         Response.json({ productTypes: [{ name: 'LUGGAGE', displayName: 'Luggage' }] })
   });
   const { db } = fakeDb(() => ({
      data: {
         id: 'acc-1',
         tenant_id: 'tenant-1',
         customer_id: 'c1',
         seller_id: null,
         api_connection: 'connected'
      },
      error: null
   }));
   const res = await handler(
      get(
         'action=search&keywords=luggage&country=DE&customer_id=00000000-0000-4000-8000-000000000001'
      ),
      deps({ admin: () => db, amazon })
   );
   assertEquals(res.status, 200);
   assertEquals(await res.json(), { productTypes: [{ name: 'LUGGAGE', displayName: 'Luggage' }] });
});

Deno.test('a country outside the EU marketplaces is refused', async () => {
   const res = await handler(
      get(
         'action=definition&product_type=LUGGAGE&country=US&customer_id=00000000-0000-4000-8000-000000000001'
      ),
      deps()
   );
   assertEquals(res.status, 422);
   assertEquals((await res.json()).message, 'amazon_marketplace_unsupported');
});

Deno.test('an Amazon error answers its code and status, never a token', async () => {
   clearTokenCache();
   const { deps: amazon } = fakeFetch({
      'https://sandbox.sellingpartnerapi-eu.amazon.com/definitions/2020-09-01/productTypes': () =>
         Response.json(
            { errors: [{ code: 'InvalidInput', message: 'bad keywords' }] },
            { status: 400 }
         )
   });
   const { db } = fakeDb(() => ({
      data: {
         id: 'acc-1',
         tenant_id: 'tenant-1',
         customer_id: 'c1',
         seller_id: 'S1',
         api_connection: 'connected'
      },
      error: null
   }));
   const res = await handler(
      get('action=search&keywords=x&country=DE&customer_id=00000000-0000-4000-8000-000000000001'),
      deps({ admin: () => db, amazon })
   );
   assertEquals(res.status, 422);
   const text = await res.text();
   assertEquals(JSON.parse(text).message, 'amazon_request_invalid');
   assert(!text.includes('Atz'), 'no token in the body');
});
