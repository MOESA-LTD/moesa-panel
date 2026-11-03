import type { Tenant } from '@/api/access';
import { toMemberships } from '@/api/account/memberships';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

const tenant = (
   id: string,
   display_name: string,
   parent_id: string | null,
   owned = false
): Tenant => ({ id, display_name, parent_id, owned });

const summary = (tenants: Tenant[], roles: { tenant_id: string; roles: string[] }[]) =>
   toMemberships(tenants, roles).map(({ id, depth, owned, roles }) => ({
      id,
      depth,
      owned,
      roles
   }));

describe('toMemberships', () => {
   it('lists the tenants in tree order with the roles held in each', () => {
      const tenants = [
         tenant('moda', 'Moda', 'kadikoy'),
         tenant('atlas', 'Atlas', null, true),
         tenant('kadikoy', 'Kadıköy', 'atlas'),
         tenant('moesa', 'MOESA', null)
      ];
      const roles = [
         { tenant_id: 'moesa', roles: ['coordinator'] },
         { tenant_id: 'kadikoy', roles: ['accountant', 'staff'] }
      ];

      expect(summary(tenants, roles)).toEqual([
         { id: 'atlas', depth: 0, owned: true, roles: [] },
         { id: 'kadikoy', depth: 1, owned: false, roles: ['accountant', 'staff'] },
         { id: 'moda', depth: 2, owned: false, roles: [] },
         { id: 'moesa', depth: 0, owned: false, roles: ['coordinator'] }
      ]);
   });

   it('keeps a tenant the user only owns, with no roles (my_memberships has no row for it)', () => {
      const memberships = toMemberships([tenant('atlas', 'Atlas', null, true)], []);

      expect(memberships).toEqual([
         { id: 'atlas', display_name: 'Atlas', depth: 0, owned: true, roles: [] }
      ]);
   });

   it('puts a tenant whose parent is not in the list at the root', () => {
      expect(summary([tenant('invited', 'Invited', 'hidden')], [])).toEqual([
         { id: 'invited', depth: 0, owned: false, roles: [] }
      ]);
   });

   it('drops a role row for a tenant not in the list', () => {
      const memberships = toMemberships(
         [tenant('moesa', 'MOESA', null)],
         [{ tenant_id: 'gone', roles: ['staff'] }]
      );

      expect(memberships.map(({ id }) => id)).toEqual(['moesa']);
   });

   it('gives nothing without tenants', () => {
      expect(toMemberships([], [{ tenant_id: 'moesa', roles: ['staff'] }])).toEqual([]);
   });
});
