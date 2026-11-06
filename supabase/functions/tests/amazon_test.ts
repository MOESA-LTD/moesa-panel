import { assertEquals, assertInstanceOf, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
   AmazonAuthError,
   AmazonError,
   type AmazonEnv,
   amazonEnv,
   AmazonRequestError,
   AmazonThrottleError,
   clearTokenCache,
   type Deps,
   LWA_TOKEN_URL,
   lwaToken,
   marketplaceFor,
   spapiClient,
   spapiHost,
   TokenBucket
} from '../_shared/amazon.ts';
import { amazonAccountFor, withRevocation } from '../_shared/amazonAccount.ts';
import { assertServiceCall } from '../_shared/auth.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import { HttpError } from '../_shared/http.ts';

const ENV: AmazonEnv = {
   env: 'sandbox',
   region: 'eu',
   clientId: 'amzn1.application-oa2-client.test',
   clientSecret: 'shh',
   selfRefreshToken: 'Atzr|self',
   sellerId: 'A2SELLER'
};

type Call = { url: string; init: RequestInit };

const lwaOk = (token = 't', expiresIn = 3600) =>
   Response.json({ access_token: `Atza|${token}`, token_type: 'bearer', expires_in: expiresIn });

/** A fake fetch that answers from a queue (LWA calls get a fresh token unless queued otherwise). */
const fakeDeps = (spapi: Array<() => Response>, lwa: Array<() => Response> = []) => {
   const calls: Call[] = [];
   const sleeps: number[] = [];
   let clock = 0;
   const deps: Deps = {
      fetch: (input, init) => {
         const url = String(input);
         calls.push({ url, init: init ?? {} });
         const next = url === LWA_TOKEN_URL ? (lwa.shift() ?? (() => lwaOk())) : spapi.shift();
         if (!next) throw new Error(`unexpected fetch ${url}`);
         return Promise.resolve(next());
      },
      now: () => clock,
      sleep: (ms) => {
         sleeps.push(ms);
         return Promise.resolve();
      }
   };
   return {
      deps,
      calls,
      sleeps,
      setClock: (ms: number) => (clock = ms),
      lwaCalls: () => calls.filter((call) => call.url === LWA_TOKEN_URL),
      spapiCalls: () => calls.filter((call) => call.url !== LWA_TOKEN_URL)
   };
};

const headerOf = (call: Call, name: string) => new Headers(call.init.headers).get(name);

const errorBody = (code: string, message = 'm') => ({ errors: [{ code, message, details: '' }] });

Deno.test('amazonEnv reads the environment and refuses a region other than eu', () => {
   const vars: Record<string, string> = {
      AMAZON_SPAPI_LWA_CLIENT_ID: 'id',
      AMAZON_SPAPI_LWA_CLIENT_SECRET: 'secret',
      AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|r',
      AMAZON_SPAPI_SELLER_ID: 'S1',
      AMAZON_SPAPI_ENV: 'sandbox',
      AMAZON_SPAPI_REGION: 'eu'
   };
   assertEquals(
      amazonEnv((name) => vars[name]),
      {
         env: 'sandbox',
         region: 'eu',
         clientId: 'id',
         clientSecret: 'secret',
         selfRefreshToken: 'Atzr|r',
         sellerId: 'S1'
      }
   );

   const region = assertThrows(
      () => amazonEnv((name) => ({ ...vars, AMAZON_SPAPI_REGION: 'na' })[name]),
      AmazonError
   );
   assertEquals(region.code, 'amazon_region_unsupported');

   const missing = assertThrows(
      () => amazonEnv((name) => ({ ...vars, AMAZON_SPAPI_LWA_CLIENT_SECRET: '' })[name]),
      AmazonError
   );
   assertEquals([missing.code, missing.status], ['amazon_unconfigured', 500]);
});

Deno.test('spapiHost picks the sandbox or production eu host', () => {
   assertEquals(spapiHost(ENV), 'https://sandbox.sellingpartnerapi-eu.amazon.com');
   assertEquals(
      spapiHost({ ...ENV, env: 'production' }),
      'https://sellingpartnerapi-eu.amazon.com'
   );
});

