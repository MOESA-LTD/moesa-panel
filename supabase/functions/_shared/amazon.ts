// The shared Selling Partner API client: env, hosts, EU marketplaces, the LWA token cache, a token
// bucket and a retrying request function. Secrets (client secret, refresh and access tokens) stay
// in this module: errors carry a code, a status, Amazon's errors and a request id, nothing else.
import { HttpError } from './http.ts';

export type AmazonEnv = {
   env: 'sandbox' | 'production';
   region: 'eu';
   clientId: string;
   clientSecret: string;
   /** The self-authorized refresh token (sandbox only; production tokens come from Vault). */
   selfRefreshToken?: string;
   sellerId?: string;
};

export class AmazonError extends Error {
   constructor(
      public code: string,
      public status: number,
      public details?: unknown,
      public requestId?: string
   ) {
      super(code);
      this.name = new.target.name;
   }
}

/** 'amazon_connection_revoked' (invalid_grant) | 'amazon_auth_failed'. */
export class AmazonAuthError extends AmazonError {}
/** 'amazon_throttled'. */
export class AmazonThrottleError extends AmazonError {}
/** 'amazon_request_invalid' (4xx; details = Amazon's errors[]) | 'amazon_not_found' (404). */
export class AmazonRequestError extends AmazonError {}

/** Reads AMAZON_SPAPI_* from the environment (or `get`). */
export function amazonEnv(
   get: (name: string) => string | undefined = (name) => Deno.env.get(name)
): AmazonEnv {
   const read = (name: string) => get(name)?.trim() || undefined;

   const clientId = read('AMAZON_SPAPI_LWA_CLIENT_ID');
   const clientSecret = read('AMAZON_SPAPI_LWA_CLIENT_SECRET');
   if (!clientId || !clientSecret) throw new AmazonError('amazon_unconfigured', 500);

   const env = read('AMAZON_SPAPI_ENV') ?? 'sandbox';
   if (env !== 'sandbox' && env !== 'production') throw new AmazonError('amazon_unconfigured', 500);

   const region = read('AMAZON_SPAPI_REGION') ?? 'eu';
   if (region !== 'eu') throw new AmazonError('amazon_region_unsupported', 500);

   return {
      env,
      region,
      clientId,
      clientSecret,
      selfRefreshToken: read('AMAZON_SPAPI_REFRESH_TOKEN'),
      sellerId: read('AMAZON_SPAPI_SELLER_ID')
   };
}

export const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

/** The SP-API regions. Only `eu` is configurable; the others serve sandbox-only mocks. */
export type Region = 'eu' | 'na' | 'fe';

/**
 * The SP-API host. `sandboxRegionOverride` reaches a static-sandbox mock that Amazon serves from
 * another region (the VALIDATION_PREVIEW mock for ATVPDKIKX0DER lives on the NA sandbox); it is
 * refused in production with amazon_region_unsupported.
 */
export function spapiHost(env: AmazonEnv, sandboxRegionOverride?: Region): string {
   if (env.env === 'sandbox') {
      return `https://sandbox.sellingpartnerapi-${sandboxRegionOverride ?? env.region}.amazon.com`;
   }
   if (sandboxRegionOverride && sandboxRegionOverride !== env.region) {
      throw new AmazonError('amazon_region_unsupported', 500);
   }
   return `https://sellingpartnerapi-${env.region}.amazon.com`;
}

type Marketplace = { marketplaceId: string; languageTag: string; currency: string };

const marketplace = (marketplaceId: string, languageTag: string, currency: string): Marketplace =>
   Object.freeze({ marketplaceId, languageTag, currency });

/** The EU marketplaces of the `amazon` platform, by country. */
export const EU_MARKETPLACES: Readonly<Record<string, Marketplace>> = Object.freeze({
   DE: marketplace('A1PA6795UKMFR9', 'de_DE', 'EUR'),
   FR: marketplace('A13V1IB3VIYZZH', 'fr_FR', 'EUR'),
   IT: marketplace('APJ6JRA9NG5V4', 'it_IT', 'EUR'),
   ES: marketplace('A1RKKUPIHCS9HS', 'es_ES', 'EUR'),
   NL: marketplace('A1805IZSGTT6HS', 'nl_NL', 'EUR'),
   PL: marketplace('A1C3SOZRARQ6R3', 'pl_PL', 'PLN'),
   SE: marketplace('A2NODRKZP88ZB9', 'sv_SE', 'SEK'),
   BE: marketplace('AMEN7PMS3EDWL', 'fr_BE', 'EUR'),
   GB: marketplace('A1F83G8C2ARO7P', 'en_GB', 'GBP')
});

