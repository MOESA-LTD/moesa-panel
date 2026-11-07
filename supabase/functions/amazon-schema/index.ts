// amazon-schema: product type search, the cached (or fetched) definition of a product type for a
// marketplace, and the daily refresh that 047's cron job POSTs to amazon-schema/refresh.
//
//   GET  ?action=search&keywords=&country=&customer_id=                  -> { productTypes }
//   GET  ?action=definition&product_type=&country=&locale?=&customer_id= -> the cache row
//   POST /refresh (or { action: 'refresh' }), Bearer service key         -> { refreshed, ... }
//
// The user routes run with the caller's JWT: the cache and the Amazon account row are read as the
// user (RLS); the service role (_shared/serviceRole.ts) only reads the account's token, marks a
// revoked grant and writes the tenant-neutral cache (no user writes it). The refresh has no user:
// it uses the service client, audited as amazon-schema-refresh.
import {
   AmazonAuthError,
   AmazonError,
   type AmazonEnv,
   amazonEnv,
   type Deps,
   marketplaceFor,
   spapiClient
} from '../_shared/amazon.ts';
import { amazonAccountFor, withRevocation } from '../_shared/amazonAccount.ts';
import { assertServiceCall, type Requirement, withAuthorization } from '../_shared/auth.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import { type SupabaseClient, z } from '../_shared/deps.ts';
import { errorResponse, HttpError, json, serve } from '../_shared/http.ts';
import { languageTag } from '../_shared/listingCompleteness.ts';
import { type ServiceRole, serviceRole } from '../_shared/serviceRole.ts';
import { supabaseClient, supabaseService } from '../_shared/supabaseClient.ts';
import {
   type DefinitionKey,
   type DefinitionRow,
   fetchDefinition,
   pickDefinition,
   searchProductTypes
} from './schema.ts';

const TABLE = 'amazon_product_type_definition';
const PERMISSION: Requirement = [['update', 'product']];
/** A cached schema older than this is re-fetched by the daily refresh. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** One refresh run handles at most this many rows, oldest first; the rest wait for the next run. */
const REFRESH_BATCH = 20;
/** No new row is started after this long, well inside the Edge Function wall-clock limit. */
const REFRESH_BUDGET_MS = 100_000;

type Db = SupabaseClient<Database>;

export type HandlerDeps = {
   /** fetch / now / sleep for the SP-API client and the schema download. */
   amazon: Partial<Deps>;
   env: () => AmazonEnv;
   /** The refresh's service-role client (no user: pg_cron calls it), audited as amazon-schema-refresh. */
   admin: () => Db;
   /** The caller's client (RLS): cache and account reads. */
   userDb: (req: Request) => Db;
   /** What only the service role may do on a user route, audited as the user. */
   service: (userId: string) => ServiceRole;
   authorize: (
      req: Request,
      required: Requirement,
      run: (context: { tenantId: string; userId: string }) => Promise<Response>
   ) => Promise<Response>;
   serviceKey: string | undefined;
};

const country = z.string().trim().toUpperCase().length(2);
const customerId = z.string().uuid();

const searchQuery = z.object({
   action: z.literal('search'),
   keywords: z.string().trim().min(1).max(200),
   country,
   customer_id: customerId
});

const definitionQuery = z.object({
   action: z.literal('definition'),
   product_type: z.string().regex(/^[A-Z0-9_]{1,100}$/),
   country,
   locale: z
      .string()
      .regex(/^[a-z]{2}_[A-Z]{2}$/)
      .optional(),
   customer_id: customerId
});

const userQuery = z.discriminatedUnion('action', [searchQuery, definitionQuery]);

const toJson = (row: DefinitionRow) => ({
   ...row,
   schema: row.schema as unknown as Json,
   property_groups: row.property_groups as unknown as Json
});

/** Writes a row with the service role; fetched_at is set so an upsert renews it. */
const store = (service: ServiceRole, row: DefinitionRow, now: number) =>
   service.storeDefinition({ ...toJson(row), fetched_at: new Date(now).toISOString() });

type Caller = { req: Request; tenantId: string; userId: string };

const search = async (d: HandlerDeps, caller: Caller, q: z.infer<typeof searchQuery>) => {
   const { marketplaceId } = marketplaceFor(q.country);
   const env = d.env();
   const service = d.service(caller.userId);
   const account = await amazonAccountFor(
      d.userDb(caller.req),
      service,
      q.customer_id,
      caller.tenantId,
      env
   );
   const call = spapiClient(account.refreshToken, env, d.amazon);
   const productTypes = await withRevocation(service, account.id, () =>
      searchProductTypes(call, q.keywords, marketplaceId)
   );
   return json({ productTypes });
};

