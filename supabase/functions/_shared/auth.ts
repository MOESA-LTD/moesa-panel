import { type AnyAbility, createMongoAbility, jwtDecode, timingSafeEqual } from './deps.ts';
import { HttpError } from './http.ts';
import { supabaseAdmin, supabaseClient } from './supabaseClient.ts';

export type Permission = [action: string, subject: string];
export type Requirement = Permission[] | ((ability: AnyAbility) => boolean);

/** The token's claims; it identifies the user only (see private.custom_access_token_hook). */
export type Claims = {
   sub: string;
   user_metadata?: {
      current_tenant_id?: string;
   };
};

export type PermissionClaim = { command: string; resource_name: string | null };

/** The caller's tenant in use and its permissions, as public.my_access returns them. */
export type Access = {
   tenant_id: string | null;
   permissions: PermissionClaim[];
};

export type AuthContext = {
   ability: AnyAbility;
   claims: Claims;
   userId: string;
   tenantId: string;
};

export const buildAbility = (permissions: PermissionClaim[] = []) =>
   createMongoAbility(
      permissions.map(({ command, resource_name }) => ({
         action: command,
         subject: resource_name?.replace(/^public\./, '') ?? ''
      }))
   );

export const isAuthorized = (ability: AnyAbility, required: Requirement) =>
   typeof required === 'function'
      ? required(ability)
      : required.every(([action, subject]) => ability.can(action, subject));

/**
 * The tenant a request may act on: the one the database settled on for the caller. A requested
 * tenant (`x-tenant-id`) the caller does not belong to is rejected rather than replaced.
 */
export const resolveTenantId = (access: Access | null, requested?: string | null) => {
   const current = access?.tenant_id;
   if (!current) return null;
   if (requested && requested !== current) return null;
   return current;
};

/** The caller's access, read from the database as RLS reads it (so changes apply at once). */
export const loadAccess = async (req: Request, requested: string | null) => {
   const { data } = await supabaseClient(req)
      .schema('public')
      .rpc('my_access', requested ? { requested } : {})
      .throwOnError();
   return data as Access | null;
};

/** Verifies the bearer token with Supabase Auth and returns its claims. */
export const authenticate = async (req: Request) => {
   const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
   if (!token) throw new HttpError(401, 'unauthorized');

   // getUser validates the token signature and expiry on the Auth server; only then are claims trusted.
   const { data, error } = await supabaseAdmin().auth.getUser(token);
   if (error || !data.user) throw new HttpError(401, 'unauthorized');

   const claims = jwtDecode<Claims>(token);
   if (claims.sub !== data.user.id) throw new HttpError(401, 'unauthorized');

   return claims;
};

/**
 * For calls made by the platform itself (pg_cron through pg_net): the bearer token must be the
 * service role key. Compared in constant time; anything else is 401.
 */
export function assertServiceCall(
   req: Request,
   key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
): void {
   const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
   if (!key || !token) throw new HttpError(401, 'unauthorized');

   const encoder = new TextEncoder();
   const a = encoder.encode(token);
   const b = encoder.encode(key);
   if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b))
      throw new HttpError(401, 'unauthorized');
}

export async function withAuthorization(
   req: Request,
   required: Requirement,
   handler: (context: AuthContext) => Promise<Response>
): Promise<Response> {
   const claims = await authenticate(req);

   const requested = req.headers.get('x-tenant-id');
   const access = await loadAccess(req, requested);
   const tenantId = resolveTenantId(access, requested);
   if (!tenantId) throw new HttpError(403, 'tenant_not_allowed');

   const ability = buildAbility(access?.permissions);
   if (!isAuthorized(ability, required)) throw new HttpError(403, 'forbidden');

   return handler({ ability, claims, userId: claims.sub, tenantId });
}
