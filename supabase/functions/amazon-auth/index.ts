// amazon-auth: connects a customer's Amazon platform account to the panel (Seller Central OAuth,
// public app) and disconnects it.
//
//   POST { action: 'connect', account_id, return_to }  (update customer_platform_account)
//        production -> { redirect: <Seller Central consent URL with a signed state> }
//        sandbox    -> { account }  (no OAuth: the self-authorized env token serves, R6)
//   POST { action: 'disconnect', account_id }           -> { account }
//   GET  /amazon-auth/callback?state&selling_partner_id&spapi_oauth_code  (Amazon's redirect)
//        -> 302 APP_URL + return_to + ?amazon=connected | ?amazon=error&reason=<code>
//
// The callback carries no JWT (verify_jwt = false): the signed state is its only credential. The
// refresh token goes from LWA straight to Vault through amazon_account_connect (service role); it
// is never in a response, a redirect or a log line.
import { AmazonError, type AmazonEnv, amazonEnv, type Deps } from '../_shared/amazon.ts';
import { type Requirement, withAuthorization } from '../_shared/auth.ts';
import type { Database } from '../_shared/database.types.ts';
import { type SupabaseClient, z } from '../_shared/deps.ts';
import { errorResponse, HttpError, json, serve } from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts';
import {
   type AuthConfig,
   authConfig,
   consentUrl,
   exchangeCode,
   isAppPath,
   signState,
   STATE_TTL_MS,
   verifyState
} from './auth.ts';

const PERMISSION: Requirement = [['update', 'customer_platform_account']];
/** The seller id stored by a sandbox connect when AMAZON_SPAPI_SELLER_ID is not set. */
const SANDBOX_SELLER = 'SANDBOX_SELLER';
const CALLBACK_PATH = '/functions/v1/amazon-auth/callback';
/** The account as responses show it: the connection state, never a credential. */
const ACCOUNT_COLUMNS = 'id, customer_id, platform_id, api_connection, authorized_at, seller_id';

type Db = SupabaseClient<Database>;
type Account = Pick<
   Database['public']['Tables']['customer_platform_account']['Row'],
   'id' | 'customer_id' | 'platform_id' | 'api_connection' | 'authorized_at' | 'seller_id'
>;

export type HandlerDeps = {
   /** The service-role client: account lookups (scoped by tenant explicitly) and the RPCs. */
   db: () => Db;
   env: () => AmazonEnv;
   config: (env: AmazonEnv) => Promise<AuthConfig>;
   now: () => number;
   fetch: Deps['fetch'];
   authorize: (
      req: Request,
      required: Requirement,
      run: (context: { tenantId: string; userId: string }) => Promise<Response>
   ) => Promise<Response>;
};

const accountId = z.string().uuid();

const body = z.discriminatedUnion('action', [
   z.object({
      action: z.literal('connect'),
      account_id: accountId,
      return_to: z.string().max(500).refine(isAppPath, 'return_to must be an app path')
   }),
   z.object({ action: z.literal('disconnect'), account_id: accountId })
]);

const pick = (row: Account): Account => ({
   id: row.id,
   customer_id: row.customer_id,
   platform_id: row.platform_id,
   api_connection: row.api_connection,
   authorized_at: row.authorized_at,
   seller_id: row.seller_id
});

/** The tenant's amazon account, or 404 platform_account_not_found. */
const findAccount = async (db: Db, id: string, tenantId: string): Promise<Account> => {
   const { data, error } = await db
      .from('customer_platform_account')
      .select(ACCOUNT_COLUMNS)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('platform_id', 'amazon')
      .maybeSingle();
   if (error) throw error;
   if (!data) throw new HttpError(404, 'platform_account_not_found');
   return data as Account;
};

const connectAccount = async (
   db: Db,
   id: string,
   refreshToken: string | null,
   sellerId: string
) => {
   const { data, error } = await db.rpc('amazon_account_connect', {
      p_account_id: id,
      // NULL keeps Vault untouched: the sandbox reads the self-authorized token from the env.
      p_refresh_token: refreshToken as string,
      p_seller_id: sellerId
   });
   if (error) throw error;
   return pick(data as Account);
};

