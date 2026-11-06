// The OAuth pieces of amazon-auth: its config, the signed state, the Seller Central consent URL
// and the LWA authorization_code exchange. The client secret and the refresh token stay here:
// errors carry Amazon's error code and description only.
import { AmazonError, type AmazonEnv, type Deps, LWA_TOKEN_URL } from '../_shared/amazon.ts';
import { decodeBase64Url, encodeBase64Url, encodeHex, z } from '../_shared/deps.ts';

export type StatePayload = {
   account_id: string;
   tenant_id: string;
   user_id: string;
   /** An app path the callback redirects back to (same origin only). */
   return_to: string;
   /** Epoch ms. */
   exp: number;
};

/** How long a state is valid: Amazon's whole website flow must finish within 10 minutes. */
export const STATE_TTL_MS = 600_000;

const CONSENT_URL = 'https://sellercentral-europe.amazon.com/apps/authorize/consent';

/** A path on the app itself: '/x', never '//host', a scheme, a backslash or a control character. */
export const isAppPath = (path: string) =>
   path.startsWith('/') && !path.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(path);

const statePayload = z.object({
   account_id: z.string().min(1),
   tenant_id: z.string().min(1),
   user_id: z.string().min(1),
   return_to: z.string().refine(isAppPath),
   exp: z.number().int()
});

const encoder = new TextEncoder();

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
   crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      [usage]
   );

/** base64url(JSON) + '.' + base64url(HMAC-SHA256 of the first part). */
export async function signState(payload: StatePayload, secret: string): Promise<string> {
   const body = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
   const mac = await crypto.subtle.sign(
      'HMAC',
      await hmacKey(secret, 'sign'),
      encoder.encode(body)
   );
   return `${body}.${encodeBase64Url(mac)}`;
}

/** The payload, or null for a bad signature, an expired state or a return_to off the app. */
export async function verifyState(
   state: string,
   secret: string,
   now: number
): Promise<StatePayload | null> {
   const parts = state.split('.');
   if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
   const [body, mac] = parts;
   try {
      // crypto.subtle.verify compares in constant time.
      const valid = await crypto.subtle.verify(
         'HMAC',
         await hmacKey(secret, 'verify'),
         decodeBase64Url(mac),
         encoder.encode(body)
      );
      if (!valid) return null;
      const parsed = statePayload.safeParse(
         JSON.parse(new TextDecoder().decode(decodeBase64Url(body)))
      );
      if (!parsed.success || parsed.data.exp < now) return null;
      return parsed.data;
   } catch {
      return null;
   }
}

/** Seller Central (EU) consent page of a public app; version=beta while the app is a draft. */
export function consentUrl(appId: string, state: string, beta: boolean): string {
   const params = new URLSearchParams({ application_id: appId, state });
   if (beta) params.set('version', 'beta');
   return `${CONSENT_URL}?${params}`;
}

/** Exchanges the callback's spapi_oauth_code for the seller's refresh token at LWA. */
export async function exchangeCode(
   code: string,
   redirectUri: string,
   env: AmazonEnv,
   deps: Partial<Deps> = {}
): Promise<string> {
   const doFetch = deps.fetch ?? fetch;
   let response: Response;
   try {
      response = await doFetch(LWA_TOKEN_URL, {
         method: 'POST',
         headers: { 'content-type': 'application/x-www-form-urlencoded' },
         body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: env.clientId,
            client_secret: env.clientSecret
         }).toString()
      });
   } catch {
      throw new AmazonError('amazon_unavailable', 502);
   }

   let body: { refresh_token?: string; error?: string; error_description?: string } | undefined;
   try {
      body = await response.json();
   } catch {
      body = undefined;
   }
   if (response.ok && typeof body?.refresh_token === 'string' && body.refresh_token)
      return body.refresh_token;
   if (response.status >= 500) throw new AmazonError('amazon_unavailable', 502);
   // Only Amazon's code and description: never the request, which holds the secrets.
   const details = body?.error
      ? { error: body.error, error_description: body.error_description }
      : undefined;
   throw new AmazonError('amazon_auth_failed', 502, details);
}

export type AuthConfig = {
   /** AMAZON_SPAPI_APP_ID: required for the production consent URL. */
   appId?: string;
   /** AMAZON_SPAPI_APP_BETA === 'true'. */
   beta: boolean;
   /** APP_URL, default http://localhost:6161. */
   appUrl: string;
   /** PUBLIC_SUPABASE_URL, default http://127.0.0.1:54321 (the callback's redirect_uri host). */
   publicSupabaseUrl: string;
   stateSecret: string;
};

const MIN_SECRET_LENGTH = 32;

/**
 * Reads the OAuth config. The state secret is AMAZON_SPAPI_STATE_SECRET (at least 32 characters).
 * In sandbox only, a missing one falls back to SHA-256 of the service role key, so local dev
 * works without it; production without it is amazon_unconfigured.
 */
export async function authConfig(
   env: AmazonEnv,
   get: (name: string) => string | undefined = (name) => Deno.env.get(name)
): Promise<AuthConfig> {
   const read = (name: string) => get(name)?.trim() || undefined;
   const trimSlash = (url: string) => url.replace(/\/+$/, '');

   let stateSecret = read('AMAZON_SPAPI_STATE_SECRET');
   if (!stateSecret && env.env === 'sandbox') {
      const key = read('SUPABASE_SERVICE_ROLE_KEY');
      if (key) {
         const digest = await crypto.subtle.digest(
            'SHA-256',
            encoder.encode(`amazon-auth-state:${key}`)
         );
         stateSecret = encodeHex(new Uint8Array(digest));
      }
   }
   if (!stateSecret || stateSecret.length < MIN_SECRET_LENGTH)
      throw new AmazonError('amazon_unconfigured', 500);

   return {
      appId: read('AMAZON_SPAPI_APP_ID'),
      beta: read('AMAZON_SPAPI_APP_BETA') === 'true',
      appUrl: trimSlash(read('APP_URL') ?? 'http://localhost:6161'),
      publicSupabaseUrl: trimSlash(read('PUBLIC_SUPABASE_URL') ?? 'http://127.0.0.1:54321'),
      stateSecret
   };
}
