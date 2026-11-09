import { readableColumns, useFieldAccess } from '@/composables/useFieldAccess';
import { ability, toAbilityRules } from '@/plugins/casl';
import { describe, expect, it } from 'vitest';
import { computed } from 'vue';

const grant = (fields: Parameters<typeof toAbilityRules>[1]) =>
   ability.update(
      toAbilityRules(
         [
            { command: 'select', resource_name: 'public.product' },
            { command: 'update', resource_name: 'public.product' }
         ],
         fields
      )
   );

describe('useFieldAccess', () => {
   it('reflects the ability', () => {
      grant([
         { resource_name: 'public.product', field: 'notes', can_read: true, can_write: false }
      ]);
      const { canRead, canWrite } = useFieldAccess('product');
      expect(canRead('notes')).toBe(true);
      expect(canWrite('notes')).toBe(false);
      expect(canWrite('display_name')).toBe(true);
   });

   it('hides a field the user may not read', () => {
      grant([
         { resource_name: 'public.product', field: 'notes', can_read: false, can_write: false }
      ]);
      expect(useFieldAccess('product').canRead('notes')).toBe(false);
   });

   it('follows a change of the rights', () => {
      grant([]);
      const { canRead } = useFieldAccess('product');
      const visible = computed(() => canRead('notes'));
      expect(visible.value).toBe(true);

      grant([
         { resource_name: 'public.product', field: 'notes', can_read: false, can_write: false }
      ]);
      expect(visible.value).toBe(false);
   });
});

describe('readableColumns', () => {
   it('drops the columns of fields the user may not read', () => {
      grant([
         { resource_name: 'public.product', field: 'notes', can_read: false, can_write: false }
      ]);
      const columns = [{ field: 'sku' }, { field: 'notes' }, { header: 'actions' }];
      expect(readableColumns('product', columns)).toEqual([
         { field: 'sku' },
         { header: 'actions' }
      ]);
   });

   it("follows the table's rights in a view of its rows", () => {
      grant([
         { resource_name: 'public.product', field: 'notes', can_read: false, can_write: false }
      ]);
      expect(readableColumns('product_with_evidence', [{ field: 'notes' }])).toEqual([]);
   });
});
