import { AuditLogModel, type AuditLogDto } from '@/api/auditLog/model';
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

describe('AuditLogModel', () => {
   const log = (overrides: Partial<AuditLogDto> = {}): AuditLogDto => ({
      id: 'l1',
      correlation_id: null,
      created_at: null,
      old_data: null,
      operation: 'UPDATE',
      request_id: null,
      reverted: false,
      reverted_at: null,
      row_data: null,
      table_name: 'client',
      table_schema: 'public',
      tenant_id: 't1',
      user_id: user({ display_name: 'Ada' }),
      reverted_by: null,
      ...overrides
   });

   it('maps the embedded users to UserModels', () => {
      const model = toModel(AuditLogModel, log());

      expect(model.user_id).toBeInstanceOf(UserModel);
      expect(model.user_id?.displayName).toBe('Ada');
      expect(model.reverted_by).toBeNull();
   });

   it('groups a change by its correlation id, or by itself', () => {
      expect(toModel(AuditLogModel, log()).groupId).toBe('l1');
      expect(toModel(AuditLogModel, log({ correlation_id: 'g1' })).groupId).toBe('g1');
   });
});
