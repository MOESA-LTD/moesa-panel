import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

const routes: RouteRecordRaw[] = [
   {
      path: 'battery',
      name: 'battery',
      component: CustomRouteView,
      meta: {
         label: 'route.label.battery',
         requiresAuth: true,
         icon: PrimeIcons.BOLT,
         requiredPermissions: [
            {
               action: 'select',
               subject: 'stock'
            }
         ],
         contextMenuItems: [
            {
               label: 'action.add',
               route: {
                  name: 'stock-add',
                  query: { showDialog: DIALOG_POSITIONS.CENTER },
                  params: {
                     category: 'battery'
                  }
               }
            }
         ]
      },
      redirect: { name: 'battery-list' },
      children: [
         {
            path: 'list',
            name: 'battery-list',
            components: {
               default: () => import('@/views/pages/stock/battery/Index.vue'),
               skeleton: () => import('@/views/pages/stock/battery/Index.vue')
            },
            meta: {
               visible: false,
               label: 'route.label.battery_list',
               index: -1,
               icon: PrimeIcons.LIST,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'stock'
                  }
               ]
            }
         }
      ]
   }
];

export default routes;
