import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import CustomRouteView from '@/components/layout/CustomRouteView.vue';
import { DIALOG_POSITIONS } from '@/constants/router';

// A document is opened from its record's list (see EntityDocuments), which passes the record in
// the query: what it belongs to and the code its file is named after.
const documentProps = (route: RouteLocationNormalized) => ({
   ...route.params,
   entity_type: route.query.entity_type ?? null,
   entity_id: route.query.entity_id ?? null,
   customer_id: route.query.customer_id ?? null,
   code: route.query.code ?? null
});

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
            { action: 'select', subject: 'supplier' },
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
         },
         {
            path: 'suppliers',
            name: 'ops-supplier',
            meta: {
               label: 'route.label.ops_supplier',
               icon: PrimeIcons.TRUCK,
               requiredPermissions: [{ action: 'select', subject: 'supplier' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-supplier-manage',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-supplier-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-supplier-list',
                  meta: {
                     label: 'route.label.ops_supplier_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'supplier' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/supplier/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/supplier/Index.vue')
                  }
               },
               {
                  // The supplier card: its tabs open on their own as these child routes.
                  path: ':id?/manage/:tab?',
                  name: 'ops-supplier-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_supplier_manage',
                     icon: PrimeIcons.TRUCK,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'supplier' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/supplier/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/supplier/Manage.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'ops-supplier-manage-general',
                        props: true,
                        meta: {
                           label: 'route.label.ops_supplier_general',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/supplier/tabs/General.vue'),
                           skeleton: () => import('@/views/pages/ops/supplier/tabs/General.vue')
                        }
                     },
                     {
                        path: 'contacts',
                        name: 'ops-supplier-manage-contacts',
                        props: true,
                        meta: {
                           label: 'route.label.ops_supplier_contacts',
                           icon: PrimeIcons.USERS,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/supplier/tabs/Contacts.vue'),
                           skeleton: () => import('@/views/pages/ops/supplier/tabs/Contacts.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-supplier-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_supplier_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/supplier/tabs/Documents.vue'),
                           skeleton: () => import('@/views/pages/ops/supplier/tabs/Documents.vue')
                        }
                     }
                  ]
               },
               {
                  path: ':supplierId/contact/add',
                  name: 'ops-supplier-contact-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_supplier_contact_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'supplier_contact' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/supplier/ContactUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/supplier/ContactUpsert.vue')
                  }
               },
               {
                  path: 'contact/:id/edit',
                  name: 'ops-supplier-contact-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_supplier_contact_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'supplier_contact' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/supplier/ContactUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/supplier/ContactUpsert.vue')
                  }
               }
            ]
         },
         {
            path: 'document/add',
            name: 'ops-document-add',
            props: { default: documentProps, skeleton: documentProps },
            meta: {
               label: 'route.label.ops_document_add',
               icon: PrimeIcons.PLUS,
               visible: false,
               requiredPermissions: [{ action: 'create', subject: 'document' }]
            },
            components: {
               default: () => import('@/views/pages/ops/document/Upsert.vue'),
               skeleton: () => import('@/views/pages/ops/document/Upsert.vue')
            }
         },
         {
            path: 'document/:id/edit',
            name: 'ops-document-edit',
            props: { default: documentProps, skeleton: documentProps },
            meta: {
               label: 'route.label.ops_document_edit',
               icon: PrimeIcons.FILE_EDIT,
               visible: false,
               requiredPermissions: [{ action: 'modify', subject: 'document' }]
            },
            components: {
               default: () => import('@/views/pages/ops/document/Upsert.vue'),
               skeleton: () => import('@/views/pages/ops/document/Upsert.vue')
            }
         }
      ]
   }
];

export default routes;
