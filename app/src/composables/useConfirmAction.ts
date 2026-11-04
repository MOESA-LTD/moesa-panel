import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import { useConfirm } from 'primevue/useconfirm';

export type ConfirmActionOptions = {
   header: string;
   message: string;
   /** Defaults to "Yes". */
   acceptLabel?: string;
   /** Runs once the user accepts; the dialog's promise settles with it. */
   accept: () => Promise<void> | void;
};

/**
 * Asks the user to confirm an action and runs it on accept. The returned promise resolves `true`
 * once `accept` has finished, `false` when the user declines or closes the dialog, and rejects
 * with whatever `accept` throws. Call it during setup (or before a guard's first `await`).
 */
export function useConfirmAction() {
   const confirm = useConfirm();

   return ({ header, message, acceptLabel, accept }: ConfirmActionOptions) =>
      new Promise<boolean>((resolve, reject) => {
         let accepted = false;
         // PrimeVue also hides the dialog after accept; only a dismissal before it is a "no".
         const decline = () => {
            if (!accepted) resolve(false);
         };

         confirm.require({
            icon: PrimeIcons.EXCLAMATION_TRIANGLE,
            message,
            header,
            acceptProps: { label: acceptLabel ?? i18n.t('action.yes'), outlined: true },
            rejectProps: { label: i18n.t('action.no'), severity: 'secondary', outlined: true },
            accept: async () => {
               accepted = true;
               try {
                  await accept();
                  resolve(true);
               } catch (error) {
                  reject(error);
               }
            },
            reject: decline,
            onHide: decline
         });
      });
}
