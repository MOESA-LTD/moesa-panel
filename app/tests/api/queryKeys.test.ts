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
      expect(queryKeys.detail(TENANT, 'client', 'c1')).toEqual([
         'tenant',
         TENANT,
         'client',
         'detail',
         'c1'
      ]);
      expect(queryKeys.list(TENANT, 'client', { page: 1 }).slice(0, 4)).toEqual([
         'tenant',
         TENANT,
         'client',
         'list'
      ]);
   });
});

describe('affectedTables', () => {
   it('adds derived views and the audit log', () => {
      const tables = affectedTables(['client_address']);
      expect(tables).toContain('client_address');
      expect(tables).toContain('client_address_view');
      expect(tables).toContain('audit_log');
      expect(tables).not.toContain('stock_view');
   });

   it('marks stock_view stale when records change', () => {
      expect(affectedTables(['record'])).toContain('stock_view');
   });
});

describe('invalidateTables', () => {
   it('invalidates the queries of the given tables and their derived views only', async () => {
      const queryClient = new QueryClient();
      const clientDetail = queryKeys.detail(TENANT, 'client', 'c1');
      const clientList = queryKeys.list(TENANT, 'client', { page: 1 });
      const addressView = queryKeys.list(TENANT, 'client_address_view');
      const stockList = queryKeys.list(TENANT, 'stock');
      seed(queryClient, [clientDetail, clientList, addressView, stockList, ['unrelated']]);

      await invalidateTables(queryClient, ['client']);

      expect(staleKeys(queryClient)).toEqual(
         expect.arrayContaining([clientDetail, clientList, addressView])
      );
      expect(staleKeys(queryClient)).not.toContainEqual(stockList);
      expect(staleKeys(queryClient)).not.toContainEqual(['unrelated']);
   });
});
