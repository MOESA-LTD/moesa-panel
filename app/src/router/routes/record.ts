import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

/**
 * @type {import('vue-router').RouteRecordNormalized[]}
 */
const routes: RouteRecordRaw[] = [
   {
      path: 'record',
      name: 'record',
      component: CustomRouteView,
      meta: {
         label: 'route.label.record',
         icon: PrimeIcons.FOLDER,
         requiresAuth: true,
         requiredPermissions: [
            {
               action: 'read',
               subject: 'record'
            },
            {
               action: 'read',
               subject: 'stock'
            },
            {
               action: 'read',
               subject: 'product'
            }
         ],
         contextMenuItems: [
            {
               label: 'action.add',
               route: {
                  name: 'record-add',
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }
            }
         ]
      },
      redirect: { name: 'record-list' },
      children: [
         {
            path: ':record_type?/:record_status?',
            name: 'record-list',
            components: {
               default: () => import('@/views/pages/record/index.vue'),
               skeleton: () => import('@/views/pages/record/index.vue')
            },
            props: true,
            meta: {
               label: 'route.label.record_list',
               icon: PrimeIcons.LIST,
               visible: false
            }
         },
         {
            path: 'add',
            name: 'record-add',
            props: true,
            meta: {
               label: 'route.label.record_add',
               visible: false,
               icon: PrimeIcons.PLUS,
               requiredPermissions: [
                  {
                     action: 'create',
                     subject: 'record'
                  }
               ]
            },
            components: {
               default: () => import('@/views/pages/record/upsert/index.vue'),
               skeleton: () => import('@/views/pages/record/upsert/index.vue')
            }
         },
         {
            path: ':id?/edit',
            name: 'record-edit',
            props: true,
            meta: {
               label: 'route.label.record_edit',
               visible: false,
               icon: PrimeIcons.PENCIL,
               requiredPermissions: [
                  {
                     action: 'read',
                     subject: 'record'
                  },
                  {
                     action: 'modify',
                     subject: 'record'
                  }
               ]
            },
            components: {
               default: () => import('@/views/pages/record/upsert/index.vue'),
               skeleton: () => import('@/views/pages/record/upsert/index.vue')
            }
         }
      ]
   }
];

export default routes;
