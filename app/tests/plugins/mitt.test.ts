import { queryKeys } from '@/api/queryKeys';
import { emitter } from '@/plugins/mitt';
import { queryClient } from '@/plugins/tanstack-query';
import { afterEach, describe, expect, it } from 'vitest';

const isStale = (key: readonly unknown[]) =>
   queryClient.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;

describe('legacy update event bridge', () => {
   afterEach(() => queryClient.clear());

   it('invalidates the table named by a legacy `<table>-update` event', async () => {
      const addressView = queryKeys.list('t1', 'client_address_view');
      const stock = queryKeys.list('t1', 'stock');
      queryClient.setQueryData(addressView, []);
      queryClient.setQueryData(stock, []);

      // stateKeys use dashes, table names underscores.
      emitter.emit('client-address-update');
      await Promise.resolve();

      expect(isStale(addressView)).toBe(true);
      expect(isStale(stock)).toBe(false);
   });

   it('ignores events that are not update notifications', async () => {
      const stock = queryKeys.list('t1', 'stock');
      queryClient.setQueryData(stock, []);

      emitter.emit('stock-selected');
      await Promise.resolve();

      expect(isStale(stock)).toBe(false);
   });
});
