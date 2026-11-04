<script setup lang="ts">
import {
   evidenceTarget,
   groupGates,
   groupPurchaseOrders,
   groupShipments,
   splitTasks,
   useDashboardEvidence,
   useDashboardGates,
   useDashboardPurchaseOrders,
   useDashboardShipments,
   useDashboardTasks,
   type DashboardEvidenceRow,
   type DashboardGateRow,
   type DashboardPurchaseOrderRow,
   type DashboardShipmentRow,
   type DashboardTaskRow
} from '@/api/dashboard';
import CountListCard, {
   type CountListItem
} from '@/components/service-components/dashboard/CountListCard.vue';
import { useDialogRef } from '@/composables/useDialogRef';
import { fieldRoutes } from '@/constants/form/field';
import { DIALOG_POSITIONS } from '@/constants/router';
import { appErrorHandler } from '@/lib/appErrorHandler';
import { useCustomerFilter } from '@/store/customerFilter';
import dayjs from 'dayjs';
import { RouteLocationAsRelativeGeneric } from 'vue-router';

const dialogRef = useDialogRef();

// --- weekly rhythm (M6): gates, tasks and product evidence ---

const projectTab = (projectId: string | null, tab: 'overview' | 'tasks') => ({
   name: 'ops-project-manage',
   params: { id: projectId ?? '', tab },
   query: { showDialog: DIALOG_POSITIONS.CENTER }
});

const gateItem = (row: DashboardGateRow): CountListItem => ({
   label: [row.project_code, i18n.t(`ops.project.gate.${row.gate_code}`), row.customer_code]
      .filter(Boolean)
      .join(' · '),
   meta: i18n.t('dashboard.ops.waiting_days', { days: row.waiting_days ?? 0 }),
   to: projectTab(row.project_id, 'overview')
});

const taskMeta = ({ days_left }: DashboardTaskRow) => {
   const days = days_left ?? 0;
   if (days < 0) return i18n.t('dashboard.ops.days_overdue', { days: -days });
   if (days === 0) return i18n.t('dashboard.ops.due_today');
   return i18n.t('dashboard.ops.days_left', { days });
};

const taskItem = (row: DashboardTaskRow): CountListItem => ({
   label: [row.project_code, row.display_name].filter(Boolean).join(' · '),
   meta: taskMeta(row),
   to: projectTab(row.project_id, 'tasks')
});

const { data: gateRows } = useDashboardGates();
const { data: taskRows } = useDashboardTasks();
const { data: evidenceRows } = useDashboardEvidence();

const gates = computed(() => groupGates(gateRows.value ?? []));
const tasks = computed(() => splitTasks(taskRows.value ?? []));

const customerFilter = useCustomerFilter();

/**
 * Per customer, how many SKUs `count` finds, as rows opening the product list narrowed to that
 * customer (through the global customer filter) and to what the card counts (see evidenceTarget).
 */
const evidenceBox = (
   count: (row: DashboardEvidenceRow) => number,
   card: Parameters<typeof evidenceTarget>[1]
) => {
   const rows = (evidenceRows.value ?? [])
      .map((row) => ({ row, n: count(row) }))
      .filter(({ n }) => n > 0)
      .sort((a, b) => b.n - a.n);
   return {
      count: _sumBy(rows, 'n'),
      items: rows.map(({ row, n }): CountListItem => {
         const { customerId, route } = evidenceTarget(row, card);
         return {
            label: row.customer_code ?? '',
            meta: String(n),
            to: route,
            onSelect: () => customerFilter.set(customerId)
         };
      })
   };
};

const unsignedSkus = computed(() =>
   evidenceBox((row) => row.unsigned_sku_count ?? 0, 'unsigned_spec')
);
const incompleteCompliance = computed(() =>
   evidenceBox(
      (row) => (row.active_sku_count ?? 0) - (row.compliance_complete_count ?? 0),
      'compliance'
   )
);

// --- orders and shipments (M6): waiting for action, in production, on the way and late ---

/** A dashboard date, day and month only (DD.MM). */
const dayMonth = (date: string) => dayjs(date).format('DD.MM');

