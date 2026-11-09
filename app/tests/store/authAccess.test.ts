import type { Access } from '@/api/access';
import { ability } from '@/plugins/casl';
import { useAuthStore } from '@/store/auth';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
   authChange: null as null | ((event: string, session: unknown) => void),
   onAccessChanged: null as null | (() => void),
   fetchAccess: vi.fn()
}));

vi.mock('@/lib/supabase', () => {
   const channel = {
      on: (_type: string, _filter: unknown, handler: () => void) => {
         mock.onAccessChanged = handler;
         return channel;
      },
      subscribe: () => channel
   };
   return {
      supabase: {
         auth: {
            onAuthStateChange: (callback: typeof mock.authChange) => (mock.authChange = callback)
         },
         realtime: { setAuth: () => Promise.resolve() },
         channel: () => channel,
         removeChannel: () => Promise.resolve()
      }
   };
});
vi.mock('@/api/access', () => ({ fetchAccess: mock.fetchAccess }));

const access = (canRead: boolean): Access => ({
   tenant_id: 't1',
   tenants: [{ id: 't1', display_name: 'MOESA' }],
   permissions: [{ command: 'select', resource_name: 'public.supplier' }],
   fields: [
      {
         resource_name: 'public.supplier',
         field: 'deposit_rate',
         can_read: canRead,
         can_write: false
      }
   ],
   subscription: null,
   is_super_admin: false
});

describe('auth store field rights', () => {
   it('reloads the field rights when an access change is broadcast', async () => {
      setActivePinia(createPinia());
      mock.fetchAccess.mockResolvedValueOnce(access(true)).mockResolvedValueOnce(access(false));
      useAuthStore();

      mock.authChange!('SIGNED_IN', { user: { id: 'u1', user_metadata: {} }, access_token: '' });
      await new Promise((resolve) => setTimeout(resolve));
      await flushPromises();
      expect(ability.can('read', 'supplier', 'deposit_rate')).toBe(true);

      // private.notify_access_changed, e.g. after a role's field rights changed.
      mock.onAccessChanged!();
      await flushPromises();
      expect(mock.fetchAccess).toHaveBeenCalledTimes(2);
      expect(ability.can('read', 'supplier', 'deposit_rate')).toBe(false);
      expect(ability.can('read', 'supplier')).toBe(true);
   });
});
