import { mapPostgrestError } from '@/lib/form/postgrestErrors';
import i18n from '@plugins/i18n';
import { describe, expect, it } from 'vitest';

const FIELDS = ['national_id', 'email', 'gender', 'address_id', 'display_name'];

describe('mapPostgrestError', () => {
   it('maps unique violations from the error details', () => {
      expect(
         mapPostgrestError(
            { code: '23505', details: 'Key (national_id)=(123) already exists.' },
            FIELDS
         )
      ).toEqual({ national_id: i18n.t('form.already_exists') });
   });

   it('falls back to the constraint name when details are hidden', () => {
      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "client_national_id_key"',
               details: null
            },
            FIELDS
         )
      ).toEqual({ national_id: i18n.t('form.already_exists') });
   });

   it('maps foreign key, not null and check violations', () => {
      expect(
         mapPostgrestError(
            { code: '23503', details: 'Key (address_id)=(x) is not present in table "address".' },
            FIELDS
         )
      ).toEqual({ address_id: i18n.t('form.invalid_reference') });

      expect(
         mapPostgrestError(
            { code: '23502', message: 'null value in column "display_name" of relation "client"' },
            FIELDS
         )
      ).toEqual({ display_name: i18n.t('form.required') });

      expect(
         mapPostgrestError(
            { code: '23514', message: 'violates check constraint "client_gender_check"' },
            FIELDS
         )
      ).toEqual({ gender: i18n.t('form.invalid_value') });
   });

   it('returns null for other errors or unknown columns', () => {
      expect(mapPostgrestError({ code: '42501', message: 'permission denied' }, FIELDS)).toBeNull();
      expect(
         mapPostgrestError(
            { code: '23505', details: 'Key (tenant_id, slug)=(a, b) already exists.' },
            FIELDS
         )
      ).toBeNull();
      expect(mapPostgrestError(new Error('boom'), FIELDS)).toBeNull();
   });
   it('maps the errors the document table raises by name', () => {
      const fields = ['entity_type', 'entity_id', 'type', 'version', 'status', 'url'];

      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "unique_document_version"',
               details:
                  'Key (tenant_id, entity_type, entity_id, type, version)=(t, product, p, pi, 1) already exists.'
            },
            fields
         )
      ).toEqual({ version: i18n.t('errors.document_version_exists') });

      expect(
         mapPostgrestError({ code: '23514', message: 'document_signed_incomplete' }, fields)
      ).toEqual({ status: i18n.t('errors.document_signed_incomplete') });

      expect(
         mapPostgrestError(
            {
               code: '23514',
               message:
                  'new row for relation "document" violates check constraint "document_has_file"'
            },
            fields
         )
      ).toEqual({ url: i18n.t('form.required') });

      // Left to the error toast.
      expect(
         mapPostgrestError({ code: '23503', message: 'document_entity_missing' }, fields)
      ).toBeNull();
   });
   it('maps the duplicate GTIN and SKU of a product to their fields', () => {
      const fields = ['customer_id', 'sku', 'gtin', 'display_name'];

      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "product_gtin_active"',
               details: 'Key (gtin)=(4260696025800) already exists.'
            },
            fields
         )
      ).toEqual({ gtin: i18n.t('errors.gtin_in_use') });

      expect(
         mapPostgrestError(
            {
               code: '23505',
               message:
                  'duplicate key value violates unique constraint "product_customer_id_sku_key"',
               details: 'Key (customer_id, sku)=(c, THO-1) already exists.'
            },
            fields
         )
      ).toEqual({ sku: i18n.t('errors.sku_in_use') });
   });
});
