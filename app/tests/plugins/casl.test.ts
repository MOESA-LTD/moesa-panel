import { createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { createAbility, resolveAction } from '@/plugins/casl';

const abilityFor = (...actions: string[]) =>
   createMongoAbility(
      actions.map((action) => ({ action, subject: 'client' })),
      { resolveAction }
   );

describe('resolveAction', () => {
   it('maps database commands to UI aliases', () => {
      const ability = abilityFor('select', 'insert');

      expect(ability.can('read', 'client')).toBe(true);
      expect(ability.can('view', 'client')).toBe(true);
      expect(ability.can('create', 'client')).toBe(true);
      expect(ability.can('edit', 'client')).toBe(false);
   });

   it('treats "modify" as either update or delete', () => {
      expect(abilityFor('update').can('modify', 'client')).toBe(true);
      expect(abilityFor('delete').can('modify', 'client')).toBe(true);
      expect(abilityFor('delete').can('edit', 'client')).toBe(false);
      expect(abilityFor('update').can('remove', 'client')).toBe(false);
   });

   it('does not grant anything for unrelated subjects', () => {
      expect(abilityFor('select').can('read', 'stock')).toBe(false);
   });
});

describe('field rules', () => {
   it('denies reading a field without can_read', () => {
      const a = createAbility(
         [{ command: 'select', resource_name: 'public.product' }],
         [
            {
               resource_name: 'public.product',
               field: 'purchase_price',
               can_read: false,
               can_write: false
            }
         ]
      );
      expect(a.can('read', 'product', 'purchase_price')).toBe(false);
      expect(a.can('read', 'product', 'sku')).toBe(true);
      expect(a.can('read', 'product')).toBe(true);
   });

   it('allows reading but not updating with can_read only', () => {
      const a = createAbility(
         [
            { command: 'select', resource_name: 'public.supplier' },
            { command: 'update', resource_name: 'public.supplier' }
         ],
         [
            {
               resource_name: 'public.supplier',
               field: 'deposit_rate',
               can_read: true,
               can_write: false
            }
         ]
      );
      expect(a.can('read', 'supplier', 'deposit_rate')).toBe(true);
      expect(a.can('update', 'supplier', 'deposit_rate')).toBe(false);
      expect(a.can('create', 'supplier', 'deposit_rate')).toBe(false);
      expect(a.can('update', 'supplier', 'city')).toBe(true);
   });

   it('grants nothing through a field right without the table permission', () => {
      const a = createAbility(
         [],
         [{ resource_name: 'public.product', field: 'notes', can_read: true, can_write: true }]
      );
      expect(a.can('read', 'product', 'notes')).toBe(false);
   });
});
