import {
   attributeFilled,
   type Attributes,
   type MissingField,
   type ProductCardColumn,
   type PropertyGroups,
   type PropertySchema,
   type ProvidedAttributes,
   type ProvidedSource,
   type requiredAttributes
} from '@edge-shared/listingCompleteness';

// The schema-driven Amazon form, read from the product type schema alone: no attribute is named
// here except by the `_image_locator` pattern of Amazon's image slots.

/** How the form edits one attribute. */
export type Control =
   | 'text'
   | 'textarea'
   | 'number'
   | 'select'
   | 'boolean'
   | 'measure'
   | 'image'
   | 'json';

/** The JSON-schema keywords of one property of an entry that the controls read. */
export type EntryPropertySchema = {
   title?: string;
   description?: string;
   type?: string;
   enum?: unknown[];
   enumNames?: string[];
   maxLength?: number;
   minimum?: number;
   maximum?: number;
};

/** One entry of an attribute's array: its value(s) and the selectors that scope it. */
export type Entry = Record<string, unknown>;

/** Keys that scope an entry rather than hold its content. */
const SELECTOR_KEYS = new Set(['marketplace_id', 'language_tag']);

const isObject = (value: unknown): value is Record<string, unknown> =>
   typeof value === 'object' && value !== null && !Array.isArray(value);

/** The properties of the attribute's entries (`items.properties`). */
export const entryProperties = (property: PropertySchema): Record<string, EntryPropertySchema> =>
   (property.items?.properties ?? {}) as Record<string, EntryPropertySchema>;

/** The entry's content keys: everything but the selectors (`marketplace_id`, `language_tag`). */
export const contentKeys = (property: PropertySchema): string[] =>
   Object.keys(entryProperties(property)).filter((key) => !SELECTOR_KEYS.has(key));

/**
 * The key that holds the entry's value: `value`, else the entry's only content key (a real
 * Amazon `variation_theme` holds `name`), else null (the entry has several parts).
 */
export function valueKey(property: PropertySchema): string | null {
   const keys = contentKeys(property);
   if (keys.includes('value')) return 'value';
   return keys.length === 1 ? keys[0]! : null;
}

/** Whether an attribute is one of Amazon's image slots (main, other_…, swatch). */
export const isImageSlot = (name: string) => name.includes('_image_locator');

const isNumeric = (field: EntryPropertySchema | undefined) =>
   field?.type === 'number' || field?.type === 'integer';

/**
 * The control of an attribute. An entry with parts beyond its value (and a measure's unit), or a
 * value of another type, is edited as JSON, so no part of an attribute is ever dropped.
 */
export function controlFor(name: string, property: PropertySchema): Control {
   if (isImageSlot(name)) return 'image';
   const key = valueKey(property);
   if (!key) return 'json';
   const others = contentKeys(property).filter((other) => other !== key);
   const field = entryProperties(property)[key];
   if (others.length === 1 && others[0] === 'unit') return isNumeric(field) ? 'measure' : 'json';
   if (others.length) return 'json';
   if (Array.isArray(field?.enum)) return 'select';
   if (field?.type === 'boolean') return 'boolean';
   if (isNumeric(field)) return 'number';
   if (field?.type === 'string') return (field.maxLength ?? 0) > 200 ? 'textarea' : 'text';
   return 'json';
}

/** Whether the attribute's entries carry a language (`items.properties.language_tag`). */
export const isLanguageTagged = (property: PropertySchema): boolean =>
   Object.hasOwn(entryProperties(property), 'language_tag');

/** The badge of an attribute: required by the schema, by a rule that holds, or optional. */
export const badgeFor = (
   name: string,
   required: ReturnType<typeof requiredAttributes>
): 'required' | 'conditional' | 'optional' =>
   required.find(({ attribute }) => attribute === name)?.reason ?? 'optional';

/** An entry of this language: one with that language_tag, or one without a language. */
const inLanguage = (entry: unknown, languageTag: string): entry is Entry =>
   isObject(entry) && (entry.language_tag == null || entry.language_tag === languageTag);

/** The positions in the attribute's array of the entries of this language, in order. */
const positionsIn = (entries: unknown[], languageTag: string) =>
   entries.flatMap((entry, position) => (inLanguage(entry, languageTag) ? [position] : []));

/** The attribute's `index`-th entry of the language (0 by default), or undefined. */
export function readValue(
   attributes: Attributes,
   name: string,
   opts: { languageTag: string; index?: number }
): Entry | undefined {
   const entries = attributes[name] ?? [];
   const position = positionsIn(entries, opts.languageTag)[opts.index ?? 0];
   return position === undefined ? undefined : (entries[position] as Entry);
}

/** The entry's content: what the controls edit, without its selectors. */
export const contentOf = (entry: Entry | undefined): Entry =>
   Object.fromEntries(Object.entries(entry ?? {}).filter(([key]) => !SELECTOR_KEYS.has(key)));

/** Whether an entry's content holds a value (a lone unit does not; false does). */
const hasValue = (content: Entry) =>
   attributeFilled([content], { marketplaceId: '', languageTag: '' });

