import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
   type AmazonSchema,
   type Attributes,
   attributeFilled,
   completeness,
   type CompletenessOptions,
   type GetDefinitionResponse,
   groupMissingCounts,
   languageTag,
   missingAttributes,
   type PropertyGroups,
   requiredAttributes,
   serverProvided,
   toDefinitionRow
} from '../_shared/listingCompleteness.ts';

const readJson = async (name: string) =>
   JSON.parse(await Deno.readTextFile(new URL(`../../seed_files/amazon/${name}`, import.meta.url)));

const fixture: GetDefinitionResponse & { schema: AmazonSchema } = await readJson(
   'LUGGAGE.A1PA6795UKMFR9.en_GB.json'
);
const story: Attributes = await readJson('LUGGAGE.attributes.json');
const schema = fixture.schema;
const groups: PropertyGroups = fixture.propertyGroups;

const DE: CompletenessOptions = { marketplaceId: 'A1PA6795UKMFR9', languageTag: 'de_DE' };
const WITH_GTIN: CompletenessOptions = {
   ...DE,
   provided: ['externally_assigned_product_identifier']
};
const names = (missing: { attribute: string }[]) => missing.map((m) => m.attribute);

Deno.test('an empty product misses the six required attributes', () => {
   const missing = missingAttributes(schema, groups, {}, DE);
   assertEquals(names(missing), [
      'brand',
      'bullet_point',
      'condition_type',
      'externally_assigned_product_identifier',
      'item_name',
      'main_product_image_locator'
   ]);
   assertEquals(new Set(missing.map((m) => m.reason)), new Set(['required']));
   assertEquals(missing.find((m) => m.attribute === 'bullet_point')?.group, 'product_details');
});

Deno.test('a language-tagged value counts only in the cell language', () => {
   const attributes = { item_name: [{ value: 'x', language_tag: 'en_GB' }] };
   assertEquals(
      names(missingAttributes(schema, groups, attributes, DE)).includes('item_name'),
      true
   );
   assertEquals(attributeFilled(attributes.item_name, { ...DE, languageTag: 'en_GB' }), true);
   assertEquals(attributeFilled([{ value: 'x' }], DE), true);
});

Deno.test('a value for another marketplace does not count', () => {
   assertEquals(attributeFilled([{ value: 'OKAEI', marketplace_id: 'A13V1IB3VIYZZH' }], DE), false);
   assertEquals(attributeFilled([{ value: 'OKAEI', marketplace_id: 'A1PA6795UKMFR9' }], DE), true);
});

Deno.test('empty strings and empty arrays are not filled', () => {
   assertEquals(attributeFilled([], DE), false);
   assertEquals(attributeFilled([{ value: '' }], DE), false);
   assertEquals(attributeFilled([{ value: '   ' }], DE), false);
   assertEquals(attributeFilled([{ value: null }], DE), false);
   assertEquals(attributeFilled([{ value: [] }], DE), false);
   assertEquals(
      attributeFilled([{ language_tag: 'de_DE', marketplace_id: 'A1PA6795UKMFR9' }], DE),
      false
   );
   assertEquals(attributeFilled(undefined, DE), false);
   assertEquals(attributeFilled('x', DE), false);
   assertEquals(attributeFilled([{ unit: 'grams' }], DE), false);
   assertEquals(attributeFilled([{ value: 350, unit: 'grams' }], DE), true);
   assertEquals(attributeFilled([{ value: false }], DE), true);
   assertEquals(attributeFilled([{ value: 0 }], DE), true);
   assertEquals(attributeFilled([{ media_location: 'media:x' }], DE), true);
   assertEquals(attributeFilled([{ currency: 'EUR', our_price: [] }], DE), true);
   assertEquals(
      attributeFilled([{ our_price: [{ schedule: [{ value_with_tax: 12.5 }] }] }], DE),
      true
   );
});

Deno.test('a child also needs child_parent_sku_relationship and variation_theme', () => {
   const child = { ...story, parentage_level: [{ value: 'child' }] };
   assertEquals(missingAttributes(schema, groups, child, WITH_GTIN), [
      { attribute: 'child_parent_sku_relationship', group: 'variations', reason: 'conditional' },
      { attribute: 'variation_theme', group: 'variations', reason: 'conditional' }
   ]);
   const parent = { ...story, parentage_level: [{ value: 'parent' }] };
   assertEquals(missingAttributes(schema, groups, parent, WITH_GTIN), []);
});

