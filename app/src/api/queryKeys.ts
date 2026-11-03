import type { QueryClient } from '@tanstack/vue-query';

export type TableName = keyof Tables | keyof Views;

/**
 * Every server query is keyed as ['tenant', tenantId, table, ...]. Scoping by table lets a
 * mutation invalidate all queries of the tables it touched without knowing their parameters.
 */
export const queryKeys = {
   tenant: (tenantId: string | null) => ['tenant', tenantId] as const,
   table: (tenantId: string | null, table: TableName) =>
      [...queryKeys.tenant(tenantId), table] as const,
   list: (tenantId: string | null, table: TableName, params: object = {}) =>
      [...queryKeys.table(tenantId, table), 'list', params] as const,
   detail: (tenantId: string | null, table: TableName, id: string | null | undefined) =>
      [...queryKeys.table(tenantId, table), 'detail', id] as const
};

/** Views and tables whose rows are derived from a table and go stale when it changes. */
const DERIVED: Partial<Record<TableName, TableName[]>> = {
   subscription: ['company_subscription'],
   plan: ['company_subscription'],
   user: ['tenant_member'],
   tenant_user: ['tenant_member'],
   tenant_owner: ['tenant_member']
};

/** Tables whose rows are removed by ON DELETE CASCADE when a row of the key table is deleted. */
const CASCADES: Partial<Record<TableName, TableName[]>> = {
   user: ['tenant_owner', 'tenant_user', 'user_role'],
   permission: ['role_permission'],
   role: ['role_permission', 'user_role'],
   supplier: ['supplier_contact']
};

// Every authenticated write is recorded by the audit trigger.
const AUDIT: TableName[] = ['audit_transaction', 'audit_log', 'dashboard_notification_feed'];

/** The tables, everything cascading from them, the views derived from all of these, and the audit log. */
export const affectedTables = (tables: readonly TableName[]): TableName[] => {
   const written = new Set<TableName>();
   const visit = (table: TableName) => {
      if (written.has(table)) return;
      written.add(table);
      CASCADES[table]?.forEach(visit);
   };
   tables.forEach(visit);

   return [
      ...new Set([...written, ...[...written].flatMap((table) => DERIVED[table] ?? []), ...AUDIT])
   ];
};

export const isTableQuery = (queryKey: readonly unknown[], tables: readonly TableName[]) =>
   queryKey[0] === 'tenant' && tables.includes(queryKey[2] as TableName);

/** Marks every query of the given tables, and of what is derived from them, as stale. */
export const invalidateTables = (queryClient: QueryClient, tables: readonly TableName[]) => {
   const affected = affectedTables(tables);
   return queryClient.invalidateQueries({
      predicate: ({ queryKey }) => isTableQuery(queryKey, affected)
   });
};
