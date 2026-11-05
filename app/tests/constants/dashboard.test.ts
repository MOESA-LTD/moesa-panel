import { boxById, DASHBOARD_AREA_CLASSES, DASHBOARD_BOXES } from '@/constants/dashboard';
import { PAGE_GUIDES } from '@/constants/guide';
import en from '@/plugins/i18n/locales/en/index.json';
import branchRoutes from '@/router/routes/branch';
import opsRoutes from '@/router/routes/ops';
import { expect, it } from 'vitest';
import type { RouteRecordRaw } from 'vue-router';

const lookup = (tree: unknown, path: string): unknown =>
   path
      .split('.')
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
const routeNames = (routes: RouteRecordRaw[]): string[] =>
   routes.flatMap((r) => [
      ...(typeof r.name === 'string' ? [r.name] : []),
      ...routeNames(r.children ?? [])
   ]);

it("has unique ids in today's order", () => {
   expect(DASHBOARD_BOXES.map((b) => b.id)).toEqual([
      'gates_team',
      'gates_management',
      'gates_customer',
      'tasks_overdue',
      'tasks_due_soon',
      'unsigned_skus',
      'incomplete_compliance',
      'po_action',
      'po_production',
      'shipments_in_transit',
      'shipments_late',
      'incidents_open',
      'change_requests_open',
      'market_summary',
      'notifications'
   ]);
   expect(new Set(DASHBOARD_BOXES.map((b) => b.id)).size).toBe(DASHBOARD_BOXES.length);
});
it('gives every box a permission, a component, a narrow default, an area colour and an existing title', () => {
   for (const b of DASHBOARD_BOXES) {
      expect(b.permission).toMatch(/^[a-z_]+$/);
      expect(b.component).toBeTruthy();
      expect(b.size).toBe('narrow');
      expect(DASHBOARD_AREA_CLASSES[b.area]).toBeDefined();
      expect(lookup(en, b.title)).toEqual(expect.any(String));
   }
   expect(boxById('unsigned_skus').area).toBe('products');
   expect(boxById('incomplete_compliance').area).toBe('products');
});
it('points every "open all" route and guide task at something that exists', () => {
   const names = routeNames([...opsRoutes, ...branchRoutes]);
   const guideTasks = PAGE_GUIDES.dashboard.tasks.map((t) => t.id);
   for (const b of DASHBOARD_BOXES) {
      if (b.to) expect(names).toContain((b.to as { name: string }).name);
      if (b.guideTask) expect(guideTasks).toContain(b.guideTask);
   }
   expect(boxById('tasks_overdue').to).toBeUndefined();
});