export function marketplaceFor(country: string): Marketplace {
   const found = Object.hasOwn(EU_MARKETPLACES, country) ? EU_MARKETPLACES[country] : undefined;
   if (!found) throw new HttpError(422, 'amazon_marketplace_unsupported');
   return found;
}

export type Deps = { fetch: typeof fetch; now: () => number; sleep: (ms: number) => Promise<void> };

const defaultDeps: Deps = {
   fetch: (input, init) => fetch(input, init),
   now: () => Date.now(),
   sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

const withDefaults = (deps?: Partial<Deps>): Deps => ({ ...defaultDeps, ...deps });

/**
 * Rate limiter: `burst` calls pass at once, then one per 1/`ratePerSecond` s. Each take reserves
 * a token (the balance may go negative) and sleeps until it is due, so concurrent callers queue.
 * A take that would wait longer than `maxWaitMs` gives its reservation back and throws
 * AmazonThrottleError('amazon_rate_limited', 429), so a drained bucket never blocks for long.
 */
export class TokenBucket {
   private tokens: number;
   private last: number;
   private readonly deps: Deps;

   constructor(
      private readonly ratePerSecond: number,
      private readonly burst: number,
      deps?: Partial<Deps>,
      private readonly maxWaitMs = 10_000
   ) {
      this.deps = withDefaults(deps);
      this.tokens = burst;
      this.last = this.deps.now();
   }

   async take(): Promise<void> {
      const now = this.deps.now();
      this.tokens = Math.min(
         this.burst,
         this.tokens + ((now - this.last) / 1000) * this.ratePerSecond
      );
      this.last = now;
      this.tokens -= 1;
      if (this.tokens >= 0) return;

      const wait = (-this.tokens / this.ratePerSecond) * 1000;
      if (wait > this.maxWaitMs) {
         this.tokens += 1;
         throw new AmazonThrottleError('amazon_rate_limited', 429);
      }
      await this.deps.sleep(wait);
   }
}

// --- LWA ---------------------------------------------------------------------------------------

/** Tokens are reused until this long before Amazon's expiry. */
const TOKEN_MARGIN_MS = 60_000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const pending = new Map<string, Promise<string>>();

const cacheKey = (refreshToken: string, env: AmazonEnv) => `${env.clientId}\n${refreshToken}`;

export function clearTokenCache(): void {
   tokenCache.clear();
   pending.clear();
}

const readJson = async (response: Response): Promise<unknown> => {
   const text = await response.text();
   if (!text) return undefined;
   try {
      return JSON.parse(text);
   } catch {
      return undefined;
   }
};

const exchange = async (refreshToken: string, env: AmazonEnv, deps: Deps): Promise<string> => {
   let response: Response;
   try {
      response = await deps.fetch(LWA_TOKEN_URL, {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: env.clientId,
            client_secret: env.clientSecret
         }).toString()
      });
   } catch {
      throw new AmazonError('amazon_unavailable', 502);
   }

   const body = (await readJson(response)) as
      | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
      | undefined;

   if (!response.ok || !body?.access_token) {
      if (response.status >= 500) throw new AmazonError('amazon_unavailable', 502);
      // Only Amazon's error code and description: never the request, which holds the secrets.
      const details = body?.error
         ? { error: body.error, error_description: body.error_description }
         : undefined;
      if (body?.error === 'invalid_grant')
         throw new AmazonAuthError('amazon_connection_revoked', 409, details);
      throw new AmazonAuthError('amazon_auth_failed', 502, details);
   }

   const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
   tokenCache.set(cacheKey(refreshToken, env), {
      token: body.access_token,
      expiresAt: deps.now() + expiresIn * 1000 - TOKEN_MARGIN_MS
   });
   return body.access_token;
};

/** An LWA access token for `refreshToken`, cached per refresh token until expires_in − 60 s. */
export function lwaToken(
   refreshToken: string,
   env: AmazonEnv,
   deps?: Partial<Deps>
): Promise<string> {
   const d = withDefaults(deps);
   const key = cacheKey(refreshToken, env);

   const cached = tokenCache.get(key);
   if (cached && d.now() < cached.expiresAt) return Promise.resolve(cached.token);

   // Concurrent callers share one exchange.
   let inflight = pending.get(key);
   if (!inflight) {
      inflight = exchange(refreshToken, env, d).finally(() => pending.delete(key));
      pending.set(key, inflight);
   }
   return inflight;
}

const dropToken = (refreshToken: string, env: AmazonEnv) =>
   tokenCache.delete(cacheKey(refreshToken, env));

// --- SP-API ------------------------------------------------------------------------------------

export type SpapiRequest = {
   method: 'GET' | 'PUT' | 'PATCH' | 'DELETE';
   path: string;
   query?: Record<string, string | readonly string[] | undefined>;
   body?: unknown;
};

