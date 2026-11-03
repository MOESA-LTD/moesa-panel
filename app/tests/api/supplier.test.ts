import {
   supplierContactSchema,
   supplierSchema,
   toSupplierContactFormValues,
   toSupplierContactPayload,
   toSupplierFormValues,
   toSupplierPayload
} from '@/api/supplier';
import { describe, expect, it } from 'vitest';

describe('supplier form', () => {
   const parse = (values: Partial<ReturnType<typeof toSupplierFormValues>>) =>
      supplierSchema.safeParse({
         ...toSupplierFormValues({ code: 'CN1', display_name: 'Ningbo Tools', country: 'China' }),
         ...values
      });

   it('takes a code of two letters and one to three digits, in capitals', () => {
      expect(parse({ code: 'TR1' }).success).toBe(true);
      const lower = parse({ code: 'cn12' });
      expect(lower.success && lower.data.code).toBe('CN12');
      expect(parse({ code: 'CN1234' }).success).toBe(false);
      expect(parse({ code: 'C1' }).success).toBe(false);
   });

   it('needs a name and a country', () => {
      expect(parse({ display_name: '' }).success).toBe(false);
      expect(parse({ country: null }).success).toBe(false);
   });

   it('keeps the deposit rate within 0–100 and the rating within 1–5', () => {
      expect(parse({ deposit_rate: 150 }).success).toBe(false);
      expect(parse({ deposit_rate: 30 }).success).toBe(true);
      expect(parse({ rating: 6 }).success).toBe(false);
      expect(parse({ rating: 2.5 }).success).toBe(false);
      expect(parse({ rating: 4 }).success).toBe(true);
   });

   it('starts as a candidate and sends empty text as null', () => {
      const values = toSupplierFormValues({
         code: 'CN1',
         display_name: 'Ningbo',
         country: 'China'
      });
      expect(values.status).toBe('candidate');
      const payload = toSupplierPayload(supplierSchema.parse({ ...values, city: '  ' }));
      expect(payload).toMatchObject({ code: 'CN1', display_name: 'Ningbo', country: 'China' });
      expect(payload.city).toBeNull();
      expect(payload.website).toBeNull();
      expect(payload.payment_terms).toBeNull();
      expect(payload.deposit_rate).toBeNull();
      expect(payload.product_groups).toEqual([]);
   });

   it('adds https:// to a web address typed without it', () => {
      const result = parse({ website: 'ningbo.example.com' });
      expect(result.success && result.data.website).toBe('https://ningbo.example.com');
   });
});

describe('supplier contact form', () => {
   const parse = (values: Partial<ReturnType<typeof toSupplierContactFormValues>>) =>
      supplierContactSchema.safeParse({
         ...toSupplierContactFormValues({ supplier_id: 's1', name: 'Li Wei' }),
         ...values
      });

   it('needs a name and checks the e-mail and phone', () => {
      expect(parse({}).success).toBe(true);
      expect(parse({ name: '' }).success).toBe(false);
      expect(parse({ email: 'not-an-email' }).success).toBe(false);
      expect(parse({ phone: '123' }).success).toBe(false);
   });

   it('keeps its supplier and sends empty fields as null', () => {
      const payload = toSupplierContactPayload(
         supplierContactSchema.parse(toSupplierContactFormValues({ supplier_id: 's1', name: 'Li' }))
      );
      expect(payload).toMatchObject({ supplier_id: 's1', name: 'Li', is_primary: false });
      expect(payload.email).toBeNull();
      expect(payload.phone).toBeNull();
      expect(payload.role).toBeNull();
   });
});
