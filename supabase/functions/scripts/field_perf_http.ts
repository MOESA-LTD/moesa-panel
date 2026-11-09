// The field-security performance budget over HTTP (Task 20, spec R10), against the local stack.
//
//   eval "$(supabase status -o env | sed 's/^/export /')" && cd supabase/functions && deno task perf:http
//   then: supabase db reset (the load is committed) and pnpm dev:seed-story from app/.
//
// 1. Loads supabase/perf/field_security_perf_load.sql (committed; skipped when already loaded)
//    and the HTTP fixtures (http-tests/helpers.ts adminSetup).
// 2. Baseline, measured live: GRANT SELECT, UPDATE on the measured public tables TO authenticated,
//    the same requests with Accept-Profile: public, then REVOKE in a finally block, and a check that
//    no public relation grants anything to anon/authenticated afterwards (exit 3 if one does).
// 3. The same requests through api. 30 per case per actor (after 3 warm-ups): the product list
//    (50, with customer(code),supplier(code)), the purchase-order overview (50) and a PATCH with
//    return=representation. Medians compared against R10's budget: internal ≤ +15%, restricted and
//    mixed ≤ +40%. Exit 1 when over budget.
//
// No secret is printed; the service key stays in helpers.ts. Not run in CI.
import { adminSetup, adminTeardown, API_URL, type Fixture, rest, signIn } from '../http-tests/helpers.ts';

const CONTAINER = 'supabase_db_moesa-panel';
const N = 30;
const WARMUP = 3;
const PERF_PRODUCT = 'feed0001-0000-4000-8000-000000000001';
const MEASURED = [
   'public.product',
   'public.customer',
   'public.supplier',
   'public.purchase_order',
   'public.purchase_order_line',
   'public.purchase_order_payment',
   'public.project',
   'public.document',
   'public.purchase_order_overview',
];

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) throw new Error('local stack only');

