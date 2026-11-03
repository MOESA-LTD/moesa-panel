import { queryKeys, type TableName } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { supabase } from '@/lib/supabase';
import { useCustomerFilter } from '@/store/customerFilter';
import { useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

export type DashboardGateRow = Views['dashboard_gate_pending']['Row'];
export type DashboardTaskRow = Views['dashboard_task_due']['Row'];
export type DashboardEvidenceRow = Views['dashboard_product_evidence']['Row'];

type DashboardView = Extract<
   TableName,
   'dashboard_gate_pending' | 'dashboard_task_due' | 'dashboard_product_evidence'
>;

/** A dashboard view's rows, narrowed to the customer of the global customer filter when one is set. */
function useDashboardView<Row>(
   view: DashboardView,
   order?: { column: string; ascending: boolean }
) {
   const tenantKey = useTenantKey();
   const { customerId } = storeToRefs(useCustomerFilter());

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantKey.value, view, { customerId: customerId.value })
      ),
      queryFn: async ({ signal }) => {
         let query = supabase.from(view).select('*').abortSignal(signal);
         if (customerId.value) query = query.eq('customer_id', customerId.value);
         if (order) query = query.order(order.column, { ascending: order.ascending });
         const { data } = await query.throwOnError();
         return (data ?? []) as Row[];
      }
   });
}

/** The gate each active project waits on, longest waiting first. */
export const useDashboardGates = () =>
   useDashboardView<DashboardGateRow>('dashboard_gate_pending', {
      column: 'waiting_days',
      ascending: false
   });

/** The open tasks due within five days (overdue ones included), earliest first. */
export const useDashboardTasks = () =>
   useDashboardView<DashboardTaskRow>('dashboard_task_due', { column: 'due_on', ascending: true });

/** Per customer, the evidence behind its active products. */
export const useDashboardEvidence = () =>
   useDashboardView<DashboardEvidenceRow>('dashboard_product_evidence');

/**
 * Who has to act on each pending gate: management (a management gate), else the customer (an (M)
 * gate waiting for their approval), else the team. Each group keeps the rows' order.
 */
export function groupGates<
   Row extends Pick<DashboardGateRow, 'needs_management' | 'needs_customer_approval'>
>(rows: readonly Row[]) {
   const groups = { management: [] as Row[], customer: [] as Row[], team: [] as Row[] };
   for (const row of rows) {
      if (row.needs_management) groups.management.push(row);
      else if (row.needs_customer_approval) groups.customer.push(row);
      else groups.team.push(row);
   }
   return groups;
}

/** The tasks past their due date, and those due within the next five days. */
export function splitTasks<Row extends Pick<DashboardTaskRow, 'overdue'>>(rows: readonly Row[]) {
   return {
      overdue: rows.filter((row) => row.overdue),
      dueSoon: rows.filter((row) => !row.overdue)
   };
}
