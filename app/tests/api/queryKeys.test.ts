import { affectedTables, invalidateTables, queryKeys } from '@/api/queryKeys';
import { QueryClient } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';

const TENANT = 'tenant-1';

const seed = (queryClient: QueryClient, keys: readonly (readonly unknown[])[]) =>
   keys.forEach((key) => queryClient.setQueryData(key, { seeded: true }));

const staleKeys = (queryClient: QueryClient) =>
   queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey);

describe('queryKeys', () => {
   it('scopes every key by tenant and table', () => {
      expect(queryKeys.detail(TENANT, 'role', 'r1')).toEqual([
         'tenant',
         TENANT,
         'role',
         'detail',
         'r1'
      ]);
      expect(queryKeys.list(TENANT, 'role', { page: 1 }).slice(0, 4)).toEqual([
         'tenant',
         TENANT,
         'role',
         'list'
      ]);
   });
});

describe('affectedTables', () => {
   it('adds derived views and the audit log', () => {
      const tables = affectedTables(['tenant_user']);
      expect(tables).toContain('tenant_user');
      expect(tables).toContain('tenant_member');
      expect(tables).toContain('audit_log');
      expect(tables).not.toContain('company_subscription');
   });

   it('follows ON DELETE CASCADE chains and their derived views', () => {
      const tables = affectedTables(['user']);
      expect(tables).toEqual(expect.arrayContaining(['tenant_user', 'tenant_owner', 'user_role']));
      expect(tables).toContain('tenant_member');
      expect(affectedTables(['role'])).not.toContain('tenant_member');
   });

   it('marks the media library and the product images stale after a media change', () => {
      expect(affectedTables(['media_link'])).toEqual(
         expect.arrayContaining(['media_library', 'product_with_evidence', 'media'])
      );
      expect(affectedTables(['media'])).toEqual(
         expect.arrayContaining(['media_library', 'product_with_evidence', 'media_link'])
      );
      // A document citing a file counts in the library's document_count.
      expect(affectedTables(['document'])).toContain('media_library');
   });

   it('marks the order overview and the product evidence stale after an order change', () => {
      expect(affectedTables(['purchase_order_line'])).toEqual(
         expect.arrayContaining([
            'purchase_order',
            'purchase_order_overview',
            'product_evidence',
            'product_with_evidence'
         ])
      );
      expect(affectedTables(['purchase_order_payment'])).toEqual(
         expect.arrayContaining(['purchase_order', 'purchase_order_overview'])
      );
      expect(affectedTables(['purchase_order_update'])).toContain('purchase_order');
      expect(affectedTables(['purchase_order'])).toEqual(
         expect.arrayContaining(['purchase_order_overview', 'product_evidence'])
      );
      // The approved PSI and the spec sheets (has_approved_psi, spec_missing_line_ids).
      expect(affectedTables(['document'])).toContain('purchase_order_overview');
      expect(affectedTables(['setting'])).toContain('purchase_order_overview');
   });

   it('marks the shipment card and overview stale after a change to its orders, lines or events', () => {
      expect(affectedTables(['shipment_line'])).toEqual(
         expect.arrayContaining(['shipment', 'shipment_overview'])
      );
      expect(affectedTables(['shipment_purchase_order'])).toEqual(
         expect.arrayContaining(['shipment', 'shipment_overview'])
      );
      expect(affectedTables(['shipment_event'])).toContain('shipment');
      expect(affectedTables(['shipment_event'])).not.toContain('shipment_overview');
      // The links, lines and events go with their shipment (ON DELETE CASCADE).
      expect(affectedTables(['shipment'])).toEqual(
         expect.arrayContaining([
            'shipment_purchase_order',
            'shipment_line',
            'shipment_event',
            'shipment_overview'
         ])
      );
      // psi_missing_po_codes reads the orders' approved PSI reports.
      expect(affectedTables(['document'])).toContain('shipment_overview');
   });

   it('marks the shipment card stale after a change to what it embeds', () => {
      // The orders' status and tolerance, their lines and the lines' products.
      expect(affectedTables(['purchase_order'])).toContain('shipment');
      expect(affectedTables(['purchase_order_line'])).toContain('shipment');
      expect(affectedTables(['product'])).toContain('shipment');
      // The customer and the warehouse, which the overview names too.
      expect(affectedTables(['customer_warehouse'])).toEqual(
         expect.arrayContaining(['shipment', 'shipment_overview'])
      );
      expect(affectedTables(['customer'])).toEqual(
         expect.arrayContaining(['shipment', 'shipment_overview'])
      );
   });

   it('marks the dashboard boxes stale after a change to an order or a shipment', () => {
      // Lines change system_total; payments the planned deposit and balance dates.
      expect(affectedTables(['purchase_order'])).toContain('dashboard_purchase_order');
      expect(affectedTables(['purchase_order_line'])).toContain('dashboard_purchase_order');
      expect(affectedTables(['purchase_order_payment'])).toContain('dashboard_purchase_order');
      expect(affectedTables(['shipment'])).toContain('dashboard_shipment');
      expect(affectedTables(['shipment_purchase_order'])).toContain('dashboard_shipment');
   });

   it('marks the order card, its overview and the boxes stale after a change to what they embed', () => {
      // The order card embeds its lines' products and spec sheets.
      expect(affectedTables(['document'])).toContain('purchase_order');
      expect(affectedTables(['product'])).toContain('purchase_order');
      // The overview names the project, the supplier and the customer; the boxes show them.
      expect(affectedTables(['project'])).toContain('purchase_order_overview');
      expect(affectedTables(['supplier'])).toEqual(
         expect.arrayContaining([
            'purchase_order',
            'purchase_order_overview',
            'dashboard_purchase_order'
         ])
      );
      expect(affectedTables(['customer'])).toEqual(
         expect.arrayContaining([
            'shipment',
            'shipment_overview',
            'purchase_order',
            'purchase_order_overview',
            'dashboard_purchase_order',
            'dashboard_shipment'
         ])
      );
   });
});