const definition = async (d: HandlerDeps, caller: Caller, q: z.infer<typeof definitionQuery>) => {
   const { marketplaceId } = marketplaceFor(q.country);
   const env = d.env();
   const sandbox = env.env === 'sandbox';
   const key: DefinitionKey = {
      marketplaceId,
      productType: q.product_type,
      locale: q.locale ?? (languageTag(q.country) as string)
   };

   // In sandbox every row of the product type may serve (pickDefinition), so all are read.
   const db = d.userDb(caller.req);
   const base = db.from(TABLE).select('*').eq('product_type', key.productType);
   const { data: rows, error } = sandbox
      ? await base
      : await base.eq('marketplace_id', key.marketplaceId).eq('locale', key.locale);
   if (error) throw error;

   const cached = pickDefinition((rows ?? []) as unknown as DefinitionRow[], key, sandbox);
   if (cached) return json(cached);
   // The sandbox's schema link (https://schema-url) cannot be downloaded: only the fixture serves.
   if (sandbox) throw new HttpError(404, 'amazon_schema_missing');

   const service = d.service(caller.userId);
   const account = await amazonAccountFor(db, service, q.customer_id, caller.tenantId, env);
   const call = spapiClient(account.refreshToken, env, d.amazon);
   const row = await withRevocation(service, account.id, () =>
      fetchDefinition(call, { ...key, sellerId: account.sellerId }, d.amazon)
   );
   return json(await store(service, row, (d.amazon.now ?? Date.now)()));
};

/** Re-fetches every row older than a week with the most recently authorized connected account. */
const refresh = async (d: HandlerDeps) => {
   const env = d.env();
   if (env.env === 'sandbox') return json({ refreshed: 0, sandbox: true });

   const clock = d.amazon.now ?? Date.now;
   const started = clock();
   // No user: the scheduled refresh reads every tenant's accounts and the whole cache.
   const admin = d.admin();
   const service = serviceRole(admin);
   const {
      data: stale,
      count,
      error
   } = await admin
      .from(TABLE)
      .select('marketplace_id, product_type, locale', { count: 'exact' })
      .lt('fetched_at', new Date(started - STALE_AFTER_MS).toISOString())
      .order('fetched_at', { ascending: true })
      .limit(REFRESH_BATCH);
   if (error) throw error;
   const total = count ?? stale?.length ?? 0;
   if (!stale?.length) return json({ refreshed: 0, failed: 0, remaining: 0, sandbox: false });

   const { data: latest, error: accountError } = await admin
      .from('customer_platform_account')
      .select('customer_id, tenant_id')
      .eq('platform_id', 'amazon')
      .eq('api_connection', 'connected')
      .order('authorized_at', { ascending: false, nullsFirst: false })
      .limit(1);
   if (accountError) throw accountError;
   if (!latest?.length) throw new HttpError(409, 'amazon_not_connected');

   const account = await amazonAccountFor(
      admin,
      service,
      latest[0].customer_id,
      latest[0].tenant_id,
      env
   );
   const call = spapiClient(account.refreshToken, env, d.amazon);

   let refreshed = 0;
   let failed = 0;
   await withRevocation(service, account.id, async () => {
      for (const row of stale) {
         if (clock() - started >= REFRESH_BUDGET_MS) break;
         const key = {
            marketplaceId: row.marketplace_id,
            productType: row.product_type,
            locale: row.locale,
            sellerId: account.sellerId
         };
         let fresh: DefinitionRow;
         try {
            fresh = await fetchDefinition(call, key, d.amazon);
         } catch (error) {
            // A revoked grant ends the run; any other Amazon failure keeps the old row for the next run.
            if (error instanceof AmazonAuthError) throw error;
            const code = error instanceof AmazonError ? error.code : 'internal_error';
            console.error(
               `amazon-schema refresh failed: ${row.product_type} ${row.marketplace_id} ${row.locale} ${code}`
            );
            failed += 1;
            continue;
         }
         // A database error ends the run: the rows after it would fail the same way.
         await store(service, fresh, clock());
         refreshed += 1;
      }
   });
   return json({ refreshed, failed, remaining: total - refreshed - failed, sandbox: false });
};

const isRefresh = async (req: Request) => {
   if (new URL(req.url).pathname.replace(/\/+$/, '').endsWith('/refresh')) return true;
   try {
      return (JSON.parse(await req.text()) as { action?: unknown })?.action === 'refresh';
   } catch {
      return false;
   }
};

const route = async (req: Request, d: HandlerDeps): Promise<Response> => {
   if (req.method === 'POST') {
      assertServiceCall(req, d.serviceKey);
      if (!(await isRefresh(req))) throw new HttpError(404, 'not_found');
      return refresh(d);
   }
   if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');

   return d.authorize(req, PERMISSION, ({ tenantId, userId }) => {
      const params: Record<string, string> = {};
      new URL(req.url).searchParams.forEach((value, name) => (params[name] = value));
      const q = userQuery.parse(params);
      const caller = { req, tenantId, userId };
      return q.action === 'search' ? search(d, caller, q) : definition(d, caller, q);
   });
};

/** Amazon's typed errors answer their own code and status (never a token: see _shared/amazon.ts). */
const toResponse = (error: unknown) =>
   errorResponse(
      error instanceof AmazonError ? new HttpError(error.status, error.code, error.details) : error
   );

export async function handler(req: Request, deps: Partial<HandlerDeps> = {}): Promise<Response> {
   const d: HandlerDeps = {
      amazon: {},
      env: () => amazonEnv(),
      // The refresh only: no user is there (pg_cron), and the cache is tenant-neutral.
      admin: () => supabaseService({ role: 'amazon-schema-refresh' }),
      userDb: supabaseClient,
      // The service role on a user route (token, revoked grant, cache write), audited as the user.
      service: (userId) => serviceRole(supabaseService({ role: 'amazon-schema', actorId: userId })),
      authorize: withAuthorization,
      serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      ...deps
   };
   try {
      return await route(req, d);
   } catch (error) {
      return toResponse(error);
   }
}

if (import.meta.main) serve((req) => handler(req));
