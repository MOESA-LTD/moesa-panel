import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import { useConfirm } from 'primevue/useconfirm';
import { inject, onUnmounted, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

type CloseGuard = () => boolean | Promise<boolean>;
type RouteDialogRef = Ref<{ data?: { closeGuards?: Set<CloseGuard> } } | null>;

/**
 * Asks before discarding unsaved changes, both when leaving the route and when closing the route
 * dialog the form is shown in (see the dialog middleware).
 */
export function useUnsavedChangesGuard(isDirty: MaybeRefOrGetter<boolean>) {
   const confirm = useConfirm();

   const allowLeave: CloseGuard = () => {
      if (!toValue(isDirty)) return true;

      return new Promise<boolean>((resolve) =>
         confirm.require({
            icon: PrimeIcons.EXCLAMATION_TRIANGLE,
            header: i18n.t('form.unsaved_changes.header'),
            message: i18n.t('form.unsaved_changes.message'),
            acceptProps: { label: i18n.t('action.yes'), outlined: true },
            rejectProps: { label: i18n.t('action.no'), severity: 'secondary', outlined: true },
            accept: () => resolve(true),
            reject: () => resolve(false),
            onHide: () => resolve(false)
         })
      );
   };

   // Route dialogs render outside <router-view>, so they guard their own close instead.
   const closeGuards = inject<RouteDialogRef | null>('dialogRef', null)?.value?.data?.closeGuards;
   if (closeGuards) {
      closeGuards.add(allowLeave);
      onUnmounted(() => closeGuards.delete(allowLeave));
   } else {
      onBeforeRouteLeave(allowLeave);
   }
}
