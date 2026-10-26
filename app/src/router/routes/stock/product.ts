import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

const routes: RouteRecordRaw[] = [
   {
      path: 'product',
      name: 'product',
      component: CustomRouteView,
      meta: {
         label: 'route.label.product',
         requiresAuth: true,
         index: -1,
         icon: 'pi pi-barcode',
         requiredPermissions: [
            {
               action: 'select',
               subject: 'product'
            }
         ],
         contextMenuItems: [
            {
               label: 'action.add',
               route: {
                  name: 'product-add',
                  query: { showDialog: DIALOG_POSITIONS.CENTER }
               }
            }
         ]
      },
      redirect: { name: 'product-list' },
      children: [
         {
            path: 'list',
            name: 'product-list',
            components: {
               default: () => import('@/views/pages/stock/product/Index.vue'),
               skeleton: () => import('@/views/pages/stock/product/Index.vue')
            },
            meta: {
               label: 'route.label.product_list',
               visible: false,
               index: -1,
               icon: PrimeIcons.LIST,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'product'
                  }
               ]
            }
         },
         {
            path: ':category?/add',
            name: 'product-add',
            props: true,
            meta: {
               label: 'route.label.product_add',
               visible: false
            },
            components: {
               default: () => import('@/views/pages/stock/product/Upsert.vue'),
               skeleton: () => import('@/views/pages/stock/product/Upsert.vue')
            }
         },
         {
            path: ':id?/edit',
            name: 'product-edit',
            props: true,
            meta: {
               label: 'route.label.product_edit',
               visible: false
            },
            components: {
               default: () => import('@/views/pages/stock/product/Upsert.vue'),
               skeleton: () => import('@/views/pages/stock/product/Upsert.vue')
            }
         }
      ]
   }
];

export default routes;
