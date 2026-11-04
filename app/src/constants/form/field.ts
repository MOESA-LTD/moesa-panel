import { RouteRecordNameGeneric } from 'vue-router';

// Define a type for auditItemRoutes
interface FieldRoutes {
   [key: string]: { name: RouteRecordNameGeneric; field?: string };
}

// Initialize auditItemRoutes with the correct type
export const fieldRoutes: FieldRoutes = {
   role_id: { name: 'branch-role-edit' },
   role: { name: 'branch-role-edit' },
   user_role: { name: 'branch-role-edit', field: 'role_id' },
   user_id: { name: 'branch-user-manage' },
   user: { name: 'branch-user-manage' },
   tenant_user: { name: 'branch-user-manage', field: 'user_id' },
   tenant_owner: { name: 'branch-user-manage', field: 'user_id' },
   document: { name: 'ops-document-edit' },
   supplier: { name: 'ops-supplier-manage' },
   supplier_contact: { name: 'ops-supplier-contact-edit' },
   customer: { name: 'ops-customer-manage' },
   customer_contact: { name: 'ops-customer-contact-edit' },
   customer_warehouse: { name: 'ops-customer-warehouse-edit' },
   customer_platform_account: { name: 'ops-customer-platform-edit' },
   customer_brand: { name: 'ops-customer-brand-edit' },
   product: { name: 'ops-product-manage' },
   project: { name: 'ops-project-manage' },
   project_task: { name: 'ops-project-task-edit' },
   project_gate: { name: 'ops-project-manage', field: 'project_id' },
   media: { name: 'ops-media-edit' },
   purchase_order: { name: 'ops-purchase-order-manage' },
   purchase_order_line: { name: 'ops-purchase-order-manage', field: 'purchase_order_id' },
   purchase_order_payment: { name: 'ops-purchase-order-manage', field: 'purchase_order_id' },
   purchase_order_update: { name: 'ops-purchase-order-manage', field: 'purchase_order_id' }
};
