import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

// A member is opened in the branch of their row (`tenant` query): a member of several branches is
// listed once per branch. Without it, in the user's own branch (managed_in).
const memberProps = (route: RouteLocationNormalized) => ({
   ...route.params,
   tenant: route.query.tenant ?? null
});

const routes: RouteRecordRaw[] = [
   {
      path: 'branch',
      name: 'branch',
      meta: {
         label: 'route.label.branch',
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
               label: 'route.label.branch-profile',
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
            path: 'branches',
            name: 'branch-tree',
            meta: {
               label: 'route.label.branch-tree',
               icon: PrimeIcons.SITEMAP
            },
            component: CustomRouteView,
            redirect: { name: 'branch-tree-list' },
            children: [
               {
                  path: 'list',
                  name: 'branch-tree-list',
                  meta: {
                     label: 'route.label.branch_tree_list',
                     visible: false,
                     index: -1,
                     icon: PrimeIcons.LIST
                  },
                  components: {
                     default: () => import('@/views/pages/branch/branches/Index.vue'),
                     skeleton: () => import('@/views/pages/branch/branches/Index.vue')
                  }
               },
               {
                  // Opening a branch is up to the owners of the one above (checked by the form).
                  path: ':parentId/add',
                  name: 'branch-tree-add',
                  props: true,
                  meta: {
                     label: 'route.label.branch_tree_add',
                     visible: false,
                     icon: PrimeIcons.PLUS
                  },
                  components: {
                     default: () => import('@/views/pages/branch/branches/Upsert.vue'),
                     skeleton: () => import('@/views/pages/branch/branches/Upsert.vue')
                  }
               },
               {
                  path: ':id/edit',
                  name: 'branch-tree-edit',
                  props: true,
                  meta: {
                     label: 'route.label.edit',
                     visible: false,
                     icon: PrimeIcons.FILE_EDIT
                  },
                  components: {
                     default: () => import('@/views/pages/branch/branches/Upsert.vue'),
                     skeleton: () => import('@/views/pages/branch/branches/Upsert.vue')
                  }
               }
            ]
         },
         {
            path: 'user',
            name: 'branch-user',
            meta: {
               label: 'route.label.branch-user',
               icon: PrimeIcons.USER,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'user'
                  }
               ],
               contextMenuItems: [
                  {
                     label: 'action.add',
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
                     label: 'route.label.branch_user_list',
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
                  props: { default: memberProps, skeleton: memberProps },
                  meta: {
                     label: 'route.label.manage-user',
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
                        props: { default: memberProps, skeleton: memberProps },
                        meta: {
                           label: 'route.label.user-general-info',
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
               label: 'route.label.branch-role',
               icon: PrimeIcons.LOCK,
               requiredPermissions: [
                  {
                     action: 'select',
                     subject: 'role'
                  }
               ],
               contextMenuItems: [
                  {
                     label: 'action.add',
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
                     label: 'route.label.branch_role_list',
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
                     label: 'route.label.add',
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
                     label: 'route.label.edit',
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
               label: 'route.label.audit-logs',
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
                     label: 'route.label.audit_log_list',
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

export default routes;
