import {
   badgeFor,
   controlFor,
   isLanguageTagged,
   readValue,
   valueKey,
   writeValue
} from '@/components/service-components/amazon-form/amazonForm';
import {
   requiredAttributes,
   type AmazonSchema,
   type Attributes
} from '@edge-shared/listingCompleteness';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixture = JSON.parse(
   readFileSync(
      resolve(__dirname, '../../../supabase/seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json'),
      'utf8'
   )
) as { schema: AmazonSchema };
const { properties } = fixture.schema;

describe('controlFor', () => {
   it.each([
      ['condition_type', 'select'],
      ['product_description', 'textarea'],
      ['item_name', 'text'],
      ['item_package_weight', 'measure'],
      ['is_fragile', 'boolean'],
      ['main_product_image_locator', 'image'],
      ['number_of_items', 'number'],
      ['purchasable_offer', 'json'],
      // value and type both matter: no part of the attribute is dropped
      ['externally_assigned_product_identifier', 'json'],
      ['variation_theme', 'select']
   ])('controlFor %s is %s', (name, control) => {
      expect(controlFor(name, properties[name]!)).toBe(control);
   });

   it('reads a lone content key other than value (Amazon names variation_theme by name)', () => {
      const property = {
         type: 'array',
         items: {
            properties: {
               name: { type: 'string', enum: ['COLOR', 'SIZE'] },
               marketplace_id: { type: 'string' }
            }
         }
      };
      expect(valueKey(property)).toBe('name');
      expect(controlFor('variation_theme', property)).toBe('select');
   });
});

describe('isLanguageTagged', () => {
   it('is true when the entries carry a language_tag', () => {
      expect(isLanguageTagged(properties.item_name!)).toBe(true);
      expect(isLanguageTagged(properties.condition_type!)).toBe(false);
   });
});

describe('readValue and writeValue', () => {
   const story: Attributes = {
      item_name: [{ value: 'Wischmopp', language_tag: 'de_DE' }],
      bullet_point: [
         { value: 'Eins', language_tag: 'de_DE' },
         { value: 'One', language_tag: 'en_GB' },
         { value: 'Zwei', language_tag: 'de_DE' }
      ],
      condition_type: [{ value: 'new_new' }]
   };

   it('reads the entry of the language at the index', () => {
      expect(readValue(story, 'bullet_point', { languageTag: 'de_DE', index: 1 })).toEqual({
         value: 'Zwei',
         language_tag: 'de_DE'
      });
      expect(readValue(story, 'bullet_point', { languageTag: 'en_GB' })).toEqual({
         value: 'One',
         language_tag: 'en_GB'
      });
      expect(readValue(story, 'condition_type', { languageTag: 'fr_FR' })).toEqual({
         value: 'new_new'
      });
      expect(readValue(story, 'color', { languageTag: 'de_DE' })).toBeUndefined();
   });

   it('writeValue edits one language and keeps the others', () => {
      const withGerman: Attributes = {
         item_name: [{ value: 'Mop', language_tag: 'en_GB' }]
      };
      const next = writeValue(withGerman, 'item_name', 'Wischmopp', {
         languageTag: 'de_DE',
         languageTagged: true
      });
      expect(next.item_name).toEqual([
         { value: 'Mop', language_tag: 'en_GB' },
         { value: 'Wischmopp', language_tag: 'de_DE' }
      ]);
      expect(withGerman.item_name).toHaveLength(1);

      const edited = writeValue(
         next,
         'item_name',
         { value: 'Mopp' },
         {
            languageTag: 'de_DE',
            languageTagged: true
         }
      );
      expect(edited.item_name).toEqual([
         { value: 'Mop', language_tag: 'en_GB' },
         { value: 'Mopp', language_tag: 'de_DE' }
      ]);
   });

   it('writes an untagged value without a language_tag and keeps its marketplace_id', () => {
      const next = writeValue(
         { condition_type: [{ value: 'new_new', marketplace_id: 'A1PA6795UKMFR9' }] },
         'condition_type',
         'used_good',
         { languageTag: 'de_DE', languageTagged: false }
      );
      expect(next.condition_type).toEqual([
         { value: 'used_good', marketplace_id: 'A1PA6795UKMFR9' }
      ]);
   });

   it('writeValue with a blank value removes only that entry', () => {
      const next = writeValue(story, 'bullet_point', '  ', {
         languageTag: 'de_DE',
         languageTagged: true,
         index: 0
      });
      expect(next.bullet_point).toEqual([
         { value: 'One', language_tag: 'en_GB' },
         { value: 'Zwei', language_tag: 'de_DE' }
      ]);
      // A lone unit is no value either.
      const weight = writeValue(
         { item_package_weight: [{ value: 2, unit: 'kilograms' }] },
         'item_package_weight',
         { value: null, unit: 'kilograms' },
         { languageTag: 'de_DE', languageTagged: false }
      );
      expect(weight).toEqual({});
   });

   it('appends a slot past the last entry of the language', () => {
      const next = writeValue(story, 'bullet_point', 'Drei', {
         languageTag: 'de_DE',
         languageTagged: true,
         index: 2
      });
      expect(readValue(next, 'bullet_point', { languageTag: 'de_DE', index: 2 })).toEqual({
         value: 'Drei',
         language_tag: 'de_DE'
      });
   });
});

describe('badgeFor', () => {
   it('names required, conditional and optional attributes', () => {
      const required = requiredAttributes(fixture.schema, {
         parentage_level: [{ value: 'child' }]
      });
      expect(badgeFor('item_name', required)).toBe('required');
      expect(badgeFor('child_parent_sku_relationship', required)).toBe('conditional');
      expect(badgeFor('color', required)).toBe('optional');
   });
});
