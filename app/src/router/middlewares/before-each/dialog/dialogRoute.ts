import type { RouteLocationNormalized } from 'vue-router';

/**
 * A card's tab route (`ops-<x>-manage-<tab>`, a child of `ops-<x>-manage`) renders inside its
 * card, so opened alone in a dialog it resolves to the Manage parent with the tab as a param (the
 * card selects its tab from it). Any other route is returned unchanged. `fullPath` is kept: a
 * reload reopens the tab URL, which resolves the same way.
 */
export function dialogRoute(to: RouteLocationNormalized): RouteLocationNormalized {
   const leaf = to.matched.at(-1);
   const parent = to.matched.at(-2);
   const parentName = parent?.name;
   const leafName = leaf?.name;
   if (
      typeof parentName !== 'string' ||
      typeof leafName !== 'string' ||
      !parentName.endsWith('-manage') ||
      !leafName.startsWith(`${parentName}-`)
   ) {
      return to;
   }
   return {
      ...to,
      name: parentName,
      meta: parent!.meta,
      matched: to.matched.slice(0, -1),
      params: { ...to.params, tab: leafName.slice(parentName.length + 1) }
   };
}
