import type { MenuItem } from 'primevue/menuitem';
import type { MaybeRefOrGetter } from 'vue';

/** A CASL rule a route needs, e.g. `{ action: 'read', subject: 'client' }`. */
export type RoutePermission = { action: string; subject: string };

declare module 'vue-router' {
   interface RouteMeta {
      /** i18n key, translated where it is shown (menus, breadcrumb, dialog header). */
      label?: string;
      icon?: string;
      /** Position in menus; lower comes first. */
      index?: number;
      layout?: 'dashboard';
      requiresAuth?: boolean;
      /** Only for the super admin (the plans and subscriptions panel). */
      superAdmin?: boolean;
      /** All of them are needed to enter the route; menus hide the route without them. */
      requiredPermissions?: RoutePermission[];
      /** Overrides the permission-based menu visibility. */
      visible?: MaybeRefOrGetter<boolean>;
      /** Menu links replace the current history entry. */
      replace?: boolean;
      contextMenuItems?: MaybeRefOrGetter<MenuItem[] | null>;
   }
}

export {};
