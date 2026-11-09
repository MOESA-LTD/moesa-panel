import { roleRepository, useSaveRole } from '@/api/role';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

const mock = vi.hoisted(() => ({
   rpc: vi.fn(() => ({ throwOnError: () => Promise.resolve({ data: 'r1' }) })),
   select: vi.fn(),
   refreshAccess: vi.fn(() => Promise.resolve())
}));

vi.mock('@/lib/supabase', () => {
   const builder: Record<string, unknown> = {};
   for (const method of ['eq', 'abortSignal', 'maybeSingle']) builder[method] = () => builder;
   builder.select = (columns: string) => (mock.select(columns), builder);
   builder.throwOnError = () =>
      Promise.resolve({
         data: {
            id: 'r1',
            display_name: 'Buyer',
            role_permission: [{ permission: { id: 'p1', kind: 'read', group_name: 'product' } }]
         }
      });
   return { supabase: { from: () => builder }, publicSchema: { rpc: mock.rpc } };
});
vi.mock('@/store/auth', () => ({
   useAuthStore: () => ({ currentTenant: { id: 't1' }, refreshAccess: mock.refreshAccess })
}));

beforeEach(() => vi.clearAllMocks());

describe('roleRepository', () => {
   it('reads the permissions through role_permission and flattens them', async () => {
      const role = await roleRepository.get('r1', new AbortController().signal);
      expect(mock.select).toHaveBeenCalledWith(
         '*, role_permission(permission(id, kind, group_name))'
      );
      expect(role).toEqual({
         id: 'r1',
         display_name: 'Buyer',
         permission: [{ id: 'p1', kind: 'read', group_name: 'product' }]
      });
   });
});

describe('useSaveRole', () => {
   it("reloads the user's own access, whose field rights the role may carry", async () => {
      let mutation!: ReturnType<typeof useSaveRole>;
      mount(
         defineComponent({
            setup() {
               mutation = useSaveRole();
               return () => h('div');
            }
         }),
         { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
      );

      await mutation.mutateAsync({ role: { display_name: 'Buyer' }, permissionIds: ['p1'] });

      expect(mock.rpc).toHaveBeenCalledWith('save_role', expect.anything());
      expect(mock.refreshAccess).toHaveBeenCalled();
   });
});
