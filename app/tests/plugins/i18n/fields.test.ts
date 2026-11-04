import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');

const fields = (locale: string): Record<string, unknown> =>
   JSON.parse(readFileSync(resolve(LOCALES_DIR, locale, 'index.json'), 'utf-8')).fields;

// The dashboard notifications and the audit log name a change by its table (`fields.<table>`), the
// permission picker and the plan screens a module by its id (`fields.<module>`).
const OPS_TABLES = [
   'setting',
   'document',
   'supplier',
   'supplier_contact',
   'customer',
   'customer_contact',
   'customer_warehouse',
   'customer_platform_account',
   'customer_brand',
   'product',
   'project',
   'project_product',
   'project_gate',
   'project_task',
   'media',
   'media_link',
   'purchase_order',
   'purchase_order_line',
   'purchase_order_payment',
   'purchase_order_update',
   'shipment',
   'shipment_purchase_order',
   'shipment_line',
   'shipment_event',
   'market_cell',
   'incident',
   'incident_log',
   'incident_deadline',
   'change_request',
   'change_request_product'
];
const OPS_MODULES = [
   'ops_setting',
   'document',
   'supplier',
   'customer',
   'product',
   'project',
   'media',
   'purchase_order',
   'shipment',
   'market_matrix',
   'incident',
   'change_request'
];

describe('field names of the business modules', () => {
   it.each(['en', 'tr'])('%s names every business table and module', (locale) => {
      const names = fields(locale);
      const missing = [...OPS_TABLES, ...OPS_MODULES].filter(
         (key) => typeof names[key] !== 'string'
      );
      expect(missing).toEqual([]);
   });
});
