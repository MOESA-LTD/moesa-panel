// Shared test helpers: a stubbed global fetch (what supabase-js uses) and a caller with permissions.
import type { Permission } from '../_shared/auth.ts';

export const CALLER = '00000000-0000-4000-8000-0000000000aa';
export const TENANT = '00000000-0000-4000-8000-0000000000a1';

Deno.env.set('SUPABASE_URL', 'http://stub.local');
Deno.env.set('SUPABASE_ANON_KEY', 'anon');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

let granted: Permission[] = [];

const b64 = (value: unknown) =>
   btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

/** A request whose bearer token is for CALLER, who holds the given permissions in TENANT. */
export const authorizedRequest = (...permissions: Permission[]): Request => {
   granted = permissions;
   const token = `${b64({ alg: 'none' })}.${b64({ sub: CALLER })}.sig`;
   return new Request('http://localhost/user/x', {
      headers: { Authorization: `Bearer ${token}` }
   });
};

export const jsonResponse = (body: unknown, status = 200) =>
   new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
   });

let current: Handler | undefined;
const realFetch = globalThis.fetch;

// supabase-js binds the global fetch when a client is created, and the service client is cached
// across tests: install one permanent wrapper and swap the handler behind it.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
   if (!current) return realFetch(input, init);
   const url = new URL(input instanceof Request ? input.url : String(input));
   if (url.pathname === '/auth/v1/user') return Promise.resolve(jsonResponse({ id: CALLER }));
   if (url.pathname === '/rest/v1/rpc/my_access')
      return Promise.resolve(
         jsonResponse({
            tenant_id: TENANT,
            permissions: granted.map(([command, subject]) => ({
               command,
               resource_name: `public.${subject}`
            }))
         })
      );
   return Promise.resolve(current(url, init));
}) as typeof fetch;

/**
 * Routes fetch to `handler`. Sign-in verification (GET /auth/v1/user) and public.my_access are
 * answered for the caller of authorizedRequest. Returns the restore.
 */
export const stubFetch = (handler: Handler) => {
   current = handler;
   return () => {
      current = undefined;
   };
};