const connect = async (
   d: HandlerDeps,
   ctx: { tenantId: string; userId: string },
   q: { account_id: string; return_to: string }
) => {
   const env = d.env();
   const db = d.db();
   const account = await findAccount(db, q.account_id, ctx.tenantId);

   // R6: the OAuth website flow cannot run against the sandbox hosts.
   if (env.env === 'sandbox')
      return json({
         account: await connectAccount(db, account.id, null, env.sellerId ?? SANDBOX_SELLER)
      });

   const config = await d.config(env);
   if (!config.appId) throw new AmazonError('amazon_unconfigured', 500);
   const state = await signState(
      {
         account_id: account.id,
         tenant_id: ctx.tenantId,
         user_id: ctx.userId,
         return_to: q.return_to,
         exp: d.now() + STATE_TTL_MS
      },
      config.stateSecret
   );
   return json({ redirect: consentUrl(config.appId, state, config.beta) });
};

const disconnect = async (d: HandlerDeps, tenantId: string, id: string) => {
   const db = d.db();
   await findAccount(db, id, tenantId);
   const { error } = await db.rpc('amazon_account_disconnect', {
      p_account_id: id,
      p_state: 'none'
   });
   if (error) throw error;
   return json({ account: await findAccount(db, id, tenantId) });
};

/** A 302 back to the app; `path` is checked to stay on APP_URL. */
const redirect = (appUrl: string, path: string, result: Record<string, string>) => {
   let url = new URL(`${appUrl}${path}`);
   if (url.origin !== new URL(appUrl).origin) url = new URL(`${appUrl}/`);
   for (const [name, value] of Object.entries(result)) url.searchParams.set(name, value);
   return new Response(null, {
      status: 302,
      headers: {
         Location: url.toString(),
         'Referrer-Policy': 'no-referrer',
         'Cache-Control': 'no-store'
      }
   });
};

const callback = async (req: Request, d: HandlerDeps) => {
   const params = new URL(req.url).searchParams;
   const env = d.env();
   const config = await d.config(env);

   const payload = await verifyState(params.get('state') ?? '', config.stateSecret, d.now());
   // An unverified state's return_to is not trusted: the app's root gets the error.
   if (!payload)
      return redirect(config.appUrl, '/', { amazon: 'error', reason: 'amazon_state_invalid' });
   const back = (result: Record<string, string>) =>
      redirect(config.appUrl, payload.return_to, result);

   const code = params.get('spapi_oauth_code');
   const sellerId = params.get('selling_partner_id');
   if (!code || !sellerId) return back({ amazon: 'error', reason: 'amazon_callback_invalid' });

   try {
      const db = d.db();
      const account = await findAccount(db, payload.account_id, payload.tenant_id);
      // One use per state: an account authorized since the state was issued has spent it.
      const issuedAt = payload.exp - STATE_TTL_MS;
      if (account.authorized_at && Date.parse(account.authorized_at) >= issuedAt)
         throw new HttpError(403, 'amazon_state_replayed');

      const refreshToken = await exchangeCode(code, config.publicSupabaseUrl + CALLBACK_PATH, env, {
         fetch: d.fetch
      });
      await connectAccount(db, account.id, refreshToken, sellerId);
      return back({ amazon: 'connected' });
   } catch (error) {
      if (error instanceof HttpError) return back({ amazon: 'error', reason: error.message });
      const reason = error instanceof AmazonError ? error.code : 'internal_error';
      // The reason only: never the code, the token or the request.
      console.error(`amazon-auth callback failed: ${reason}`);
      return back({ amazon: 'error', reason });
   }
};

const readBody = async (req: Request): Promise<unknown> => {
   try {
      return JSON.parse(await req.text());
   } catch {
      return {};
   }
};

const route = async (req: Request, d: HandlerDeps): Promise<Response> => {
   const path = new URL(req.url).pathname.replace(/\/+$/, '');
   if (req.method === 'GET') {
      if (path.endsWith('/callback')) return callback(req, d);
      throw new HttpError(404, 'not_found');
   }
   if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');

   return d.authorize(req, PERMISSION, async (ctx) => {
      const q = body.parse(await readBody(req));
      return q.action === 'connect'
         ? connect(d, ctx, q)
         : disconnect(d, ctx.tenantId, q.account_id);
   });
};

/** Amazon's typed errors answer their own code and status. */
const toResponse = (error: unknown) =>
   errorResponse(
      error instanceof AmazonError ? new HttpError(error.status, error.code, error.details) : error
   );

export async function handler(req: Request, deps: Partial<HandlerDeps> = {}): Promise<Response> {
   const d: HandlerDeps = {
      db: supabaseAdmin,
      env: () => amazonEnv(),
      config: (env) => authConfig(env),
      now: Date.now,
      fetch: (input, init) => fetch(input, init),
      authorize: withAuthorization,
      ...deps
   };
   try {
      return await route(req, d);
   } catch (error) {
      return toResponse(error);
   }
}

if (import.meta.main) serve((req) => handler(req));
