import {
   type AmazonSchema,
   type Attributes,
   completeness,
   type GetDefinitionResponse,
   groupMissingCounts,
   languageTag,
   missingAttributes,
   providedAttributes,
   serverProvided,
   toDefinitionRow,
   toPropertyGroups
} from '@edge-shared/listingCompleteness';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readJson = (name: string) =>
   JSON.parse(
      readFileSync(resolve(__dirname, '../../../supabase/seed_files/amazon', name), 'utf8')
   );

const fixture: GetDefinitionResponse & { schema: AmazonSchema } = readJson(
   'LUGGAGE.A1PA6795UKMFR9.en_GB.json'
);
const story: Attributes = readJson('LUGGAGE.attributes.json');
const DE = { marketplaceId: 'A1PA6795UKMFR9', languageTag: 'de_DE' };

describe('listingCompleteness from the app (@edge-shared)', () => {
   it('counts the missing fields of an empty product per group', () => {
      const groups = toPropertyGroups(fixture.propertyGroups);
      const missing = missingAttributes(fixture.schema, groups, {}, DE);
      expect(groupMissingCounts(missing, groups)).toEqual({
         product_identity: 3,
         offer: 1,
         images: 1,
         product_details: 1,
         variations: 0
      });
   });

   it('finds the story complete once the server provides the identifier', () => {
      const provided = serverProvided({ gtin: '4006381333931' }, { price: null, currency: null });
      expect(completeness(fixture.schema, story, { ...DE, provided })).toEqual({
         required: 6,
         filled: 6
      });
   });

   it('derives the product card attributes the schema has, as the server does', () => {
      const { attributes, sources } = providedAttributes(
         { gtin: '4006381333931', brand: 'OKAEI', pack_qty: 2, unit_net_g: 180 },
         { price: null, currency: null },
         fixture.schema,
         DE
      );
      expect(attributes).toEqual({
         brand: [{ value: 'OKAEI', language_tag: 'de_DE', marketplace_id: DE.marketplaceId }],
         number_of_items: [{ value: 2, marketplace_id: DE.marketplaceId }]
      });
      const unbranded: Attributes = { ...story };
      delete unbranded.brand;
      expect(
         completeness(fixture.schema, unbranded, { ...DE, provided: Object.keys(sources) })
      ).toEqual({ required: 6, filled: 6 });
   });

   it('shares the language default and the definition row with the server', () => {
      expect(languageTag('BE', null)).toBe('fr_BE');
      expect(toDefinitionRow(fixture).version).toBe('UHqSqmb4FNUk=');
   });
});
