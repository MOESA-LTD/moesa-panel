import {
   customerBrandSchema,
   customerContactSchema,
   customerPlatformAccountSchema,
   customerSchema,
   customerWarehouseSchema,
   toCustomerBrandFormValues,
   toCustomerBrandPayload,
   toCustomerContactFormValues,
   toCustomerContactPayload,
   toCustomerFormValues,
   toCustomerPayload,
   toCustomerPlatformAccountFormValues,
   toCustomerPlatformAccountPayload,
   toCustomerWarehouseFormValues,
   toCustomerWarehousePayload
} from '@/api/customer';
import { describe, expect, it } from 'vitest';

describe('customer form', () => {
   const parse = (values: Partial<ReturnType<typeof toCustomerFormValues>>) =>
      customerSchema.safeParse({
         ...toCustomerFormValues({
            code: 'THO',
            display_name: 'Thor Trading',
            commercial_model: 'trading_partner'
         }),
         ...values
      });

   it('takes a code of three letters, in capitals', () => {
      const lower = parse({ code: ' tho ' });
      expect(lower.success && lower.data.code).toBe('THO');
      expect(parse({ code: 'TH' }).success).toBe(false);
      expect(parse({ code: 'THOR' }).success).toBe(false);
      expect(parse({ code: 'TH1' }).success).toBe(false);
   });

   it('takes only the known packages', () => {
      expect(parse({ packages: ['A0', 'B', 'E'] }).success).toBe(true);
      expect(parse({ packages: ['X'] as never }).success).toBe(false);
   });

   it('needs a name and a commercial model', () => {
      expect(parse({ display_name: '' }).success).toBe(false);
      expect(parse({ commercial_model: null }).success).toBe(false);
   });

   it('keeps the deposit rate within 0–100', () => {
      expect(parse({ deposit_rate: 101 }).success).toBe(false);
      expect(parse({ deposit_rate: 30 }).success).toBe(true);
   });

   it('starts as a lead and sends empty fields as null', () => {
      const values = toCustomerFormValues({
         code: 'tho',
         display_name: 'Thor',
         commercial_model: 'operations_partner'
      });
      expect(values.status).toBe('lead');
      const payload = toCustomerPayload(
         customerSchema.parse({
            ...values,
            notes: '  ',
            start_on: new Date(2026, 10, 3),
            restricted_drive_url: 'drive.google.com/drive/folders/x'
         })
      );
      expect(payload).toMatchObject({
         code: 'THO',
         display_name: 'Thor',
         commercial_model: 'operations_partner',
         status: 'lead',
         packages: [],
         start_on: '2026-11-03',
         restricted_drive_url: 'https://drive.google.com/drive/folders/x'
      });
      expect(payload.notes).toBeNull();
      expect(payload.website).toBeNull();
      expect(payload.country).toBeNull();
      expect(payload.deposit_rate).toBeNull();
      expect(payload.contract_accepted_on).toBeNull();
      expect(payload.contract_document_id).toBeNull();
      expect(payload).not.toHaveProperty('id');
   });
});

describe('customer contact form', () => {
   it('needs a name, checks the e-mail and sends empty fields as null', () => {
      const values = toCustomerContactFormValues({ customer_id: 'c1', name: 'Thor' });
      expect(customerContactSchema.safeParse({ ...values, name: '' }).success).toBe(false);
      expect(customerContactSchema.safeParse({ ...values, email: 'x' }).success).toBe(false);
      const payload = toCustomerContactPayload(customerContactSchema.parse(values));
      expect(payload).toMatchObject({ customer_id: 'c1', name: 'Thor', can_approve: false });
      expect(payload.email).toBeNull();
      expect(payload.role).toBeNull();
   });
});

describe('customer warehouse form', () => {
   it('needs a name and a type, and sends empty address fields as null', () => {
      const values = toCustomerWarehouseFormValues({ customer_id: 'c1', display_name: 'Hamburg' });
      expect(values.type).toBe('own');
      expect(customerWarehouseSchema.safeParse({ ...values, display_name: '' }).success).toBe(
         false
      );
      expect(customerWarehouseSchema.safeParse({ ...values, type: null }).success).toBe(false);
      const payload = toCustomerWarehousePayload(
         customerWarehouseSchema.parse({ ...values, type: 'fba', city: ' ' })
      );
      expect(payload).toMatchObject({ customer_id: 'c1', type: 'fba', is_default: false });
      expect(payload.city).toBeNull();
      expect(payload.address).toBeNull();
   });
});

describe('customer platform account form', () => {
   it('needs a platform, has no access by default and keeps no secrets', () => {
      const values = toCustomerPlatformAccountFormValues({ customer_id: 'c1' });
      expect(values.access).toBe('none');
      expect(customerPlatformAccountSchema.safeParse(values).success).toBe(false);
      const payload = toCustomerPlatformAccountPayload(
         customerPlatformAccountSchema.parse({
            ...values,
            platform_id: 'amazon',
            countries: ['DE']
         })
      );
      expect(payload).toEqual({
         customer_id: 'c1',
         platform_id: 'amazon',
         countries: ['DE'],
         account_holder: null,
         access: 'none',
         notes: null
      });
   });
});

describe('customer brand form', () => {
   it('needs a name and sends empty fields as null', () => {
      const values = toCustomerBrandFormValues({ customer_id: 'c1', name: 'Thor' });
      expect(customerBrandSchema.safeParse({ ...values, name: '' }).success).toBe(false);
      const payload = toCustomerBrandPayload(customerBrandSchema.parse(values));
      expect(payload).toMatchObject({ customer_id: 'c1', name: 'Thor' });
      expect(payload.registration_status).toBeNull();
      expect(payload.gs1_prefix_owner).toBeNull();
   });
});
