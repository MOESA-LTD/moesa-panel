import type { RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';

const routes: RouteRecordRaw[] = [
   {
      path: 'account',
      name: 'account',
      meta: {
         label: 'route.label.account',
         index: 10,
         icon: PrimeIcons.ID_CARD,
         layout: 'dashboard',
         requiresAuth: true,
         visible: () => useAuthStore().isSignedIn
      },
      components: {
         default: () => import('@/views/pages/account/Index.vue')
      },
      children: [
         {
            path: 'profile',
            name: 'account-profile',
            meta: {
               label: 'route.label.profile',
               icon: PrimeIcons.USER,
               index: 1
            },
            components: {
               default: () => import('@/views/pages/account/profile/Index.vue'),
               skeleton: () => import('@/views/pages/account/profile/Index.vue')
            }
         },
         {
            path: 'settings',
            name: 'account-settings',
            meta: {
               label: 'route.label.settings',
               icon: PrimeIcons.COG,
               index: 2
            },
            redirect: { name: 'update-profile' },
            component: CustomRouteView,
            children: [
               {
                  path: 'update-profile',
                  name: 'update-profile',
                  meta: {
                     label: 'route.label.update-profile',
                     icon: PrimeIcons.USER_EDIT
                  },
                  components: {
                     default: () =>
                        import('@/views/pages/account/settings/update-profile/Index.vue')
                  }
               },
               {
                  path: 'update-password',
                  name: 'update-password',
                  meta: {
                     label: 'route.label.update-password',
                     icon: PrimeIcons.LOCK
                  },
                  components: {
                     default: () =>
                        import('@/views/pages/account/settings/update-password/Index.vue')
                  }
               }
            ]
         }
      ]
   }
];

export default routes;
