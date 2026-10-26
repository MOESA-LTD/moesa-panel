import { assertEquals } from 'jsr:@std/assert@1';
import { buildAbility, type Claims, isAuthorized, resolveTenantId } from '../_shared/auth.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';

const claims = (overrides: Partial<Claims> = {}): Claims => ({
   sub: 'user-1',
   app_metadata: {
      permission: [
         { command: 'select', resource_name: 'public.user' },
         { command: 'update', resource_name: 'public.user' }
      ],
      allowed_tenant: [{ id: TENANT }]
   },
   user_metadata: { current_tenant_id: TENANT },
   ...overrides
});

Deno.test('isAuthorized allows when every required permission is granted', () => {
   const ability = buildAbility(claims());
   assertEquals(isAuthorized(ability, [['select', 'user']]), true);
   assertEquals(
      isAuthorized(ability, [
         ['select', 'user'],
         ['update', 'user']
      ]),
      true
   );
});

Deno.test('isAuthorized denies when any required permission is missing', () => {
   const ability = buildAbility(claims());
   assertEquals(isAuthorized(ability, [['delete', 'user']]), false);
   assertEquals(
      isAuthorized(ability, [
         ['select', 'user'],
         ['insert', 'user']
      ]),
      false
   );
});

Deno.test('isAuthorized denies a token without permissions', () => {
   const ability = buildAbility(claims({ app_metadata: {} }));
   assertEquals(isAuthorized(ability, [['select', 'user']]), false);
});

Deno.test('isAuthorized supports predicate requirements', () => {
   const ability = buildAbility(claims());
   assertEquals(
      isAuthorized(ability, (a) => a.can('select', 'user') || a.can('delete', 'user')),
      true
   );
});

Deno.test('resolveTenantId uses the current tenant from the token', () => {
   assertEquals(resolveTenantId(claims()), TENANT);
   assertEquals(resolveTenantId(claims(), TENANT), TENANT);
});

Deno.test('resolveTenantId rejects a conflicting tenant header', () => {
   assertEquals(resolveTenantId(claims(), OTHER_TENANT), null);
});

Deno.test('resolveTenantId rejects a current tenant that is not allowed', () => {
   assertEquals(resolveTenantId(claims({ user_metadata: { current_tenant_id: OTHER_TENANT } })), null);
   assertEquals(resolveTenantId(claims({ user_metadata: {} })), null);
});
