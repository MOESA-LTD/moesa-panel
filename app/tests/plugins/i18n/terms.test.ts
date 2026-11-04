import { isTermCode, TERM_CODES, TERMS, termKeys, termSlug } from '@/constants/terms';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = resolve(__dirname, '../../../src/plugins/i18n/locales');

const LOCALES = readdirSync(LOCALES_DIR).filter((name) =>
   statSync(join(LOCALES_DIR, name)).isDirectory()
);

type Tree = { [k: string]: Tree | string };

const messages = (locale: string) =>
   JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'index.json'), 'utf-8')) as Tree;

const lookup = (tree: Tree, path: string): unknown =>
   path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);

const isText = (value: unknown) => typeof value === 'string' && value !== '';

/** Every string leaf of a message tree as `[key, value]`. */
const strings = (tree: Tree, prefix = ''): [string, string][] =>
   Object.entries(tree).flatMap(([key, value]): [string, string][] =>
      typeof value === 'string' ? [[`${prefix}${key}`, value]] : strings(value, `${prefix}${key}.`)
   );

/** A well-formed marker: `[[CODE]]` with no bracket inside. */
const MARKER = /\[\[([^[\]]+)\]\]/g;

/** The codes of a string's markers, sorted. */
const codesOf = (s: string) => [...s.matchAll(MARKER)].map((m) => m[1]!).sort();

/** The keys whose copy may mark codes (Global Constraints). */
const MARKED_PREFIXES = ['guide.pages.', 'glossary.', 'terms.', 'system_guide.'];
const MARKED_KEYS = [
   'ops.incident.preventive_hint',
   'ops.change_request.customer_approval_hint',
   'ops.product.import.hint'
];

const en = messages('en');
const tr = messages('tr');

describe('term copy', () => {
   it.each(['en', 'tr'])('%s has the short and long copy of every term', (locale) => {
      const tree = messages(locale);
      const missing = TERM_CODES.filter((code) => {
         const keys = termKeys(code);
         return !isText(lookup(tree, keys.short)) || !isText(lookup(tree, keys.long));
      });
      expect(missing).toEqual([]);
   });

   it('has term copy only for registered terms', () => {
      const slugs = new Set(TERM_CODES.map(termSlug));
      const terms = (en.terms ?? {}) as Tree;
      expect(Object.keys(terms).filter((slug) => !slugs.has(slug))).toEqual([]);
      const glossaryShort = TERM_CODES.filter(
         (code) =>
            TERMS[code]!.glossary && lookup(en, `terms.${termSlug(code)}.short`) !== undefined
      ).map(termSlug);
      expect(glossaryShort).toEqual([]);
   });

   it.each(LOCALES)('%s marks only known codes', (locale) => {
      const all = strings(messages(locale));
      const unknown = all
         .filter(([, value]) => codesOf(value).some((code) => !isTermCode(code)))
         .map(([key]) => key);
      expect(unknown).toEqual([]);
      const malformed = all
         .filter(([, value]) => /\[\[|\]\]/.test(value.replace(MARKER, '')))
         .map(([key]) => key);
      expect(malformed).toEqual([]);
   });

   it('marks the same codes in en and tr', () => {
      const trText = new Map(strings(tr));
      const differ = strings(en)
         .filter(([key, value]) => {
            const other = trText.get(key);
            return other !== undefined && codesOf(value).join() !== codesOf(other).join();
         })
         .map(([key]) => key);
      expect(differ).toEqual([]);
   });

   it('marks codes only in guide, glossary, term and hint copy', () => {
      const outside = strings(en)
         .filter(([, value]) => codesOf(value).length > 0)
         .map(([key]) => key)
         .filter(
            (key) =>
               !MARKED_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
               !MARKED_KEYS.includes(key)
         );
      expect(outside).toEqual([]);
   });

   it('keeps the short lines plain', () => {
      const marked = [en, tr].flatMap((tree) =>
         strings((tree.terms ?? {}) as Tree, 'terms.')
            .filter(([key, value]) => key.endsWith('.short') && /\[\[|\]\]/.test(value))
            .map(([key]) => key)
      );
      expect(marked).toEqual([]);
   });
});
