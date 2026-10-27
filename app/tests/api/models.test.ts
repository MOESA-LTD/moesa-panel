import { AuditTransactionModel, type AuditTransactionDto } from '@/api/auditLog/model';
import { ProductModel } from '@/api/product/model';
import { StockModel } from '@/api/stock/model';
import { UserModel, type UserDto } from '@/api/user/model';
import { toModel } from '@/lib/model/Model';
import { describe, expect, it } from 'vitest';

const user = (user_metadata: UserDto['user_metadata']): UserDto => ({
   id: 'u1',
   email: 'ada@example.com',
   phone: null,
   created_at: null,
   user_metadata
});

const categories = [
   { id: 'c1', display_name: 'battery' },
   { id: 'c2', display_name: 'spare part' }
];

describe('UserModel', () => {
   it('shows the chosen name, or the email without one', () => {
      expect(toModel(UserModel, user({ display_name: 'Ada' })).displayName).toBe('Ada');
      expect(toModel(UserModel, user({ display_name: '' })).displayName).toBe('ada@example.com');
      expect(toModel(UserModel, user(null)).displayName).toBe('ada@example.com');
   });
});

describe('categoryPath', () => {
   it('joins the categories for the route param', () => {
      expect(
         toModel(StockModel, { id: 's1', product: { category: categories } }).categoryPath
      ).toBe('battery|spare part');
      expect(toModel(ProductModel, { categories } as unknown as ProductModel).categoryPath).toBe(
         'battery|spare part'
      );
   });

   it('is undefined without categories, so the param is left out', () => {
      expect(toModel(StockModel, { id: 's1' }).categoryPath).toBeUndefined();
      expect(
         toModel(StockModel, { id: 's1', product: { category: [] } }).categoryPath
      ).toBeUndefined();
   });
});

describe('AuditTransactionModel', () => {
   const transaction = (overrides: Partial<AuditTransactionDto> = {}): AuditTransactionDto => ({
      id: 't1',
      tenant_id: 'tenant',
      actor_id: 'u1',
      actor_role: 'authenticated',
      table_name: 'client',
      record_id: 'c1',
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
