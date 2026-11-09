import { AuditTransactionModel, type AuditTransactionDto } from '@/api/auditLog/model';
import { UserModel, type UserDto } from '@/api/user/model';
import { toModel } from '@/lib/model/Model';
import { afterEach, describe, expect, it } from 'vitest';
import { ability, toAbilityRules } from '@/plugins/casl';
import {
   purchaseOrderLineSchema,
   purchaseOrderPaymentSchema,
   purchaseOrderSchema,
   toPurchaseOrderFormValues,
   toPurchaseOrderPaymentFormValues
} from '@/api/purchaseOrder';
import { customerContactSchema } from '@/api/customer';
import { supplierContactSchema } from '@/api/supplier';
import { incidentLogSchema, toIncidentLogFormValues } from '@/api/incident';

const user = (user_metadata: UserDto['user_metadata']): UserDto => ({
   id: 'u1',
   email: 'ada@example.com',
   phone: null,
   created_at: null,
   user_metadata
});

describe('UserModel', () => {
   it('shows the chosen name, or the email without one', () => {
      expect(toModel(UserModel, user({ display_name: 'Ada' })).displayName).toBe('Ada');
      expect(toModel(UserModel, user({ display_name: '' })).displayName).toBe('ada@example.com');
      expect(toModel(UserModel, user(null)).displayName).toBe('ada@example.com');
   });

   it('prefers the display name the api computes, which survives a masked user', () => {
      const masked = { ...user(null), email: null, display_name: 'Ada' };
      expect(toModel(UserModel, masked).displayName).toBe('Ada');
      expect(toModel(UserModel, { ...masked, display_name: null }).displayName).toBe('');
   });
});

describe('AuditTransactionModel', () => {
   const transaction = (overrides: Partial<AuditTransactionDto> = {}): AuditTransactionDto => ({
      id: 't1',
      tenant_id: 'tenant',
      actor_id: 'u1',
      actor_role: 'authenticated',
      table_name: 'role',
      record_id: 'r1',
      operation: 'UPDATE',
      reverts_id: null,
      reverted_at: null,
      reverted_by: null,
      created_at: '2026-10-27T10:00:00Z',
      actor: user({ display_name: 'Ada' }),
      reverter: null,
      ...overrides
   });

   it('maps the embedded users to UserModels', () => {
      const model = toModel(AuditTransactionModel, transaction());

      expect(model.actor).toBeInstanceOf(UserModel);
      expect(model.actor?.displayName).toBe('Ada');
      expect(model.reverter).toBeNull();
   });

   it('has no actor for system writes', () => {
      expect(toModel(AuditTransactionModel, transaction({ actor: undefined })).actor).toBeNull();
   });

   it('is reverted once it has a revert time', () => {
      expect(toModel(AuditTransactionModel, transaction()).reverted).toBe(false);
      expect(
         toModel(AuditTransactionModel, transaction({ reverted_at: '2026-10-27T11:00:00Z' }))
            .reverted
      ).toBe(true);
   });
});

describe('masked fields in forms', () => {
   const P = '00000000-0000-4000-8000-000000000001';
   const O = '00000000-0000-4000-8000-000000000002';
   const line = { purchase_order_id: O, product_id: P, quantity: 1, position: 0, notes: '' };
   const masking = (table: string, ...fields: string[]) =>
      ability.update(
         toAbilityRules(
            ['select', 'insert', 'update'].map((command) => ({
               command,
               resource_name: `public.${table}`
            })),
            fields.map((field) => ({
               resource_name: `public.${table}`,
               field,
               can_read: false,
               can_write: false
            }))
         )
      );

   afterEach(() => ability.update([]));

   it('accepts a PO line whose unit price is masked', () => {
      masking('purchase_order_line', 'unit_price');
      expect(() => purchaseOrderLineSchema.parse({ ...line, unit_price: null })).not.toThrow();
   });

   it('still requires the unit price from a user who may write it', () => {
      masking('purchase_order_line');
      expect(purchaseOrderLineSchema.safeParse({ ...line, unit_price: null }).success).toBe(false);
      expect(purchaseOrderLineSchema.safeParse({ ...line, unit_price: 2 }).success).toBe(true);
   });

   it('accepts an order whose supplier and terms are masked', () => {
      masking('purchase_order', 'supplier_id', 'incoterm', 'deposit_rate', 'pi_extra_amount');
      const order = {
         ...toPurchaseOrderFormValues({ customer_id: P, currency: 'EUR' }),
         pi_extra_amount: null
      };
      expect(purchaseOrderSchema.safeParse(order).success).toBe(true);
   });

   it('accepts a payment whose amount and currency are masked', () => {
      masking('purchase_order_payment', 'amount', 'currency');
      const payment = { ...toPurchaseOrderPaymentFormValues({ purchase_order_id: O }) };
      expect(purchaseOrderPaymentSchema.safeParse(payment).success).toBe(true);
   });

   it('accepts contacts and a log entry whose personal or internal fields are masked', () => {
      masking('customer_contact', 'name');
      expect(
         customerContactSchema.safeParse({ customer_id: P, name: null, can_approve: false }).success
      ).toBe(true);
      masking('supplier_contact', 'name');
      expect(
         supplierContactSchema.safeParse({ supplier_id: P, name: null, is_primary: false }).success
      ).toBe(true);
      masking('incident_log', 'note');
      expect(
         incidentLogSchema.safeParse({ ...toIncidentLogFormValues(), incident_id: P, note: null })
            .success
      ).toBe(true);
   });
});
