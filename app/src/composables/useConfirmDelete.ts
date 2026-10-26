import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import { useConfirm } from 'primevue/useconfirm';

type Deletable = { id?: string | null; display_name?: string | null; name?: string | null };

/** Asks the user to confirm deleting `item`; resolves to whether they accepted. */
export function useConfirmDelete() {
   const confirm = useConfirm();

   return (item: Deletable) =>
      new Promise<boolean>((resolve) =>
         confirm.require({
            icon: PrimeIcons.EXCLAMATION_TRIANGLE,
            message: i18n.t('action.confirm.delete.question', { item }),
            header: i18n.t('action.confirm.delete.title', {
               name: item?.display_name || item?.name || item?.id
            }),
            acceptProps: { label: i18n.t('action.yes'), outlined: true },
            rejectProps: { label: i18n.t('action.no'), severity: 'secondary', outlined: true },
            accept: () => resolve(true),
            reject: () => resolve(false),
            onHide: () => resolve(false)
         })
      );
}