export type SpapiCall = <T>(req: SpapiRequest) => Promise<T>;

const USER_AGENT = 'moesa-panel/1.0 (Language=TypeScript)';
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BACKOFF_MS = 500;
/** The longest wait a Retry-After header can ask for. */
const MAX_RETRY_AFTER_MS = 30_000;

/** Retry-After in ms (delta seconds or an HTTP date), undefined when absent or unreadable. */
const retryAfterMs = (response: Response | undefined, now: number) => {
   const value = response?.headers.get('retry-after')?.trim();
   if (!value) return undefined;
   if (/^\d+$/.test(value)) return Number(value) * 1000;
   const date = Date.parse(value);
   return Number.isNaN(date) ? undefined : Math.max(0, date - now);
};

/** The sandbox's answer to a marketplace of another region (403 with code Unauthorized). */
const WRONG_REGION = /marketplaces you provided are not valid for region/i;

/** One bucket per host for this function instance: 5 req/s, burst 10 (the sandbox allows 15). */
const buckets = new Map<string, TokenBucket>();
const bucketFor = (host: string) => {
   let bucket = buckets.get(host);
   if (!bucket) buckets.set(host, (bucket = new TokenBucket(5, 10)));
   return bucket;
};

const buildUrl = (host: string, req: SpapiRequest) => {
   const url = new URL(req.path, host);
   for (const [name, value] of Object.entries(req.query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(name, typeof value === 'string' ? value : value.join(','));
   }
   return url.toString();
};

const amazonErrors = (body: unknown) => {
   const errors = (body as { errors?: unknown } | undefined)?.errors;
   return Array.isArray(errors)
      ? (errors as Array<{ code?: string; message?: string; details?: string }>)
      : undefined;
};

export type SpapiOptions = {
   /** Sandbox only: send the calls to this region's sandbox host (production throws). */
   sandboxRegionOverride?: Region;
};

/** A request function bound to one refresh token: auth, rate limit, retries and typed errors. */
export function spapiClient(
   refreshToken: string,
   env: AmazonEnv,
   deps?: Partial<Deps>,
   options: SpapiOptions = {}
): SpapiCall {
   const d = withDefaults(deps);
   const host = spapiHost(env, options.sandboxRegionOverride);
   const bucket = bucketFor(host);

   return async <T>(req: SpapiRequest): Promise<T> => {
      const url = buildUrl(host, req);
      let attempt = 0;
      let refreshed = false;

      for (;;) {
         const token = await lwaToken(refreshToken, env, d);
         await bucket.take();

         let response: Response | undefined;
         try {
            response = await d.fetch(url, {
               method: req.method,
               headers: {
                  'x-amz-access-token': token,
                  'content-type': 'application/json',
                  'user-agent': USER_AGENT
               },
               body: req.body === undefined ? undefined : JSON.stringify(req.body)
            });
         } catch {
            response = undefined; // a network failure is retried like a 5xx
         }

         const status = response?.status ?? 503;
         const requestId = response?.headers.get('x-amzn-RequestId') ?? undefined;
         const body = response ? await readJson(response) : undefined;

         if (response?.ok) return body as T;

         if (RETRY_STATUSES.has(status)) {
            if (attempt < MAX_RETRIES) {
               const backoff = BACKOFF_MS * 2 ** attempt;
               const asked = retryAfterMs(response, d.now()) ?? 0;
               await d.sleep(Math.min(MAX_RETRY_AFTER_MS, Math.max(backoff, asked)));
               attempt += 1;
               continue;
            }
            if (status === 429)
               throw new AmazonThrottleError(
                  'amazon_throttled',
                  429,
                  amazonErrors(body),
                  requestId
               );
            throw new AmazonError('amazon_unavailable', 502, amazonErrors(body), requestId);
         }

         const errors = amazonErrors(body);

         if (status === 403 && errors?.[0]?.code === 'Unauthorized') {
            if (!refreshed) {
               // The cached access token was rejected: exchange once more and repeat the request.
               refreshed = true;
               dropToken(refreshToken, env);
               continue;
            }
            // Still refused with a fresh token: a marketplace of another region is a bad request.
            const wrongRegion = errors.some((e) => WRONG_REGION.test(`${e.message} ${e.details}`));
            if (wrongRegion) {
               throw new AmazonRequestError('amazon_request_invalid', 422, errors, requestId);
            }
            throw new AmazonAuthError('amazon_auth_failed', 502, errors, requestId);
         }

         if (status === 404)
            throw new AmazonRequestError('amazon_not_found', 404, errors, requestId);
         if (status >= 400 && status < 500) {
            throw new AmazonRequestError('amazon_request_invalid', 422, errors, requestId);
         }
         throw new AmazonError('amazon_unavailable', 502, errors, requestId);
      }
   };
}
