import { GLOSSARY_ENUMS, glossaryKey, type GlossaryEnum } from '@/api/glossary';
import type { InjectionKey } from 'vue';

/** The groups of the terms registry, in the order the terms are listed. */
export const TERM_CATEGORIES = [
   'process',
   'rule',
   'package',
   'gate',
   'family',
   'severity',
   'abbreviation'
] as const;

export type TermCategory = (typeof TERM_CATEGORIES)[number];

/**
 * A term a copy line can mark as `[[code]]`: its copy is `terms.<slug>.long` and, unless it reuses
 * a glossary line, `terms.<slug>.short`; `drive` links to its document.
 */
export type Term = {
   code: string;
   category: TermCategory;
   slug: string;
   glossary?: { enum: GlossaryEnum; value: string };
   drive?: string;
};

/** True only for a Google Drive or Google Docs address. */
export const driveLinkValid = (url: string): boolean =>
   /^https:\/\/(drive|docs)\.google\.com\//.test(url);

/** The documents' Drive links by term code; empty until the owner gives their URLs. */
const DRIVE_LINKS: Partial<Record<string, string>> = {};

const PROCESS = [
   'S05',
   'S07',
   'S08',
   'S09',
   'S10',
   'S11',
   'S12',
   'S13',
   'S14',
   'S15',
   'S16',
   'S17',
   'Y10'
];
const RULES = ['K5', 'K6', 'K7', 'K8'];
const ABBREVIATIONS = ['PI', 'PSI', 'ETD', 'ETA', 'CMR', 'GTIN', 'EAN', 'ASIN', 'SKU'];

const plain = (category: TermCategory, codes: readonly string[]): Term[] =>
   codes.map((code) => ({ code, category, slug: code }));

const derived = (
   category: TermCategory,
   e: GlossaryEnum,
   code: (value: string) => string
): Term[] =>
   GLOSSARY_ENUMS[e].map((value: string) => ({
      code: code(value),
      category,
      slug: category === 'gate' ? value : code(value),
      glossary: { enum: e, value }
   }));

const LIST: Term[] = [
   ...plain('process', PROCESS),
   ...plain('rule', RULES),
   ...derived('package', 'package', (value) => value),
   ...derived('gate', 'gate_code', (value) => value.replaceAll('_', '-')),
   { code: '(M)', category: 'gate', slug: 'M_gate' },
   ...derived('family', 'incident_family', (value) => value.toUpperCase()),
   ...derived('severity', 'incident_severity', (value) => value.toUpperCase()),
   ...plain('abbreviation', ABBREVIATIONS)
];

export const TERMS: Readonly<Record<string, Term>> = Object.fromEntries(
   LIST.map((term) => {
      const drive = DRIVE_LINKS[term.code];
      return [term.code, drive && driveLinkValid(drive) ? { ...term, drive } : term];
   })
);

export const TERM_CODES: readonly string[] = Object.keys(TERMS);

export const isTermCode = (code: string): boolean => Object.hasOwn(TERMS, code);

export const termSlug = (code: string): string => TERMS[code]?.slug ?? code;

/** The i18n keys of a term's copy: a derived term's short line is its glossary line. */
export const termKeys = (code: string): { short: string; long: string } => {
   const term = TERMS[code];
   const slug = termSlug(code);
   return {
      short: term?.glossary
         ? glossaryKey(term.glossary.enum, term.glossary.value)
         : `terms.${slug}.short`,
      long: `terms.${slug}.long`
   };
};

export const termsOf = (category: TermCategory): string[] =>
   TERM_CODES.filter((code) => TERMS[code]!.category === category);

/** The code of the term whose glossary line is `glossary.<e>.<value>`. */
export const termOfGlossary = (e: GlossaryEnum, value: string): string | undefined =>
   TERM_CODES.find((code) => {
      const g = TERMS[code]!.glossary;
      return g?.enum === e && g.value === value;
   });

export type TermPart = { text: string } | { code: string };

const MARKER = /\[\[([^[\]]+)\]\]/g;

/** Splits copy into text and marked terms; an unknown code is kept as text. */
export const parseTerms = (text: string): TermPart[] => {
   const parts: TermPart[] = [];
   let last = 0;
   for (const match of text.matchAll(MARKER)) {
      if (match.index > last) parts.push({ text: text.slice(last, match.index) });
      const code = match[1]!;
      parts.push(isTermCode(code) ? { code } : { text: code });
      last = match.index + match[0].length;
   }
   if (last < text.length || parts.length === 0) parts.push({ text: text.slice(last) });
   return parts;
};

/** The copy with its markers removed, for plain text (tooltips, options, labels). */
export const stripTerms = (text: string): string => text.replace(MARKER, '$1');

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Marks the first standalone `code` in a label, or appends the marker when the label has none. */
export const markLabel = (label: string, code: string): string => {
   const found = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(code)}(?![A-Za-z0-9])`).exec(label);
   if (!found) return `${label} [[${code}]]`;
   const end = found.index + code.length;
   return `${label.slice(0, found.index)}[[${code}]]${label.slice(end)}`;
};

/** A page that handles term clicks itself provides this; otherwise a term opens the guide panel. */
export const TERM_SELECT: InjectionKey<(code: string) => void> = Symbol('termSelect');