const orderItem = (row: DashboardPurchaseOrderRow, meta: string): CountListItem => ({
   label: [row.code, row.supplier_code, row.customer_code].filter(Boolean).join(' · '),
   meta,
   to: {
      name: 'ops-purchase-order-manage',
      params: { id: row.purchase_order_id ?? '' },
      query: { showDialog: DIALOG_POSITIONS.CENTER }
   }
});

/** An order waiting for action, with its status. */
const actionOrderItem = (row: DashboardPurchaseOrderRow) =>
   orderItem(row, row.status ? i18n.t(`ops.purchase_order.status.${row.status}`) : '');

/** An order in production, with its ready date and its planned balance date when they are set. */
const productionOrderItem = (row: DashboardPurchaseOrderRow) =>
   orderItem(
      row,
      [
         row.ready_on && i18n.t('dashboard.ops.meta.ready', { date: dayMonth(row.ready_on) }),
         row.balance_planned_on &&
            i18n.t('dashboard.ops.meta.balance', { date: dayMonth(row.balance_planned_on) })
      ]
         .filter(Boolean)
         .join(' · ')
   );

const shipmentItem = (row: DashboardShipmentRow, meta: string): CountListItem => ({
   label: [row.code, row.customer_code].filter(Boolean).join(' · '),
   meta,
   to: {
      name: 'ops-shipment-manage',
      params: { id: row.shipment_id ?? '' },
      query: { showDialog: DIALOG_POSITIONS.CENTER }
   }
});

/** A shipment on the way, with its ETA. */
const inTransitShipmentItem = (row: DashboardShipmentRow) =>
   shipmentItem(row, row.eta ? i18n.t('dashboard.ops.meta.eta', { date: dayMonth(row.eta) }) : '');

/** A late shipment, with the days since its ETA. */
const lateShipmentItem = (row: DashboardShipmentRow) =>
   shipmentItem(row, i18n.t('dashboard.ops.meta.late', { n: -(row.days_to_eta ?? 0) }));

const { data: orderRows } = useDashboardPurchaseOrders();
const { data: shipmentRows } = useDashboardShipments();

const orders = computed(() => groupPurchaseOrders(orderRows.value ?? []));
const shipments = computed(() => groupShipments(shipmentRows.value ?? []));

const useDashboardNotifications = () => {
   const getTagProps = (item: Views['dashboard_notification_feed']['Row']) => {
      switch (_toLower(item?.activity ?? undefined)) {
         case 'updated':
            return { icon: PrimeIcons.SYNC, severity: 'info' };
         case 'deleted':
            return { icon: PrimeIcons.MINUS, severity: 'danger' };
         case 'created':
            return { icon: PrimeIcons.PLUS, severity: 'success' };
         case 'unknown':
            return { icon: PrimeIcons.PLUS, severity: 'warn' };
      }
   };

   const getNotificationResourceRoute = (
      notification: Views['dashboard_notification_feed']['Row']
   ): Partial<RouteLocationAsRelativeGeneric> => {
      const { old_data, new_data, resource_id, table_name } = notification;
      const name = fieldRoutes[table_name ?? '']?.name;
      const field = fieldRoutes[table_name ?? '']?.field;
      const id = (
         field ? _get(new_data, field, _get(old_data, field, resource_id)) : resource_id
      ) as string;
      const params = {
         id
      };
      return {
         name,
         params,
         query: { showDialog: 'center' }
      };
   };

   /** The user's name, else "user"; writes made outside the app (no user) read as the system. */
   const getUserLabel = (notification: Views['dashboard_notification_feed']['Row']) =>
      notification.user_name ||
      i18n.t(notification.user_id ? 'fields.user' : 'dashboard.notifications.system');

   const title = computed(() => ({
      today: i18n.t('dashboard.notifications.today'),
      yesterday: i18n.t('dashboard.notifications.yesterday'),
      last_week: i18n.t('dashboard.notifications.last_week'),
      older: i18n.t('dashboard.notifications.older')
   }));

   // Replaced as a whole; shallowRef also avoids unwrapping the nested Json types.
   const data = shallowRef<Views['dashboard_notification_feed']['Row'][]>([]);
   const loading = ref(false);
   const SINCE = ['today', 'yesterday', 'last_week', 'older'];
   const load = async () => {
      try {
         // The latest five of each period, fetched in parallel.
         const groups = await Promise.all(
            SINCE.map((since) =>
               supabase
                  .from('dashboard_notification_feed')
                  .select('*')
                  .eq('since', since)
                  .order('created_at', { ascending: false })
                  .limit(5)
                  .throwOnError()
                  .then((res) => res.data ?? [])
            )
         );
         data.value = groups.flat();
      } catch (error) {
         console.error('Error fetching dashboard notifications:', error);
         appErrorHandler(error);
      } finally {
         loading.value = false;
      }
   };
   return {
      load,
      getTagProps,
      getNotificationResourceRoute,
      getUserLabel,
      data,
      loading,
      title
   };
};

