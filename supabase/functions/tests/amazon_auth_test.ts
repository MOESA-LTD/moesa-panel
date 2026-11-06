import { assert, assertEquals, assertFalse, assertRejects } from 'jsr:@std/assert@1';
import { AmazonError, type AmazonEnv, type Deps } from '../_shared/amazon.ts';
import type { Database } from '../_shared/database.types.ts';
import type { SupabaseClient } from '../_shared/deps.ts';
import type { Requirement } from '../_shared/auth.ts';
import { HttpError } from '../_shared/http.ts';
import {
   type AuthConfig,
   authConfig,
   consentUrl,
   exchangeCode,
   signState,
   type StatePayload,
   verifyState
} from '../amazon-auth/auth.ts';
import { handler, type HandlerDeps } from '../amazon-auth/index.ts';

const NOW = Date.parse('2026-11-06T10:00:00Z');
const SECRET = 'a-test-state-secret-of-at-least-32-chars';
const ACCOUNT = '0f6d5a4e-3c2b-4a19-8e7f-6a5b4c3d2e1f';
const TENANT = 'tenant-1';
const USER = 'user-1';
const RETURN_TO = '/ops/customer/1/platforms';

const ENV: AmazonEnv = {
   env: 'sandbox',
   region: 'eu',
   clientId: 'amzn1.application-oa2-client.test',
   clientSecret: 'shh',
   selfRefreshToken: 'Atzr|self',
   sellerId: 'A2SANDBOX'
};
const PROD: AmazonEnv = {
   ...ENV,
   env: 'production',
   selfRefreshToken: undefined,
   sellerId: undefined
};

const CONFIG: AuthConfig = {
   appId: 'amzn1.sp.solution.app-1',
   beta: true,
   appUrl: 'http://localhost:5173',
   publicSupabaseUrl: 'http://127.0.0.1:54321',
   stateSecret: SECRET
};

const payload = (overrides: Partial<StatePayload> = {}): StatePayload => ({
   account_id: ACCOUNT,
   tenant_id: TENANT,
   user_id: USER,
   return_to: RETURN_TO,
   exp: NOW + 600_000,
   ...overrides
});

// --- A minimal Supabase client fake --------------------------------------------------------------

type Op = [method: string, args: unknown[]];
type Query = { table: string; ops: Op[] };
type Result = { data: unknown; error: unknown };
type RpcCall = { name: string; args: Record<string, unknown> };

const arg = (query: Query, method: string, column: string) =>
   query.ops.find(([name, args]) => name === method && args[0] === column)?.[1][1];

type Row = {
   id: string;
   tenant_id: string;
   customer_id: string;
   platform_id: string;
   api_connection: string;
   authorized_at: string | null;
   seller_id: string | null;
};

const amazonRow = (overrides: Partial<Row> = {}): Row => ({
   id: ACCOUNT,
   tenant_id: TENANT,
   customer_id: 'customer-1',
   platform_id: 'amazon',
   api_connection: 'none',
   authorized_at: null,
   seller_id: null,
   ...overrides
});

/**
 * `rows` is the customer_platform_account table; every filter (eq) is applied to it. The rpc fake
 * records its calls and answers amazon_account_connect with the connected row.
 */
const fakeDb = (rows: Row[] = [amazonRow()]) => {
   const queries: Query[] = [];
   const rpcs: RpcCall[] = [];
   const answer = (query: Query): Result => {
      const matching = rows.filter((row) =>
         query.ops.every(
            ([name, args]) =>
               name !== 'eq' || (row as Record<string, unknown>)[args[0] as string] === args[1]
         )
      );
      return { data: matching[0] ?? null, error: null };
   };
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
      rpc(name: string, args: Record<string, unknown>) {
         rpcs.push({ name, args });
         if (name === 'amazon_account_connect') {
            const row = rows.find((r) => r.id === args.p_account_id)!;
            Object.assign(row, {
               api_connection: 'connected',
               authorized_at: new Date(NOW).toISOString(),
               seller_id: args.p_seller_id
            });
            return Promise.resolve({ data: { ...row, notes: null }, error: null });
         }
         if (name === 'amazon_account_disconnect') {
            const row = rows.find((r) => r.id === args.p_account_id)!;
            Object.assign(row, { api_connection: 'none', authorized_at: null, seller_id: null });
         }
         return Promise.resolve({ data: null, error: null });
      }
   };
   return { db: db as unknown as SupabaseClient<Database>, queries, rpcs };
};

