import i18n from '@plugins/i18n';

type RevertRow = { table_name: string | null; reverted: boolean | null };

/**
 * Why an audit entry's revert is unavailable, for the disabled button's tooltip, or null. A
 * transaction that wrote a transfer row is never reverted (040, revert_audit_transaction: a
 * transfer is undone by transferring back); otherwise the caller lacks the create and modify
 * rights on its table. An entry reverted already says so in its label.
 */
export function revertDisabledReason(
   row: RevertRow,
   can: (action: string, subject: string) => boolean
): string | null {
   if (row.reverted) return null;
   if (row.table_name === 'transfer') return i18n.t('audit_log.revert_transfer_locked');
   if (!row.table_name || !can('create', row.table_name) || !can('modify', row.table_name))
      return i18n.t('errors.insufficient_permission');
   return null;
}
