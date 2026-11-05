import '../setup/mockMain';
import {
   evidenceTarget,
   type DashboardEvidenceRow,
   type DashboardGateRow,
   type DashboardIncidentRow,
   type DashboardMarketRow,
   type DashboardTaskRow
} from '@/api/dashboard';
import en from '@/plugins/i18n/locales/en/index.json';
import { useBoxView } from '@/views/pages/dashboard/boxes/useBoxView';
import {
   evidenceView,
   feedPreview,
   gatesView,
   incidentsView,
   marketView,
   tasksView
} from '@/views/pages/dashboard/boxes/views';
import i18n from '@plugins/i18n';
import { mount } from '@vue/test-utils';
import { beforeAll, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

const gate = (project_code: string, needs_management: boolean, needs_customer_approval: boolean) =>
   ({
      project_code,
      gate_code: 'G2',
      customer_code: 'THO',
      waiting_days: 4,
      project_id: 'p',
      needs_management,
      needs_customer_approval
   }) as DashboardGateRow;
const task = (project_code: string, days_left: number) =>
   ({
      project_code,
      display_name: 'Spec',
      days_left,
      overdue: days_left < 0,
      project_id: 'p'
   }) as DashboardTaskRow;
const evidence = (customer_id: string, unsigned_sku_count: number) =>
   ({
      customer_id,
      customer_code: customer_id.toUpperCase(),
      unsigned_sku_count,
      active_sku_count: 0,
      compliance_complete_count: 0
   }) as DashboardEvidenceRow;
beforeAll(() => i18n.setLocaleMessage('en', en));

it('picks the management gates and counts them all', () => {
   const v = gatesView(
      [gate('A', true, false), gate('B', false, false), gate('C', true, true)],
      'gates_management'
   );
   expect(v.count).toBe(2);
   expect(v.rows.map((r) => r.code)).toEqual(['A', 'C']);
   expect(v.rows[0]).toMatchObject({
      context: `${i18n.t('ops.project.gate.G2')} · THO`,
      tag: i18n.t('dashboard.ops.waiting_days', { days: 4 })
   });
});
it('marks overdue tasks urgent with their days late', () => {
   const [row] = tasksView([task('A', -3), task('B', 2)], 'tasks_overdue').rows;
   expect(row).toMatchObject({
      code: 'A',
      tag: i18n.t('dashboard.ops.days_overdue', { days: 3 }),
      urgent: true
   });
   expect(tasksView([task('A', -3), task('B', 2)], 'tasks_due_soon').rows[0].urgent).toBeFalsy();
});
it('sums the SKUs per customer, most first, and sets the customer filter before opening the list', () => {
   const setCustomer = vi.fn();
   const v = evidenceView(setCustomer)(
      [evidence('a', 1), evidence('b', 0), evidence('c', 5)],
      'unsigned_skus'
   );
   expect(v.count).toBe(6);
   expect(v.rows.map((r) => [r.code, r.tag])).toEqual([
      ['C', '5'],
      ['A', '1']
   ]);
   expect(v.rows[0].to).toEqual(evidenceTarget({ customer_id: 'c' }, 'unsigned_spec').route);
   v.rows[0].onSelect!();
   expect(setCustomer).toHaveBeenCalledWith('c');
});
it('counts live market cells and is empty without targets', () => {
   const v = marketView(vi.fn())([
      { customer_id: 'a', live_count: 3, target_count: 0 } as DashboardMarketRow
   ]);
   expect(v).toMatchObject({ count: 3, empty: true, rows: [] });
});
it('marks an incident urgent when management was not told', () => {
   const [row] = incidentsView([
      {
         code: 'INC-1',
         title: 'Leak',
         severity: 's1',
         management_notice_missing: true,
         incident_id: 'i'
      } as DashboardIncidentRow
   ]).rows;
   expect(row.urgent).toBe(true);
   expect(row.tag).toContain(i18n.t('dashboard.ops.meta.notice_missing'));
});
it('a box component runs its hook and hands the view to the shell', () => {
   const rows = ref([gate('A', false, false)]);
   const useRows = vi.fn(() => ({ data: rows }));
   const Shell = defineComponent({
      props: ['box', 'size', 'count', 'rows'],
      template: '<p>{{ count }}:{{ rows.map((r) => r.code).join() }}</p>'
   });
   const Probe = defineComponent({
      props: ['box', 'size'],
      setup: (props) => ({ view: useBoxView(props.box, useRows, gatesView) }),
      components: { Shell },
      template: '<Shell :box="box" :size="size" v-bind="view" />'
   });
   const w = mount(Probe, { props: { box: { id: 'gates_team' }, size: 'narrow' } });
   expect(useRows).toHaveBeenCalledOnce();
   expect(w.text()).toBe('1:A');
});
it('previews the first items of the feed, grouped by period', () => {
   const items = [
      { id: 1, since: 'today' },
      { id: 2, since: 'today' },
      { id: 3, since: 'older' },
      { id: 4, since: 'older' }
   ];
   expect(feedPreview(items, 3)).toEqual([
      { since: 'today', items: items.slice(0, 2) },
      { since: 'older', items: [items[2]] }
   ]);
});
