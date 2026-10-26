import RouteDialogHeader from '@/components/layout/RouteDialogHeader.vue';
import type { DialogPosition } from '@/constants/router';
import { ProgressSpinner, useDialog } from 'primevue';
import type { DynamicDialogInstance, DynamicDialogOptions } from 'primevue/dynamicdialogoptions';
import { type Component, type WatchStopHandle } from 'vue';
import type { NavigationGuardWithThis, RouteLocationRaw } from 'vue-router';

export type DialogCloseGuard = () => boolean | Promise<boolean>;

/**
 * A route opened with `?showDialog=<position>` renders its page in a dialog over the current page
 * instead of navigating to it.
 */
export const dialogBeforeEach: NavigationGuardWithThis<undefined> = async (to, from) => {
   if (to.name == 'logout') return;

   const showDialog = to.query?.showDialog as DialogPosition | undefined;
   if (!showDialog) return;

   const lastMatchedRoute = _last(to.matched);
   const components = lastMatchedRoute.components;
   const page = components.default;
   const dialogComponent = h(
      _isFunction(page)
         ? defineAsyncComponent({
              loader: page as () => Promise<Component>,
              loadingComponent: (components.skeleton as Component) || ProgressSpinner
           })
         : page,
      to.params
   );

   const dialogs = useDialog();

   let dialog: DynamicDialogInstance | null = null;

   // Components register guards here (useUnsavedChangesGuard); every guard must allow the close.
   const closeGuards = new Set<DialogCloseGuard>();
   let unwatchAuth: WatchStopHandle | undefined;

   const requestClose = async () => {
      for (const guard of closeGuards) {
         if (!(await guard())) return;
      }
      unwatchAuth?.();
      dialog?.close();
   };

   const updateStyles = (e: Event | HTMLElement | null): void => {
      const dialogElement = (e instanceof Event ? e.target : e) as HTMLElement | null;
      if (!dialogElement) return;

      if (dialogElement.role != 'dialog') return updateStyles(dialogElement.parentElement);

      dialog!.options.props!.style = dialogElement.style.cssText;
   };

   // Brings the clicked dialog to the front.
   const focusToDialog = (e: Event | HTMLElement | null): void => {
      const dialogElement = (e instanceof Event ? e.target : e) as HTMLElement | null;
      if (!dialogElement) return;

      if (!dialogElement.classList.contains('p-dialog-mask'))
         return focusToDialog(dialogElement.parentElement);

      if (dialogElement.querySelectorAll('.p-dialog-maximized').length > 0) return;

      const allDialogElements = [
         ...document.querySelectorAll<HTMLElement>('.p-dialog-mask:has(.p-dialog[role="dialog"])')
      ];
      const topDialogElement = _last(
         allDialogElements.sort((a, b) => +a.style.zIndex - +b.style.zIndex)
      );

      if (!topDialogElement || topDialogElement.isSameNode(dialogElement)) return;

      allDialogElements.forEach(
         (element) => (element.style.zIndex = `${+element.style.zIndex - 1}`)
      );

      dialogElement.style.zIndex = `${+topDialogElement.style.zIndex + 1}`;
   };

   const dialogOptions: DynamicDialogOptions = {
      data: { to, from, closeGuards },
      templates: {
         header: () =>
            h(RouteDialogHeader, {
               title: i18n.t(lastMatchedRoute.meta.label ?? ''),
               onClose: requestClose
            })
      },
      props: {
         maximizable: false,
         // Closing goes through RouteDialogHeader so that close guards can veto it.
         closable: false,
         closeOnEscape: false,
         position: showDialog,
         keepInViewport: false,
         // Not in PrimeVue's DialogProps; passed through to the dialog element as attributes.
         ...({
            class: 'min-w-[clamp(32rem,50%,100vw)] max-w-min',
            onDragend: updateStyles,
            onMousedown: focusToDialog
         } as object)
      }
   };

   if (to.meta.requiresAuth) {
      const authStore = useAuthStore();
      const { isSignedIn, currentTenant } = storeToRefs(authStore);

      await authStore.initialized;

      const tenantId = currentTenant.value?.id;

      // The page belongs to the signed-in user and tenant; close it when either goes away.
      const unwatch = watch(
         () => [currentTenant.value?.id, isSignedIn.value] as const,
         ([newTenantId, signedIn]) => {
            if (!signedIn) return dialog?.close();
            if (newTenantId !== tenantId && !_isNil(to.meta.requiredPermissions))
               return dialog?.close();
            dialog ??= dialogs.open(dialogComponent, dialogOptions);
         }
      );

      dialogOptions.data.unwatch = unwatch;
      unwatchAuth = unwatch;

      dialogOptions.onClose = (options) => {
         dialog = null;
         if (options?.type !== 'dialog-close') return;
         unwatch();
      };
   }

   dialog = dialogs.open(dialogComponent, dialogOptions);

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
