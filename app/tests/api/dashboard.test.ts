import {
   evidenceTarget,
   groupGates,
   groupPurchaseOrders,
   groupShipments,
   marketSummary,
   splitTasks,
   type DashboardGateRow,
   type DashboardMarketRow,
   type DashboardTaskRow
} from '@/api/dashboard';
import { affectedTables } from '@/api/queryKeys';
import { describe, expect, it } from 'vitest';

const gate = (
   gate_id: string,
   needs_management: boolean,
   needs_customer_approval: boolean
): DashboardGateRow => ({ gate_id, needs_management, needs_customer_approval }) as DashboardGateRow;

const task = (task_id: string, overdue: boolean): DashboardTaskRow =>
   ({ task_id, overdue }) as DashboardTaskRow;

describe('groupGates', () => {
   it('puts management gates first, then the customer approvals, and the rest to the team', () => {
      const groups = groupGates([
         gate('team', false, false),
         gate('management', true, true),
         gate('customer', false, true)
      ]);
      expect(groups.management.map((row) => row.gate_id)).toEqual(['management']);
      expect(groups.customer.map((row) => row.gate_id)).toEqual(['customer']);
      expect(groups.team.map((row) => row.gate_id)).toEqual(['team']);
   });

   it('keeps the order of the rows within each group', () => {
      const groups = groupGates([gate('a', false, false), gate('b', false, false)]);
      expect(groups.team.map((row) => row.gate_id)).toEqual(['a', 'b']);
      expect(groups.management).toEqual([]);
      expect(groups.customer).toEqual([]);
   });
});

describe('splitTasks', () => {
   it('splits overdue tasks from the ones due soon', () => {
      const { overdue, dueSoon } = splitTasks([task('late', true), task('soon', false)]);
      expect(overdue.map((row) => row.task_id)).toEqual(['late']);
      expect(dueSoon.map((row) => row.task_id)).toEqual(['soon']);
   });
});

describe('groupPurchaseOrders', () => {
   it('puts the orders waiting for action apart from those in production, keeping their order', () => {
      const { action, production } = groupPurchaseOrders([
         { status: 'sent' as const },
         { status: 'ready' as const },
         { status: 'pi_approved' as const }
      ]);
      expect(action.map((row) => row.status)).toEqual(['sent', 'pi_approved']);
      expect(production.map((row) => row.status)).toEqual(['ready']);
   });
});

describe('groupShipments', () => {
   it('lists the shipments on the way and, apart, every late one', () => {
      const { inTransit, late } = groupShipments([
         { status: 'in_transit' as const, overdue: true },
         { status: 'booked' as const, overdue: true }
      ]);
      expect(inTransit.map((row) => row.status)).toEqual(['in_transit']);
      expect(late.map((row) => row.status)).toEqual(['in_transit', 'booked']);
   });
});

describe('marketSummary', () => {
   it('sums the live cells and keeps the customers with a target', () => {
      const { live, items } = marketSummary([
         { customer_code: 'THO', live_count: 1, target_count: 3 },
         { customer_code: 'ZZZ', live_count: 4, target_count: 4 },
         { customer_code: 'NIL', live_count: 0, target_count: 0 }
      ] as DashboardMarketRow[]);
      expect(live).toBe(5);
      expect(items.map((row) => row.customer_code)).toEqual(['ZZZ', 'THO']);
   });
});

describe('evidenceTarget', () => {
   it("opens the product list narrowed to the row's customer", () => {
      expect(evidenceTarget({ customer_id: 'c1' })).toEqual({
         customerId: 'c1',
         route: { name: 'ops-product-list' }
      });
   });

   it('opens the unsigned SKU card on the products without a signed spec sheet', () => {
      expect(evidenceTarget({ customer_id: 'c1' }, 'unsigned_spec')).toEqual({
         customerId: 'c1',
         route: { name: 'ops-product-list', query: { spec: 'false' } }
      });
   });

   it('clears the customer filter for a row without a customer', () => {
      expect(evidenceTarget({ customer_id: null }).customerId).toBeNull();
   });
});

describe('dashboard query invalidation', () => {
   it('refreshes the dashboard views when gates, tasks, products or documents change', () => {
      expect(affectedTables(['project_gate'])).toEqual(
         expect.arrayContaining(['project', 'dashboard_gate_pending'])
      );
      expect(affectedTables(['project_task'])).toContain('dashboard_task_due');
      expect(affectedTables(['product'])).toContain('dashboard_product_evidence');
      expect(affectedTables(['document'])).toContain('dashboard_product_evidence');
      expect(affectedTables(['product'])).toContain('product_with_evidence');
      expect(affectedTables(['document'])).toContain('product_with_evidence');
      expect(affectedTables(['purchase_order_line'])).toContain('dashboard_purchase_order');
      expect(affectedTables(['shipment'])).toContain('dashboard_shipment');
   });
});
