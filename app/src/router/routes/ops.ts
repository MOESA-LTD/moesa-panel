import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';

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
