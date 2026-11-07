import { assertEquals } from 'jsr:@std/assert@1';
import {
   type AmazonSchema,
   type Attributes,
   completeness,
   type GetDefinitionResponse,
   missingAttributes,
   type ProductCard,
   providedAttributes,
   toPropertyGroups,
   withProvided
} from '../_shared/listingCompleteness.ts';

// The Amazon attributes derived from the product card (M3). The R3 fixture has only brand,
// number_of_items and item_package_weight of the mapping, so the other rows use inline schemas
// shaped as Amazon's (value + unit, nested length/width/height, language_tag, marketplace_id).
const fixture: GetDefinitionResponse & { schema: AmazonSchema } = JSON.parse(
   await Deno.readTextFile(
      new URL('../../seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json', import.meta.url)
   )
);

const DE = { marketplaceId: 'A1PA6795UKMFR9', languageTag: 'de_DE' };
const NO_CELL = { price: null, currency: null };

const selector = { type: 'string' };
const entry = (properties: Record<string, unknown>) => ({
   type: 'array',
   items: { type: 'object', properties: { ...properties, marketplace_id: selector } }
});
const text = (tagged = false) =>
   entry({ value: { type: 'string' }, ...(tagged ? { language_tag: selector } : {}) });
const measure = (units: string[]) =>
   entry({ value: { type: 'number' }, unit: { type: 'string', enum: units } });
const side = (units: string[]) => ({
   type: 'object',
   properties: { value: { type: 'number' }, unit: { type: 'string', enum: units } }
});
const box = (units: string[]) =>
   entry({ length: side(units), width: side(units), height: side(units) });

const LENGTHS = ['centimeters', 'millimeters', 'meters', 'inches'];
const WEIGHTS = ['grams', 'kilograms', 'pounds'];

const schemaOf = (properties: Record<string, unknown>): AmazonSchema =>
   ({ properties }) as AmazonSchema;

const full = schemaOf({
   brand: text(true),
   item_dimensions: box(LENGTHS),
   item_weight: measure(WEIGHTS),
   item_package_dimensions: box(LENGTHS),
   item_package_weight: measure(WEIGHTS),
   number_of_items: entry({ value: { type: 'integer' } }),
   unit_count: entry({
      value: { type: 'number' },
      type: {
         type: 'object',
         properties: { value: { type: 'string', enum: ['count'] }, language_tag: selector }
      }
   }),
   country_of_origin: entry({ value: { type: 'string', enum: ['CN', 'DE', 'TR'] } }),
   model_number: text(),
   part_number: text(),
   supplier_declared_dg_hz_regulation: entry({
      value: { type: 'string', enum: ['ghs', 'not_applicable', 'other'] }
   })
});

const derive = (product: ProductCard, schema: AmazonSchema = full) =>
   providedAttributes(product, NO_CELL, schema, DE);
const mm = (value: number) => ({ value, unit: 'millimeters' });
const at = { marketplace_id: DE.marketplaceId };

Deno.test('the brand is derived in the cell language and marketplace', () => {
   const { attributes, sources } = derive({ brand: ' OKAEI ' });
   assertEquals(attributes.brand, [{ value: 'OKAEI', language_tag: 'de_DE', ...at }]);
   assertEquals(sources.brand, 'product.brand');
   assertEquals(derive({ brand: '  ' }).attributes.brand, undefined);
});

Deno.test('unit dimensions are parsed with x, × and decimal commas, in millimeters', () => {
   for (const dims of ['120x80x40', '120×80×40', ' 120 X 80 x 40 ']) {
      assertEquals(derive({ unit_dims_mm: dims }).attributes.item_dimensions, [
         { length: mm(120), width: mm(80), height: mm(40), ...at }
      ]);
   }
   const decimal = derive({ unit_dims_mm: '12,5 x 8 x 4' });
   assertEquals(decimal.attributes.item_dimensions, [
      { length: mm(12.5), width: mm(8), height: mm(4), ...at }
   ]);
   assertEquals(decimal.sources.item_dimensions, 'product.unit_dims_mm');
});

Deno.test('dimensions convert to centimeters when the schema allows only those', () => {
   const schema = schemaOf({ item_dimensions: box(['centimeters', 'inches']) });
   const cm = (value: number) => ({ value, unit: 'centimeters' });
   assertEquals(derive({ unit_dims_mm: '12,5 x 8 x 4' }, schema).attributes.item_dimensions, [
      { length: cm(1.25), width: cm(0.8), height: cm(0.4), ...at }
   ]);
   const inchesOnly = schemaOf({ item_dimensions: box(['inches']) });
   assertEquals(derive({ unit_dims_mm: '120x80x40' }, inchesOnly).attributes, {});
});

