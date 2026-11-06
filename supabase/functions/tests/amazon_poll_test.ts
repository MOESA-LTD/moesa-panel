import { assertEquals } from 'jsr:@std/assert@1';
import { AmazonAuthError, type AmazonEnv } from '../_shared/amazon.ts';
import { handler } from '../amazon-poll/index.ts';
import { POLL_CAP, type RefreshFn } from '../amazon-poll/poll.ts';

const SERVICE_KEY = 'service-key-for-tests';
const ENV: AmazonEnv = {
   env: 'sandbox',
   region: 'eu',
   clientId: 'amzn1.application-oa2-client.test',
   clientSecret: 'shh',
   selfRefreshToken: 'Atzr|self',
   sellerId: 'A2SELLER'
};
const NOW = Date.parse('2026-11-06T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

type Rpc = { fn: string; args: Record<string, unknown> };

/** A service-role client that answers each table with canned rows and records the query. */
const fakeAdmin = (tables: Record<string, unknown[]>, opts: { count?: number } = {}) => {
   const queries: { table: string; ops: [string, unknown[]][] }[] = [];
   const rpcs: Rpc[] = [];
   const admin = {
      from(table: string) {
         const query = { table, ops: [] as [string, unknown[]][] };
         queries.push(query);
         const rows = tables[table] ?? [];
         const builder: Record<string, unknown> = {};
         for (const op of ['select', 'eq', 'order', 'limit']) {
            builder[op] = (...args: unknown[]) => {
               query.ops.push([op, args]);
               return builder;
            };
         }
         builder.then = (resolve: (v: unknown) => unknown) =>
            resolve({ data: rows, count: opts.count ?? rows.length, error: null });
         return builder;
      },
      rpc(fn: string, args: Record<string, unknown>) {
         rpcs.push({ fn, args });
         return Promise.resolve({ data: { id: 'cell' }, error: null });
      }
   };
   return { admin: () => admin as never, queries, rpcs };
};

const post = (key?: string) =>
   new Request('http://localhost/amazon-poll', {
      method: 'POST',
      headers: key ? { Authorization: `Bearer ${key}` } : {}
   });

const run = (
   req: Request,
   db: ReturnType<typeof fakeAdmin>,
   refresh: RefreshFn,
   extra: Record<string, unknown> = {}
) =>
   handler(req, {
      admin: db.admin,
      env: () => ENV,
      serviceKey: SERVICE_KEY,
      amazon: { now: () => NOW },
      refresh,
      ...extra
   });

const processing =
   (created = hoursAgo(1)): RefreshFn =>
   (_deps, target) =>
      Promise.resolve({
         cell: { listing_state: 'submitted' },
         submission: {
            id: `sub-${target.cellId}`,
            status: 'processing',
            created_at: created
         }
      });

/** Runs `fn` with console.error captured. */
const quiet = async <T>(fn: () => Promise<T>) => {
   const logged: string[] = [];
   const original = console.error;
   console.error = (...args: unknown[]) => void logged.push(args.join(' '));
   try {
      return { result: await fn(), logged };
   } finally {
      console.error = original;
   }
};

Deno.test('a call without the service key is 401 and reads nothing', async () => {
   const db = fakeAdmin({ market_cell: [{ id: 'c1', tenant_id: 't1' }] });
   for (const req of [post(), post('user-jwt')]) {
      const res = await run(req, db, processing());
      assertEquals(res.status, 401);
      await res.body?.cancel();
   }
   assertEquals(db.queries.length, 0);
});

Deno.test('only POST is served', async () => {
   const db = fakeAdmin({});
   const get = new Request('http://localhost/amazon-poll', { method: 'GET' });
   const res = await run(get, db, processing());
   assertEquals(res.status, 405);
   await res.body?.cancel();
});

Deno.test('selects amazon cells in submitted, oldest check first, capped', async () => {
   const db = fakeAdmin({ market_cell: [] }, { count: 0 });
   const res = await run(post(SERVICE_KEY), db, processing());
   assertEquals(res.status, 200);
   assertEquals(await res.json(), {
      polled: 0,
      failed: 0,
      given_up: 0,
      remaining: 0
   });
   const { ops } = db.queries[0];
   assertEquals(
      ops.filter(([op]) => op === 'eq').map(([, a]) => a),
      [
         ['platform_id', 'amazon'],
         ['listing_state', 'submitted']
      ]
   );
   assertEquals(ops.find(([op]) => op === 'order')?.[1], [
      'listing_checked_at',
      { ascending: true, nullsFirst: true }
   ]);
   assertEquals(ops.find(([op]) => op === 'limit')?.[1], [POLL_CAP]);
});

Deno.test(
   'calls the shared refresh for each cell with its tenant and reports remaining',
   async () => {
      const db = fakeAdmin(
         {
            market_cell: [
               { id: 'c1', tenant_id: 't1' },
               { id: 'c2', tenant_id: 't2' }
            ]
         },
         { count: 5 }
      );
      const seen: unknown[] = [];
      const refresh: RefreshFn = (deps, target) => {
         seen.push([deps.env.env, target]);
         return processing()(deps, target);
      };
      const res = await run(post(SERVICE_KEY), db, refresh);
      assertEquals(await res.json(), {
         polled: 2,
         failed: 0,
         given_up: 0,
         remaining: 3
      });
      assertEquals(seen, [
         ['sandbox', { tenantId: 't1', cellId: 'c1' }],
         ['sandbox', { tenantId: 't2', cellId: 'c2' }]
      ]);
      assertEquals(db.rpcs.length, 0);
   }
);

Deno.test(
   'one failing tenant does not stop the others; only code and message are logged',
   async () => {
      const db = fakeAdmin({
         market_cell: [
            { id: 'c1', tenant_id: 't1' },
            { id: 'c2', tenant_id: 't2' }
         ],
         listing_submission: []
      });
      const refresh: RefreshFn = (deps, target) =>
         target.tenantId === 't1'
            ? Promise.reject(new AmazonAuthError('amazon_connection_revoked', 409))
            : processing()(deps, target);
      const { result: res, logged } = await quiet(() => run(post(SERVICE_KEY), db, refresh));
      assertEquals(await res.json(), {
         polled: 1,
         failed: 1,
         given_up: 0,
         remaining: 0
      });
      assertEquals(logged.length, 1);
      assertEquals(logged[0].startsWith('amazon-poll failed: amazon_connection_revoked'), true);
   }
);

Deno.test(
   'a cell still submitted after 24 hours is given up: submission failed, cell issues',
   async () => {
      const db = fakeAdmin({ market_cell: [{ id: 'c1', tenant_id: 't1' }] });
      const res = await run(post(SERVICE_KEY), db, processing(hoursAgo(25)));
      assertEquals(await res.json(), {
         polled: 1,
         failed: 0,
         given_up: 1,
         remaining: 0
      });
      assertEquals(db.rpcs.length, 1);
      const { fn, args } = db.rpcs[0];
      assertEquals(fn, 'listing_apply_submission');
      assertEquals(args.p_submission_id, 'sub-c1');
      assertEquals(args.p_status, 'failed');
      assertEquals(args.p_listing_state, 'issues');
      assertEquals(args.p_issues, [
         {
            code: 'amazon_poll_timeout',
            message: 'Amazon did not report the listing within 24 hours.',
            severity: 'ERROR',
            attributeNames: []
         }
      ]);
   }
);

Deno.test('within 24 hours, or once resolved, nothing is given up', async () => {
   const db = fakeAdmin({
      market_cell: [
         { id: 'c1', tenant_id: 't1' },
         { id: 'c2', tenant_id: 't1' }
      ]
   });
   const refresh: RefreshFn = (deps, target) =>
      target.cellId === 'c1'
         ? processing(hoursAgo(23))(deps, target)
         : Promise.resolve({
              cell: { listing_state: 'live' },
              submission: { id: 's2', status: 'done', created_at: hoursAgo(30) }
           });
   const res = await run(post(SERVICE_KEY), db, refresh);
   assertEquals(await res.json(), {
      polled: 2,
      failed: 0,
      given_up: 0,
      remaining: 0
   });
   assertEquals(db.rpcs.length, 0);
});

Deno.test('a cell that keeps failing is also given up after 24 hours', async () => {
   const db = fakeAdmin({
      market_cell: [{ id: 'c1', tenant_id: 't1' }],
      listing_submission: [
         {
            id: 'del',
            kind: 'delete',
            status: 'processing',
            created_at: hoursAgo(1)
         },
         {
            id: 'old',
            kind: 'create',
            status: 'processing',
            created_at: hoursAgo(30)
         }
      ]
   });
   const { result: res } = await quiet(() =>
      run(post(SERVICE_KEY), db, () =>
         Promise.reject(new AmazonAuthError('amazon_connection_revoked', 409))
      )
   );
   assertEquals(await res.json(), {
      polled: 0,
      failed: 1,
      given_up: 1,
      remaining: 0
   });
   assertEquals(db.rpcs[0].args.p_submission_id, 'old');
   assertEquals(db.rpcs[0].args.p_status, 'failed');
});

Deno.test('the time budget stops new cells and leaves them in remaining', async () => {
   const db = fakeAdmin({
      market_cell: [
         { id: 'c1', tenant_id: 't1' },
         { id: 'c2', tenant_id: 't1' }
      ]
   });
   let clock = NOW;
   const refresh: RefreshFn = (deps, target) => {
      clock += 101_000;
      return processing()(deps, target);
   };
   const res = await run(post(SERVICE_KEY), db, refresh, {
      amazon: { now: () => clock }
   });
   assertEquals(await res.json(), {
      polled: 1,
      failed: 0,
      given_up: 0,
      remaining: 1
   });
});
