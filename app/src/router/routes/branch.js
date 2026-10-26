import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '../../constants/router';

/**
 * @type {import('vue-router').RouteLocation[]}
 */
export default [
   {
      path: 'branch',
      name: 'branch',
      component: CustomRouteView,
      meta: {
         label: i18n.t('route.label.branch'),
         index: -1,
         icon: PrimeIcons.BUILDING,
         requiresAuth: true
      },
      components: {
         default: () => import('@/views/pages/branch/Index.vue'),
         skeleton: () => import('@/views/pages/branch/Index.vue')
      },
      children: [
         {
            path: 'branch',
            name: 'branch-profile',
            meta: {
               index: -1,
               label: i18n.t('route.label.branch-profile'),
               icon: 'pi pi-building-columns',
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'tenant'
                  }
               ]
            },
            components: {
               default: () => import('@/views/pages/branch/profile/index.vue'),
               skeleton: () => import('@/views/pages/branch/profile/index.vue')
            }
         },
         {
            path: 'user',
            name: 'branch-user',
            meta: {
               label: i18n.t('route.label.branch-user'),
               icon: PrimeIcons.USER,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'user'
                  }
               ],
               contextMenuItems: [
                  {
                     label: i18n.t('action.add'),
                     route: {
                        name: 'branch-manage-user-general',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'branch-user-list' },
            children: [
               {
                  path: 'list',
                  name: 'branch-user-list',
                  meta: {
                     visible: false,
                     label: i18n.t('route.label.branch_user_list'),
                     requiredPermissions: [
                        {
                           action: 'select',
                           subject: 'user'
                        }
                     ],
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/branch/user/Index.vue'),
                     skeleton: () => import('@/views/pages/branch/user/Index.vue')
                  }
               },
               {
                  path: ':id?/manage/:tab?',
                  name: 'branch-user-manage',
                  props: true,
                  meta: {
                     label: i18n.t('route.label.manage-user'),
                     visible: false
                  },
                  components: {
                     default: () => import('@/views/pages/branch/user/upsert/Index.vue'),
                     skeleton: () => import('@/views/pages/branch/user/upsert/Index.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'branch-manage-user-general',
                        props: true,
                        meta: {
                           label: i18n.t('route.label.user-general-info'),
                           icon: PrimeIcons.USER,
                           visible: false
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/branch/user/upsert/tabs/General.vue'),
                           skeleton: () =>
                              import('@/views/pages/branch/user/upsert/tabs/General.vue')
                        }
                     }
                  ]
               }
            ]
         },
         {
            path: 'role',
            name: 'branch-role',
            meta: {
               label: i18n.t('route.label.branch-role'),
               icon: PrimeIcons.LOCK,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'role'
                  }
               ],
               contextMenuItems: [
                  {
                     label: i18n.t('action.add'),
                     route: {
                        name: 'branch-role-add',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'branch-role-list' },
            children: [
               {
                  path: 'list',
                  name: 'branch-role-list',
                  meta: {
                     label: i18n.t('route.label.branch_role_list'),
                     visible: false,
                     index: -1,
                     requiredPermissions: [
                        {
                           action: 'select',
                           subject: 'role'
                        },
                        {
                           action: 'select',
                           subject: 'role_permission'
                        }
                     ],
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/branch/role/Index.vue'),
                     skeleton: () => import('@/views/pages/branch/role/Index.vue')
                  }
               },
               {
                  path: 'add',
                  name: 'branch-role-add',
                  meta: {
                     label: i18n.t('route.label.add'),
                     visible: false,
                     icon: PrimeIcons.PLUS,
                     requiredPermissions: [
                        {
                           action: 'create',
                           subject: 'role'
                        },
                        {
                           action: 'create',
                           subject: 'role_permission'
                        }
                     ]
                  },
                  components: {
                     default: () => import('@/views/pages/branch/role/Upsert.vue'),
                     skeleton: () => import('@/views/pages/branch/role/Upsert.vue')
                  }
               },
               {
                  path: ':id?/edit',
                  name: 'branch-role-edit',
                  props: true,
                  meta: {
                     label: i18n.t('route.label.edit'),
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [
                        {
                           action: 'modify',
                           subject: 'role'
                        },
                        {
                           action: 'modify',
                           subject: 'role_permission'
                        }
                     ]
                  },
                  components: {
                     default: () => import('@/views/pages/branch/role/Upsert.vue'),
                     skeleton: () => import('@/views/pages/branch/role/Upsert.vue')
                  }
               }
            ]
         },
         {
            path: 'audit-log',
            name: 'branch-audit-log',
            meta: {
               label: i18n.t('route.label.audit-logs'),
               icon: PrimeIcons.HISTORY,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'audit_log'
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'branch-audit-log-list' },
            children: [
               {
                  path: 'list',
                  name: 'branch-audit-log-list',
                  meta: {
                     label: i18n.t('route.label.audit_log_list'),
                     visible: false,
                     index: -1,
                     requiredPermissions: [
                        {
                           action: 'select',
                           subject: 'audit_log'
                        }
                     ],
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/branch/audit_log/Index.vue'),
                     skeleton: () => import('@/views/pages/branch/audit_log/Index.vue')
                  }
               }
            ]
         }
      ]
   }
];
