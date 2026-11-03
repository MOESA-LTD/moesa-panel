import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');
const SOURCE_LOCALE = 'en';

const flattenKeys = (value: unknown, prefix = ''): string[] =>
   value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) =>
           flattenKeys(child, prefix ? `${prefix}.${key}` : key)
        )
      : [prefix];

const readKeys = (locale: string) =>
   new Set(flattenKeys(JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'index.json'), 'utf-8'))));

const locales = readdirSync(LOCALES_DIR).filter((name) =>
   statSync(join(LOCALES_DIR, name)).isDirectory()
);

describe('locale messages', () => {
   const sourceKeys = readKeys(SOURCE_LOCALE);

   it.each(locales.filter((locale) => locale !== SOURCE_LOCALE))(
      '%s has the same keys as the source locale',
      (locale) => {
         const keys = readKeys(locale);
         expect({
            missing: [...sourceKeys].filter((key) => !keys.has(key)),
            extra: [...keys].filter((key) => !sourceKeys.has(key))
         }).toEqual({ missing: [], extra: [] });
      }
   );
});
