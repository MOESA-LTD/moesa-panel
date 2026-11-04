import { mapPostgrestError, NAMED_ERRORS } from '@/lib/form/postgrestErrors';
import en from '@/plugins/i18n/locales/en/index.json';
import tr from '@/plugins/i18n/locales/tr/index.json';
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
      ).toEqual({ url: i18n.t('errors.document_file_required') });

      // Left to the error toast.
      expect(
         mapPostgrestError({ code: '23503', message: 'document_entity_missing' }, fields)
      ).toBeNull();
   });
   it('maps the errors the media tables raise by name', () => {
      const fields = ['id', 'media_id', 'role', 'customer_id'];

      expect(
         mapPostgrestError({ code: '23514', message: 'media_too_large' }, ['media_id'])
      ).toEqual({
         media_id: i18n.t('errors.media_too_large')
      });
      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "unique_media_link"'
            },
            fields
         )
      ).toEqual({ media_id: i18n.t('errors.media_already_linked') });
      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "media_link_one_primary"'
            },
            fields
         )
      ).toEqual({ role: i18n.t('errors.media_primary_exists') });
      expect(mapPostgrestError({ code: '23503', message: 'media_in_use' }, fields)).toEqual({
         id: i18n.t('errors.media_in_use')
      });
      expect(
         mapPostgrestError({ code: '23514', message: 'media_customer_locked' }, fields)
      ).toEqual({ customer_id: i18n.t('errors.media_customer_locked') });
      expect(mapPostgrestError({ code: '23503', message: 'media_missing' }, fields)).toEqual({
         media_id: i18n.t('errors.media_missing')
      });
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
   it('maps the errors of the purchase order tables to their fields', () => {
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "purchase_order_line" violates foreign key constraint "purchase_order_line_product_fkey"'
            },
            ['product_id']
         )
      ).toEqual({ product_id: i18n.t('errors.po_line_product_customer') });
      expect(
         mapPostgrestError(
            {
               code: '23514',
               message:
                  'new row for relation "purchase_order" violates check constraint "purchase_order_incoterm_valid"'
            },
            ['incoterm', 'currency']
         )
      ).toEqual({ incoterm: i18n.t('errors.incoterm_invalid') });
      expect(mapPostgrestError({ code: '23514', message: 'po_locked' }, ['quantity'])).toEqual({
         quantity: i18n.t('errors.po_locked')
      });
   });
   it('maps the errors of the shipment tables to their fields', () => {
      expect(
         mapPostgrestError({ code: '23514', message: 'shipment_quantity_exceeds_po' }, ['quantity'])
      ).toEqual({ quantity: i18n.t('errors.shipment_quantity_exceeds_po') });
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "shipment" violates foreign key constraint "shipment_warehouse_fkey"'
            },
            ['delivery_warehouse_id', 'customer_id']
         )
      ).toEqual({ delivery_warehouse_id: i18n.t('errors.shipment_warehouse_customer') });
      expect(
         mapPostgrestError(
            {
               code: '23514',
               message:
                  'new row for relation "shipment" violates check constraint "shipment_incoterm_sell_valid"'
            },
            ['incoterm_buy', 'incoterm_sell']
         )
      ).toEqual({ incoterm_sell: i18n.t('errors.incoterm_invalid') });
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "shipment_purchase_order" violates foreign key constraint "shipment_purchase_order_po_fkey"'
            },
            ['purchase_order_id']
         )
      ).toEqual({ purchase_order_id: i18n.t('errors.shipment_po_customer') });
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "shipment_line" violates foreign key constraint "shipment_line_link_fkey"'
            },
            ['purchase_order_line_id', 'quantity']
         )
      ).toEqual({ purchase_order_line_id: i18n.t('errors.shipment_line_po_not_linked') });
      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "unique_shipment_line"',
               details: 'Key (shipment_id, purchase_order_line_id)=(s, l) already exists.'
            },
            ['shipment_id', 'purchase_order_line_id']
         )
      ).toEqual({ purchase_order_line_id: i18n.t('errors.shipment_line_duplicate') });
      expect(
         mapPostgrestError({ code: '23514', message: 'shipment_locked' }, ['quantity'])
      ).toEqual({ quantity: i18n.t('errors.shipment_locked') });
      expect(
         mapPostgrestError({ code: '23514', message: 'shipment_immutable_field' }, ['customer_id'])
      ).toEqual({ customer_id: i18n.t('errors.shipment_immutable_field') });
   });
   it('never maps a shipment status error to a field', () => {
      for (const name of [
         'shipment_status_order',
         'shipment_po_required',
         'shipment_booking_date_required',
         'shipment_lines_required',
         'shipment_eta_required',
         'shipment_delivery_time_required',
         'shipment_delivery_receipt_required',
         'shipment_acceptance_issue',
         'shipment_po_has_lines'
      ]) {
         expect(NAMED_ERRORS.filter((entry) => entry.name === name)).toEqual([
            { code: '23514', name, message: `errors.${name}` }
         ]);
         expect(mapPostgrestError({ code: '23514', message: name }, ['status', 'eta'])).toBeNull();
      }
   });
   it('maps the errors of the market cell table to their fields', () => {
      expect(
         mapPostgrestError(
            {
               code: '23505',
               message: 'duplicate key value violates unique constraint "unique_market_cell"'
            },
            ['country']
         )
      ).toEqual({ country: i18n.t('errors.market_cell_duplicate') });
      expect(
         mapPostgrestError(
            {
               code: '23514',
               message:
                  'new row for relation "market_cell" violates check constraint "market_cell_country_format"'
            },
            ['country', 'currency']
         )
      ).toEqual({ country: i18n.t('errors.market_cell_country_invalid') });
      expect(
         mapPostgrestError({ code: '23514', message: 'market_cell_country_invalid' }, ['country'])
      ).toEqual({ country: i18n.t('errors.market_cell_country_invalid') });
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "market_cell" violates foreign key constraint "market_cell_product_fkey"'
            },
            ['product_id', 'project_id']
         )
      ).toEqual({ product_id: i18n.t('errors.market_cell_product_customer') });
      expect(
         mapPostgrestError(
            {
               code: '23503',
               message:
                  'insert or update on table "market_cell" violates foreign key constraint "market_cell_project_fkey"'
            },
            ['product_id', 'project_id']
         )
      ).toEqual({ project_id: i18n.t('errors.market_cell_project_customer') });
      expect(
         mapPostgrestError(
            {
               code: '23514',
               message:
                  'new row for relation "market_cell" violates check constraint "market_cell_price_currency"'
            },
            ['price', 'currency']
         )
      ).toEqual({ currency: i18n.t('errors.market_cell_price_currency') });
      expect(
         mapPostgrestError({ code: '23514', message: 'market_cell_compliance_note_required' }, [
            'compliance',
            'compliance_note'
         ])
      ).toEqual({ compliance_note: i18n.t('errors.market_cell_compliance_note_required') });
      expect(
         mapPostgrestError({ code: '23514', message: 'market_cell_compliance_red' }, [
            'compliance',
            'compliance_note'
         ])
      ).toEqual({ compliance: i18n.t('errors.market_cell_compliance_red') });
   });
   it('never maps a market cell status error to a field', () => {
      expect(
         mapPostgrestError({ code: '23514', message: 'market_cell_live_incomplete' }, ['price'])
      ).toBeNull();
      for (const name of [
         'market_cell_live_incomplete',
         'market_cell_status_order',
         'market_cell_reason_required',
         'market_cell_immutable_field',
         'market_cell_delete_candidate_only'
      ]) {
         expect(NAMED_ERRORS.filter((entry) => entry.name === name)).toEqual([
            { code: '23514', name, message: `errors.${name}` }
         ]);
         expect(
            mapPostgrestError({ code: '23514', message: name }, [
               'status',
               'notes',
               'open_issue',
               'country'
            ])
         ).toBeNull();
      }
   });
   it('never maps a toast-level error to a field', () => {
      expect(
         mapPostgrestError({ code: '23514', message: 'po_pi_mismatch' }, ['pi_total'])
      ).toBeNull();
      expect(
         mapPostgrestError({ code: '23514', message: 'po_status_order' }, ['status'])
      ).toBeNull();
   });
   it('names every error by a message in English and Turkish', () => {
      const keys = (locale: object) => (locale as { errors: Record<string, string> }).errors;
      const missing = NAMED_ERRORS.map(({ message }) => message.replace(/^errors\./, '')).filter(
         (key) => typeof keys(en)[key] !== 'string' || typeof keys(tr)[key] !== 'string'
      );
      expect(missing).toEqual([]);
   });
});
