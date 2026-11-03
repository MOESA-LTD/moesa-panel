import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import { useConfirm } from 'primevue/useconfirm';
import { useRouteDialog, type DialogCloseGuard } from '@/components/layout/route-dialog/context';
import { onUnmounted, toValue, type MaybeRefOrGetter } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

/**
 * Asks before discarding unsaved changes, both when leaving the route and when closing the route
 * dialog the form is shown in (see RouteDialog).
 */
export function useUnsavedChangesGuard(
   isDirty: MaybeRefOrGetter<boolean>,
   {
      onDiscard
   }: { /** Called when the user chooses to leave without saving. */ onDiscard?: () => void } = {}
) {
   const confirm = useConfirm();

   const allowLeave: DialogCloseGuard = () => {
      if (!toValue(isDirty)) return true;

      return new Promise<boolean>((resolve) =>
         confirm.require({
            icon: PrimeIcons.EXCLAMATION_TRIANGLE,
            header: i18n.t('form.unsaved_changes.header'),
            message: i18n.t('form.unsaved_changes.message'),
            acceptProps: { label: i18n.t('action.yes'), outlined: true },
            rejectProps: { label: i18n.t('action.no'), severity: 'secondary', outlined: true },
            accept: () => {
               onDiscard?.();
               resolve(true);
            },
            reject: () => resolve(false),
            onHide: () => resolve(false)
         })
      );
   };

   // Route dialogs render outside <router-view>, so they guard their own close instead.
   const routeDialog = useRouteDialog();
   if (routeDialog) {
      onUnmounted(routeDialog.addCloseGuard(allowLeave));
   } else {
      onBeforeRouteLeave(allowLeave);
   }
}
