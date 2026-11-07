/**
 * Completeness of a product's Amazon attributes against a product type schema.
 *
 * Pure and import-free on purpose: the Edge Functions (Deno) and the app (Vite, via the
 * `@edge-shared` alias) both import this file, so it may use nothing but plain TypeScript.
 * No attribute names are hard-coded here except the ones the server itself fills
 * (`serverProvided`) and those derived from the product card (`providedAttributes`); everything
 * else comes from the schema.
 */

export type PropertySchema = {
   title?: string;
   description?: string;
   type?: string;
   items?: { properties?: Record<string, unknown>; required?: string[] };
   maxItems?: number;
   hidden?: boolean;
   editable?: boolean;
};
export type AmazonSchema = {
   properties: Record<string, PropertySchema>;
   required?: string[];
   allOf?: unknown[];
};
/** Amazon's property groups as its API answers them: an object keyed by group, in Amazon's order. */
export type RawPropertyGroups = Record<
   string,
   { title: string; description?: string; propertyNames: string[] }
>;
/** One property group, with its key. */
export type PropertyGroup = {
   key: string;
   title: string;
   description?: string;
   propertyNames: string[];
};
/**
 * The property groups as stored and read: an array in Amazon's order (a jsonb object would
 * reorder the keys, and the form lists the groups in this order).
 */
export type PropertyGroups = PropertyGroup[];
export type Attributes = Record<string, unknown[]>;
export type CompletenessOptions = {
   marketplaceId: string;
   languageTag: string;
   provided?: readonly string[];
};
export type RequiredAttribute = { attribute: string; reason: 'required' | 'conditional' };
export type MissingField = {
   attribute: string;
   group: string | null;
   reason: 'required' | 'conditional';
};