Deno.test('marketplaceFor maps DE and refuses US', () => {
   assertEquals(marketplaceFor('DE'), {
      marketplaceId: 'A1PA6795UKMFR9',
      languageTag: 'de_DE',
      currency: 'EUR'
   });
   assertEquals(marketplaceFor('GB').marketplaceId, 'A1F83G8C2ARO7P');
   const error = assertThrows(() => marketplaceFor('US'), HttpError);
   assertEquals([error.status, error.message], [422, 'amazon_marketplace_unsupported']);
});

Deno.test('lwaToken posts the refresh grant and caches until a minute before expiry', async () => {
   clearTokenCache();
   const fake = fakeDeps([]);

   assertEquals(await lwaToken('Atzr|r', ENV, fake.deps), 'Atza|t');
   fake.setClock(3539_000);
   await lwaToken('Atzr|r', ENV, fake.deps);
   assertEquals(fake.lwaCalls().length, 1);
   fake.setClock(3541_000);
   await lwaToken('Atzr|r', ENV, fake.deps);
   assertEquals(fake.lwaCalls().length, 2);

   const [call] = fake.lwaCalls();
   assertEquals(call.init.method, 'POST');
   assertEquals(headerOf(call, 'content-type'), 'application/x-www-form-urlencoded');
   const body = new URLSearchParams(String(call.init.body));
   const fields = ['grant_type', 'refresh_token', 'client_id', 'client_secret'];
   assertEquals(Object.fromEntries(fields.map((name) => [name, body.get(name)])), {
      grant_type: 'refresh_token',
      refresh_token: 'Atzr|r',
      client_id: ENV.clientId,
      client_secret: ENV.clientSecret
   });
});

Deno.test('lwaToken maps invalid_grant to AmazonAuthError amazon_connection_revoked', async () => {
   clearTokenCache();
   const fake = fakeDeps(
      [],
      [
         () =>
            Response.json(
               {
                  error: 'invalid_grant',
                  error_description: 'The request has an invalid grant parameter'
               },
               { status: 400 }
            ),
         () => Response.json({ error: 'invalid_client' }, { status: 401 })
      ]
   );

   const revoked = await assertRejects(
      () => lwaToken('Atzr|gone', ENV, fake.deps),
      AmazonAuthError
   );
   assertEquals(revoked.code, 'amazon_connection_revoked');
   assertEquals(String(revoked.message).includes('Atzr'), false);

   const failed = await assertRejects(() => lwaToken('Atzr|gone', ENV, fake.deps), AmazonAuthError);
   assertEquals(failed.code, 'amazon_auth_failed');
});

Deno.test('spapi sends x-amz-access-token to the eu sandbox host', async () => {
   clearTokenCache();
   const fake = fakeDeps([() => Response.json({ sku: 'GM-ZDPI-9B4E' })]);
   const spapi = spapiClient('Atzr|r', ENV, fake.deps);

   const result = await spapi<{ sku: string }>({
      method: 'GET',
      path: '/listings/2021-08-01/items/SellerId/GM-ZDPI-9B4E',
      query: {
         marketplaceIds: ['A1PA6795UKMFR9'],
         includedData: ['summaries', 'issues'],
         skipped: undefined
      }
   });

   assertEquals(result, { sku: 'GM-ZDPI-9B4E' });
   const [call] = fake.spapiCalls();
   assertEquals(
      call.url,
      'https://sandbox.sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/SellerId/GM-ZDPI-9B4E?marketplaceIds=A1PA6795UKMFR9&includedData=summaries%2Cissues'
   );
   assertEquals(call.init.method, 'GET');
   assertEquals(headerOf(call, 'x-amz-access-token'), 'Atza|t');
   assertEquals(headerOf(call, 'content-type'), 'application/json');
   assertEquals(headerOf(call, 'user-agent'), 'moesa-panel/1.0 (Language=TypeScript)');
   assertEquals(call.init.body, undefined);
});

Deno.test('spapi sends a JSON body on PUT', async () => {
   clearTokenCache();
   const fake = fakeDeps([() => Response.json({ status: 'ACCEPTED' })]);
   const body = { productType: 'LUGGAGE', requirements: 'LISTING', attributes: {} };

   await spapiClient('Atzr|r', ENV, fake.deps)({ method: 'PUT', path: '/x', body });

   assertEquals(JSON.parse(String(fake.spapiCalls()[0].init.body)), body);
});

