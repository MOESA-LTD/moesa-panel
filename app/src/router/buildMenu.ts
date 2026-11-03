import type { MenuItem } from 'primevue/menuitem';
import { toValue } from 'vue';
import type { RouteRecordNormalized } from 'vue-router';

/** A menu entry for a route: the sidebar, the section menu bars and the account menu. */
export interface NavigationItem extends MenuItem {
   /** The route name; also the key PanelMenu remembers expanded entries by. */
   key: string;
   name: RouteRecordNormalized['name'];
   label: string;
   icon?: string;
   visible: boolean;
   route: RouteRecordNormalized & { replace?: boolean };
   index: number;
   /** `meta.contextMenuItems`, resolved (it may be a ref or getter). */
   contextMenuItems: MenuItem[];
   /** The module outside the plan the entry needs: it is shown locked, without its children. */
   locked?: string;
   items?: NavigationItem[];
}

type Node = { route: RouteRecordNormalized; items: Record<string, Node> };

type BuildOptions = {
   can: (action: string, subject: string) => boolean;
   t: (key: string) => string;
   /** The module outside the plan a permission subject belongs to, if any. */
   lockedModule?: (subject: string) => string | null;
};

/**
 * Nests the routes by path segment (params left out) and turns them into menu entries.
 *
 * - Order: `meta.index`, else one after the previous sibling (a child counts on from its parent).
 * - Visibility: `meta.visible` if set, else whether every `meta.requiredPermissions` is granted,
 *   else whether it has visible children; nested entries without either are visible.
 * - Hidden children are left out; hidden top-level entries are kept with `visible: false`.
 * - Locked: an entry without `meta.visible` that needs a module outside the plan is shown (locked),
 *   without its children, whatever the permissions (the plan, not the role, keeps it closed).
 */
export function buildMenu(
   records: readonly RouteRecordNormalized[],
   { can, t, lockedModule }: BuildOptions
) {
   const root: Record<string, Node> = {};

   // Shorter paths first, so a segment belongs to the route that owns it. Aliases repeat a route.
   [...records]
      .filter((record) => !record.aliasOf)
      .sort((a, b) => a.path.length - b.path.length)
      .forEach((route) => {
         let level = root;
         route.path
            .replace(/\/:[^/]+/g, '')
            .split('/')
            .filter(Boolean)
            .forEach((segment) => {
               level[segment] ??= { route, items: {} };
               level = level[segment].items;
            });
      });

   const toItems = (nodes: Record<string, Node>, nested: boolean, previous = 0): NavigationItem[] =>
      Object.entries(nodes)
         .map(([segment, { route, items }]) => {
            const { meta, name } = route;
            const index = meta.index ?? ++previous;
            const locked =
               meta.visible === undefined
                  ? meta.requiredPermissions
                       ?.map(({ subject }) => lockedModule?.(subject))
                       .find(Boolean)
                  : undefined;
            const children = locked
               ? []
               : toItems(items, true, index).filter((child) => child.visible);

            const visible =
               !!locked ||
               (toValue(meta.visible) ??
                  meta.requiredPermissions?.every(({ action, subject }) => can(action, subject)) ??
                  (children.length > 0 || nested));

            return {
               key: String(name ?? route.path),
               name,
               label: t(meta.label || segment),
               icon: meta.icon,
               visible,
               route: { ...route, replace: meta.replace },
               index,
               contextMenuItems: locked ? [] : (toValue(meta.contextMenuItems) ?? []),
               ...(locked && { locked }),
               ...(children.length > 0 && { items: children })
            };
         })
         .sort((a, b) => a.index - b.index);

   return toItems(root, false);
}