/** The Product Type Definitions API's link to a schema document (`schema` / `metaSchema`). */
export type SchemaLink = { link: { resource: string; verb: string }; checksum: string };
/** `getDefinitionsProductType` (2020-09-01). The R3 fixture carries `schema` inline instead of a link. */
export type GetDefinitionResponse = {
   productType: string;
   marketplaceIds: string[];
   locale?: string;
   displayName?: string;
   requirements?: string;
   requirementsEnforced?: string;
   productTypeVersion: { version: string; latest?: boolean; releaseCandidate?: boolean };
   propertyGroups: RawPropertyGroups;
   schema: AmazonSchema | SchemaLink;
   metaSchema?: SchemaLink;
};
/** A row of `public.amazon_product_type_definition` (fetched_at is defaulted by the table). */
export type DefinitionRow = {
   marketplace_id: string;
   product_type: string;
   locale: string;
   version: string;
   display_name: string | null;
   schema: AmazonSchema;
   property_groups: PropertyGroups;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
   typeof value === 'object' && value !== null && !Array.isArray(value);

const isSchema = (value: unknown): value is AmazonSchema =>
   isObject(value) && isObject(value.properties);

/**
 * Entry keys that do not carry content on their own: the selectors that scope an entry, and the
 * `unit` of a measure (a unit without its value is not an answer).
 */
const NON_CONTENT_KEYS = new Set(['marketplace_id', 'language_tag', 'unit']);

/** A leaf with content: a non-blank string, a number, a boolean, or a container holding one. */
const hasContent = (value: unknown): boolean => {
   if (typeof value === 'string') return value.trim() !== '';
   if (typeof value === 'number') return Number.isFinite(value);
   if (typeof value === 'boolean') return true;
   if (Array.isArray(value)) return value.some(hasContent);
   if (isObject(value)) return Object.values(value).some(hasContent);
   return false;
};

/**
 * True when `values` is an array with at least one entry for this marketplace (or none named)
 * and this language (or none named) that holds a non-blank leaf (`value`, `media_location`,
 * `currency`, ...). Empty strings, empty arrays, null and a lone `unit` do not count.
 */
export function attributeFilled(values: unknown, opts: CompletenessOptions): boolean {
   if (!Array.isArray(values)) return false;
   return values.some((entry) => {
      if (!isObject(entry)) return false;
      if (entry.marketplace_id != null && entry.marketplace_id !== opts.marketplaceId) return false;
      if (entry.language_tag != null && entry.language_tag !== opts.languageTag) return false;
      return Object.entries(entry).some(
         ([key, leaf]) => !NON_CONTENT_KEYS.has(key) && hasContent(leaf)
      );
   });
}

const stringArray = (value: unknown): string[] | null =>
   Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? (value as string[])
      : null;

/** The `value` enum of `{ properties: { value: { enum } } }`, else null. */
const valueEnum = (node: unknown): unknown[] | null => {
   if (!isObject(node) || Object.keys(node).some((key) => key !== 'properties')) return null;
   const properties = node.properties;
   if (!isObject(properties) || Object.keys(properties).some((key) => key !== 'value')) return null;
   const value = properties.value;
   if (!isObject(value) || Object.keys(value).some((key) => key !== 'enum')) return null;
   return Array.isArray(value.enum) ? value.enum : null;
};

const entryValue = (entry: unknown) => (isObject(entry) ? entry.value : undefined);

/**
 * Evaluates one `if.properties.<a>` condition: `contains` (some entry's value is in the enum)
 * or `items` (every entry's value is). Returns null for any other construct.
 */
const propertyCondition = (condition: unknown, values: unknown): boolean | null => {
   if (!isObject(condition)) return null;
   const keys = Object.keys(condition);
   if (keys.length !== 1) return null;
   const allowed = valueEnum(condition[keys[0]]);
   if (!allowed) return null;
   const entries = Array.isArray(values) ? values : [];
   if (keys[0] === 'contains') return entries.some((entry) => allowed.includes(entryValue(entry)));
   if (keys[0] === 'items') return entries.every((entry) => allowed.includes(entryValue(entry)));
   return null;
};

/**
 * The required names of an `allOf` rule when its `if` holds for `attributes`; [] when it does
 * not hold or uses a construct this module does not evaluate (so it never makes a field required).
 */
const conditionalRequired = (rule: unknown, attributes: Attributes): string[] => {
   if (!isObject(rule) || !isObject(rule.if) || !isObject(rule.then)) return [];
   const { required, properties, ...rest } = rule.if;
   const ifRequired = stringArray(required);
   if (!ifRequired?.length || Object.keys(rest).length > 0) return [];
   if (properties !== undefined && !isObject(properties)) return [];
   if (!ifRequired.every((name) => Object.hasOwn(attributes, name))) return [];
   for (const [name, condition] of Object.entries(properties ?? {})) {
      if (propertyCondition(condition, attributes[name]) !== true) return [];
   }
   return stringArray(rule.then.required) ?? [];
};

/** `schema.required` (reason 'required') plus the `allOf` if/then rules that hold ('conditional'), by name. */
export function requiredAttributes(
   schema: AmazonSchema,
   attributes: Attributes
): RequiredAttribute[] {
   const reasons = new Map<string, RequiredAttribute['reason']>();
   for (const name of schema.required ?? []) reasons.set(name, 'required');
   for (const rule of schema.allOf ?? []) {
      for (const name of conditionalRequired(rule, attributes)) {
         if (!reasons.has(name)) reasons.set(name, 'conditional');
      }
   }
   return [...reasons]
      .map(([attribute, reason]) => ({ attribute, reason }))
      .sort((a, b) => a.attribute.localeCompare(b.attribute));
}

/** The required attributes that are neither provided nor filled. */
const unfilled = (
   required: RequiredAttribute[],
   attributes: Attributes,
   opts: CompletenessOptions
) => {
   const provided = new Set(opts.provided ?? []);
   return required.filter(
      ({ attribute }) => !provided.has(attribute) && !attributeFilled(attributes[attribute], opts)
   );
};

/** Amazon's property groups as an ordered array (an object's own keys keep their order in JS). */
export const toPropertyGroups = (raw: RawPropertyGroups): PropertyGroups =>
   Object.entries(raw ?? {}).map(([key, group]) => ({ key, ...group }));

const groupOf = (groups: PropertyGroups, attribute: string) =>
   groups.find((group) => group.propertyNames.includes(attribute))?.key ?? null;

/**
 * The required attributes not filled for this marketplace and language, sorted by name, each with
 * its property group (null when no group lists it). `opts.provided` counts as filled.
 */
export function missingAttributes(
   schema: AmazonSchema,
   groups: PropertyGroups,
   attributes: Attributes,
   opts: CompletenessOptions
): MissingField[] {
   return unfilled(requiredAttributes(schema, attributes), attributes, opts).map(
      ({ attribute, reason }) => ({ attribute, group: groupOf(groups, attribute), reason })
   );
}

/** Missing fields per property group; every group is present (0 when complete). Ungrouped fields are not counted. */
export function groupMissingCounts(
   missing: readonly MissingField[],
   groups: PropertyGroups
): Record<string, number> {
   const counts: Record<string, number> = Object.fromEntries(groups.map(({ key }) => [key, 0]));
   for (const { group } of missing) {
      if (group !== null && Object.hasOwn(counts, group)) counts[group] += 1;
   }
   return counts;
}

/** How many attributes are required and how many of those are filled (or provided). */
export function completeness(
   schema: AmazonSchema,
   attributes: Attributes,
   opts: CompletenessOptions
): { required: number; filled: number } {
   const required = requiredAttributes(schema, attributes);
   return {
      required: required.length,
      filled: required.length - unfilled(required, attributes, opts).length
   };
}

const isBlank = (value: unknown) =>
   value == null || (typeof value === 'string' && value.trim() === '');

/** What the server fills that depends on more than the product row and the cell. */
export type ProvidedOptions = {
   /** The product is a variation parent (it has children): it sends no identifier and no offer (R7). */
   isParent?: boolean;
};

/**
 * The attributes the server fills on publish, so they count as filled (`CompletenessOptions.provided`):
 * the identifier from the GTIN, and the offer and availability once the cell has a price and a currency.
 * A variation parent has none of them to send, so all three count as provided (R7).
 */
export function serverProvided(
   product: { gtin?: string | null },
   cell: { price?: number | string | null; currency?: string | null },
   opts: ProvidedOptions = {}
): string[] {
   if (opts.isParent)
      return [
         'externally_assigned_product_identifier',
         'purchasable_offer',
         'fulfillment_availability'
      ];
   const provided: string[] = [];
   if (!isBlank(product.gtin)) provided.push('externally_assigned_product_identifier');
   if (!isBlank(cell.price) && !isBlank(cell.currency))
      provided.push('purchasable_offer', 'fulfillment_availability');
   return provided;
}

// --- Attributes derived from the product card ----------------------------------------------------

/** The product card (M3) columns some Amazon attributes are derived from, plus the GTIN. */
export type ProductCard = {
   gtin?: string | null;
   brand?: string | null;
   unit_dims_mm?: string | null;
   unit_net_g?: number | string | null;
   pack_dims_mm?: string | null;
   pack_gross_g?: number | string | null;
   pack_qty?: number | string | null;
   origin_country?: string | null;
   manufacturer_art_no?: string | null;
   is_hazmat?: boolean | null;
};
export type ProductCardColumn = Exclude<keyof ProductCard, 'gtin'>;
/** Where a provided attribute comes from: the server on publish, or a product card column. */
export type ProvidedSource = 'server' | `product.${ProductCardColumn}`;
/**
 * What is provided without being typed for Amazon. `sources` names every provided attribute;
 * `attributes` holds the values derived from the product card (the server builds its own values,
 * the identifier and the offer, on publish).
 */
export type ProvidedAttributes = {
   attributes: Attributes;
   sources: Record<string, ProvidedSource>;
};
export type ProvidedContext = ProvidedOptions & { marketplaceId: string; languageTag: string };

type Node = Record<string, unknown>;
type Entry = Record<string, unknown>;
const nodeAt = (node: unknown, key: string): Node | null =>
   isObject(node) && isObject(node[key]) ? (node[key] as Node) : null;

/** The properties of an attribute's entries (`items.properties`), or null. */
const entryPartsOf = (schema: AmazonSchema | null | undefined, name: string): Node | null =>
   nodeAt(nodeAt(schema?.properties?.[name], 'items'), 'properties');

/** The values a part allows: its `enum`, with those of its `anyOf` branches; null for any. */
const allowedValues = (part: Node | null): unknown[] | null => {
   if (!part) return null;
   const values = [
      ...(Array.isArray(part.enum) ? part.enum : []),
      ...(Array.isArray(part.anyOf)
         ? part.anyOf.flatMap((branch) => allowedValues(branch) ?? [])
         : [])
   ];
   return values.length ? values : null;
};

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** A positive number from a numeric column, else null. */
const positive = (value: unknown): number | null => {
   const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
   return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
};

const text = (value: unknown): string | null =>
   typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** "120x80x40", "120×80×40", "12,5 x 8 x 4": length, width and height in mm; else null. */
export function parseDimensions(value: unknown): [number, number, number] | null {
   if (typeof value !== 'string') return null;
   const parts = value.trim().split(/\s*[x×*]\s*/i);
   if (parts.length !== 3 || !parts.every((part) => /^\d+(?:[.,]\d+)?$/.test(part))) return null;
   const sides = parts.map((part) => positive(part));
   return sides.every((side) => side !== null) ? (sides as [number, number, number]) : null;
}

/** Millimetres in the first unit the part allows of these (any part allows the first). */
const LENGTH_UNITS: ReadonlyArray<[string, number]> = [
   ['millimeters', 1],
   ['centimeters', 10],
   ['meters', 1000]
];
const WEIGHT_UNITS: ReadonlyArray<[string, number]> = [
   ['grams', 1],
   ['kilograms', 1000]
];

/** `{value, unit}` of an amount in the base unit, in the unit the part allows; null when none. */
const inUnit = (
   amount: number,
   unitPart: Node | null,
   units: ReadonlyArray<[string, number]>
): { value: number; unit: string } | null => {
   const allowed = allowedValues(unitPart);
   const match = units.find(([unit]) => !allowed || allowed.includes(unit));
   return match ? { value: round(amount / match[1]), unit: match[0] } : null;
};

/** The selectors an attribute's entries carry in this context. */
const selectorsFor = (parts: Node, ctx: ProvidedContext): Entry => ({
   ...(parts.language_tag ? { language_tag: ctx.languageTag } : {}),
   ...(parts.marketplace_id ? { marketplace_id: ctx.marketplaceId } : {})
});
/** A `{value}` entry; the value must be one the schema's enum allows, if it has one. */
const valueEntry = (parts: Node, value: unknown): Entry | null => {
   const allowed = allowedValues(nodeAt(parts, 'value'));
   return allowed && !allowed.includes(value) ? null : { value };
};

/** A `{value, unit}` entry of a weight in grams. */
const weightEntry = (parts: Node, grams: number): Entry | null =>
   parts.value ? inUnit(grams, nodeAt(parts, 'unit'), WEIGHT_UNITS) : null;

/** A `{length, width, height}` entry, each `{value, unit}`, from dimensions in mm. */
const dimensionsEntry = (parts: Node, [length, width, height]: number[]): Entry | null => {
   const sides: Entry = {};
   for (const [key, mm] of [
      ['length', length],
      ['width', width],
      ['height', height]
   ] as const) {
      const part = nodeAt(parts, key);
      const side = part
         ? inUnit(mm, nodeAt(nodeAt(part, 'properties'), 'unit'), LENGTH_UNITS)
         : null;
      if (!side) return null;
      sides[key] = side;
   }
   return sides;
};

/** `unit_count`: the count, typed `count` (in the language when its type is tagged). */
const countEntry = (parts: Node, count: number, ctx: ProvidedContext): Entry | null => {
   const typeParts = nodeAt(nodeAt(parts, 'type'), 'properties');
   if (!typeParts) return { value: count };
   const allowed = allowedValues(nodeAt(typeParts, 'value'));
   if (allowed && !allowed.includes('count')) return null;
   return {
      value: count,
      type: { value: 'count', ...(typeParts.language_tag ? { language_tag: ctx.languageTag } : {}) }
   };
};

/** Country names the product card may hold instead of the ISO code (en, tr, de). */
const COUNTRY_CODES: Readonly<Record<string, string>> = Object.freeze({
   china: 'CN',
   çin: 'CN',
   türkiye: 'TR',
   turkiye: 'TR',
   turkey: 'TR',
   türkei: 'TR',
   indonesia: 'ID',
   endonezya: 'ID',
   indonesien: 'ID',
   germany: 'DE',
   almanya: 'DE',
   deutschland: 'DE',
   india: 'IN',
   hindistan: 'IN',
   indien: 'IN',
   vietnam: 'VN',
   poland: 'PL',
   polonya: 'PL',
   polen: 'PL',
   italy: 'IT',
   italya: 'IT',
   italien: 'IT'
});

/** An ISO 3166 alpha-2 code from the card's origin (a code or a known name), else null. */
const countryCode = (origin: unknown): string | null => {
   const value = text(origin);
   if (!value) return null;
   if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
   return (
      COUNTRY_CODES[value.toLocaleLowerCase('tr')] ?? COUNTRY_CODES[value.toLowerCase()] ?? null
   );
};

type Derivation = {
   column: ProductCardColumn;
   attributes: readonly string[];
   entry: (parts: Node, product: ProductCard, ctx: ProvidedContext) => Entry | null;
};

/**
 * The mapping: each product card column, the Amazon attributes it fills (each only when the
 * schema has it) and the entry it makes in the attribute's shape. A value that does not parse, or
 * that the schema's enum or units do not allow, is not derived.
 */
const DERIVATIONS: readonly Derivation[] = [
   {
      column: 'brand',
      attributes: ['brand'],
      entry: (parts, { brand }) => (text(brand) ? valueEntry(parts, text(brand)) : null)
   },
   {
      column: 'unit_dims_mm',
      attributes: ['item_dimensions', 'item_length_width_height'],
      entry: (parts, { unit_dims_mm }) => {
         const dims = parseDimensions(unit_dims_mm);
         return dims ? dimensionsEntry(parts, dims) : null;
      }
   },
   {
      column: 'unit_net_g',
      attributes: ['item_weight', 'item_net_weight'],
      entry: (parts, { unit_net_g }) => {
         const grams = positive(unit_net_g);
         return grams ? weightEntry(parts, grams) : null;
      }
   },
   {
      column: 'pack_dims_mm',
      attributes: ['item_package_dimensions'],
      entry: (parts, { pack_dims_mm }) => {
         const dims = parseDimensions(pack_dims_mm);
         return dims ? dimensionsEntry(parts, dims) : null;
      }
   },
   {
      column: 'pack_gross_g',
      attributes: ['item_package_weight'],
      entry: (parts, { pack_gross_g }) => {
         const grams = positive(pack_gross_g);
         return grams ? weightEntry(parts, grams) : null;
      }
   },
   {
      column: 'pack_qty',
      attributes: ['number_of_items'],
      entry: (parts, { pack_qty }) => {
         const count = positive(pack_qty);
         return count && Number.isInteger(count) ? valueEntry(parts, count) : null;
      }
   },
   {
      column: 'pack_qty',
      attributes: ['unit_count'],
      entry: (parts, { pack_qty }, ctx) => {
         const count = positive(pack_qty);
         return count && Number.isInteger(count) ? countEntry(parts, count, ctx) : null;
      }
   },
   {
      column: 'origin_country',
      attributes: ['country_of_origin'],
      entry: (parts, { origin_country }) => {
         const code = countryCode(origin_country);
         return code ? valueEntry(parts, code) : null;
      }
   },
   {
      column: 'manufacturer_art_no',
      attributes: ['model_number', 'part_number'],
      entry: (parts, { manufacturer_art_no }) =>
         text(manufacturer_art_no) ? valueEntry(parts, text(manufacturer_art_no)) : null
   },
   {
      // Not hazmat declares no regulation; a hazmat product's regulation is the user's to state.
      column: 'is_hazmat',
      attributes: ['supplier_declared_dg_hz_regulation'],
      entry: (parts, { is_hazmat }) =>
         is_hazmat === false ? valueEntry(parts, 'not_applicable') : null
   }
];

/**
 * Everything provided without being typed for Amazon, for one cell: what the server fills on
 * publish (serverProvided: the GTIN's identifier, the offer, a parent's rules) and the attributes
 * derived from the product card in the schema's shape, for the cell's marketplace and language.
 * Derived values are never stored in `listing_attributes`: the server merges them under the
 * user's values on check, validate and publish (withProvided), and the forms show them.
 */
export function providedAttributes(
   product: ProductCard,
   cell: { price?: number | string | null; currency?: string | null },
   schema: AmazonSchema | null | undefined,
   ctx: ProvidedContext
): ProvidedAttributes {
   const sources: Record<string, ProvidedSource> = {};
   for (const name of serverProvided(product, cell, { isParent: ctx.isParent }))
      sources[name] = 'server';
   const attributes: Attributes = {};
   for (const { column, attributes: names, entry } of DERIVATIONS) {
      for (const name of names) {
         const parts = entryPartsOf(schema, name);
         if (!parts || Object.hasOwn(sources, name)) continue;
         const value = entry(parts, product, ctx);
         if (!value) continue;
         attributes[name] = [{ ...value, ...selectorsFor(parts, ctx) }];
         sources[name] = `product.${column}`;
      }
   }
   return { attributes, sources };
}

/** An entry of this marketplace (or none named) and this language (or none named). */
const inScope = (
   entry: unknown,
   opts: Pick<CompletenessOptions, 'marketplaceId' | 'languageTag'>
) =>
   isObject(entry) &&
   (entry.marketplace_id == null || entry.marketplace_id === opts.marketplaceId) &&
   (entry.language_tag == null || entry.language_tag === opts.languageTag);

/**
 * The user's attributes with the derived ones under them: a derived attribute is added only when
 * the user has no value for this marketplace and language (the user's value wins); the entries of
 * other marketplaces and languages are kept beside it. Returns a new object.
 */
export function withProvided(
   attributes: Attributes,
   provided: ProvidedAttributes,
   opts: Pick<CompletenessOptions, 'marketplaceId' | 'languageTag'>
): Attributes {
   const next: Attributes = { ...attributes };
   for (const [name, derived] of Object.entries(provided.attributes)) {
      if (attributeFilled(attributes[name], opts)) continue;
      const others = (attributes[name] ?? []).filter((entry) => !inScope(entry, opts));
      next[name] = [...others, ...derived];
   }
   return next;
}

/**
 * Amazon's marketplace id of each EU country the panel publishes to (sellingpartner docs
 * "Marketplace IDs"), in the panel's country order. The one map: _shared/amazon.ts and the app
 * read it from here.
 */
export const MARKETPLACE_IDS: Readonly<Record<string, string>> = Object.freeze({
   DE: 'A1PA6795UKMFR9',
   FR: 'A13V1IB3VIYZZH',
   IT: 'APJ6JRA9NG5V4',
   ES: 'A1RKKUPIHCS9HS',
   NL: 'A1805IZSGTT6HS',
   PL: 'A1C3SOZRARQ6R3',
   SE: 'A2NODRKZP88ZB9',
   BE: 'AMEN7PMS3EDWL',
   GB: 'A1F83G8C2ARO7P'
});

/** The default listing language of each EU Amazon marketplace, by country code. */
export const DEFAULT_LANGUAGE_TAGS: Readonly<Record<string, string>> = Object.freeze({
   DE: 'de_DE',
   FR: 'fr_FR',
   IT: 'it_IT',
   ES: 'es_ES',
   NL: 'nl_NL',
   PL: 'pl_PL',
   SE: 'sv_SE',
   BE: 'fr_BE',
   GB: 'en_GB'
});

/** The cell's `listing_language` when set, else the marketplace default; null for an unsupported country. */
export function languageTag(
   marketplaceCountry: string,
   cellListingLanguage?: string | null
): string | null {
   if (!isBlank(cellListingLanguage)) return cellListingLanguage as string;
   return Object.hasOwn(DEFAULT_LANGUAGE_TAGS, marketplaceCountry)
      ? DEFAULT_LANGUAGE_TAGS[marketplaceCountry]
      : null;
}

/**
 * A cache row from a definition answer. The schema is the downloaded one when given (the API
 * answers with a `{link, checksum}`), else the answer's inline schema (the R3 fixture). The locale
 * is the given one, else the answer's.
 */
export function toDefinitionRow(
   meta: GetDefinitionResponse,
   schema?: unknown,
   locale?: string
): DefinitionRow {
   const resolved = schema ?? meta.schema;
   if (!isSchema(resolved))
      throw new Error('toDefinitionRow: no schema with properties (download the schema link)');
   const marketplaceId = meta.marketplaceIds?.[0];
   if (!marketplaceId) throw new Error('toDefinitionRow: the answer names no marketplace');
   const rowLocale = locale ?? meta.locale;
   if (!rowLocale) throw new Error('toDefinitionRow: no locale');
   return {
      marketplace_id: marketplaceId,
      product_type: meta.productType,
      locale: rowLocale,
      version: meta.productTypeVersion.version,
      display_name: meta.displayName ?? null,
      schema: resolved,
      property_groups: toPropertyGroups(meta.propertyGroups)
   };
}
