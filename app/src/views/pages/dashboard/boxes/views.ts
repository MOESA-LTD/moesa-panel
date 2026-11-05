import {
   evidenceTarget,
   groupGates,
   groupPurchaseOrders,
   groupShipments,
   marketSummary,
   splitTasks,
   type DashboardChangeRequestRow,
   type DashboardEvidenceRow,
   type DashboardGateRow,
   type DashboardIncidentRow,
   type DashboardMarketRow,
   type DashboardPurchaseOrderRow,
   type DashboardShipmentRow,
   type DashboardTaskRow
} from '@/api/dashboard';
import type { DashboardBoxId, DashboardRow } from '@/constants/dashboard';
import { DIALOG_POSITIONS } from '@/constants/router';
import i18n from '@plugins/i18n';
import dayjs from 'dayjs';

/** What a box shows: its badge count, its rows and, when the count is not the test, its emptiness. */
export type BoxView = { count: number; rows: DashboardRow[]; empty?: boolean };

/** Sets the global customer filter (see useCustomerFilter), which the target list pages read. */
export type SetCustomer = (id: string | null) => void;

/** A box over a group's rows: the count is their number. */
const listView = <Row>(rows: readonly Row[], toRow: (row: Row) => DashboardRow): BoxView => ({
   count: rows.length,
   rows: rows.map(toRow)
});

/** The group a box id picks from a grouper's result; no rows for an id of another family. */
const pick = <Row, Key extends string>(
   groups: Record<Key, Row[]>,
   keys: Partial<Record<DashboardBoxId, Key>>,
   id: DashboardBoxId
): Row[] => {
   const key = keys[id];
   return key ? groups[key] : [];
};

/** The non-empty parts, joined with a middle dot. */
const joined = (...parts: (string | null | undefined | false)[]) =>
   parts.filter(Boolean).join(' · ');

/** A dashboard date, day and month only (DD.MM). */
const dayMonth = (date: string) => dayjs(date).format('DD.MM');

/** The manage dialog of an operations record. */
const manage = (name: string, id: string | null) => ({
   name,
   params: { id: id ?? '' },
   query: { showDialog: DIALOG_POSITIONS.CENTER }
});

const projectTab = (projectId: string | null, tab: 'overview' | 'tasks') => ({
   name: 'ops-project-manage',
   params: { id: projectId ?? '', tab },
   query: { showDialog: DIALOG_POSITIONS.CENTER }
});

// --- gates and tasks ---

const GATE_GROUPS = {
   gates_team: 'team',
   gates_management: 'management',
   gates_customer: 'customer'
} as const;

const gateRow = (row: DashboardGateRow): DashboardRow => ({
   code: row.project_code ?? '',
   context: joined(i18n.t(`ops.project.gate.${row.gate_code}`), row.customer_code),
   tag: i18n.t('dashboard.ops.waiting_days', { days: row.waiting_days ?? 0 }),
   to: projectTab(row.project_id, 'overview')
});

/** The pending gates of the box's group (team, management or customer). */
export const gatesView = (rows: readonly DashboardGateRow[], id: DashboardBoxId): BoxView =>
   listView(pick(groupGates(rows), GATE_GROUPS, id), gateRow);

const TASK_GROUPS = { tasks_overdue: 'overdue', tasks_due_soon: 'dueSoon' } as const;

const taskTag = ({ days_left }: DashboardTaskRow) => {
   const days = days_left ?? 0;
   if (days < 0) return i18n.t('dashboard.ops.days_overdue', { days: -days });
   if (days === 0) return i18n.t('dashboard.ops.due_today');
   return i18n.t('dashboard.ops.days_left', { days });
};

const taskRow = (row: DashboardTaskRow): DashboardRow => ({
   code: row.project_code ?? '',
   context: joined(row.display_name),
   tag: taskTag(row),
   urgent: (row.days_left ?? 0) < 0,
   to: projectTab(row.project_id, 'tasks')
});

/** The overdue tasks, or those due within five days. */
export const tasksView = (rows: readonly DashboardTaskRow[], id: DashboardBoxId): BoxView =>
   listView(pick(splitTasks(rows), TASK_GROUPS, id), taskRow);

// --- product evidence ---

type EvidenceCard = {
   skuCountOf: (row: DashboardEvidenceRow) => number;
   card: Parameters<typeof evidenceTarget>[1];
};

const EVIDENCE_CARDS: Partial<Record<DashboardBoxId, EvidenceCard>> = {
   unsigned_skus: { skuCountOf: (row) => row.unsigned_sku_count ?? 0, card: 'unsigned_spec' },
   incomplete_compliance: {
      skuCountOf: (row) => (row.active_sku_count ?? 0) - (row.compliance_complete_count ?? 0),
      card: 'compliance'
   }
};

/**
 * Per customer, how many SKUs the box counts, most first, as rows opening the product list
 * narrowed to that customer (through the global customer filter) and to what the box counts (see
 * evidenceTarget). The count is the SKUs' sum.
 */