Deno.test('unsupported conditional constructs never make a field required', () => {
   const value = (values: string[]) => ({ properties: { value: { enum: values } } });
   const odd: AmazonSchema = {
      properties: {},
      allOf: [
         {
            if: { required: ['a'], properties: { a: { not: { contains: value(['y']) } } } },
            then: { required: ['x'] }
         },
         { if: { properties: { a: { contains: value(['y']) } } }, then: { required: ['x'] } },
         { if: { required: ['a'], anyOf: [] }, then: { required: ['x'] } },
         { anyOf: [{ required: ['x'] }] },
         'junk'
      ]
   };
   assertEquals(requiredAttributes(odd, { a: [{ value: 'y' }] }), []);
   const items: AmazonSchema = {
      properties: {},
      allOf: [
         {
            if: { required: ['a'], properties: { a: { items: value(['y']) } } },
            then: { required: ['x'] }
         }
      ]
   };
   assertEquals(requiredAttributes(items, { a: [{ value: 'y' }] }), [
      { attribute: 'x', reason: 'conditional' }
   ]);
   assertEquals(requiredAttributes(items, { a: [{ value: 'y' }, { value: 'z' }] }), []);
   assertEquals(requiredAttributes(items, {}), []);
});

Deno.test('groupMissingCounts counts per property group', () => {
   assertEquals(groupMissingCounts(missingAttributes(schema, groups, {}, DE), groups), {
      product_identity: 3,
      offer: 1,
      images: 1,
      product_details: 1,
      variations: 0
   });
});

Deno.test('provided attributes count as filled', () => {
   const missing = missingAttributes(schema, groups, {}, WITH_GTIN);
   assertEquals(names(missing).includes('externally_assigned_product_identifier'), false);
   assertEquals(missing.length, 5);
});

Deno.test('the story attributes are complete for de_DE', () => {
   assertEquals(missingAttributes(schema, groups, story, WITH_GTIN), []);
   assertEquals(completeness(schema, story, WITH_GTIN), { required: 6, filled: 6 });
   assertEquals(completeness(schema, story, DE), { required: 6, filled: 5 });
   assertEquals(
      completeness(schema, story, { ...WITH_GTIN, languageTag: 'en_GB' }).filled < 6,
      true
   );
});

Deno.test('a new schema version keeps values and recomputes missing', () => {
   const before = structuredClone(story);
   const next: AmazonSchema = { ...schema, required: [...(schema.required ?? []), 'color'] };
   assertEquals(names(missingAttributes(next, groups, story, WITH_GTIN)), ['color']);
   assertEquals(story, before);
});

Deno.test(
   'serverProvided adds the identifier with a GTIN and the offer with price and currency',
   () => {
      assertEquals(serverProvided({ gtin: '4006381333931' }, { price: 12.5, currency: 'EUR' }), [
         'externally_assigned_product_identifier',
         'purchasable_offer',
         'fulfillment_availability'
      ]);
      assertEquals(serverProvided({ gtin: ' ' }, { price: 12.5, currency: null }), []);
      assertEquals(serverProvided({ gtin: null }, { price: null, currency: 'EUR' }), []);
      assertEquals(serverProvided({}, { price: 0, currency: 'EUR' }), [
         'purchasable_offer',
         'fulfillment_availability'
      ]);
   }
);

Deno.test('languageTag prefers the cell language, else the marketplace default', () => {
   assertEquals(languageTag('DE', null), 'de_DE');
   assertEquals(languageTag('DE', 'en_GB'), 'en_GB');
   assertEquals(languageTag('BE', undefined), 'fr_BE');
   assertEquals(languageTag('SE', ''), 'sv_SE');
   assertEquals(languageTag('GB', null), 'en_GB');
   assertEquals(languageTag('US', null), null);
   assertEquals(languageTag('US', 'en_US'), 'en_US');
});

Deno.test('toDefinitionRow converts the fixture envelope with its inline schema', () => {
   const row = toDefinitionRow(fixture);
   assertEquals(row.marketplace_id, 'A1PA6795UKMFR9');
   assertEquals(row.product_type, 'LUGGAGE');
   assertEquals(row.locale, 'en_GB');
   assertEquals(row.version, 'UHqSqmb4FNUk=');
   assertEquals(row.display_name, 'Luggage');
   assertEquals(row.property_groups.product_identity.title, 'Product Identity');
   assertEquals(row.schema, fixture.schema);
});

Deno.test('toDefinitionRow takes the downloaded schema when the answer carries a link', () => {
   const meta: GetDefinitionResponse = {
      ...fixture,
      marketplaceIds: ['A13V1IB3VIYZZH'],
      schema: {
         link: { resource: 'https://example.test/schema.json', verb: 'GET' },
         checksum: 'abc'
      }
   };
   const row = toDefinitionRow(meta, schema, 'fr_FR');
   assertEquals(row.marketplace_id, 'A13V1IB3VIYZZH');
   assertEquals(row.locale, 'fr_FR');
   assertEquals(row.schema, schema);
   assertThrows(() => toDefinitionRow(meta), Error, 'schema');
});