describe('affectedTables of the market matrix', () => {
   it('marks the matrix overview and the live cell count stale after a cell change', () => {
      expect(affectedTables(['market_cell'])).toEqual(
         expect.arrayContaining(['market_cell_overview', 'product_evidence'])
      );
      expect(affectedTables(['market_cell'])).toContain('product_with_evidence');
      expect(affectedTables(['market_cell'])).not.toContain('dashboard_product_evidence');
   });

   it('marks the matrix overview stale after a change to what it names', () => {
      for (const table of ['product', 'project', 'customer'] as const)
         expect(affectedTables([table])).toContain('market_cell_overview');
   });
});

describe('invalidateTables', () => {
   it('invalidates the queries of the given tables and their derived views only', async () => {
      const queryClient = new QueryClient();
      const userDetail = queryKeys.detail(TENANT, 'user', 'u1');
      const userList = queryKeys.list(TENANT, 'user', { page: 1 });
      const memberView = queryKeys.list(TENANT, 'tenant_member');
      const planList = queryKeys.list(TENANT, 'plan');
      seed(queryClient, [userDetail, userList, memberView, planList, ['unrelated']]);

      await invalidateTables(queryClient, ['user']);

      expect(staleKeys(queryClient)).toEqual(
         expect.arrayContaining([userDetail, userList, memberView])
      );
      expect(staleKeys(queryClient)).not.toContainEqual(planList);
      expect(staleKeys(queryClient)).not.toContainEqual(['unrelated']);
   });
});

describe('affectedTables of incidents and change requests', () => {
   it('marks the log, deadlines, overview and rolled-back gates stale after an incident change', () => {
      expect(affectedTables(['incident'])).toEqual(
         expect.arrayContaining(['incident_log', 'incident_deadline', 'incident_overview'])
      );
      expect(affectedTables(['incident'])).toContain('project_gate');
      expect(affectedTables(['incident_log'])).toContain('incident');
      expect(affectedTables(['incident_deadline'])).toEqual(
         expect.arrayContaining(['incident', 'incident_overview'])
      );
   });

   it('marks the incident card stale after a gate change', () => {
      expect(affectedTables(['project_gate'])).toContain('incident');
   });

   it('marks the overview stale after a change to what it names', () => {
      for (const table of [
         'customer',
         'project',
         'product',
         'purchase_order',
         'shipment',
         'market_cell'
      ] as const)
         expect(affectedTables([table])).toContain('incident_overview');
   });

   it('marks the change request card stale after a change to what it embeds', () => {
      expect(affectedTables(['change_request'])).toContain('change_request_product');
      expect(affectedTables(['change_request_product'])).toContain('change_request');
      for (const table of ['customer', 'project', 'product', 'document'] as const)
         expect(affectedTables([table])).toContain('change_request');
   });

   it('refreshes the new dashboard boxes', () => {
      expect(affectedTables(['market_cell'])).toContain('dashboard_market');
      expect(affectedTables(['incident_deadline'])).toContain('dashboard_incident');
      expect(affectedTables(['change_request'])).toContain('dashboard_change_request');
   });
});
