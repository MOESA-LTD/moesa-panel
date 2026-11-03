import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { createRouter, createWebHistory } from 'vue-router';
import { beforeEachMiddlewares } from './middlewares';

import { appErrorHandler } from '@/lib/appErrorHandler';
import accountRoutes from '@/router/routes/account';
import adminRoutes from '@/router/routes/admin';
import authRoutes from '@/router/routes/auth';
import branchRoutes from '@/router/routes/branch';
import opsRoutes from '@/router/routes/ops';
import subscriptionRoutes from '@/router/routes/subscription';

const router = createRouter({
   history: createWebHistory(),
   routes: [
      {
         path: `/:locale(${SUPPORTED_LOCALES.value.map((lang) => lang.value).join('|')})?`,
         children: [
            {
               path: ``,
               component: () => import('@/layouts/AppLayout.vue'),
               children: [
                  {
                     path: '',
                     meta: {
                        layout: 'dashboard',
                        requiresAuth: true,
                        visible: () => useAuthStore().isSignedIn
                     },
                     redirect: { name: 'dashboard' },
                     components: {
                        default: CustomRouteView,
                        'layout-topbar': () => import('@/layouts/dashboard/Topbar.vue'),
                        'layout-sidebar': () => import('@/layouts/dashboard/Sidebar.vue'),
                        'layout-footer': () => import('@/layouts/dashboard/Footer.vue'),
                        'page-header': () => import('@/components/layout/AppBreadcrumb.vue')
                     },
                     children: [
                        {
                           path: 'dashboard',
                           name: 'dashboard',
                           meta: {
                              label: 'route.label.dashboard',
                              icon: PrimeIcons.CHART_LINE,
                              index: -999,
                              visible: () => useAuthStore().isSignedIn
                           },
                           components: {
                              default: () => import('@/views/pages/dashboard/Index.vue'),
                              skeleton: () => import('@/views/pages/dashboard/Index.vue')
                           }
                        },
                        ...branchRoutes,
                        ...opsRoutes,
                        ...accountRoutes,
                        ...subscriptionRoutes,
                        ...adminRoutes
                     ]
                  },
                  ...authRoutes,
                  {
                     path: '',
                     meta: {
                        layout: 'dashboard',
                        visible: false
                     },
                     children: [
                        {
                           path: 'error',
                           name: 'error',
                           meta: {
                              label: 'route.label.error'
                           },
                           components: {
                              default: () => import('@/views/pages/Error.vue'),
                              'layout-topbar': () => import('@/layouts/dashboard/Topbar.vue'),
                              'layout-sidebar': () => import('@/layouts/dashboard/Sidebar.vue'),
                              'layout-footer': () => import('@/layouts/dashboard/Footer.vue')
                              // 'page-header': () => import('@/components/layout/AppBreadcrumb.vue')
                           }
                        },
                        {
                           path: `:pathMatch(.*)*`,
                           name: 'notfound',
                           meta: {
                              label: 'route.label.notfound'
                           },
                           components: {
                              default: () => import('@/views/pages/NotFound.vue'),
                              'layout-topbar': () => import('@/layouts/dashboard/Topbar.vue'),
                              'layout-footer': () => import('@/layouts/dashboard/Footer.vue')
                              // 'page-header': () => import('@/components/layout/AppBreadcrumb.vue')
                           }
                        }
                     ]
                  }
               ]
            }
         ]
      }
   ]
});

beforeEachMiddlewares.forEach((middleware) => {
   router.beforeEach(middleware);
});

router.onError(async (error) => {
   const status = (error as { status?: number })?.status;

   switch (status) {
      case 401: {
         await router.replace({ name: 'auth-login' });
         break;
      }

      case 403: {
         await appErrorHandler(error);
         await router.push({ name: 'access-denied' });
         break;
      }

      default: {
         await appErrorHandler(error);
         router.push({ name: 'error' });
         break;
      }
   }
});

export default router;
