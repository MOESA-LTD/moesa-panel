import { ability } from '@/plugins/casl';
import opsRoutes, { marketCellProps } from '@/router/routes/ops';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type RouteLocationNormalized } from 'vue-router';

// A route dialog renders its page outside the router, so a new cell opened from an empty matrix
// cell gets its product, platform and country from the query as props.
describe('market cell route props', () => {
   it('reads the new cell from the query', () => {
      const route = {
         params: {},
         query: { product_id: 'p1', platform_id: 'amazon', country: 'DE' }
      } as unknown as RouteLocationNormalized;

      expect(marketCellProps(route)).toEqual({
         product_id: 'p1',
         platform_id: 'amazon',
         country: 'DE'
      });
   });

   it('opens a cell for readers and adds one only with create', () => {
      const router = createRouter({
         history: createMemoryHistory(),
         routes: [{ path: '/', children: opsRoutes }]
      });
      // What the auth guard checks: every required permission of the target route.
      const allowed = (name: string, params: Record<string, string> = {}) =>
         (router.resolve({ name, params }).meta.requiredPermissions ?? []).every(
            ({ action, subject }) => ability.can(action, subject)
         );

      ability.update([{ action: 'select', subject: 'market_cell' }]);
      expect(allowed('ops-market-cell-edit', { id: 'c1' })).toBe(true);
      expect(allowed('ops-market-list')).toBe(true);
      expect(allowed('ops-market-cell-add')).toBe(false);
      expect(allowed('ops-market-cells-add')).toBe(false);

      ability.update([
         { action: 'select', subject: 'market_cell' },
         { action: 'create', subject: 'market_cell' }
      ]);
      expect(allowed('ops-market-cell-add')).toBe(true);
      expect(allowed('ops-market-cells-add')).toBe(true);
   });
});
