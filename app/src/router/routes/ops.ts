import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
   {
      path: 'ops',
      name: 'ops',
      meta: {
         label: 'route.label.ops',
         icon: PrimeIcons.BRIEFCASE,
         requiresAuth: true,
         // A section of several modules: shown to anyone who may read one of them.
         anyPermission: [
            { action: 'select', subject: 'customer' },
            { action: 'select', subject: 'product' },
            { action: 'select', subject: 'setting' }
         ]
      },
      components: {
         default: () => import('@/views/pages/ops/Index.vue'),
         skeleton: () => import('@/views/pages/ops/Index.vue')
      },
      children: [
         {
            path: 'settings',
            name: 'ops-setting',
            meta: {
               label: 'route.label.ops_setting',
               icon: PrimeIcons.COG,
               requiredPermissions: [{ action: 'select', subject: 'setting' }]
            },
            components: {
               default: () => import('@/views/pages/ops/setting/Index.vue'),
               skeleton: () => import('@/views/pages/ops/setting/Index.vue')
            }
         }
      ]
   }
];

export default routes;
