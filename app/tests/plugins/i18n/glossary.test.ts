import { GLOSSARY_ENUMS, GLOSSARY_LABELS } from '@/api/glossary';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');

type Tree = { [k: string]: Tree | string };

const lookup = (tree: Tree, path: string): unknown =>
   path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);

type Glossary = Record<string, Record<string, unknown>>;

const messages = (locale: string) =>
   JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'index.json'), 'utf-8')) as {
      glossary?: Glossary;
   };

describe('glossary', () => {
   it.each(['en', 'tr'])('%s describes every value of every glossary enum', (locale) => {
      const glossary = messages(locale).glossary ?? {};
      const missing = Object.entries(GLOSSARY_ENUMS).flatMap(([e, values]) =>
         values.filter((v) => typeof glossary[e]?.[v] !== 'string').map((v) => `${e}.${v}`)
      );
      expect(missing).toEqual([]);
   });

   it('has no entry for a value that is gone', () => {
      const extra = Object.entries(messages('en').glossary ?? {}).flatMap(([e, entries]) =>
         Object.keys(entries)
            .filter((v) => !(GLOSSARY_ENUMS as Record<string, readonly string[]>)[e]?.includes(v))
            .map((v) => `${e}.${v}`)
      );
      expect(extra).toEqual([]);
   });

   it('covers the enums the spec names', () => {
      expect(Object.keys(GLOSSARY_ENUMS).sort()).toEqual([
         'change_kind',
         'change_request_source',
         'change_request_status',
         'change_request_urgency',
         'content_status',
         'cost_payer',
         'customer_status',
         'document_status',
         'document_type',
         'gate_code',
         'incident_deadline_kind',
         'incident_family',
         'incident_outcome',
         'incident_party',
         'incident_root_cause',
         'incident_severity',
         'incident_status',
         'market_cell_status',
         'market_compliance',
         'package',
         'payment_kind',
         'product_status',
         'project_path',
         'project_type',
         'purchase_order_status',
         'shipment_mode',
         'shipment_status',
         'stock_source',
         'supplier_status',
         'task_status'
      ]);
   });

   it('maps every glossary enum to a label prefix', () => {
      expect(Object.keys(GLOSSARY_LABELS).sort()).toEqual(Object.keys(GLOSSARY_ENUMS).sort());
   });

   it('labels every value of every glossary enum', () => {
      const missing = ['en', 'tr'].flatMap((locale) => {
         const tree = JSON.parse(
            readFileSync(join(LOCALES_DIR, locale, 'index.json'), 'utf-8')
         ) as Tree;
         return Object.entries(GLOSSARY_ENUMS).flatMap(([e, values]) => {
            const prefix = GLOSSARY_LABELS[e as keyof typeof GLOSSARY_ENUMS];
            if (prefix === null) return [];
            return (values as readonly string[])
               .filter((v) => {
                  const label = lookup(tree, `${prefix}.${v}`);
                  return typeof label !== 'string' || label === '';
               })
               .map((v) => `${locale}:${prefix}.${v}`);
         });
      });
      expect(missing).toEqual([]);
   });
});
