/**
 * Completeness of a product's Amazon attributes against a product type schema.
 *
 * Pure and import-free on purpose: the Edge Functions (Deno) and the app (Vite, via the
 * `@edge-shared` alias) both import this file, so it may use nothing but plain TypeScript.
 * No attribute names are hard-coded here except the ones the server itself fills
 * (`serverProvided`); everything else comes from the schema.
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