type FetchCall = { url: string; init: RequestInit };

/** LWA answers the authorization_code grant with `answer`; nothing else may be fetched. */
const fakeFetch = (answer: () => Response = () => Response.json({ refresh_token: 'Atzr|x' })) => {
   const calls: FetchCall[] = [];
   const fetch: typeof globalThis.fetch = (input, init) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url !== 'https://api.amazon.com/auth/o2/token')
         throw new Error(`unexpected fetch ${url}`);
      return Promise.resolve(answer());
   };
   return { fetch, calls };
};

const PERMISSION: Requirement = [['update', 'customer_platform_account']];

const deps = (
   db: SupabaseClient<Database>,
   overrides: Partial<HandlerDeps> = {}
): Partial<HandlerDeps> => ({
   db: () => db,
   env: () => ENV,
   config: () => Promise.resolve(CONFIG),
   now: () => NOW,
   fetch: fakeFetch().fetch,
   authorize: (_req, required, run) => {
      assertEquals(required, PERMISSION);
      return run({ tenantId: TENANT, userId: USER });
   },
   ...overrides
});

const post = (body: unknown) =>
   new Request('http://localhost/amazon-auth', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'content-type': 'application/json' },
      body: JSON.stringify(body)
   });

const callback = (params: Record<string, string>) =>
   new Request(`http://localhost/amazon-auth/callback?${new URLSearchParams(params)}`);

/** Runs `run` with console.error captured, so a test can assert what was logged. */
const capturingErrors = async <T>(run: () => Promise<T>) => {
   const original = console.error;
   const lines: string[] = [];
   console.error = (...args: unknown[]) => lines.push(args.map(String).join(' '));
   try {
      return { result: await run(), lines };
   } finally {
      console.error = original;
   }
};

// --- auth.ts --------------------------------------------------------------------------------------

Deno.test(
   'consentUrl targets sellercentral-europe with application_id, state and version=beta',
   () => {
      const url = new URL(consentUrl('amzn1.sp.solution.app-1', 'st.ate', true));
      assertEquals(
         url.origin + url.pathname,
         'https://sellercentral-europe.amazon.com/apps/authorize/consent'
      );
      assertEquals(url.searchParams.get('application_id'), 'amzn1.sp.solution.app-1');
      assertEquals(url.searchParams.get('state'), 'st.ate');
      assertEquals(url.searchParams.get('version'), 'beta');
   }
);

Deno.test('consentUrl omits version once the app is published', () => {
   const url = new URL(consentUrl('amzn1.sp.solution.app-1', 'st.ate', false));
   assertFalse(url.searchParams.has('version'));
   assertEquals(url.search, '?application_id=amzn1.sp.solution.app-1&state=st.ate');
});

Deno.test('verifyState accepts its own state', async () => {
   const state = await signState(payload(), SECRET);
   assertEquals(state.split('.').length, 2);
   assert(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state), 'base64url parts');
   assertEquals(await verifyState(state, SECRET, NOW), payload());
});

Deno.test('verifyState rejects a tampered, expired or off-site state', async () => {
   const state = await signState(payload(), SECRET);
   const flip = (s: string, i: number) =>
      s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);

   assertEquals(await verifyState(flip(state, 3), SECRET, NOW), null, 'payload flipped');
   assertEquals(await verifyState(flip(state, state.length - 2), SECRET, NOW), null, 'mac flipped');
   assertEquals(await verifyState(state, `${SECRET}x`, NOW), null, 'other secret');
   assertEquals(await verifyState('garbage', SECRET, NOW), null, 'no dot');
   assertEquals(await verifyState('', SECRET, NOW), null, 'empty');

   const expired = await signState(payload({ exp: NOW - 1 }), SECRET);
   assertEquals(await verifyState(expired, SECRET, NOW), null, 'expired');

   for (const returnTo of ['//evil.test', 'https://evil.test', '/\\evil.test', 'ops'])
      assertEquals(
         await verifyState(await signState(payload({ return_to: returnTo }), SECRET), SECRET, NOW),
         null,
         returnTo
      );
});

