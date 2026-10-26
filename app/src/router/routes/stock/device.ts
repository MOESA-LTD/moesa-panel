import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

const routes: RouteRecordRaw[] = [
   {
      path: 'device',
      name: 'device',
      component: CustomRouteView,
      meta: {
         label: 'route.label.device',
         requiresAuth: true,
         icon: 'pi pi-headphones',
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
                     category: 'device'
                  }
               }
            }
         ]
      },
      redirect: { name: 'device-list' },
      children: [
         {
            path: 'list',
            name: 'device-list',
            components: {
               default: () => import('@/views/pages/stock/device/Index.vue'),
               skeleton: () => import('@/views/pages/stock/device/Index.vue')
            },
            meta: {
               visible: false,
               label: 'route.label.device_list',
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
