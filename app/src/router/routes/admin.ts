import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

// The super admin's panel: the companies' subscriptions and the plans.
const routes: RouteRecordRaw[] = [
   {
      path: 'admin',
      name: 'admin',
      meta: {
         label: 'route.label.admin',
         icon: PrimeIcons.SHIELD,
         index: 8,
         requiresAuth: true,
         superAdmin: true,
         visible: () => useAuthStore().isSuperAdmin
      },
      components: {
         default: () => import('@/views/pages/admin/Index.vue'),
         skeleton: () => import('@/views/pages/admin/Index.vue')
      },
      children: [
         {
            path: 'subscriptions',
            name: 'admin-subscriptions',
            meta: {
               label: 'route.label.admin_subscriptions',
               icon: PrimeIcons.CREDIT_CARD,
               index: 1
            },
            component: CustomRouteView,
            redirect: { name: 'admin-subscription-list' },
            children: [
               {
                  path: 'list',
                  name: 'admin-subscription-list',
                  meta: {
                     label: 'route.label.admin_subscription_list',
                     visible: false,
                     index: -1,
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/admin/subscriptions/Index.vue'),
                     skeleton: () => import('@/views/pages/admin/subscriptions/Index.vue')
                  }
               },
               {
                  path: ':companyId/manage',
                  name: 'admin-subscription-manage',
                  props: true,
                  meta: {
                     label: 'route.label.admin_subscription_manage',
                     visible: false,
                     icon: PrimeIcons.COG
                  },
                  components: {
                     default: () => import('@/views/pages/admin/subscriptions/Manage.vue'),
                     skeleton: () => import('@/views/pages/admin/subscriptions/Manage.vue')
                  }
               }
            ]
         },
         {
            path: 'plans',
            name: 'admin-plans',
            meta: {
               label: 'route.label.admin_plans',
               icon: PrimeIcons.BOX,
               index: 2,
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'admin-plan-add',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'admin-plan-list' },
            children: [
               {
                  path: 'list',
                  name: 'admin-plan-list',
                  meta: {
                     label: 'route.label.admin_plan_list',
                     visible: false,
                     index: -1,
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/admin/plans/Index.vue'),
                     skeleton: () => import('@/views/pages/admin/plans/Index.vue')
                  }
               },
               {
                  path: 'add',
                  name: 'admin-plan-add',
                  meta: {
                     label: 'route.label.add',
                     visible: false,
                     icon: PrimeIcons.PLUS
                  },
                  components: {
                     default: () => import('@/views/pages/admin/plans/Upsert.vue'),
                     skeleton: () => import('@/views/pages/admin/plans/Upsert.vue')
                  }
               },
               {
                  path: ':id/edit',
                  name: 'admin-plan-edit',
                  props: true,
                  meta: {
                     label: 'route.label.edit',
                     visible: false,
                     icon: PrimeIcons.FILE_EDIT
                  },
                  components: {
                     default: () => import('@/views/pages/admin/plans/Upsert.vue'),
                     skeleton: () => import('@/views/pages/admin/plans/Upsert.vue')
                  }
               }
            ]
         }
      ]
   }
];

export default routes;
