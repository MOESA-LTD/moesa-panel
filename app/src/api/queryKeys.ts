import type { QueryClient } from '@tanstack/vue-query';

export type TableName = keyof Tables | keyof Views;

/**
 * Every server query is keyed as ['tenant', tenantId, table, ...]. Scoping by table lets a
 * mutation invalidate all queries of the tables it touched without knowing their parameters.
 */
export const queryKeys = {
   table: (tenantId: string | null, table: TableName) => ['tenant', tenantId, table] as const,
   list: (tenantId: string | null, table: TableName, params: object = {}) =>
      [...queryKeys.table(tenantId, table), 'list', params] as const,
   detail: (tenantId: string | null, table: TableName, id: string | null | undefined) =>
      [...queryKeys.table(tenantId, table), 'detail', id] as const
};

/** Views and tables whose rows are derived from a table and go stale when it changes. */
const DERIVED: Partial<Record<TableName, TableName[]>> = {
   client: ['client_address_view'],
   address: ['client_address_view'],
   client_address: ['client_address_view'],
   product: [
      'stock_view',
      'product_brands',
      'stock_product_stat',
      'dashboard_best_selling_products',
      'dashboard_product_category_sales_summary'
   ],
   product_category: ['dashboard_product_category_sales_summary'],
   product_categories: ['dashboard_product_category_sales_summary'],
   stock: [
      'stock_view',
      'stock_vendor',
      'stock_vendor_stat',
      'stock_product_stat',
      'dashboard_best_selling_products'
   ],
   // stock_view.available_quantity subtracts sold records.
   record: [
      'stock_view',
      'stock_vendor_stat',
      'stock_product_stat',
      'dashboard_best_selling_products',
      'dashboard_product_category_sales_summary'
   ]
};

// Every authenticated write is recorded by the audit trigger.
const AUDIT: TableName[] = ['audit_log', 'audit_log_group', 'dashboard_notification_feed'];

export const affectedTables = (tables: readonly TableName[]): TableName[] => [
   ...new Set([...tables, ...tables.flatMap((table) => DERIVED[table] ?? []), ...AUDIT])
];

export const isTableQuery = (queryKey: readonly unknown[], tables: readonly TableName[]) =>
   queryKey[0] === 'tenant' && tables.includes(queryKey[2] as TableName);

/** Marks every query of the given tables, and of what is derived from them, as stale. */
export const invalidateTables = (queryClient: QueryClient, tables: readonly TableName[]) => {
   const affected = affectedTables(tables);
   return queryClient.invalidateQueries({
      predicate: ({ queryKey }) => isTableQuery(queryKey, affected)
   });
};
