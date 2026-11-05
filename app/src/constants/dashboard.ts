import { PrimeIcons } from '@primevue/core/api';
import { defineAsyncComponent, type Component, type InjectionKey, type Ref } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

/** Every dashboard box, in today's order (the default layout). */
export const DASHBOARD_BOX_IDS = [
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
] as const;

export type DashboardBoxId = (typeof DASHBOARD_BOX_IDS)[number];

export type BoxSize = 'narrow' | 'wide';

export const BOX_SIZES: readonly BoxSize[] = ['narrow', 'wide'];

/** The business area a box belongs to; it picks the box's colours. */
export type DashboardArea =
   | 'projects'
   | 'products'
   | 'supply'
   | 'logistics'
   | 'incidents'
   | 'change_requests'
   | 'market'
   | 'notifications';

// Full class strings, so Tailwind's content scan finds them.
export const DASHBOARD_AREA_CLASSES: Record<DashboardArea, { icon: string; badge: string }> = {
   projects: {
      icon: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
      badge: 'bg-blue-600 text-white'
   },
   products: {
      icon: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
      badge: 'bg-teal-600 text-white'
   },
   supply: {
      icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
      badge: 'bg-amber-600 text-white'
   },
   logistics: {
      icon: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
      badge: 'bg-sky-600 text-white'
   },
   incidents: {
      icon: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
      badge: 'bg-red-600 text-white'
   },
   change_requests: {
      icon: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
      badge: 'bg-violet-600 text-white'
   },
   market: {
      icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
      badge: 'bg-emerald-600 text-white'
   },
   notifications: {
      icon: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
      badge: 'bg-slate-600 text-white'
   }
};

/** How many rows a box lists at each size; the badge still shows the full count. */
export const ROW_LIMIT: Record<BoxSize, number> = { narrow: 4, wide: 8 };

/** Where a user's dashboard layout is kept in the browser. */
export const layoutStorageKey = (userId: string): string => `dashboard.layout.${userId}`;

/** True while the dashboard is being edited; boxes then render their links inert. Absent = not editing. */
export const DASHBOARD_EDITING: InjectionKey<Readonly<Ref<boolean>>> = Symbol('dashboard-editing');

export type DashboardBoxDef = {
   id: DashboardBoxId;
   /** i18n key */
   title: string;
   icon: string;
   area: DashboardArea;
   size: BoxSize;
   /** CASL subject, checked with the action 'read'. */
   permission: string;
   /** The list page behind the box, for its "Open all" link. */
   to?: RouteLocationRaw;
   /** The dashboard guide's task that says how to clear this box. */
   guideTask?: string;
   component: Component;
};

export type DashboardRow = {
   code: string;
   context?: string;
   tag?: string;
   urgent?: boolean;
   to: RouteLocationRaw;
   /** Runs before the row navigates to `to` (e.g. to set a filter the target page reads). */
   onSelect?: () => void;
};

// Loaded on first render, so the registry itself imports no API code.
const GatesBox = defineAsyncComponent(() => import('@/views/pages/dashboard/boxes/GatesBox.vue'));
const TasksBox = defineAsyncComponent(() => import('@/views/pages/dashboard/boxes/TasksBox.vue'));
const EvidenceBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/EvidenceBox.vue')
);
const PurchaseOrdersBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/PurchaseOrdersBox.vue')
);
const ShipmentsBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/ShipmentsBox.vue')
);
const IncidentsBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/IncidentsBox.vue')
);
const ChangeRequestsBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/ChangeRequestsBox.vue')
);
const MarketBox = defineAsyncComponent(() => import('@/views/pages/dashboard/boxes/MarketBox.vue'));
const NotificationsBox = defineAsyncComponent(
   () => import('@/views/pages/dashboard/boxes/NotificationsBox.vue')
);

