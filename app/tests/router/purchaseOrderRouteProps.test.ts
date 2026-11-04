import opsRoutes from '@/router/routes/ops';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

// A route dialog renders its page outside the router (RouteDialog calls the record's props), so
// the purchase order card gets a project link's customer and project as props.
describe('purchase order card route', () => {
   it("passes the link's customer and project from the query as props", () => {
      const router = createRouter({
         history: createMemoryHistory(),
         routes: [{ path: '/', children: opsRoutes }]
      });
      const route = router.resolve({
         name: 'ops-purchase-order-manage',
         query: { customer_id: 'c1', project_id: 'p1', showDialog: 'center' }
      });
      const record = route.matched.at(-1)!;
      const props = record.props.default as (r: typeof route) => Record<string, unknown>;

      expect(props(route)).toMatchObject({ customer_id: 'c1', project_id: 'p1' });
   });
});
