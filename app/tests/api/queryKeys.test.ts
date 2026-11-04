import { affectedTables, invalidateTables, queryKeys } from '@/api/queryKeys';
import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';

const TENANT = 'tenant-1';

const seed = (queryClient: QueryClient, keys: readonly (readonly unknown[])[]) =>
   keys.forEach((key) => queryClient.setQueryData(key, { seeded: true }));

const staleKeys = (queryClient: QueryClient) =>
   queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey);

describe('queryKeys', () => {
   it('scopes every key by tenant and table', () => {
      expect(queryKeys.detail(TENANT, 'role', 'r1')).toEqual([
         'tenant',
         TENANT,
         'role',
         'detail',
         'r1'
      ]);
      expect(queryKeys.list(TENANT, 'role', { page: 1 }).slice(0, 4)).toEqual([
         'tenant',
         TENANT,
         'role',
         'list'
      ]);
   });
});

describe('affectedTables', () => {
   it('adds derived views and the audit log', () => {
      const tables = affectedTables(['tenant_user']);
      expect(tables).toContain('tenant_user');
      expect(tables).toContain('tenant_member');
      expect(tables).toContain('audit_log');
      expect(tables).not.toContain('company_subscription');
   });

   it('follows ON DELETE CASCADE chains and their derived views', () => {
      const tables = affectedTables(['user']);
      expect(tables).toEqual(expect.arrayContaining(['tenant_user', 'tenant_owner', 'user_role']));
      expect(tables).toContain('tenant_member');
      expect(affectedTables(['role'])).not.toContain('tenant_member');
   });

   it('marks the media library and the product images stale after a media change', () => {
      expect(affectedTables(['media_link'])).toEqual(
         expect.arrayContaining(['media_library', 'product_with_evidence', 'media'])
      );
      expect(affectedTables(['media'])).toEqual(
         expect.arrayContaining(['media_library', 'product_with_evidence', 'media_link'])
      );
      // A document citing a file counts in the library's document_count.
      expect(affectedTables(['document'])).toContain('media_library');
   });

   it('marks the order overview and the product evidence stale after an order change', () => {
      expect(affectedTables(['purchase_order_line'])).toEqual(
         expect.arrayContaining([
            'purchase_order',
            'purchase_order_overview',
            'product_evidence',
            'product_with_evidence'
         ])
      );
      expect(affectedTables(['purchase_order_payment'])).toEqual(
         expect.arrayContaining(['purchase_order', 'purchase_order_overview'])
      );
      expect(affectedTables(['purchase_order_update'])).toContain('purchase_order');
      expect(affectedTables(['purchase_order'])).toEqual(
         expect.arrayContaining(['purchase_order_overview', 'product_evidence'])
      );
      // The approved PSI and the spec sheets (has_approved_psi, spec_missing_line_ids).
      expect(affectedTables(['document'])).toContain('purchase_order_overview');
      expect(affectedTables(['setting'])).toContain('purchase_order_overview');
   });
});

describe('invalidateTables', () => {
   it('invalidates the queries of the given tables and their derived views only', async () => {
      const queryClient = new QueryClient();
      const userDetail = queryKeys.detail(TENANT, 'user', 'u1');
      const userList = queryKeys.list(TENANT, 'user', { page: 1 });
      const memberView = queryKeys.list(TENANT, 'tenant_member');
      const planList = queryKeys.list(TENANT, 'plan');
      seed(queryClient, [userDetail, userList, memberView, planList, ['unrelated']]);

      await invalidateTables(queryClient, ['user']);

      expect(staleKeys(queryClient)).toEqual(
         expect.arrayContaining([userDetail, userList, memberView])
      );
      expect(staleKeys(queryClient)).not.toContainEqual(planList);
      expect(staleKeys(queryClient)).not.toContainEqual(['unrelated']);
   });
});