/** Every dashboard box, in `DASHBOARD_BOX_IDS` order (today's layout). */
export const DASHBOARD_BOXES: readonly DashboardBoxDef[] = [
   {
      id: 'gates_team',
      title: 'dashboard.ops.gates_team',
      icon: PrimeIcons.FLAG,
      area: 'projects',
      size: 'narrow',
      permission: 'project_gate',
      to: { name: 'ops-project-list' },
      guideTask: 'close_gates',
      component: GatesBox
   },
   {
      id: 'gates_management',
      title: 'dashboard.ops.gates_management',
      icon: PrimeIcons.BRIEFCASE,
      area: 'projects',
      size: 'narrow',
      permission: 'project_gate',
      to: { name: 'ops-project-list' },
      guideTask: 'close_gates',
      component: GatesBox
   },
   {
      id: 'gates_customer',
      title: 'dashboard.ops.gates_customer',
      icon: PrimeIcons.USER,
      area: 'projects',
      size: 'narrow',
      permission: 'project_gate',
      to: { name: 'ops-project-list' },
      guideTask: 'close_gates',
      component: GatesBox
   },
   {
      id: 'tasks_overdue',
      title: 'dashboard.ops.tasks_overdue',
      icon: PrimeIcons.EXCLAMATION_TRIANGLE,
      area: 'projects',
      size: 'narrow',
      permission: 'project_task',
      guideTask: 'close_tasks',
      component: TasksBox
   },
   {
      id: 'tasks_due_soon',
      title: 'dashboard.ops.tasks_due_soon',
      icon: PrimeIcons.CLOCK,
      area: 'projects',
      size: 'narrow',
      permission: 'project_task',
      guideTask: 'close_tasks',
      component: TasksBox
   },
   {
      id: 'unsigned_skus',
      title: 'dashboard.ops.unsigned_skus',
      icon: PrimeIcons.FILE_EDIT,
      area: 'products',
      size: 'narrow',
      permission: 'product',
      to: { name: 'ops-product-list', query: { spec: 'false' } },
      guideTask: 'sign_spec',
      component: EvidenceBox
   },
   {
      id: 'incomplete_compliance',
      title: 'dashboard.ops.incomplete_compliance',
      icon: PrimeIcons.SHIELD,
      area: 'products',
      size: 'narrow',
      permission: 'product',
      to: { name: 'ops-product-list' },
      guideTask: 'complete_compliance',
      component: EvidenceBox
   },
   {
      id: 'po_action',
      title: 'dashboard.ops.po_action',
      icon: PrimeIcons.SHOPPING_CART,
      area: 'supply',
      size: 'narrow',
      permission: 'purchase_order',
      to: { name: 'ops-purchase-order-list' },
      guideTask: 'advance_po',
      component: PurchaseOrdersBox
   },
   {
      id: 'po_production',
      title: 'dashboard.ops.po_production',
      icon: PrimeIcons.COG,
      area: 'supply',
      size: 'narrow',
      permission: 'purchase_order',
      to: { name: 'ops-purchase-order-list' },
      guideTask: 'advance_po',
      component: PurchaseOrdersBox
   },
   {
      id: 'shipments_in_transit',
      title: 'dashboard.ops.shipments_in_transit',
      icon: PrimeIcons.SEND,
      area: 'logistics',
      size: 'narrow',
      permission: 'shipment',
      to: { name: 'ops-shipment-list' },
      guideTask: 'track_shipment',
      component: ShipmentsBox
   },
   {
      id: 'shipments_late',
      title: 'dashboard.ops.shipments_late',
      icon: PrimeIcons.EXCLAMATION_TRIANGLE,
      area: 'logistics',
      size: 'narrow',
      permission: 'shipment',
      to: { name: 'ops-shipment-list' },
      guideTask: 'track_shipment',
      component: ShipmentsBox
   },
   {
      id: 'incidents_open',
      title: 'dashboard.ops.incidents_open',
      icon: PrimeIcons.EXCLAMATION_CIRCLE,
      area: 'incidents',
      size: 'narrow',
      permission: 'incident',
      to: { name: 'ops-incident-list' },
      guideTask: 'close_incident',
      component: IncidentsBox
   },
   {
      id: 'change_requests_open',
      title: 'dashboard.ops.change_requests_open',
      icon: PrimeIcons.SYNC,
      area: 'change_requests',
      size: 'narrow',
      permission: 'change_request',
      to: { name: 'ops-change-request-list' },
      guideTask: 'decide_cr',
      component: ChangeRequestsBox
   },
   {
      id: 'market_summary',
      title: 'dashboard.ops.market_summary',
      icon: PrimeIcons.TABLE,
      area: 'market',
      size: 'narrow',
      permission: 'market_cell',
      to: { name: 'ops-market-list' },
      guideTask: 'update_market',
      component: MarketBox
   },
   {
      id: 'notifications',
      title: 'dashboard.notifications.title',
      icon: PrimeIcons.BELL,
      area: 'notifications',
      size: 'narrow',
      permission: 'audit_log',
      to: { name: 'branch-audit-log-list' },
      component: NotificationsBox
   }
];

/** The registry entry of a box. */
export const boxById = (id: DashboardBoxId): DashboardBoxDef =>
   DASHBOARD_BOXES.find((box) => box.id === id)!;