Deno.test('spapi retries 429 and 503 with backoff then succeeds', async () => {
   clearTokenCache();
   const fake = fakeDeps([
      () => Response.json(errorBody('QuotaExceeded'), { status: 429 }),
      () => new Response('down', { status: 503 }),
      () => Response.json({ ok: true })
   ]);

   assertEquals(await spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }), {
      ok: true
   });
   assertEquals(fake.sleeps, [500, 1000]);
   assertEquals(fake.spapiCalls().length, 3);
});

Deno.test('spapi gives up after three retries with AmazonThrottleError', async () => {
   clearTokenCache();
   const throttled = () =>
      Response.json(errorBody('QuotaExceeded'), {
         status: 429,
         headers: { 'x-amzn-RequestId': 'req-1' }
      });
   const fake = fakeDeps([throttled, throttled, throttled, throttled]);

   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }),
      AmazonThrottleError
   );
   assertEquals([error.code, error.status, error.requestId], ['amazon_throttled', 429, 'req-1']);
   assertEquals(fake.spapiCalls().length, 4);
   assertEquals(fake.sleeps, [500, 1000, 2000]);
});

Deno.test('spapi gives up on persistent 5xx with amazon_unavailable', async () => {
   clearTokenCache();
   const down = () => new Response('', { status: 502 });
   const fake = fakeDeps([down, down, down, down]);

   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }),
      AmazonError
   );
   assertEquals([error.code, error.status], ['amazon_unavailable', 502]);
   assertEquals(fake.spapiCalls().length, 4);
});

Deno.test('spapiHost honours a sandbox region override and refuses it in production', () => {
   assertEquals(spapiHost(ENV, 'na'), 'https://sandbox.sellingpartnerapi-na.amazon.com');
   const production: AmazonEnv = { ...ENV, env: 'production' };
   assertEquals(spapiHost(production, 'eu'), 'https://sellingpartnerapi-eu.amazon.com');
   const error = assertThrows(() => spapiHost(production, 'na'), AmazonError);
   assertEquals(error.code, 'amazon_region_unsupported');
});

Deno.test('spapi sends a sandbox region override to that host', async () => {
   clearTokenCache();
   const fake = fakeDeps([() => Response.json({})]);

   await spapiClient('Atzr|r', ENV, fake.deps, { sandboxRegionOverride: 'na' })({
      method: 'GET',
      path: '/x'
   });

   assertEquals(fake.spapiCalls()[0].url, 'https://sandbox.sellingpartnerapi-na.amazon.com/x');
   const error = assertThrows(
      () =>
         spapiClient('Atzr|r', { ...ENV, env: 'production' }, fake.deps, {
            sandboxRegionOverride: 'na'
         }),
      AmazonError
   );
   assertEquals(error.code, 'amazon_region_unsupported');
});

Deno.test('spapi waits as long as Retry-After asks, within the cap', async () => {
   clearTokenCache();
   const after = (value: string) => () =>
      Response.json(errorBody('QuotaExceeded'), { status: 429, headers: { 'Retry-After': value } });
   const fake = fakeDeps([
      after('2'), // seconds, longer than the 500 ms backoff
      after(new Date(5000).toUTCString()), // an HTTP date, 5 s after the fake now (0)
      after('0'), // shorter than the backoff: the backoff wins
      () => Response.json({ ok: true })
   ]);

   assertEquals(await spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }), {
      ok: true
   });
   assertEquals(fake.sleeps, [2000, 5000, 2000]);

   clearTokenCache();
   const capped = fakeDeps([after('120'), () => Response.json({})]);
   await spapiClient('Atzr|r', ENV, capped.deps)({ method: 'GET', path: '/x' });
   assertEquals(capped.sleeps, [30_000]);
});

Deno.test('spapi maps the sandbox wrong-region 403 to amazon_request_invalid', async () => {
   clearTokenCache();
   const errors = [
      {
         code: 'Unauthorized',
         message: 'Access to requested resource is denied.',
         details: 'The marketplaces you provided are not valid for region.'
      }
   ];
   const wrongRegion = () => Response.json({ errors }, { status: 403 });
   const fake = fakeDeps([wrongRegion, wrongRegion]);

   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }),
      AmazonRequestError
   );
   assertEquals([error.code, error.status], ['amazon_request_invalid', 422]);
   assertEquals(error.details, errors);
   assertEquals(fake.lwaCalls().length, 2);
});

