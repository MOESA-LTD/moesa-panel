import { useDeleteRow, type RowMatch } from '@/api/tables';
import { useConfirmDelete } from '@/composables/useConfirmDelete';
import i18n from '@plugins/i18n';
import { PrimeIcons } from '@primevue/core/api';
import type { CustomTableRowAction } from '@/components/ui/custom-table/types';

/**
 * "Delete" row action for ResourceTable: asks for confirmation, deletes the row and refreshes
 * every table showing it. `match` selects the row; it defaults to its `id`.
 */
export function useDeleteAction<T extends Record<string, any>>(
   table: keyof Tables,
   match: (row: T) => RowMatch = (row) => ({ id: row.id })
): CustomTableRowAction<T> {
   const confirmDelete = useConfirmDelete();
   const { mutateAsync: deleteRow } = useDeleteRow(table);

   return {
      label: i18n.t('action.delete'),
      icon: PrimeIcons.TRASH,
      requires: { action: 'modify', subject: table },
      command:
         ({ data }) =>
         async () => {
            if (await confirmDelete(data)) await deleteRow(match(data));
         }
   };
}
