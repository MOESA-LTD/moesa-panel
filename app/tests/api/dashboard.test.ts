import {
   evidenceTarget,
   groupGates,
   splitTasks,
   type DashboardGateRow,
   type DashboardTaskRow
} from '@/api/dashboard';
import { affectedTables } from '@/api/queryKeys';
import CountListCard from '@/components/service-components/dashboard/CountListCard.vue';
import en from '@/plugins/i18n/locales/en/index.json';
import i18n, { i18NPlugin } from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

describe('evidenceTarget', () => {
   it("opens the product list narrowed to the row's customer", () => {
      expect(evidenceTarget({ customer_id: 'c1' })).toEqual({
         customerId: 'c1',
         route: { name: 'ops-product-list' }
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
   });
});

describe('CountListCard', () => {
   beforeAll(() => i18n.setLocaleMessage('en', en));

   const navigate = vi.fn();

   const mountCard = (
      count: number,
      items: { label: string; meta?: string; onSelect?: () => void }[] = []
   ) =>
      mount(CountListCard, {
         props: {
            title: 'Overdue tasks',
            count,
            icon: 'pi pi-clock',
            items: items.map((item) => ({ ...item, to: { name: 'dashboard' } }))
         },
         global: {
            plugins: [i18NPlugin, PrimeVue],
            stubs: {
               CustomLink: {
                  setup: () => ({ navigate }),
                  template: '<a><slot :navigate="navigate" /></a>'
               }
            }
         }
      });

   it('says there is none when the count is zero', () => {
      const wrapper = mountCard(0);
      expect(wrapper.text()).toContain(i18n.t('dashboard.ops.none'));
      expect(wrapper.findAll('li')).toHaveLength(0);
   });

   it('lists at most eight rows, each with its meta', () => {
      const items = Array.from({ length: 10 }, (_, index) => ({
         label: `Row ${index}`,
         meta: `${index} days`
      }));
      const wrapper = mountCard(10, items);
      const rows = wrapper.findAll('li');
      expect(rows).toHaveLength(8);
      expect(rows[0].text()).toContain('Row 0');
      expect(rows[0].text()).toContain('0 days');
      expect(wrapper.text()).toContain('10');
      expect(wrapper.text()).not.toContain(i18n.t('dashboard.ops.none'));
   });

   it("runs the row's onSelect before navigating", async () => {
      const calls: string[] = [];
      navigate.mockImplementation(() => calls.push('navigate'));
      const wrapper = mountCard(1, [{ label: 'THO', onSelect: () => calls.push('select') }]);
      await wrapper.find('li button').trigger('click');
      expect(calls).toEqual(['select', 'navigate']);
   });
});
