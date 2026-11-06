import {
   type AmazonSchema,
   type Attributes,
   completeness,
   type GetDefinitionResponse,
   groupMissingCounts,
   languageTag,
   missingAttributes,
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

   it('shares the language default and the definition row with the server', () => {
      expect(languageTag('BE', null)).toBe('fr_BE');
      expect(toDefinitionRow(fixture).version).toBe('UHqSqmb4FNUk=');
   });
});
