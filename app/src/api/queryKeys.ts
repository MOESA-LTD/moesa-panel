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
   tenant_owner: ['tenant_member'],
   // The shipment card embeds its orders' products (sku, name, is_hazmat), the order card its
   // lines' products, the cell card its product.
   product: [
      'product_evidence',
      'product_with_evidence',
      'dashboard_product_evidence',
      'shipment',
      'purchase_order',
      'market_cell',
      'market_cell_overview',
      'incident_overview',
      'change_request'
   ],
   // The shipment, order and incident cards embed their customer (the shipment its warehouse too);
   // the overviews and the dashboard boxes name it (customer_code).
   customer: [
      'shipment',
      'shipment_overview',
      'purchase_order',
      'purchase_order_overview',
      'dashboard_purchase_order',
      'dashboard_shipment',
      'market_cell_overview',
      'incident',
      'incident_overview',
      'change_request',
      'dashboard_market',
      'dashboard_incident',
      'dashboard_change_request'
   ],
   // The order card embeds its supplier (code, terms); the overview and the boxes name it.
   supplier: ['purchase_order', 'purchase_order_overview', 'dashboard_purchase_order'],
   customer_warehouse: ['shipment', 'shipment_overview'],
   // A document may cite a media file (the library's document_count); an order's overview reads
   // its approved PSI and its lines' spec sheets (has_approved_psi, spec_missing_line_ids), and its
   // card embeds the lines' spec sheets; a shipment's overview the PSI of its orders
   // (psi_missing_po_codes).
   document: [
      'product_evidence',
      'product_with_evidence',
      'dashboard_product_evidence',
      'media_library',
      'purchase_order',
      'purchase_order_overview',
      'shipment_overview',
      'change_request'
   ],
   // product_with_evidence carries the primary image; a record's media list embeds its files.
   media: ['media_library', 'product_with_evidence', 'media_link'],
   media_link: ['media_library', 'product_with_evidence', 'media'],
   // The project card embeds its gates, the incident card the gates it rolled back.
   project_gate: ['project', 'dashboard_gate_pending', 'incident'],
   project_task: ['dashboard_task_due'],
   // A project put on hold or closed leaves the dashboard; management_gates decides who acts. The
   // order overview names the order's project.
   // The matrix overview names the product (sku, name, gtin), the customer and the project codes.
   // The incident overview names the incident's customer and linked record (customer_code,
   // entity_label: a project, order, shipment, product or market cell); the change request card
   // embeds its customer, project, products and documents; the cell card embeds its project.
   project: [
      'dashboard_gate_pending',
      'dashboard_task_due',
      'purchase_order_overview',
      'market_cell',
      'market_cell_overview',
      'incident_overview',
      'change_request'
   ],
   // spec_sheet_required_from decides which lines miss a spec sheet.
   setting: ['dashboard_gate_pending', 'purchase_order_overview'],
   // product_evidence names the last order of a product (last_po_code); the shipment card embeds
   // its orders (status, tolerance) and their lines.
   // The dashboard's order boxes read the overview (status, dates, system_total).
   purchase_order: [
      'purchase_order_overview',
      'product_evidence',
      'product_with_evidence',
      'shipment',
      'dashboard_purchase_order',
      'incident_overview'
   ],
   // The order card embeds its lines and payments; the overview sums them (lines change
   // system_total, payments the planned deposit and balance dates).
   purchase_order_line: [
      'purchase_order',
      'purchase_order_overview',
      'product_evidence',
      'product_with_evidence',
      'shipment',
      'dashboard_purchase_order'
   ],
   purchase_order_payment: [
      'purchase_order',
      'purchase_order_overview',
      'dashboard_purchase_order'
   ],
   purchase_order_update: ['purchase_order'],
   // The dashboard's shipment boxes read the overview (status, ETA).
   shipment: ['shipment_overview', 'dashboard_shipment', 'incident_overview'],
   // The shipment card embeds its orders and lines; the overview lists their ids and products.
   shipment_purchase_order: ['shipment', 'shipment_overview', 'dashboard_shipment'],
   shipment_line: ['shipment', 'shipment_overview'],
   shipment_event: ['shipment'],
   // product_evidence counts the live cells (live_cell_count). dashboard_product_evidence reads
   // product_evidence but none of its columns change with cells; dashboard_market counts them.
   market_cell: [
      'market_cell_overview',
      'product_evidence',
      'product_with_evidence',
      'incident_overview',
      'dashboard_market'
   ],
   // The overview names the incident's customer and linked record (codes, entity_label) and
   // reads its deadlines (next_deadline_at, overdue_deadline_count); the card embeds its log,
   // deadlines and the gates it rolled back. The dashboard box reads the overview.
   incident: ['incident_overview', 'project_gate', 'dashboard_incident'],
   incident_log: ['incident'],
   incident_deadline: ['incident', 'incident_overview', 'dashboard_incident'],
   // The dashboard box lists the open and approved requests.
   change_request: ['dashboard_change_request'],
   // The change request card embeds its products.
   change_request_product: ['change_request']
};

/** Tables whose rows are removed by ON DELETE CASCADE when a row of the key table is deleted. */
const CASCADES: Partial<Record<TableName, TableName[]>> = {
   user: ['tenant_owner', 'tenant_user', 'user_role'],
   permission: ['role_permission'],
   role: ['role_permission', 'user_role'],
   supplier: ['supplier_contact'],
   customer: [
      'customer_contact',
      'customer_warehouse',
      'customer_platform_account',
      'customer_brand'
   ],
   // Orders and shipments are never deleted (only cancelled), as customers; the keys mirror the
   // foreign keys.
   purchase_order: ['purchase_order_line', 'purchase_order_payment', 'purchase_order_update'],
   shipment: ['shipment_purchase_order', 'shipment_line', 'shipment_event'],
   // Incidents and change requests are never deleted either; the keys mirror the foreign keys.
   incident: ['incident_log', 'incident_deadline'],
   change_request: ['change_request_product']
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
