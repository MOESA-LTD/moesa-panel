import { openRouteDialog } from '@/components/layout/route-dialog/openRouteDialog';
import type { DialogPosition } from '@/constants/router';
import { useDialog } from 'primevue';
import type { NavigationGuardWithThis, RouteLocationRaw } from 'vue-router';

/**
 * A route opened with `?showDialog=<position>` renders its page in a dialog over the current page
 * instead of navigating to it (see RouteDialog).
 */
export const dialogBeforeEach: NavigationGuardWithThis<undefined> = async (to, from) => {
   if (to.name == 'logout') return;

   const position = to.query?.showDialog as DialogPosition | undefined;
   if (!position || !to.matched.at(-1)?.components) return;

   // Injected before the first await: guards only have the app's injection context until then.
   const dialogs = useDialog();

   // RouteDialog reads the session to close itself on sign-out or tenant change.
   if (to.meta.requiresAuth) await useAuthStore().initialized;

   openRouteDialog(dialogs, to, position);

   // Opened directly (page load): show the closest named parent route underneath.
   if (from.matched.length < 1) {
      const backRoute: RouteLocationRaw = to.matched
         .slice(0, -2)
         .reverse()
         .find((route) => route.name) ?? { name: 'account-profile' };
      return backRoute;
   }
   return false;
};
