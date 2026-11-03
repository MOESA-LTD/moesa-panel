import {
   productSchema,
   specFilterFromQuery,
   toProductFormValues,
   toProductPayload
} from '@/api/product';
import { gtinValid } from '@/lib/gtin';
import i18n from '@plugins/i18n';
import { describe, expect, it } from 'vitest';

const CUSTOMER = '6f1c2b0e-8f4a-4d6e-9a51-2b7c3d4e5f60';

describe('gtinValid', () => {
   it('checks the GS1 check digit of GTIN-8, -12, -13 and -14', () => {
      expect(gtinValid('4260696025800')).toBe(true);
      expect(gtinValid('96385074')).toBe(true);
      expect(gtinValid('4260696025801')).toBe(false);
   });

   it('takes only 8, 12, 13 or 14 digits', () => {
      expect(gtinValid('12345')).toBe(false);
      expect(gtinValid('426069602580X')).toBe(false);
      expect(gtinValid('04260696025800')).toBe(true);
   });
});

describe('product form', () => {
   const parse = (values: Partial<ReturnType<typeof toProductFormValues>>) =>
      productSchema.safeParse({
         ...toProductFormValues({ customer_id: CUSTOMER, sku: 'THO-1', display_name: 'Mop' }),
         ...values
      });

   it('takes the SKU in capitals and only letters, digits and dashes', () => {
      const lower = parse({ sku: ' tho-mop40-2p ' });
      expect(lower.success && lower.data.sku).toBe('THO-MOP40-2P');
      expect(parse({ sku: 'THO MOP' }).success).toBe(false);
      expect(parse({ sku: '' }).success).toBe(false);
   });

   it('rejects a GTIN with a wrong check digit', () => {
      const result = parse({ gtin: '4260696025801' });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map(({ path, message }) => [path[0], message])).toEqual([
         ['gtin', i18n.t('errors.invalid_gtin')]
      ]);
      expect(parse({ gtin: '4260696025800' }).success).toBe(true);
   });

   it('needs a customer and a name', () => {
      expect(parse({ customer_id: null }).success).toBe(false);
      expect(parse({ display_name: '' }).success).toBe(false);
   });

   it('takes no negative amounts and whole quantities', () => {
      expect(parse({ purchase_price: -1 }).success).toBe(false);
      expect(parse({ pack_qty: 1.5 }).success).toBe(false);
      expect(parse({ pack_qty: 12, purchase_price: 1.25 }).success).toBe(true);
   });

   it('starts as a concept without compliance and sends empty fields as null', () => {
      const values = toProductFormValues({
         customer_id: CUSTOMER,
         sku: 'tho-1',
         display_name: 'Mop'
      });
      expect(values.status).toBe('concept');
      expect(values.compliance_status).toBe('none');
      expect(values.is_hazmat).toBe(false);
      const payload = toProductPayload(
         productSchema.parse({ ...values, notes: ' ', golden_sample_on: new Date(2026, 10, 3) })
      );
      expect(payload).toMatchObject({
         customer_id: CUSTOMER,
         sku: 'THO-1',
         display_name: 'Mop',
         status: 'concept',
         compliance_status: 'none',
         is_hazmat: false,
         golden_sample_on: '2026-11-03'
      });
      expect(payload.gtin).toBeNull();
      expect(payload.notes).toBeNull();
      expect(payload.supplier_id).toBeNull();
      expect(payload.parent_id).toBeNull();
      expect(payload.purchase_price).toBeNull();
      expect(payload.purchase_currency).toBeNull();
      expect(payload).not.toHaveProperty('id');
   });
});

describe('specFilterFromQuery', () => {
   it('reads ?spec=true and ?spec=false as the Spec filter', () => {
      expect(specFilterFromQuery({ spec: 'true' })).toBe(true);
      expect(specFilterFromQuery({ spec: 'false' })).toBe(false);
      expect(specFilterFromQuery({ spec: ['false'] })).toBe(false);
   });

   it('leaves the filter alone without a spec query or with another value', () => {
      expect(specFilterFromQuery({})).toBeNull();
      expect(specFilterFromQuery({ spec: 'maybe' })).toBeNull();
   });
});
