import type { DialogPosition } from '@/constants/router';
import { useAuthStore } from '@/store/auth';
import type { useDialog } from 'primevue';
import { h } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';
import RouteDialog from './RouteDialog.vue';
import { markOnScreen, rememberDialog, takeReopening } from './session';

/**
 * Opens `route`'s page in a RouteDialog; DynamicDialog only provides the mask and the box. The
 * dialog is remembered for the tab so a reload reopens it, with its position, size and state when
 * it is being reopened.
 */
export function openRouteDialog(
   dialogs: ReturnType<typeof useDialog>,
   route: RouteLocationNormalized,
   position: DialogPosition
) {
   const saved = takeReopening(route.fullPath);
   const id = saved?.id ?? crypto.randomUUID();
   // Only pages of the signed-in user are reopened; auth pages (login, ...) are not.
   const userId = useAuthStore().user?.id;
   if (userId && route.meta.requiresAuth) {
      rememberDialog({ ...saved, id, userId, path: route.fullPath, position });
   }
   markOnScreen(id);

   return dialogs.open(h(RouteDialog, { route, dialogId: id, initialFrame: saved }), {
      props: {
         // RouteDialog renders the header and handles closing, moving and resizing itself.
         showHeader: false,
         closable: false,
         closeOnEscape: false,
         draggable: false,
         maximizable: false,
         keepInViewport: false,
         position,
         style: saved?.style,
         pt: { content: { class: '!p-0 !overflow-hidden flex flex-col' } },
         // Not in PrimeVue's DialogProps; passed through to the dialog element. `relative` places
         // the resize handles until the dialog is first moved (then it is `fixed`).
         ...({ class: 'relative min-w-[clamp(32rem,50%,100vw)] max-w-min' } as object)
      }
   });
}