Deno.test('item_length_width_height takes the unit dimensions when the schema has it', () => {
   const schema = schemaOf({ item_length_width_height: box(LENGTHS) });
   const { attributes, sources } = derive({ unit_dims_mm: '400x300x15' }, schema);
   assertEquals(attributes.item_length_width_height, [
      { length: mm(400), width: mm(300), height: mm(15), ...at }
   ]);
   assertEquals(sources, { item_length_width_height: 'product.unit_dims_mm' });
});

Deno.test('unparseable dimensions are not derived', () => {
   for (const dims of ['120x80', 'about 12 cm', '12x8x', '0x0x0', '']) {
      assertEquals(derive({ unit_dims_mm: dims }).attributes.item_dimensions, undefined, dims);
   }
});

Deno.test('the net weight goes to item_weight in grams, or kilograms when only those', () => {
   assertEquals(derive({ unit_net_g: 180 }).attributes.item_weight, [
      { value: 180, unit: 'grams', ...at }
   ]);
   const kg = schemaOf({ item_weight: measure(['kilograms', 'pounds']) });
   assertEquals(derive({ unit_net_g: '180' }, kg).attributes.item_weight, [
      { value: 0.18, unit: 'kilograms', ...at }
   ]);
   const net = schemaOf({ item_net_weight: measure(WEIGHTS) });
   const { attributes, sources } = derive({ unit_net_g: 180 }, net);
   assertEquals(attributes.item_net_weight, [{ value: 180, unit: 'grams', ...at }]);
   assertEquals(sources.item_net_weight, 'product.unit_net_g');
   assertEquals(derive({ unit_net_g: 0 }).attributes.item_weight, undefined);
});

Deno.test('the pack dimensions and gross weight go to the package attributes', () => {
   const { attributes, sources } = derive({ pack_dims_mm: '410x310x30', pack_gross_g: 400 });
   assertEquals(attributes.item_package_dimensions, [
      { length: mm(410), width: mm(310), height: mm(30), ...at }
   ]);
   assertEquals(attributes.item_package_weight, [{ value: 400, unit: 'grams', ...at }]);
   assertEquals(sources.item_package_dimensions, 'product.pack_dims_mm');
   assertEquals(sources.item_package_weight, 'product.pack_gross_g');
});

Deno.test('the pack quantity is the number of items and the unit count', () => {
   const { attributes } = derive({ pack_qty: 2 });
   assertEquals(attributes.number_of_items, [{ value: 2, ...at }]);
   assertEquals(attributes.unit_count, [
      { value: 2, type: { value: 'count', language_tag: 'de_DE' }, ...at }
   ]);
   assertEquals(derive({ pack_qty: 0 }).attributes.number_of_items, undefined);
   assertEquals(derive({ pack_qty: 1.5 }).attributes.number_of_items, undefined);
});

Deno.test('the country of origin is an ISO code the schema enum accepts', () => {
   for (const origin of ['CN', 'cn', 'China', 'Çin']) {
      assertEquals(
         derive({ origin_country: origin }).attributes.country_of_origin,
         [{ value: 'CN', ...at }],
         origin
      );
   }
   assertEquals(derive({ origin_country: 'Türkiye' }).attributes.country_of_origin, [
      { value: 'TR', ...at }
   ]);
   // Not in the enum, or not a known country: not derived.
   assertEquals(derive({ origin_country: 'FR' }).attributes.country_of_origin, undefined);
   assertEquals(derive({ origin_country: 'Atlantis' }).attributes.country_of_origin, undefined);
});

Deno.test('the manufacturer article number is the model and the part number', () => {
   const { attributes, sources } = derive({ manufacturer_art_no: 'MOP-40' });
   assertEquals(attributes.model_number, [{ value: 'MOP-40', ...at }]);
   assertEquals(attributes.part_number, [{ value: 'MOP-40', ...at }]);
   assertEquals(sources.model_number, 'product.manufacturer_art_no');
   assertEquals(sources.part_number, 'product.manufacturer_art_no');
});