Deno.test('spapi refreshes the token once on 403 Unauthorized', async () => {
   clearTokenCache();
   const unauthorized = () =>
      Response.json(errorBody('Unauthorized', 'Access to requested resource is denied.'), {
         status: 403
      });
   const fake = fakeDeps(
      [unauthorized, () => Response.json({ status: 'ACCEPTED' })],
      [() => lwaOk('old'), () => lwaOk('new')]
   );

   const result = await spapiClient(
      'Atzr|r',
      ENV,
      fake.deps
   )({ method: 'PUT', path: '/x', body: {} });

   assertEquals(result, { status: 'ACCEPTED' });
   assertEquals(fake.lwaCalls().length, 2);
   assertEquals(
      fake.spapiCalls().map((call) => headerOf(call, 'x-amz-access-token')),
      ['Atza|old', 'Atza|new']
   );
   assertEquals(fake.sleeps, []);

   clearTokenCache();
   const twice = fakeDeps([unauthorized, unauthorized]);
   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, twice.deps)({ method: 'GET', path: '/x' }),
      AmazonAuthError
   );
   assertEquals(error.code, 'amazon_auth_failed');
   assertEquals(twice.lwaCalls().length, 2);
   assertEquals(twice.spapiCalls().length, 2);
});

Deno.test('spapi throws AmazonRequestError with Amazon errors on 400', async () => {
   clearTokenCache();
   const errors = [{ code: 'BAD_REQUEST', message: 'Invalid input', details: 'Invalid input' }];
   const fake = fakeDeps([() => Response.json({ errors }, { status: 400 })]);

   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, fake.deps)({ method: 'PUT', path: '/x', body: {} }),
      AmazonRequestError
   );
   assertEquals(error.code, 'amazon_request_invalid');
   assertEquals(error.details, errors);
   assertEquals(fake.sleeps, []);
   assertEquals(JSON.stringify(error).includes('Atza'), false);
});

Deno.test('spapi maps 404 to amazon_not_found', async () => {
   clearTokenCache();
   const fake = fakeDeps([() => Response.json(errorBody('NOT_FOUND'), { status: 404 })]);

   const error = await assertRejects(
      () => spapiClient('Atzr|r', ENV, fake.deps)({ method: 'GET', path: '/x' }),
      AmazonRequestError
   );
   assertEquals([error.code, error.status], ['amazon_not_found', 404]);
});

Deno.test('spapi returns undefined for an empty body', async () => {
   clearTokenCache();
   const fake = fakeDeps([() => new Response(null, { status: 204 })]);
   assertEquals(
      await spapiClient('Atzr|r', ENV, fake.deps)({ method: 'DELETE', path: '/x' }),
      undefined
   );
});

Deno.test('TokenBucket lets the burst through and then waits', async () => {
   const sleeps: number[] = [];
   let clock = 0;
   const bucket = new TokenBucket(1, 2, {
      now: () => clock,
      sleep: (ms) => {
         sleeps.push(ms);
         clock += ms;
         return Promise.resolve();
      }
   });

   await bucket.take();
   await bucket.take();
   assertEquals(sleeps, []);
   await bucket.take();
   assertEquals(sleeps.length, 1);
   assertEquals(Math.round(sleeps[0]), 1000);

   clock += 5000; // refills up to the burst only
   await bucket.take();
   await bucket.take();
   assertEquals(sleeps.length, 1);
});

Deno.test(
   'TokenBucket refuses a wait longer than its maximum and keeps the reservation free',
   async () => {
      const sleeps: number[] = [];
      const bucket = new TokenBucket(
         1,
         1,
         {
            now: () => 0,
            sleep: (ms) => {
               sleeps.push(ms);
               return Promise.resolve();
            }
         },
         1500
      );

      await bucket.take(); // the burst
      await bucket.take(); // waits 1000 ms
      const error = await assertRejects(() => bucket.take(), AmazonThrottleError); // would wait 2000 ms
      assertEquals([error.code, error.status], ['amazon_rate_limited', 429]);
      await assertRejects(() => bucket.take(), AmazonThrottleError); // the refused take was given back
      assertEquals(sleeps, [1000]);
   }
);

