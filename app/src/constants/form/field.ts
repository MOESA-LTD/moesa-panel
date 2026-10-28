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
   tenant_owner: { name: 'branch-user-manage', field: 'user_id' }
};
