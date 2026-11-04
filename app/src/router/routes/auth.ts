import type { RouteRecordRaw } from 'vue-router';
import { logoutBeforeEnter } from '@/router/middlewares/before-enter/logout';

const routes: RouteRecordRaw[] = [
   {
      path: '',
      name: 'auth',
      meta: {
         layout: 'dashboard',
         requiresAuth: false
      },
      components: {
         default: () => import('@/views/pages/auth/Index.vue'),
         'layout-sidebar': () => import('@/layouts/dashboard/Sidebar.vue'),
         'layout-topbar': () => import('@/layouts/dashboard/Topbar.vue')
      },
      children: [
         {
            path: 'register',
            name: 'auth-register',
            meta: {
               label: 'route.label.register',
               replace: true
            },
            components: {
               default: () => import('@/views/pages/auth/register/Index.vue')
            },
            beforeEnter: logoutBeforeEnter
         },
         {
            path: 'login',
            name: 'auth-login',
            meta: {
               label: 'route.label.login',
               icon: PrimeIcons.SIGN_IN,
               replace: true
            },
            component: () => import('@/views/pages/auth/Login.vue'),
            beforeEnter: logoutBeforeEnter
         },
         {
            path: 'otp',
            name: 'auth-otp',
            meta: {
               requiresAuth: false,
               label: 'route.label.enter-auth-otp-code',
               icon: PrimeIcons.KEY,
               replace: true
            },
            alias: ['forgot-password', 'invite-code'],
            component: () => import('@/views/pages/auth/Otp.vue'),
            beforeEnter: logoutBeforeEnter
         }
      ]
   },
   {
      path: 'access-denied',
      name: 'access-denied',
      meta: {
         label: 'route.label.access-denied',
         layout: 'dashboard',
         requiresAuth: false
      },
      components: {
         default: () => import('@/views/pages/auth/Access.vue'),
         'layout-sidebar': () => import('@/layouts/dashboard/Sidebar.vue'),
         'layout-topbar': () => import('@/layouts/dashboard/Topbar.vue')
      }
   }
];

export default routes;
