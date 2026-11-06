// amazon-schema: product type search, the cached (or fetched) definition of a product type for a
// marketplace, and the weekly refresh that 047's cron job POSTs to amazon-schema/refresh.
//
//   GET  ?action=search&keywords=&country=&customer_id=                  -> { productTypes }
//   GET  ?action=definition&product_type=&country=&locale?=&customer_id= -> the cache row
//   POST /refresh (or { action: 'refresh' }), Bearer service key         -> { refreshed, ... }
//
// The cache is read as the user (every user reads it) and written only with the service client.
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
import { supabaseAdmin, supabaseClient } from '../_shared/supabaseClient.ts';
import {
   type DefinitionKey,
   type DefinitionRow,
   fetchDefinition,
   pickDefinition,
   searchProductTypes
} from './schema.ts';

const TABLE = 'amazon_product_type_definition';
const PERMISSION: Requirement = [['update', 'product']];
/** A cached schema older than this is re-fetched by the weekly refresh. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type Db = SupabaseClient<Database>;

export type HandlerDeps = {
   /** fetch / now / sleep for the SP-API client and the schema download. */
   amazon: Partial<Deps>;
   env: () => AmazonEnv;
   /** The service-role client: cache writes and the Amazon account. */
   admin: () => Db;
   /** The caller's client (RLS): cache reads. */
   userDb: (req: Request) => Db;
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

/** Writes a row with the service client; fetched_at is set so an upsert renews it. */
const store = async (db: Db, row: DefinitionRow, now: number) => {
   const { data, error } = await db
      .from(TABLE)
      .upsert(
         { ...toJson(row), fetched_at: new Date(now).toISOString() },
         { onConflict: 'marketplace_id,product_type,locale' }
      )
      .select()
      .single();
   if (error) throw error;
   return data;
};

const search = async (d: HandlerDeps, tenantId: string, q: z.infer<typeof searchQuery>) => {
   const { marketplaceId } = marketplaceFor(q.country);
   const env = d.env();
   const admin = d.admin();
   const account = await amazonAccountFor(admin, q.customer_id, tenantId, env);
   const call = spapiClient(account.refreshToken, env, d.amazon);
   const productTypes = await withRevocation(admin, account.id, () =>
      searchProductTypes(call, q.keywords, marketplaceId)
   );
   return json({ productTypes });
};

const definition = async (
   req: Request,
   d: HandlerDeps,
   tenantId: string,
   q: z.infer<typeof definitionQuery>
) => {
   const { marketplaceId } = marketplaceFor(q.country);
   const env = d.env();
   const sandbox = env.env === 'sandbox';
   const key: DefinitionKey = {
      marketplaceId,
      productType: q.product_type,
      locale: q.locale ?? (languageTag(q.country) as string)
   };

   // In sandbox every row of the product type may serve (pickDefinition), so all are read.
   const base = d.userDb(req).from(TABLE).select('*').eq('product_type', key.productType);
   const { data: rows, error } = sandbox
      ? await base
      : await base.eq('marketplace_id', key.marketplaceId).eq('locale', key.locale);
   if (error) throw error;

   const cached = pickDefinition((rows ?? []) as unknown as DefinitionRow[], key, sandbox);
   if (cached) return json(cached);
   // The sandbox's schema link (https://schema-url) cannot be downloaded: only the fixture serves.
   if (sandbox) throw new HttpError(404, 'amazon_schema_missing');

   const admin = d.admin();
   const account = await amazonAccountFor(admin, q.customer_id, tenantId, env);
   const call = spapiClient(account.refreshToken, env, d.amazon);
   const row = await withRevocation(admin, account.id, () =>
      fetchDefinition(call, { ...key, sellerId: account.sellerId }, d.amazon)
   );
   return json(await store(admin, row, (d.amazon.now ?? Date.now)()));
};

/** Re-fetches every row older than a week with the most recently authorized connected account. */
const refresh = async (d: HandlerDeps) => {
   const env = d.env();
   if (env.env === 'sandbox') return json({ refreshed: 0, sandbox: true });

   const now = (d.amazon.now ?? Date.now)();
   const admin = d.admin();
   const { data: stale, error } = await admin
      .from(TABLE)
      .select('marketplace_id, product_type, locale')
      .lt('fetched_at', new Date(now - STALE_AFTER_MS).toISOString());
   if (error) throw error;
   if (!stale?.length) return json({ refreshed: 0, failed: 0, sandbox: false });

   const { data: latest, error: accountError } = await admin
      .from('customer_platform_account')
      .select('customer_id, tenant_id')
      .eq('platform_id', 'amazon')
      .eq('api_connection', 'connected')
      .order('authorized_at', { ascending: false, nullsFirst: false })
      .limit(1);
   if (accountError) throw accountError;
   if (!latest?.length) throw new HttpError(409, 'amazon_not_connected');

   const account = await amazonAccountFor(admin, latest[0].customer_id, latest[0].tenant_id, env);
   const call = spapiClient(account.refreshToken, env, d.amazon);

   let refreshed = 0;
   let failed = 0;
   await withRevocation(admin, account.id, async () => {
      for (const row of stale) {
         const key = {
            marketplaceId: row.marketplace_id,
            productType: row.product_type,
            locale: row.locale,
            sellerId: account.sellerId
         };
         try {
            await store(admin, await fetchDefinition(call, key, d.amazon), now);
            refreshed += 1;
         } catch (error) {
            // A revoked grant ends the run; any other failure keeps the old row for next week.
            if (error instanceof AmazonAuthError) throw error;
            const code = error instanceof AmazonError ? error.code : 'internal_error';
            console.error(
               `amazon-schema refresh failed: ${row.product_type} ${row.marketplace_id} ${row.locale} ${code}`
            );
            failed += 1;
         }
      }
   });
   return json({ refreshed, failed, sandbox: false });
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

   return d.authorize(req, PERMISSION, ({ tenantId }) => {
      const params: Record<string, string> = {};
      new URL(req.url).searchParams.forEach((value, name) => (params[name] = value));
      const q = userQuery.parse(params);
      return q.action === 'search' ? search(d, tenantId, q) : definition(req, d, tenantId, q);
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
      admin: supabaseAdmin,
      userDb: supabaseClient,
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
