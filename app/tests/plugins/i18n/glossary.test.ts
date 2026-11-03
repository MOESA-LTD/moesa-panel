import { GLOSSARY_ENUMS } from '@/api/glossary';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');

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
         'customer_status',
         'document_status',
         'document_type',
         'gate_code',
         'package',
         'product_status',
         'project_path',
         'project_type',
         'supplier_status',
         'task_status'
      ]);
   });
});
