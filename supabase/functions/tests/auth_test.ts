import { assertEquals } from 'jsr:@std/assert@1';
import { type Access, buildAbility, isAuthorized, resolveTenantId } from '../_shared/auth.ts';
import { supabaseAdmin, supabaseClient, supabaseService } from '../_shared/supabaseClient.ts';
import { stubFetch } from './helpers.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';

const access = (overrides: Partial<Access> = {}): Access => ({
   tenant_id: TENANT,
   permissions: [
      { command: 'select', resource_name: 'public.user' },
      { command: 'update', resource_name: 'public.user' }
   ],
   ...overrides
});

Deno.test('isAuthorized allows when every required permission is granted', () => {
   const ability = buildAbility(access().permissions);
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
   const ability = buildAbility(access().permissions);
   assertEquals(isAuthorized(ability, [['delete', 'user']]), false);
   assertEquals(
      isAuthorized(ability, [
         ['select', 'user'],
         ['insert', 'user']
      ]),
      false
   );
});

Deno.test('isAuthorized denies without permissions', () => {
   assertEquals(isAuthorized(buildAbility([]), [['select', 'user']]), false);
   assertEquals(isAuthorized(buildAbility(), [['select', 'user']]), false);
});

Deno.test('isAuthorized supports predicate requirements', () => {
   const ability = buildAbility(access().permissions);
   assertEquals(
      isAuthorized(ability, (a) => a.can('select', 'user') || a.can('delete', 'user')),
      true
   );
});

Deno.test('resolveTenantId uses the tenant the database settled on', () => {
   assertEquals(resolveTenantId(access()), TENANT);
   assertEquals(resolveTenantId(access(), TENANT), TENANT);
});

Deno.test('resolveTenantId rejects a requested tenant the caller does not belong to', () => {
   // my_access falls back to another of the caller's tenants; the request named a different one.
   assertEquals(resolveTenantId(access(), OTHER_TENANT), null);
});

Deno.test('resolveTenantId rejects a caller without a tenant', () => {
   assertEquals(resolveTenantId(access({ tenant_id: null })), null);
   assertEquals(resolveTenantId(null), null);
});

Deno.test('the user client reads the api schema and calls RPCs in public', async () => {
   const seen: Headers[] = [];
   const restore = stubFetch((_url, init) => {
      seen.push(new Headers(init?.headers));
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
   });
   try {
      const client = supabaseClient(
         new Request('http://x', { headers: { Authorization: 'Bearer t' } })
      );
      await client.from('product').select('id');
      await client.schema('public').rpc('is_super_admin', { user_id: 'u' });
   } finally {
      restore();
   }
   assertEquals(seen[0].get('Accept-Profile'), 'api');
   assertEquals(seen[1].get('Accept-Profile') ?? seen[1].get('Content-Profile'), 'public');
});

Deno.test('the service-role clients pin the public profile', async () => {
   const seen: Headers[] = [];
   const restore = stubFetch((_url, init) => {
      seen.push(new Headers(init?.headers));
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
   });
   try {
      await supabaseAdmin().from('product').select('id');
      await supabaseService({ role: 'amazon-poll' }).from('product').select('id');
   } finally {
      restore();
   }
   assertEquals(seen[0].get('Accept-Profile'), 'public');
   assertEquals(seen[1].get('Accept-Profile'), 'public');
});
