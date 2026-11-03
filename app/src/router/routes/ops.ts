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
            path: 'customers',
            name: 'ops-customer',
            meta: {
               label: 'route.label.ops_customer',
               icon: PrimeIcons.USERS,
               requiredPermissions: [{ action: 'select', subject: 'customer' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-customer-manage',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-customer-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-customer-list',
                  meta: {
                     label: 'route.label.ops_customer_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'customer' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/Index.vue')
                  }
               },
               {
                  // The customer card: its tabs open on their own as these child routes.
                  path: ':id?/manage/:tab?',
                  name: 'ops-customer-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_manage',
                     icon: PrimeIcons.USERS,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'customer' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/Manage.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'ops-customer-manage-general',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_general',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/General.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/General.vue')
                        }
                     },
                     {
                        path: 'contacts',
                        name: 'ops-customer-manage-contacts',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_contacts',
                           icon: PrimeIcons.USERS,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Contacts.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Contacts.vue')
                        }
                     },
                     {
                        path: 'warehouses',
                        name: 'ops-customer-manage-warehouses',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_warehouses',
                           icon: PrimeIcons.BUILDING,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Warehouses.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Warehouses.vue')
                        }
                     },
                     {
                        path: 'platforms',
                        name: 'ops-customer-manage-platforms',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_platforms',
                           icon: PrimeIcons.SHOP,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Platforms.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Platforms.vue')
                        }
                     },
                     {
                        path: 'brands',
                        name: 'ops-customer-manage-brands',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_brands',
                           icon: PrimeIcons.TAG,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Brands.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Brands.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-customer-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Documents.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Documents.vue')
                        }
                     }
                  ]
               },
               {
                  path: ':customerId/contact/add',
                  name: 'ops-customer-contact-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_contact_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'customer_contact' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/ContactUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/ContactUpsert.vue')
                  }
               },
               {
                  path: 'contact/:id/edit',
                  name: 'ops-customer-contact-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_contact_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'customer_contact' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/ContactUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/ContactUpsert.vue')
                  }
               },
               {
                  path: ':customerId/warehouse/add',
                  name: 'ops-customer-warehouse-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_warehouse_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'customer_warehouse' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/WarehouseUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/WarehouseUpsert.vue')
                  }
               },
               {
                  path: 'warehouse/:id/edit',
                  name: 'ops-customer-warehouse-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_warehouse_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'customer_warehouse' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/WarehouseUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/WarehouseUpsert.vue')
                  }
               },
               {
                  path: ':customerId/platform-account/add',
                  name: 'ops-customer-platform-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_platform_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [
                        { action: 'create', subject: 'customer_platform_account' }
                     ]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/PlatformUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/PlatformUpsert.vue')
                  }
               },
               {
                  path: 'platform-account/:id/edit',
                  name: 'ops-customer-platform-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_platform_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [
                        { action: 'modify', subject: 'customer_platform_account' }
                     ]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/PlatformUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/PlatformUpsert.vue')
                  }
               },
               {
                  path: ':customerId/brand/add',
                  name: 'ops-customer-brand-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_brand_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'customer_brand' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/BrandUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/BrandUpsert.vue')
                  }
               },
               {
                  path: 'brand/:id/edit',
                  name: 'ops-customer-brand-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_customer_brand_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'customer_brand' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/customer/BrandUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/customer/BrandUpsert.vue')
                  }
               }
            ]
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
            path: 'products',
            name: 'ops-product',
            meta: {
               label: 'route.label.ops_product',
               icon: PrimeIcons.BOX,
               requiredPermissions: [{ action: 'select', subject: 'product' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-product-manage',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-product-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-product-list',
                  meta: {
                     label: 'route.label.ops_product_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'product' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/product/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/product/Index.vue')
                  }
               },
               {
                  // The product card: its tabs open on their own as these child routes.
                  path: ':id?/manage/:tab?',
                  name: 'ops-product-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_product_manage',
                     icon: PrimeIcons.BOX,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'product' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/product/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/product/Manage.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'ops-product-manage-general',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_general',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/General.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/General.vue')
                        }
                     },
                     {
                        path: 'dimensions',
                        name: 'ops-product-manage-dimensions',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_dimensions',
                           icon: PrimeIcons.ARROWS_ALT,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/Dimensions.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/Dimensions.vue')
                        }
                     },
                     {
                        path: 'cost',
                        name: 'ops-product-manage-cost',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_cost',
                           icon: PrimeIcons.EURO,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/Cost.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/Cost.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-product-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/Documents.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/Documents.vue')
                        }
                     }
                  ]
               }
            ]
         },
         {
            // An S10 product file, imported whole or not at all (see public.import_products).
            path: 'product/import',
            name: 'ops-product-import',
            meta: {
               label: 'route.label.ops_product_import',
               icon: PrimeIcons.UPLOAD,
               visible: false,
               requiredPermissions: [{ action: 'create', subject: 'product' }]
            },
            components: {
               default: () => import('@/views/pages/ops/product/Import.vue'),
               skeleton: () => import('@/views/pages/ops/product/Import.vue')
            }
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