/**
 * Writes the attribute's `index`-th entry of the language (an index past the last one appends).
 * `value` is the entry's content, or a bare value of its `value` key. Returns a new object: the
 * entries of other languages and the entry's marketplace_id are kept, and a blank value removes
 * only this entry (the attribute goes when it has none left).
 */
export function writeValue(
   attributes: Attributes,
   name: string,
   value: unknown,
   opts: { languageTag: string; languageTagged: boolean; index?: number }
): Attributes {
   const entries = [...(attributes[name] ?? [])];
   const position = positionsIn(entries, opts.languageTag)[opts.index ?? 0];
   const content = Object.fromEntries(
      Object.entries(isObject(value) ? value : { value }).filter(
         ([key, part]) => part !== undefined && !SELECTOR_KEYS.has(key)
      )
   );

   if (!hasValue(content)) {
      if (position !== undefined) entries.splice(position, 1);
   } else {
      const previous = position === undefined ? undefined : (entries[position] as Entry);
      const entry: Entry = {
         ...content,
         ...(previous?.marketplace_id != null ? { marketplace_id: previous.marketplace_id } : {}),
         ...(opts.languageTagged ? { language_tag: opts.languageTag } : {})
      };
      if (position === undefined) entries.push(entry);
      else entries[position] = entry;
   }

   const next = { ...attributes };
   if (entries.length) next[name] = entries;
   else delete next[name];
   return next;
}

/** How many entries of the language the attribute holds. */
export const entryCount = (attributes: Attributes, name: string, languageTag: string) =>
   positionsIn(attributes[name] ?? [], languageTag).length;

/**
 * The attribute an Amazon issue names: `attributeNames` may name a part of one
 * (`item_name[marketplace_id=…]`, `a.b`), which belongs to its base attribute.
 */
export const baseAttribute = (name: string) => name.split(/[[.]/)[0]!;

/** The group that lists the attribute, or null. */
export const groupOf = (groups: PropertyGroups, attribute: string): string | null =>
   groups.find(({ propertyNames }) => propertyNames.includes(attribute))?.key ?? null;

/** The missing fields in the order the form shows them: by group, then by the group's own order. */
export function missingInFormOrder(
   missing: readonly MissingField[],
   groups: PropertyGroups
): MissingField[] {
   const order = groups.flatMap(({ propertyNames }) => propertyNames);
   const rank = (attribute: string) => {
      const at = order.indexOf(attribute);
      return at === -1 ? order.length : at;
   };
   return [...missing].sort((a, b) => rank(a.attribute) - rank(b.attribute));
}

/** Where a listing's own value applies: a language, and the marketplace when known. */
export type ValueScope = { languageTag: string; marketplaceId?: string | null };

/** An entry of the scope: its language (or none named) and marketplace (or none named). */
const inScope = (entry: unknown, scope: ValueScope): entry is Entry =>
   inLanguage(entry, scope.languageTag) &&
   (scope.marketplaceId == null ||
      entry.marketplace_id == null ||
      entry.marketplace_id === scope.marketplaceId);

/**
 * Whether the attribute has a value of its own in the scope, as the server reads it
 * (attributeFilled): such a value wins over the one derived from the product card.
 */
export const hasOwnValue = (attributes: Attributes, name: string, scope: ValueScope) =>
   attributeFilled(
      (attributes[name] ?? []).filter((entry) => inScope(entry, scope)).map(contentOf),
      { marketplaceId: '', languageTag: '' }
   );

/**
 * Removes the attribute's entries of the scope (the attribute goes when it has none left); the
 * entries of other languages and marketplaces stay.
 */
export function clearScope(attributes: Attributes, name: string, scope: ValueScope): Attributes {
   const kept = (attributes[name] ?? []).filter((entry) => !inScope(entry, scope));
   const next = { ...attributes };
   if (kept.length) next[name] = kept;
   else delete next[name];
   return next;
}

/** Nothing provided: before the product, the cell or the schema is known. */
export const NOTHING_PROVIDED: ProvidedAttributes = Object.freeze({ attributes: {}, sources: {} });

/** The product card tab of each column attributes are derived from. */
const PRODUCT_TABS: Record<ProductCardColumn, 'general' | 'dimensions'> = {
   brand: 'general',
   origin_country: 'general',
   manufacturer_art_no: 'general',
   is_hazmat: 'general',
   unit_dims_mm: 'dimensions',
   unit_net_g: 'dimensions',
   pack_dims_mm: 'dimensions',
   pack_gross_g: 'dimensions',
   pack_qty: 'dimensions'
};

/** The product card column and its tab's route name of a derived attribute; null for the server's. */
export function productSourceOf(
   source: ProvidedSource | null | undefined
): { column: ProductCardColumn; route: string } | null {
   if (!source?.startsWith('product.')) return null;
   const column = source.slice('product.'.length) as ProductCardColumn;
   return { column, route: `ops-product-manage-${PRODUCT_TABS[column]}` };
}