Deno.test('exchangeCode posts the authorization_code grant', async () => {
   const { fetch, calls } = fakeFetch();
   const token = await exchangeCode(
      'ANcode',
      'http://127.0.0.1:54321/functions/v1/amazon-auth/callback',
      PROD,
      { fetch }
   );
   assertEquals(token, 'Atzr|x');
   assertEquals(calls.length, 1);
   assertEquals(calls[0].url, 'https://api.amazon.com/auth/o2/token');
   assertEquals(calls[0].init.method, 'POST');
   const body = new URLSearchParams(String(calls[0].init.body));
   const fields: Record<string, string> = {};
   body.forEach((value, name) => (fields[name] = value));
   assertEquals(fields, {
      grant_type: 'authorization_code',
      code: 'ANcode',
      redirect_uri: 'http://127.0.0.1:54321/functions/v1/amazon-auth/callback',
      client_id: 'amzn1.application-oa2-client.test',
      client_secret: 'shh'
   });
});

Deno.test('exchangeCode maps LWA failures to typed errors without the secrets', async () => {
   const refused = fakeFetch(() =>
      Response.json({ error: 'invalid_grant', error_description: 'expired' }, { status: 400 })
   );
   const error = await assertRejects(
      () => exchangeCode('ANcode', 'https://x/cb', PROD, { fetch: refused.fetch }),
      AmazonError
   );
   assertEquals([error.code, error.status], ['amazon_auth_failed', 502]);
   assertFalse(JSON.stringify(error.details).includes('shh'));

   const down = fakeFetch(() => new Response('', { status: 503 }));
   const unavailable = await assertRejects(
      () => exchangeCode('ANcode', 'https://x/cb', PROD, { fetch: down.fetch }),
      AmazonError
   );
   assertEquals(unavailable.code, 'amazon_unavailable');
});

Deno.test('authConfig reads the env, falls back to the service key in sandbox only', async () => {
   const vars: Record<string, string> = {
      AMAZON_SPAPI_APP_ID: 'amzn1.sp.solution.app-1',
      AMAZON_SPAPI_APP_BETA: 'false',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key'
   };
   const get = (name: string) => vars[name];

   const sandbox = await authConfig(ENV, get);
   assertEquals(sandbox.appUrl, 'http://localhost:6161');
   assertEquals(sandbox.publicSupabaseUrl, 'http://127.0.0.1:54321');
   assertEquals(sandbox.beta, false);
   assertEquals(sandbox.stateSecret.length, 64, 'sha-256 hex of the service key');
   assertFalse(sandbox.stateSecret.includes('service-key'));

   await assertRejects(() => authConfig(PROD, get), AmazonError, 'amazon_unconfigured');
   await assertRejects(
      () => authConfig(PROD, (n) => ({ ...vars, AMAZON_SPAPI_STATE_SECRET: 'short' })[n]),
      AmazonError,
      'amazon_unconfigured'
   );
   const prod = await authConfig(PROD, (n) => ({ ...vars, AMAZON_SPAPI_STATE_SECRET: SECRET })[n]);
   assertEquals(prod.stateSecret, SECRET);
});

// --- callback ------------------------------------------------------------------------------------

