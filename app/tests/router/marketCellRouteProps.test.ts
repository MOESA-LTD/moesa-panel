import { marketCellProps } from '@/router/routes/ops';
import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';

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
});
