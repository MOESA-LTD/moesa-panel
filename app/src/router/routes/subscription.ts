import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
   {
      path: 'subscription',
      name: 'subscription',
      meta: {
         label: 'route.label.subscription',
         icon: PrimeIcons.CREDIT_CARD,
         index: 9,
         requiresAuth: true,
         // The company's plan concerns its owners.
         visible: () => !!useAuthStore().currentTenant?.owned
      },
      components: {
         default: () => import('@/views/pages/subscription/Index.vue'),
         skeleton: () => import('@/views/pages/subscription/Index.vue')
      }
   },
   {
      // A page of a module outside the company's plan (see the auth guard).
      path: 'subscription/locked/:module',
      name: 'module-locked',
      props: true,
      meta: {
         label: 'route.label.module_locked',
         icon: PrimeIcons.LOCK,
         requiresAuth: true,
         visible: false
      },
      components: {
         default: () => import('@/views/pages/subscription/Locked.vue'),
         skeleton: () => import('@/views/pages/subscription/Locked.vue')
      }
   }
];

export default routes;