export const evidenceView =
   (setCustomer: SetCustomer) =>
   (rows: readonly DashboardEvidenceRow[], id: DashboardBoxId): BoxView => {
      const evidence = EVIDENCE_CARDS[id];
      if (!evidence) return { count: 0, rows: [] };
      const counted = rows
         .map((row) => ({ row, n: evidence.skuCountOf(row) }))
         .filter(({ n }) => n > 0)
         .sort((a, b) => b.n - a.n);
      return {
         count: _sumBy(counted, 'n'),
         rows: counted.map(({ row, n }): DashboardRow => {
            const { customerId, route } = evidenceTarget(row, evidence.card);
            return {
               code: row.customer_code ?? '',
               tag: String(n),
               to: route,
               onSelect: () => setCustomer(customerId)
            };
         })
      };
   };

// --- orders and shipments ---

const ORDER_GROUPS = { po_action: 'action', po_production: 'production' } as const;

/** An order waiting for action shows its status; one in production its ready and balance dates. */
const orderTag = (row: DashboardPurchaseOrderRow, id: DashboardBoxId) => {
   if (id === 'po_action')
      return row.status ? i18n.t(`ops.purchase_order.status.${row.status}`) : '';
   return joined(
      row.ready_on && i18n.t('dashboard.ops.meta.ready', { date: dayMonth(row.ready_on) }),
      row.balance_planned_on &&
         i18n.t('dashboard.ops.meta.balance', { date: dayMonth(row.balance_planned_on) })
   );
};

/** The open orders waiting for action, or those in production. */
export const ordersView = (
   rows: readonly DashboardPurchaseOrderRow[],
   id: DashboardBoxId
): BoxView =>
   listView(pick(groupPurchaseOrders(rows), ORDER_GROUPS, id), (row) => ({
      code: row.code ?? '',
      context: joined(row.supplier_code, row.customer_code),
      tag: orderTag(row, id),
      to: manage('ops-purchase-order-manage', row.purchase_order_id)
   }));

const SHIPMENT_GROUPS = { shipments_in_transit: 'inTransit', shipments_late: 'late' } as const;

/** A shipment on the way shows its ETA; a late one the days since its ETA, and is urgent. */
const shipmentTag = (row: DashboardShipmentRow, late: boolean) => {
   if (late) return i18n.t('dashboard.ops.meta.late', { n: -(row.days_to_eta ?? 0) });
   return row.eta ? i18n.t('dashboard.ops.meta.eta', { date: dayMonth(row.eta) }) : '';
};

/** The shipments on the way, or the late ones. */
export const shipmentsView = (
   rows: readonly DashboardShipmentRow[],
   id: DashboardBoxId
): BoxView => {
   const late = id === 'shipments_late';
   return listView(pick(groupShipments(rows), SHIPMENT_GROUPS, id), (row) => ({
      code: row.code ?? '',
      context: joined(row.customer_code),
      tag: shipmentTag(row, late),
      urgent: late,
      to: manage('ops-shipment-manage', row.shipment_id)
   }));
};

// --- incidents, change requests and the market matrix ---

/**
 * The open incidents, with their severity, then whether management was not told yet (urgent),
 * else their next deadline.
 */
export const incidentsView = (rows: readonly DashboardIncidentRow[]): BoxView =>
   listView(rows, (row) => ({
      code: row.code ?? '',
      context: joined(row.title, row.customer_code),
      tag: joined(
         row.severity && i18n.t(`ops.incident.severity.${row.severity}`),
         row.management_notice_missing
            ? i18n.t('dashboard.ops.meta.notice_missing')
            : row.next_deadline_at &&
                 i18n.t('dashboard.ops.meta.deadline', { date: dayMonth(row.next_deadline_at) })
      ),
      urgent: !!row.management_notice_missing,
      to: manage('ops-incident-manage', row.incident_id)
   }));

/** The open and approved change requests, with their status and their decision date. */
export const changeRequestsView = (rows: readonly DashboardChangeRequestRow[]): BoxView =>
   listView(rows, (row) => ({
      code: row.code ?? '',
      context: joined(row.title, row.customer_code),
      tag: joined(
         row.status && i18n.t(`ops.change_request.status.${row.status}`),
         row.decision_due_on &&
            i18n.t('dashboard.ops.meta.decision_due', { date: dayMonth(row.decision_due_on) })
      ),
      to: manage('ops-change-request-manage', row.change_request_id)
   }));

/**
 * The live market cells of every customer, and the customers with a target as rows opening the
 * matrix narrowed to that customer (the customer filter). Empty when no customer has a target.
 */
export const marketView =
   (setCustomer: SetCustomer) =>
   (rows: readonly DashboardMarketRow[]): BoxView => {
      const { live, items } = marketSummary(rows);
      return {
         count: live,
         empty: items.length === 0,
         rows: items.map((row) => ({
            code: row.customer_code ?? '',
            tag: i18n.t('dashboard.ops.meta.market', {
               live: row.live_count ?? 0,
               preparing: row.preparing_count ?? 0,
               suppressed: row.suppressed_count ?? 0
            }),
            to: { name: 'ops-market-list' },
            onSelect: () => setCustomer(row.customer_id ?? null)
         }))
      };
   };
