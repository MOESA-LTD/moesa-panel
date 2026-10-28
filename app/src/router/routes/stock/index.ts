import type { RouteRecordRaw } from 'vue-router';
import batteryRoutes from './battery';
import deviceRoutes from './device';
import productRoutes from './product';
import serviceRoutes from './service';
import sparePartRoutes from './spare-part';

const routes: RouteRecordRaw[] = [
   {
      name: 'stock',
      path: 'stock',
      // Its pages belong to two modules (stock, product) and each needs its own permission, so
      // with one of them outside the plan the other is still reached.
      meta: {
         label: 'route.label.stock',
         icon: 'pi pi-warehouse'
      },
      components: {
         default: () => import('@/views/pages/stock/Index.vue'),
         skeleton: () => import('@/views/pages/stock/Index.vue')
      },
      children: [
         {
            path: ':category?/add',
            name: 'stock-add',
            props: true,
            meta: {
               label: 'route.label.stock_add',
               visible: false,
               requiredPermissions: [{ action: 'select', subject: 'stock' }]
            },
            components: {
               default: () => import('@/views/pages/stock/Upsert.vue'),
               skeleton: () => import('@/views/pages/stock/Upsert.vue')
            }
         },
         {
            path: ':category?/:id?/edit',
            name: 'stock-edit',
            props: true,
            meta: {
               label: 'route.label.stock_edit',
               visible: false,
               requiredPermissions: [{ action: 'select', subject: 'stock' }]
            },
            components: {
               default: () => import('@/views/pages/stock/Upsert.vue'),
               skeleton: () => import('@/views/pages/stock/Upsert.vue')
            }
         },
         ...productRoutes,
         ...deviceRoutes,
         ...sparePartRoutes,
         ...serviceRoutes,
         ...batteryRoutes
      ]
   }
];

export default routes;
