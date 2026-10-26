import { type AnyAbility, createMongoAbility, jwtDecode } from './deps.ts';
import { HttpError } from './http.ts';
import { supabaseAdmin } from './supabaseClient.ts';

export type Permission = [action: string, subject: string];
export type Requirement = Permission[] | ((ability: AnyAbility) => boolean);

/** Claims added by private.custom_access_token_hook. */
export type Claims = {
   sub: string;
   app_metadata?: {
      permission?: { command: string; resource_name: string | null }[];
      allowed_tenant?: { id: string }[];
   };
   user_metadata?: {
      current_tenant_id?: string;
   };
};

export type AuthContext = {
   ability: AnyAbility;
   claims: Claims;
   userId: string;
   tenantId: string;
};

export const buildAbility = (claims: Claims) =>
   createMongoAbility(
      (claims.app_metadata?.permission ?? []).map(({ command, resource_name }) => ({
         action: command,
         subject: resource_name?.replace(/^public\./, '') ?? ''
      }))
   );

export const isAuthorized = (ability: AnyAbility, required: Requirement) =>
   typeof required === 'function'
      ? required(ability)
      : required.every(([action, subject]) => ability.can(action, subject));

/**
 * Permissions in the token belong to `current_tenant_id`, so that is the only tenant a request
 * may act on. A conflicting `x-tenant-id` header is rejected rather than trusted.
 */
export const resolveTenantId = (claims: Claims, requested?: string | null) => {
   const current = claims.user_metadata?.current_tenant_id;
   const allowed = claims.app_metadata?.allowed_tenant?.some(({ id }) => id === current);

   if (!current || !allowed) return null;
   if (requested && requested !== current) return null;
   return current;
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

export async function withAuthorization(
   req: Request,
   required: Requirement,
   handler: (context: AuthContext) => Promise<Response>
): Promise<Response> {
   const claims = await authenticate(req);

   const tenantId = resolveTenantId(claims, req.headers.get('x-tenant-id'));
   if (!tenantId) throw new HttpError(403, 'tenant_not_allowed');

   const ability = buildAbility(claims);
   if (!isAuthorized(ability, required)) throw new HttpError(403, 'forbidden');

   return handler({ ability, claims, userId: claims.sub, tenantId });
}