Deno.test('assertServiceCall accepts only the service key', () => {
   const req = (authorization?: string) =>
      new Request('http://x', { headers: authorization ? { Authorization: authorization } : {} });

   assertServiceCall(req('Bearer service-key'), 'service-key');
   for (const bad of [undefined, 'Bearer other', 'Bearer service-ke', 'service-key']) {
      const error = assertThrows(() => assertServiceCall(req(bad), 'service-key'), HttpError);
      assertEquals([error.status, error.message], [401, 'unauthorized']);
   }
   assertThrows(() => assertServiceCall(req('Bearer '), ''), HttpError);
});

type Row = {
   id: string;
   tenant_id: string;
   customer_id: string;
   seller_id: string | null;
   api_connection: string;
};

/** A fake db: from().select().eq()…maybeSingle() answers the row; rpc() records its calls. */
const fakeDb = (row: Row | null, token: string | null = null) => {
   const filters: Array<[string, string]> = [];
   const rpcs: Array<[string, unknown]> = [];
   const query = {
      select: () => query,
      eq: (column: string, value: string) => {
         filters.push([column, value]);
         return query;
      },
      maybeSingle: () => Promise.resolve({ data: row, error: null })
   };
   const db = {
      from: (table: string) => {
         assertEquals(table, 'customer_platform_account');
         return query;
      },
      rpc: (name: string, args: unknown) => {
         rpcs.push([name, args]);
         return Promise.resolve({
            data: name === 'amazon_account_token' ? token : null,
            error: null
         });
      }
   } as unknown as SupabaseClient<Database>;
   return { db, filters, rpcs };
};

const ROW: Row = {
   id: 'acc-1',
   tenant_id: 'ten-1',
   customer_id: 'cus-1',
   seller_id: null,
   api_connection: 'connected'
};

Deno.test(
   'amazonAccountFor uses the self-authorized token in sandbox and refuses a revoked account',
   async () => {
      const sandbox = fakeDb(ROW);
      assertEquals(await amazonAccountFor(sandbox.db, 'cus-1', 'ten-1', ENV), {
         id: 'acc-1',
         tenantId: 'ten-1',
         customerId: 'cus-1',
         sellerId: 'A2SELLER',
         refreshToken: 'Atzr|self'
      });
      assertEquals(sandbox.filters, [
         ['customer_id', 'cus-1'],
         ['tenant_id', 'ten-1'],
         ['platform_id', 'amazon']
      ]);
      assertEquals(sandbox.rpcs, []);

      const production = fakeDb({ ...ROW, seller_id: 'A9PROD' }, 'Atzr|vault');
      const account = await amazonAccountFor(production.db, 'cus-1', 'ten-1', {
         ...ENV,
         env: 'production'
      });
      assertEquals([account.sellerId, account.refreshToken], ['A9PROD', 'Atzr|vault']);
      assertEquals(production.rpcs, [['amazon_account_token', { p_account_id: 'acc-1' }]]);

      for (const db of [fakeDb({ ...ROW, api_connection: 'revoked' }).db, fakeDb(null).db]) {
         const error = await assertRejects(
            () => amazonAccountFor(db, 'cus-1', 'ten-1', ENV),
            HttpError
         );
         assertEquals([error.status, error.message], [409, 'amazon_not_connected']);
      }

      const noToken = fakeDb({ ...ROW, seller_id: 'A9PROD' }, null);
      const error = await assertRejects(
         () => amazonAccountFor(noToken.db, 'cus-1', 'ten-1', { ...ENV, env: 'production' }),
         HttpError
      );
      assertEquals(error.message, 'amazon_not_connected');
   }
);

Deno.test('withRevocation marks the account revoked when Amazon refuses the grant', async () => {
   const { db, rpcs } = fakeDb(ROW);

   assertEquals(await withRevocation(db, 'acc-1', () => Promise.resolve(7)), 7);

   const error = await assertRejects(
      () =>
         withRevocation(db, 'acc-1', () =>
            Promise.reject(new AmazonAuthError('amazon_connection_revoked', 409))
         ),
      HttpError
   );
   assertEquals([error.status, error.message], [409, 'amazon_connection_revoked']);
   assertEquals(rpcs, [
      ['amazon_account_disconnect', { p_account_id: 'acc-1', p_state: 'revoked' }]
   ]);

   const other = await assertRejects(
      () =>
         withRevocation(db, 'acc-1', () =>
            Promise.reject(new AmazonAuthError('amazon_auth_failed', 502))
         ),
      AmazonAuthError
   );
   assertInstanceOf(other, AmazonError);
   assertEquals(rpcs.length, 1);
});
