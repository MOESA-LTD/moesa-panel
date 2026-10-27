import type { DialogPosition } from '@/constants/router';
import type { useDialog } from 'primevue';
import { h } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';
import RouteDialog from './RouteDialog.vue';

/** Opens `route`'s page in a RouteDialog; DynamicDialog only provides the mask and the box. */
export function openRouteDialog(
   dialogs: ReturnType<typeof useDialog>,
   route: RouteLocationNormalized,
   position: DialogPosition
) {
   return dialogs.open(h(RouteDialog, { route }), {
      props: {
         // RouteDialog renders the header and handles closing, moving and resizing itself.
         showHeader: false,
         closable: false,
         closeOnEscape: false,
         draggable: false,
         maximizable: false,
         keepInViewport: false,
         position,
         pt: { content: { class: '!p-0 !overflow-hidden flex flex-col' } },
         // Not in PrimeVue's DialogProps; passed through to the dialog element. `relative` places
         // the resize handles until the dialog is first moved (then it is `fixed`).
         ...({ class: 'relative min-w-[clamp(32rem,50%,100vw)] max-w-min' } as object)
      }
   });
}