Deno.test('a product that is not hazmat declares no dangerous goods regulation', () => {
   assertEquals(derive({ is_hazmat: false }).attributes.supplier_declared_dg_hz_regulation, [
      { value: 'not_applicable', ...at }
   ]);
   // Hazmat: the user names the regulation; unknown: nothing is declared.
   assertEquals(
      derive({ is_hazmat: true }).attributes.supplier_declared_dg_hz_regulation,
      undefined
   );
   assertEquals(derive({}).attributes.supplier_declared_dg_hz_regulation, undefined);
});

Deno.test('an attribute the schema does not have is not derived', () => {
   const product: ProductCard = {
      brand: 'OKAEI',
      unit_dims_mm: '400x300x15',
      unit_net_g: 180,
      pack_qty: 2,
      pack_gross_g: 400,
      origin_country: 'CN',
      manufacturer_art_no: 'MOP-40',
      is_hazmat: false
   };
   const { attributes, sources } = providedAttributes(product, NO_CELL, fixture.schema, DE);
   const names = ['brand', 'item_package_weight', 'number_of_items'];
   assertEquals(Object.keys(attributes).sort(), names);
   assertEquals(Object.keys(sources).sort(), names);
   assertEquals(providedAttributes(product, NO_CELL, null, DE).attributes, {});
});

Deno.test('the server sources sit next to the product ones', () => {
   const { attributes, sources } = providedAttributes(
      { gtin: '4006381333931', brand: 'OKAEI' },
      { price: 12.5, currency: 'EUR' },
      fixture.schema,
      DE
   );
   assertEquals(sources, {
      externally_assigned_product_identifier: 'server',
      purchasable_offer: 'server',
      fulfillment_availability: 'server',
      brand: 'product.brand'
   });
   // The server builds its own values on publish.
   assertEquals(Object.keys(attributes), ['brand']);
   const parent = providedAttributes({}, NO_CELL, fixture.schema, { ...DE, isParent: true });
   assertEquals(Object.keys(parent.sources).length, 3);
});

Deno.test('the user value wins over the derived one, in its language and marketplace', () => {
   const provided = derive({ brand: 'OKAEI', unit_net_g: 180 });
   const user: Attributes = {
      brand: [{ value: 'OKAEI Pro', language_tag: 'de_DE' }],
      item_weight: [{ value: 0.2, unit: 'kilograms', marketplace_id: 'A13V1IB3VIYZZH' }]
   };
   const merged = withProvided(user, provided, DE);
   assertEquals(merged.brand, [{ value: 'OKAEI Pro', language_tag: 'de_DE' }]);
   // The French weight is not this marketplace's: the derived one is added beside it.
   assertEquals(merged.item_weight, [
      { value: 0.2, unit: 'kilograms', marketplace_id: 'A13V1IB3VIYZZH' },
      { value: 180, unit: 'grams', ...at }
   ]);
   // An English brand does not override the German one.
   const english = withProvided({ brand: [{ value: 'X', language_tag: 'en_GB' }] }, provided, DE);
   assertEquals(english.brand, [
      { value: 'X', language_tag: 'en_GB' },
      { value: 'OKAEI', language_tag: 'de_DE', ...at }
   ]);
   // The input is not changed.
   assertEquals(user.brand?.length, 1);
   assertEquals(user.item_weight?.length, 1);
});

Deno.test('derived attributes count as filled', () => {
   const groups = toPropertyGroups(fixture.propertyGroups);
   const { sources } = providedAttributes(
      { gtin: '4006381333931', brand: 'OKAEI' },
      NO_CELL,
      fixture.schema,
      DE
   );
   const provided = Object.keys(sources);
   const missing = missingAttributes(fixture.schema, groups, {}, { ...DE, provided });
   assertEquals(missing.map((m) => m.attribute).includes('brand'), false);
   assertEquals(completeness(fixture.schema, {}, { ...DE, provided }), { required: 6, filled: 2 });
});

Deno.test('a variation parent derives only its identity, never what its children vary by', () => {
   const product: ProductCard = {
      brand: 'OKAEI',
      unit_dims_mm: '400x300x15',
      unit_net_g: 180,
      pack_dims_mm: '410x310x30',
      pack_gross_g: 400,
      pack_qty: 2,
      origin_country: 'CN',
      manufacturer_art_no: 'MOP-40',
      is_hazmat: false
   };
   const { attributes } = providedAttributes(product, NO_CELL, full, { ...DE, isParent: true });
   assertEquals(Object.keys(attributes).sort(), [
      'brand',
      'country_of_origin',
      'model_number',
      'part_number',
      'supplier_declared_dg_hz_regulation'
   ]);
});