const dashboardNotifications = useDashboardNotifications();
dashboardNotifications.load();
</script>

<template>
   <div
      class="bg-[var(--surface-ground)] flex flex-col gap-4"
      :class="{
         'p-4': !!dialogRef
      }"
   >
      <div class="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[inherit] items-start">
         <CountListCard
            v-if="$can('read', 'project_gate')"
            :title="$t('dashboard.ops.gates_team')"
            :count="gates.team.length"
            :items="gates.team.map(gateItem)"
            :icon="PrimeIcons.FLAG"
            severity="info"
         />
         <CountListCard
            v-if="$can('read', 'project_gate')"
            :title="$t('dashboard.ops.gates_management')"
            :count="gates.management.length"
            :items="gates.management.map(gateItem)"
            :icon="PrimeIcons.BRIEFCASE"
            severity="warn"
         />
         <CountListCard
            v-if="$can('read', 'project_gate')"
            :title="$t('dashboard.ops.gates_customer')"
            :count="gates.customer.length"
            :items="gates.customer.map(gateItem)"
            :icon="PrimeIcons.USER"
            severity="secondary"
         />
         <CountListCard
            v-if="$can('read', 'project_task')"
            :title="$t('dashboard.ops.tasks_overdue')"
            :count="tasks.overdue.length"
            :items="tasks.overdue.map(taskItem)"
            :icon="PrimeIcons.EXCLAMATION_TRIANGLE"
            severity="danger"
         />
         <CountListCard
            v-if="$can('read', 'project_task')"
            :title="$t('dashboard.ops.tasks_due_soon')"
            :count="tasks.dueSoon.length"
            :items="tasks.dueSoon.map(taskItem)"
            :icon="PrimeIcons.CLOCK"
            severity="warn"
         />
         <CountListCard
            v-if="$can('read', 'product')"
            :title="$t('dashboard.ops.unsigned_skus')"
            :count="unsignedSkus.count"
            :items="unsignedSkus.items"
            :icon="PrimeIcons.FILE_EDIT"
            severity="danger"
         />
         <CountListCard
            v-if="$can('read', 'product')"
            :title="$t('dashboard.ops.incomplete_compliance')"
            :count="incompleteCompliance.count"
            :items="incompleteCompliance.items"
            :icon="PrimeIcons.SHIELD"
            severity="warn"
         />
         <CountListCard
            v-if="$can('read', 'purchase_order')"
            :title="$t('dashboard.ops.po_action')"
            :count="orders.action.length"
            :items="orders.action.map(actionOrderItem)"
            :icon="PrimeIcons.SHOPPING_CART"
            severity="warn"
         />
         <CountListCard
            v-if="$can('read', 'purchase_order')"
            :title="$t('dashboard.ops.po_production')"
            :count="orders.production.length"
            :items="orders.production.map(productionOrderItem)"
            :icon="PrimeIcons.COG"
            severity="info"
         />
         <CountListCard
            v-if="$can('read', 'shipment')"
            :title="$t('dashboard.ops.shipments_in_transit')"
            :count="shipments.inTransit.length"
            :items="shipments.inTransit.map(inTransitShipmentItem)"
            :icon="PrimeIcons.SEND"
            severity="info"
         />
         <CountListCard
            v-if="$can('read', 'shipment')"
            :title="$t('dashboard.ops.shipments_late')"
            :count="shipments.late.length"
            :items="shipments.late.map(lateShipmentItem)"
            :icon="PrimeIcons.EXCLAMATION_TRIANGLE"
            severity="danger"
         />
      </div>
      <div class="w-full flex flex-wrap gap-[inherit]">
         <TotalRowCountCard
            v-if="$can('read', 'tenant')"
            class="flex-[1_20%] lg:flex-[1_15%]"
            :title="$t('dashboard.statistics.branches')"
            from="tenant"
            :icon="PrimeIcons.SITEMAP"
         />
         <TotalRowCountCard
            v-if="$can('read', 'user')"
            class="flex-[1_20%] lg:flex-[1_15%]"
            :title="$t('dashboard.statistics.users')"
            from="user"
            :icon="PrimeIcons.USERS"
         />
         <TotalRowCountCard
            v-if="$can('read', 'role')"
            class="flex-[1_20%] lg:flex-[1_15%]"
            :title="$t('dashboard.statistics.roles')"
            from="role"
            :icon="PrimeIcons.SHIELD"
         />
      </div>
      <div class="flex-1 flex flex-wrap gap-[inherit] items-start">
         <Card
            v-if="$can('read', 'audit_log') && !_isEmpty(dashboardNotifications.data.value)"
            class="flex-[1_49%]"
         >
            <template #title>
               <div class="flex items-center justify-between gap-4 mb-4">
                  {{ $t('dashboard.notifications.title') }}
               </div>
            </template>
            <template #content>
               <template
                  v-for="(notifications, since) in _groupBy(
                     dashboardNotifications.data.value,
                     (n) => n.since
                  )"
                  :key="since"
               >
                  <span
                     class="block text-muted-color font-medium my-2"
                     v-text="_get(dashboardNotifications.title.value, since)"
                  />
                  <div
                     class="flex flex-col gap-4"
                     v-for="(notification, index) in notifications"
                     :key="notification.id ?? index"
                  >
                     <ul class="p-0 mx-0 mt-0 mb-6 list-none">
                        <li class="flex items-center gap-4 py-2">
                           <Tag
                              class="w-12 aspect-square !rounded-full"
                              v-bind="dashboardNotifications.getTagProps(notification)"
                              :pt="{
                                 icon: {
                                    class: '!text-2xl !w-[unset] !h-[unset]'
                                 }
                              }"
                           />
                           <i18n-t
                              :keypath="`dashboard.notifications.activity.${notification.activity as unknown as any}`"
                              tag="span"
                              class="lowercase first-letter:!capitalize [&>a]:inline-flex"
                           >
                              <template #resource_name>
                                 <CustomLink
                                    v-if="
                                       $can('read', notification.table_name ?? '') &&
                                       !_isEqual(notification.operation, 'DELETE') &&
                                       !!_get(notification, 'resource_id') &&
                                       !!fieldRoutes[notification.table_name ?? '']
                                    "
                                    :to="
                                       dashboardNotifications.getNotificationResourceRoute(
                                          notification
                                       )
                                    "
                                    v-slot="{ navigate }"
                                 >
                                    <Button
                                       variant="link"
                                       size="small"
                                       fluid
                                       class="!px-0"
                                       :label="$t(`fields.${notification.table_name}`)"
                                       @click="navigate"
                                    />
                                 </CustomLink>
                                 <span v-else> {{ $t(`fields.${notification.table_name}`) }}</span>
                              </template>
                              <template #user_name>
                                 <CustomLink
                                    v-if="$can('read', `user`) && _get(notification, `user_id`)"
                                    :to="{
                                       name: 'branch-user-manage',
                                       params: { id: _get(notification, `user_id`) },
                                       query: { showDialog: 'center' }
                                    }"
                                    v-slot="{ navigate }"
                                 >
                                    <Button
                                       variant="link"
                                       size="small"
                                       fluid
                                       class="!px-0 !text-primary-emphasis-alt"
                                       :label="dashboardNotifications.getUserLabel(notification)"
                                       @click="navigate"
                                    />
                                 </CustomLink>
                                 <span
                                    v-else
                                    v-text="dashboardNotifications.getUserLabel(notification)"
                                 />
                              </template>
                           </i18n-t>
                        </li>
                     </ul>
                  </div>
               </template>
            </template>
         </Card>
      </div>
   </div>
</template>
