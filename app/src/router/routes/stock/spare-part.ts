import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

const routes: RouteRecordRaw[] = [
   {
      path: 'spare-part',
      name: 'spare-part',
      component: CustomRouteView,
      meta: {
         label: 'route.label.spare-parts',
         requiresAuth: true,
         icon: PrimeIcons.WRENCH,
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
                     category: 'spare part'
                  }
               }
            }
         ]
      },
      redirect: { name: 'spare-part-list' },
      children: [
         {
            path: 'list',
            name: 'spare-part-list',
            components: {
               default: () => import('@/views/pages/stock/spare-part/Index.vue'),
               skeleton: () => import('@/views/pages/stock/spare-part/Index.vue')
            },
            meta: {
               label: 'route.label.spare_part_list',
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