Deno.test(
   'callback stores the token with selling_partner_id and redirects to the app',
   async () => {
      const { db, rpcs } = fakeDb();
      const lwa = fakeFetch();
      const state = await signState(payload(), SECRET);

      const response = await handler(
         callback({ state, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
         deps(db, { env: () => PROD, fetch: lwa.fetch })
      );

      assertEquals(response.status, 302);
      assertEquals(
         response.headers.get('Location'),
         'http://localhost:5173/ops/customer/1/platforms?amazon=connected'
      );
      assertEquals(response.headers.get('Referrer-Policy'), 'no-referrer');
      assertEquals(rpcs, [
         {
            name: 'amazon_account_connect',
            args: { p_account_id: ACCOUNT, p_refresh_token: 'Atzr|x', p_seller_id: 'A3SELLER' }
         }
      ]);
      const body = new URLSearchParams(String(lwa.calls[0].init.body));
      assertEquals(
         body.get('redirect_uri'),
         'http://127.0.0.1:54321/functions/v1/amazon-auth/callback'
      );
      const text = await response.text();
      for (const secret of ['Atzr', 'ANcode']) {
         assertFalse(text.includes(secret));
         assertFalse(response.headers.get('Location')!.includes(secret));
      }
   }
);

Deno.test('callback with a bad state redirects with amazon=error and stores nothing', async () => {
   const { db, rpcs, queries } = fakeDb();
   const lwa = fakeFetch();
   const state = await signState(payload(), `${SECRET}-other`);

   const response = await handler(
      callback({ state, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
      deps(db, { env: () => PROD, fetch: lwa.fetch })
   );

   assertEquals(response.status, 302);
   assertEquals(
      response.headers.get('Location'),
      'http://localhost:5173/?amazon=error&reason=amazon_state_invalid'
   );
   assertEquals(response.headers.get('Referrer-Policy'), 'no-referrer');
   assertEquals([rpcs.length, queries.length, lwa.calls.length], [0, 0, 0]);
});

Deno.test('callback with an expired state or missing parameters stores nothing', async () => {
   const { db, rpcs } = fakeDb();
   const lwa = fakeFetch();
   const expired = await signState(payload({ exp: NOW - 1 }), SECRET);

   const late = await handler(
      callback({ state: expired, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
      deps(db, { env: () => PROD, fetch: lwa.fetch })
   );
   assertEquals(
      late.headers.get('Location'),
      'http://localhost:5173/?amazon=error&reason=amazon_state_invalid'
   );

   const state = await signState(payload(), SECRET);
   const noCode = await handler(
      callback({ state, selling_partner_id: 'A3SELLER' }),
      deps(db, { env: () => PROD, fetch: lwa.fetch })
   );
   assertEquals(
      noCode.headers.get('Location'),
      'http://localhost:5173/ops/customer/1/platforms?amazon=error&reason=amazon_callback_invalid'
   );
   assertEquals([rpcs.length, lwa.calls.length], [0, 0]);
});

Deno.test('callback refuses a replayed state once the account was connected with it', async () => {
   // The account was authorized after this state was issued (exp − 10 min): the state is spent.
   const { db, rpcs } = fakeDb([
      amazonRow({
         api_connection: 'connected',
         authorized_at: new Date(NOW - 60_000).toISOString()
      })
   ]);
   const lwa = fakeFetch();
   const state = await signState(payload({ exp: NOW + 500_000 }), SECRET);

   const response = await handler(
      callback({ state, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
      deps(db, { env: () => PROD, fetch: lwa.fetch })
   );
   assertEquals(
      response.headers.get('Location'),
      'http://localhost:5173/ops/customer/1/platforms?amazon=error&reason=amazon_state_replayed'
   );
   assertEquals([rpcs.length, lwa.calls.length], [0, 0]);
});

Deno.test('callback refuses an account that left the state tenant', async () => {
   const { db, rpcs } = fakeDb([amazonRow({ tenant_id: 'tenant-2' })]);
   const lwa = fakeFetch();
   const state = await signState(payload(), SECRET);

   const response = await handler(
      callback({ state, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
      deps(db, { env: () => PROD, fetch: lwa.fetch })
   );
   assertEquals(
      response.headers.get('Location'),
      'http://localhost:5173/ops/customer/1/platforms?amazon=error&reason=platform_account_not_found'
   );
   assertEquals([rpcs.length, lwa.calls.length], [0, 0]);
});

Deno.test('callback with a refused code redirects with its reason and logs no secret', async () => {
   const { db, rpcs } = fakeDb();
   const lwa = fakeFetch(() =>
      Response.json({ error: 'invalid_grant', error_description: 'code expired' }, { status: 400 })
   );
   const state = await signState(payload(), SECRET);

   const { result: response, lines } = await capturingErrors(() =>
      handler(
         callback({ state, selling_partner_id: 'A3SELLER', spapi_oauth_code: 'ANcode' }),
         deps(db, { env: () => PROD, fetch: lwa.fetch })
      )
   );
   assertEquals(
      response.headers.get('Location'),
      'http://localhost:5173/ops/customer/1/platforms?amazon=error&reason=amazon_auth_failed'
   );
   assertEquals(rpcs.length, 0);
   assertEquals(lines, ['amazon-auth callback failed: amazon_auth_failed']);
});

// --- connect / disconnect ------------------------------------------------------------------------

Deno.test('connect in production answers the consent URL with a signed state', async () => {
   const { db, rpcs, queries } = fakeDb();
   const response = await handler(
      post({ action: 'connect', account_id: ACCOUNT, return_to: RETURN_TO }),
      deps(db, { env: () => PROD })
   );
   assertEquals(response.status, 200);
   const { redirect } = await response.json();
   const url = new URL(redirect);
   assertEquals(
      url.origin + url.pathname,
      'https://sellercentral-europe.amazon.com/apps/authorize/consent'
   );
   assertEquals(url.searchParams.get('application_id'), 'amzn1.sp.solution.app-1');
   assertEquals(url.searchParams.get('version'), 'beta');
   assertEquals(
      await verifyState(url.searchParams.get('state')!, SECRET, NOW),
      payload({ exp: NOW + 600_000 })
   );
   assertEquals(rpcs.length, 0);
   assertEquals(arg(queries[0], 'eq', 'tenant_id'), TENANT);
   assertEquals(arg(queries[0], 'eq', 'platform_id'), 'amazon');
});

Deno.test('connect in sandbox stores no token and uses AMAZON_SPAPI_SELLER_ID', async () => {
   const { db, rpcs } = fakeDb();
   const response = await handler(
      post({ action: 'connect', account_id: ACCOUNT, return_to: RETURN_TO }),
      deps(db)
   );
   assertEquals(response.status, 200);
   assertEquals(rpcs, [
      {
         name: 'amazon_account_connect',
         args: { p_account_id: ACCOUNT, p_refresh_token: null, p_seller_id: 'A2SANDBOX' }
      }
   ]);
   const { account } = await response.json();
   assertEquals(account, {
      id: ACCOUNT,
      customer_id: 'customer-1',
      platform_id: 'amazon',
      api_connection: 'connected',
      authorized_at: new Date(NOW).toISOString(),
      seller_id: 'A2SANDBOX'
   });
});

Deno.test('connect in sandbox without a seller id uses the placeholder', async () => {
   const { db, rpcs } = fakeDb();
   await handler(
      post({ action: 'connect', account_id: ACCOUNT, return_to: RETURN_TO }),
      deps(db, { env: () => ({ ...ENV, sellerId: undefined }) })
   );
   assertEquals(rpcs[0].args.p_seller_id, 'SANDBOX_SELLER');
});

Deno.test(
   'connect refuses an account outside the tenant, a non-amazon one or an off-site return',
   async () => {
      for (const row of [
         amazonRow({ tenant_id: 'tenant-2' }),
         amazonRow({ platform_id: 'etsy' })
      ]) {
         const { db, rpcs } = fakeDb([row]);
         const response = await handler(
            post({ action: 'connect', account_id: ACCOUNT, return_to: RETURN_TO }),
            deps(db)
         );
         assertEquals(response.status, 404);
         assertEquals((await response.json()).message, 'platform_account_not_found');
         assertEquals(rpcs.length, 0);
      }

      const { db } = fakeDb();
      const response = await handler(
         post({ action: 'connect', account_id: ACCOUNT, return_to: '//evil.test' }),
         deps(db, { env: () => PROD })
      );
      assertEquals(response.status, 422);
   }
);

Deno.test('disconnect clears the connection through amazon_account_disconnect', async () => {
   const { db, rpcs } = fakeDb([
      amazonRow({
         api_connection: 'connected',
         authorized_at: new Date(NOW).toISOString(),
         seller_id: 'A3SELLER'
      })
   ]);
   const response = await handler(post({ action: 'disconnect', account_id: ACCOUNT }), deps(db));
   assertEquals(response.status, 200);
   assertEquals(rpcs, [
      { name: 'amazon_account_disconnect', args: { p_account_id: ACCOUNT, p_state: 'none' } }
   ]);
   assertEquals((await response.json()).account.api_connection, 'none');
});

Deno.test('connect and disconnect need update on customer_platform_account', async () => {
   for (const body of [
      { action: 'connect', account_id: ACCOUNT, return_to: RETURN_TO },
      { action: 'disconnect', account_id: ACCOUNT }
   ]) {
      const { db, rpcs, queries } = fakeDb();
      const response = await handler(
         post(body),
         deps(db, {
            authorize: (_req, required) => {
               assertEquals(required, PERMISSION);
               return Promise.reject(new HttpError(403, 'forbidden'));
            }
         })
      );
      assertEquals(response.status, 403);
      assertEquals((await response.json()).message, 'forbidden');
      assertEquals([rpcs.length, queries.length], [0, 0]);
   }
});

Deno.test('other routes and methods are refused', async () => {
   const { db } = fakeDb();
   assertEquals((await handler(new Request('http://localhost/amazon-auth'), deps(db))).status, 404);
   assertEquals(
      (await handler(new Request('http://localhost/amazon-auth', { method: 'PUT' }), deps(db)))
         .status,
      405
   );
   assertEquals((await handler(post({ action: 'refresh' }), deps(db))).status, 422);
});
