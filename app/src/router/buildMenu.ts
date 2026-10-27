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
   items?: NavigationItem[];
}

type Node = { route: RouteRecordNormalized; items: Record<string, Node> };

type BuildOptions = {
   can: (action: string, subject: string) => boolean;
   t: (key: string) => string;
};

/**
 * Nests the routes by path segment (params left out) and turns them into menu entries.
 *
 * - Order: `meta.index`, else one after the previous sibling (a child counts on from its parent).
 * - Visibility: `meta.visible` if set, else whether every `meta.requiredPermissions` is granted,
 *   else whether it has visible children; nested entries without either are visible.
 * - Hidden children are left out; hidden top-level entries are kept with `visible: false`.
 */
export function buildMenu(records: readonly RouteRecordNormalized[], { can, t }: BuildOptions) {
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
            const children = toItems(items, true, index).filter((child) => child.visible);

            const visible =
               toValue(meta.visible) ??
               meta.requiredPermissions?.every(({ action, subject }) => can(action, subject)) ??
               (children.length > 0 || nested);

            return {
               key: String(name ?? route.path),
               name,
               label: t(meta.label || segment),
               icon: meta.icon,
               visible,
               route: { ...route, replace: meta.replace },
               index,
               contextMenuItems: toValue(meta.contextMenuItems) ?? [],
               ...(children.length > 0 && { items: children })
            };
         })
         .sort((a, b) => a.index - b.index);

   return toItems(root, false);
}
