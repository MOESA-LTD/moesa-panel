import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

const routes: RouteRecordRaw[] = [
   {
      path: 'service',
      name: 'service',
      component: CustomRouteView,
      meta: {
         label: 'route.label.service',
         index: Infinity,
         requiresAuth: true,
         icon: PrimeIcons.FILE,
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
                     category: 'service'
                  }
               }
            }
         ]
      },
      redirect: { name: 'service-list' },
      children: [
         {
            path: 'list',
            name: 'service-list',
            components: {
               default: () => import('@/views/pages/stock/service/Index.vue'),
               skeleton: () => import('@/views/pages/stock/service/Index.vue')
            },
            meta: {
               label: 'route.label.service_list',
               visible: false,
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