async function psql(sql: string): Promise<string> {
   const cmd = new Deno.Command('docker', {
      args: ['exec', '-i', '-e', 'PGCLIENTENCODING=UTF8', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped',
   });
   const child = cmd.spawn();
   const writer = child.stdin.getWriter();
   await writer.write(new TextEncoder().encode(sql));
   await writer.close();
   const out = await child.output();
   const stdout = new TextDecoder().decode(out.stdout);
   if (!out.success) throw new Error(`psql failed: ${new TextDecoder().decode(out.stderr).trim()}`);
   return stdout.trim();
}

const publicGrants = () =>
   psql(`SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
      WHERE c.relnamespace = 'public'::regnamespace AND x.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole);`);

type Actor = { name: 'internal' | 'restricted' | 'mixed'; token: string; headers: Record<string, string> };
type Case = { name: string; path: string; method?: string; body?: unknown; prefer?: string };

const CASES: Case[] = [
   { name: 'product list 50 + embeds', path: 'product?select=*,customer(code),supplier(code)&order=created_at.desc&limit=50' },
   { name: 'purchase_order_overview 50', path: 'purchase_order_overview?select=*&limit=50' },
   {
      name: 'PATCH return=representation',
      path: `product?id=eq.${PERF_PRODUCT}`,
      method: 'PATCH',
      body: { display_name: 'perf' },
      prefer: 'return=representation',
   },
];

const median = (xs: number[]) => {
   const s = [...xs].sort((a, b) => a - b);
   return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function time(actor: Actor, c: Case, profile: 'api' | 'public'): Promise<number> {
   const run = async () => {
      const t0 = performance.now();
      const r = await rest(actor.token, c.path, {
         method: c.method,
         body: c.body,
         profile,
         headers: { ...actor.headers, ...(c.prefer ? { Prefer: c.prefer } : {}) },
      });
      const ms = performance.now() - t0;
      if (r.status >= 300) throw new Error(`${profile} ${actor.name} ${c.name}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      if (!Array.isArray(r.body) || r.body.length === 0) throw new Error(`${profile} ${actor.name} ${c.name}: no rows`);
      return ms;
   };
   // A failing request (e.g. 57014, the authenticated role's statement timeout) ends the case: NaN,
   // reported as an error and over budget.
   try {
      for (let i = 0; i < WARMUP; i++) await run();
      const xs: number[] = [];
      for (let i = 0; i < N; i++) xs.push(await run());
      return median(xs);
   } catch (error) {
      console.error(`  ${(error as Error).message}`);
      return Number.NaN;
   }
}

async function measure(actors: Actor[], profile: 'api' | 'public'): Promise<Map<string, number>> {
   const out = new Map<string, number>();
   for (const a of actors) for (const c of CASES) out.set(`${a.name}|${c.name}`, await time(a, c, profile));
   return out;
}

let f: Fixture | undefined;
let exitCode = 0;
try {
   if ((await psql(`SELECT count(*) FROM public.product WHERE id = '${PERF_PRODUCT}';`)) === '0') {
      const load = await Deno.readTextFile(new URL('../../perf/field_security_perf_load.sql', import.meta.url));
      console.log('loading field_security_perf_load.sql (committed) …');
      await psql(`BEGIN;\n${load}\nCOMMIT;\n`);
   }
   f = await adminSetup();
   const internal = await signIn('akif@moesa-panel.test');
   const actors: Actor[] = [
      { name: 'internal', token: internal, headers: { 'x-tenant-id': f.moesa } },
      { name: 'restricted', token: f.restricted, headers: { 'x-tenant-id': f.moesa } },
      { name: 'mixed', token: f.mixed, headers: { 'x-tenant-id': f.moesa, 'x-tenant-ids': `${f.moesa},${f.europe}` } },
   ];

   let base: Map<string, number>;
   await psql(`GRANT SELECT, UPDATE ON ${MEASURED.join(', ')} TO authenticated;`);
   try {
      base = await measure(actors, 'public');
   } finally {
      await psql(`REVOKE SELECT, UPDATE ON ${MEASURED.join(', ')} FROM authenticated;`);
      const left = await publicGrants();
      if (left !== '0') {
         console.error(`LEAK: ${left} public ACL entries for anon/authenticated remain after the baseline`);
         exitCode = 3;
      }
   }
   if (exitCode) throw new Error('public grants remain');
   const api = await measure(actors, 'api');

   const rows: string[] = [];
   const over: string[] = [];
   rows.push('| actor | case | public ms | api ms | delta | budget | verdict |', '|---|---|---|---|---|---|---|');
   for (const a of actors) {
      for (const c of CASES) {
         const key = `${a.name}|${c.name}`;
         const b = base.get(key)!;
         const x = api.get(key)!;
         const limit = a.name === 'internal' ? 1.15 : 1.4;
         const verdict = !(x / b <= limit) ? 'OVER' : 'ok';
         if (verdict === 'OVER') over.push(key);
         const delta = Number.isNaN(x / b) ? 'error' : `${x / b >= 1 ? '+' : ''}${((x / b - 1) * 100).toFixed(1)}%`;
         rows.push(`| ${a.name} | ${c.name} | ${b.toFixed(2)} | ${x.toFixed(2)} | ${delta} | +${Math.round((limit - 1) * 100)}% | ${verdict} |`);
      }
   }
   console.log(`\nHTTP medians of ${N} requests (after ${WARMUP} warm-ups), PostgREST at ${API_URL}`);
   console.log(rows.join('\n'));
   if (over.length) {
      console.error(`budget: ${over.join('; ')}`);
      exitCode = 1;
   }
} catch (error) {
   console.error((error as Error).message);
   exitCode ||= 2;
} finally {
   // The grants are closed above; check once more whatever happened.
   try {
      const left = await publicGrants();
      if (left !== '0') {
         console.error(`LEAK: ${left} public ACL entries for anon/authenticated remain`);
         exitCode = 3;
      }
   } catch (error) {
      console.error(`could not verify the public grants: ${(error as Error).message}`);
      exitCode = 3;
   }
   if (f) await adminTeardown(f).catch((error) => console.error(`teardown: ${(error as Error).message}`));
}
Deno.exit(exitCode);
