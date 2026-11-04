import type { RouteRecordRaw } from 'vue-router';

/**
 * My account: one page (header + tabs) whose sections are its children. A section is a child
 * route with `meta.label`, `meta.icon` and `meta.index`; the page builds its tabs from them.
 */
const routes: RouteRecordRaw[] = [
   {
      path: 'account',
      name: 'account',
      redirect: { name: 'account-profile' },
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
            meta: { label: 'route.label.profile', icon: PrimeIcons.USER, index: 1 },
            component: () => import('@/views/pages/account/sections/Profile.vue')
         },
         {
            path: 'security',
            name: 'account-security',
            meta: { label: 'route.label.security', icon: PrimeIcons.LOCK, index: 2 },
            component: () => import('@/views/pages/account/sections/Security.vue')
         },
         {
            path: 'preferences',
            name: 'account-preferences',
            meta: { label: 'route.label.preferences', icon: PrimeIcons.SLIDERS_H, index: 3 },
            component: () => import('@/views/pages/account/sections/Preferences.vue')
         },
         {
            path: 'memberships',
            name: 'account-memberships',
            meta: { label: 'route.label.memberships', icon: PrimeIcons.BUILDING, index: 4 },
            component: () => import('@/views/pages/account/sections/Memberships.vue')
         },
         // Old links (bookmarks, e-mails) still open the right section; hidden from every menu.
         { path: 'settings', redirect: { name: 'account-profile' }, meta: { visible: false } },
         {
            path: 'settings/update-profile',
            redirect: { name: 'account-profile' },
            meta: { visible: false }
         },
         {
            path: 'settings/update-password',
            redirect: { name: 'account-security' },
            meta: { visible: false }
         }
      ]
   }
];

export default routes;
