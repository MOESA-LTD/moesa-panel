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

// A shipment line is added for one order line, which the orders tab passes in the query.
const shipmentLineProps = (route: RouteLocationNormalized) => ({
   ...route.params,
   purchaseOrderLineId: route.query.purchaseOrderLineId ?? null
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
            { action: 'select', subject: 'project' },
            { action: 'select', subject: 'purchase_order' },
            { action: 'select', subject: 'shipment' },
            { action: 'select', subject: 'supplier' },
            { action: 'select', subject: 'setting' },
            { action: 'select', subject: 'media' }
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
                     },
                     {
                        path: 'media',
                        name: 'ops-customer-manage-media',
                        props: true,
                        meta: {
                           label: 'route.label.ops_customer_media',
                           icon: PrimeIcons.IMAGES,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/customer/tabs/Media.vue'),
                           skeleton: () => import('@/views/pages/ops/customer/tabs/Media.vue')
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
                     },
                     {
                        path: 'purchase_orders',
                        name: 'ops-supplier-manage-purchase_orders',
                        props: true,
                        meta: {
                           label: 'route.label.ops_supplier_purchase_orders',
                           icon: PrimeIcons.SHOPPING_CART,
                           visible: false,
                           requiredPermissions: [{ action: 'select', subject: 'purchase_order' }]
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/supplier/tabs/PurchaseOrders.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/supplier/tabs/PurchaseOrders.vue')
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
                        path: 'orders',
                        name: 'ops-product-manage-orders',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_orders',
                           icon: PrimeIcons.SHOPPING_CART,
                           visible: false,
                           anyPermission: [
                              { action: 'select', subject: 'purchase_order' },
                              { action: 'select', subject: 'shipment' }
                           ]
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/Orders.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/Orders.vue')
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
                     },
                     {
                        path: 'media',
                        name: 'ops-product-manage-media',
                        props: true,
                        meta: {
                           label: 'route.label.ops_product_media',
                           icon: PrimeIcons.IMAGES,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/product/tabs/Media.vue'),
                           skeleton: () => import('@/views/pages/ops/product/tabs/Media.vue')
                        }
                     }
                  ]
               }
            ]
         },
         {
            path: 'projects',
            name: 'ops-project',
            meta: {
               label: 'route.label.ops_project',
               icon: PrimeIcons.FLAG,
               requiredPermissions: [{ action: 'select', subject: 'project' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-project-add',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-project-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-project-list',
                  meta: {
                     label: 'route.label.ops_project_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'project' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/project/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/project/Index.vue')
                  }
               },
               {
                  // A new project; once saved it opens in its card.
                  path: 'add',
                  name: 'ops-project-add',
                  meta: {
                     label: 'route.label.ops_project_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'project' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/project/Upsert.vue'),
                     skeleton: () => import('@/views/pages/ops/project/Upsert.vue')
                  }
               },
               {
                  // The project card: its tabs open on their own as these child routes.
                  path: ':id/manage/:tab?',
                  name: 'ops-project-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_project_manage',
                     icon: PrimeIcons.FLAG,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'project' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/project/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/project/Manage.vue')
                  },
                  children: [
                     {
                        path: 'overview',
                        name: 'ops-project-manage-overview',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_overview',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/project/tabs/Overview.vue'),
                           skeleton: () => import('@/views/pages/ops/project/tabs/Overview.vue')
                        }
                     },
                     {
                        path: 'tasks',
                        name: 'ops-project-manage-tasks',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_tasks',
                           icon: PrimeIcons.CHECK_SQUARE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/project/tabs/Tasks.vue'),
                           skeleton: () => import('@/views/pages/ops/project/tabs/Tasks.vue')
                        }
                     },
                     {
                        path: 'products',
                        name: 'ops-project-manage-products',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_products',
                           icon: PrimeIcons.BOX,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/project/tabs/Products.vue'),
                           skeleton: () => import('@/views/pages/ops/project/tabs/Products.vue')
                        }
                     },
                     {
                        path: 'purchase_orders',
                        name: 'ops-project-manage-purchase_orders',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_purchase_orders',
                           icon: PrimeIcons.SHOPPING_CART,
                           visible: false,
                           requiredPermissions: [{ action: 'select', subject: 'purchase_order' }]
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/project/tabs/PurchaseOrders.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/project/tabs/PurchaseOrders.vue')
                        }
                     },
                     {
                        path: 'shipments',
                        name: 'ops-project-manage-shipments',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_shipments',
                           icon: PrimeIcons.SEND,
                           visible: false,
                           requiredPermissions: [{ action: 'select', subject: 'shipment' }]
                        },
                        components: {
                           default: () => import('@/views/pages/ops/project/tabs/Shipments.vue'),
                           skeleton: () => import('@/views/pages/ops/project/tabs/Shipments.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-project-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_project_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/project/tabs/Documents.vue'),
                           skeleton: () => import('@/views/pages/ops/project/tabs/Documents.vue')
                        }
                     }
                  ]
               },
               {
                  path: ':projectId/task/add',
                  name: 'ops-project-task-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_project_task_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'project_task' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/project/TaskUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/project/TaskUpsert.vue')
                  }
               },
               {
                  path: 'task/:id/edit',
                  name: 'ops-project-task-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_project_task_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'project_task' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/project/TaskUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/project/TaskUpsert.vue')
                  }
               }
            ]
         },
         {
            path: 'purchase-orders',
            name: 'ops-purchase-order',
            meta: {
               label: 'route.label.ops_purchase_order',
               icon: PrimeIcons.SHOPPING_CART,
               requiredPermissions: [{ action: 'select', subject: 'purchase_order' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-purchase-order-manage',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-purchase-order-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-purchase-order-list',
                  meta: {
                     label: 'route.label.ops_purchase_order_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'purchase_order' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/Index.vue')
                  }
               },
               {
                  // The purchase order card: its tabs open on their own as these child routes.
                  path: ':id?/manage/:tab?',
                  name: 'ops-purchase-order-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_manage',
                     icon: PrimeIcons.SHOPPING_CART,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'purchase_order' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/Manage.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'ops-purchase-order-manage-general',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_general',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/purchase-order/tabs/General.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/purchase-order/tabs/General.vue')
                        }
                     },
                     {
                        path: 'lines',
                        name: 'ops-purchase-order-manage-lines',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_lines',
                           icon: PrimeIcons.LIST,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/purchase-order/tabs/Lines.vue'),
                           skeleton: () => import('@/views/pages/ops/purchase-order/tabs/Lines.vue')
                        }
                     },
                     {
                        path: 'pi',
                        name: 'ops-purchase-order-manage-pi',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_pi',
                           icon: PrimeIcons.CHECK_SQUARE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/purchase-order/tabs/Pi.vue'),
                           skeleton: () => import('@/views/pages/ops/purchase-order/tabs/Pi.vue')
                        }
                     },
                     {
                        path: 'payments',
                        name: 'ops-purchase-order-manage-payments',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_payments',
                           icon: PrimeIcons.WALLET,
                           visible: false
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Payments.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Payments.vue')
                        }
                     },
                     {
                        path: 'production',
                        name: 'ops-purchase-order-manage-production',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_production',
                           icon: PrimeIcons.COG,
                           visible: false
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Production.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Production.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-purchase-order-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Documents.vue'),
                           skeleton: () =>
                              import('@/views/pages/ops/purchase-order/tabs/Documents.vue')
                        }
                     },
                     {
                        path: 'media',
                        name: 'ops-purchase-order-manage-media',
                        props: true,
                        meta: {
                           label: 'route.label.ops_purchase_order_media',
                           icon: PrimeIcons.IMAGES,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/purchase-order/tabs/Media.vue'),
                           skeleton: () => import('@/views/pages/ops/purchase-order/tabs/Media.vue')
                        }
                     }
                  ]
               },
               {
                  path: ':purchaseOrderId/line/add',
                  name: 'ops-purchase-order-line-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_line_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'purchase_order_line' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/LineUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/LineUpsert.vue')
                  }
               },
               {
                  path: 'line/:id/edit',
                  name: 'ops-purchase-order-line-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_line_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'purchase_order_line' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/LineUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/LineUpsert.vue')
                  }
               },
               {
                  path: ':purchaseOrderId/payment/add',
                  name: 'ops-purchase-order-payment-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_payment_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'purchase_order_payment' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/PaymentUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/PaymentUpsert.vue')
                  }
               },
               {
                  path: 'payment/:id/edit',
                  name: 'ops-purchase-order-payment-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_payment_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'purchase_order_payment' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/PaymentUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/PaymentUpsert.vue')
                  }
               },
               {
                  path: ':purchaseOrderId/update/add',
                  name: 'ops-purchase-order-update-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_update_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'purchase_order_update' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/UpdateUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/UpdateUpsert.vue')
                  }
               },
               {
                  path: 'update/:id/edit',
                  name: 'ops-purchase-order-update-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_purchase_order_update_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'purchase_order_update' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/purchase-order/UpdateUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/purchase-order/UpdateUpsert.vue')
                  }
               }
            ]
         },
         {
            path: 'shipments',
            name: 'ops-shipment',
            meta: {
               label: 'route.label.ops_shipment',
               icon: PrimeIcons.SEND,
               requiredPermissions: [{ action: 'select', subject: 'shipment' }],
               contextMenuItems: [
                  {
                     label: 'action.add',
                     route: {
                        name: 'ops-shipment-manage',
                        query: { showDialog: DIALOG_POSITIONS.CENTER }
                     }
                  }
               ]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-shipment-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-shipment-list',
                  meta: {
                     label: 'route.label.ops_shipment_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'shipment' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/Index.vue')
                  }
               },
               {
                  // The shipment card: its tabs open on their own as these child routes.
                  path: ':id?/manage/:tab?',
                  name: 'ops-shipment-manage',
                  props: true,
                  meta: {
                     label: 'route.label.ops_shipment_manage',
                     icon: PrimeIcons.SEND,
                     visible: false,
                     requiredPermissions: [{ action: 'select', subject: 'shipment' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/Manage.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/Manage.vue')
                  },
                  children: [
                     {
                        path: 'general',
                        name: 'ops-shipment-manage-general',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_general',
                           icon: PrimeIcons.INFO_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/General.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/General.vue')
                        }
                     },
                     {
                        path: 'dates',
                        name: 'ops-shipment-manage-dates',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_dates',
                           icon: PrimeIcons.CALENDAR,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Dates.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Dates.vue')
                        }
                     },
                     {
                        path: 'orders',
                        name: 'ops-shipment-manage-orders',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_orders',
                           icon: PrimeIcons.SHOPPING_CART,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Orders.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Orders.vue')
                        }
                     },
                     {
                        path: 'events',
                        name: 'ops-shipment-manage-events',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_events',
                           icon: PrimeIcons.HISTORY,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Events.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Events.vue')
                        }
                     },
                     {
                        path: 'acceptance',
                        name: 'ops-shipment-manage-acceptance',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_acceptance',
                           icon: PrimeIcons.CHECK_CIRCLE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Acceptance.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Acceptance.vue')
                        }
                     },
                     {
                        path: 'documents',
                        name: 'ops-shipment-manage-documents',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_documents',
                           icon: PrimeIcons.FILE,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Documents.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Documents.vue')
                        }
                     },
                     {
                        path: 'media',
                        name: 'ops-shipment-manage-media',
                        props: true,
                        meta: {
                           label: 'route.label.ops_shipment_media',
                           icon: PrimeIcons.IMAGES,
                           visible: false
                        },
                        components: {
                           default: () => import('@/views/pages/ops/shipment/tabs/Media.vue'),
                           skeleton: () => import('@/views/pages/ops/shipment/tabs/Media.vue')
                        }
                     }
                  ]
               },
               {
                  path: ':shipmentId/line/add',
                  name: 'ops-shipment-line-add',
                  props: { default: shipmentLineProps, skeleton: shipmentLineProps },
                  meta: {
                     label: 'route.label.ops_shipment_line_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'shipment_line' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/LineUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/LineUpsert.vue')
                  }
               },
               {
                  path: 'line/:id/edit',
                  name: 'ops-shipment-line-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_shipment_line_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'shipment_line' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/LineUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/LineUpsert.vue')
                  }
               },
               {
                  path: ':shipmentId/event/add',
                  name: 'ops-shipment-event-add',
                  props: true,
                  meta: {
                     label: 'route.label.ops_shipment_event_add',
                     icon: PrimeIcons.PLUS,
                     visible: false,
                     requiredPermissions: [{ action: 'create', subject: 'shipment_event' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/EventUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/EventUpsert.vue')
                  }
               },
               {
                  path: 'event/:id/edit',
                  name: 'ops-shipment-event-edit',
                  props: true,
                  meta: {
                     label: 'route.label.ops_shipment_event_edit',
                     icon: PrimeIcons.FILE_EDIT,
                     visible: false,
                     requiredPermissions: [{ action: 'modify', subject: 'shipment_event' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/shipment/EventUpsert.vue'),
                     skeleton: () => import('@/views/pages/ops/shipment/EventUpsert.vue')
                  }
               }
            ]
         },
         {
            // Every document of the tenant, narrowed by type, status, record kind and customer.
            path: 'documents',
            name: 'ops-document',
            meta: {
               label: 'route.label.ops_document',
               icon: PrimeIcons.FILE,
               requiredPermissions: [{ action: 'select', subject: 'document' }]
            },
            component: CustomRouteView,
            redirect: { name: 'ops-document-list' },
            children: [
               {
                  path: 'list',
                  name: 'ops-document-list',
                  meta: {
                     label: 'route.label.ops_document_list',
                     icon: PrimeIcons.LIST,
                     visible: false,
                     index: -1,
                     requiredPermissions: [{ action: 'select', subject: 'document' }]
                  },
                  components: {
                     default: () => import('@/views/pages/ops/document/Index.vue'),
                     skeleton: () => import('@/views/pages/ops/document/Index.vue')
                  }
               }
            ]
         },
         {
            // Every file of the tenant as a grid, narrowed by customer, type, tag and linked record.
            path: 'media',
            name: 'ops-media',
            meta: {
               label: 'route.label.ops_media',
               icon: PrimeIcons.IMAGES,
               requiredPermissions: [{ action: 'select', subject: 'media' }]
            },
            components: {
               default: () => import('@/views/pages/ops/media/Index.vue'),
               skeleton: () => import('@/views/pages/ops/media/Index.vue')
            }
         },
         {
            // A file's title, alt text, tags and customer, opened as a dialog from the library.
            path: 'media/:id/edit',
            name: 'ops-media-edit',
            props: true,
            meta: {
               label: 'route.label.ops_media_edit',
               icon: PrimeIcons.FILE_EDIT,
               visible: false,
               requiredPermissions: [{ action: 'modify', subject: 'media' }]
            },
            components: {
               default: () => import('@/views/pages/ops/media/Upsert.vue'),
               skeleton: () => import('@/views/pages/ops/media/Upsert.vue')
            }
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
