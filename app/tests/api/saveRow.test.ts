import { saveRow, updateRow } from '@/api/saveRow';
import { ability, toAbilityRules } from '@/plugins/casl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The query builder, recording what saveRow asks of it.
const calls: { method: string; args: unknown[] }[] = [];
const builder: Record<string, (...args: unknown[]) => unknown> = {};
for (const method of ['insert', 'update', 'eq', 'select', 'single']) {
   builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
   };
}
builder.throwOnError = () => Promise.resolve({ data: { id: 'saved' } });

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => builder } }));

beforeEach(() => {
   calls.length = 0;
   ability.update([]);
});

describe('saveRow', () => {
   it('updates an existing row without touching its tenant', async () => {
      await saveRow('role', { id: 'r1', display_name: 'Ada', tenant_id: 'another-tenant' });

      expect(calls.slice(0, 2)).toEqual([
         { method: 'update', args: [{ display_name: 'Ada' }] },
         { method: 'eq', args: ['id', 'r1'] }
      ]);
   });

   it('inserts a new row, leaving the tenant to the request unless it names one', async () => {
      await saveRow('role', { id: null, display_name: 'Ada' });
      expect(calls[0]).toEqual({ method: 'insert', args: [{ display_name: 'Ada' }] });

      calls.length = 0;
      await saveRow('role', { display_name: 'Ada', tenant_id: 't2' });
      expect(calls[0]).toEqual({
         method: 'insert',
         args: [{ display_name: 'Ada', tenant_id: 't2' }]
      });
   });

   it('returns the saved row with the requested columns', async () => {
      await expect(saveRow('role', { id: 'r1' }, 'id')).resolves.toEqual({ id: 'saved' });
      expect(calls).toContainEqual({ method: 'select', args: ['id'] });
   });
});

describe('field rights', () => {
   const restrict = (command: string) =>
      ability.update(
         toAbilityRules(
            [{ command, resource_name: 'public.product' }],
            [
               {
                  resource_name: 'public.product',
                  field: 'purchase_price',
                  can_read: false,
                  can_write: false
               }
            ]
         )
      );

   it('drops fields the user may not write', async () => {
      restrict('update');
      await saveRow('product', { id: 'p1', display_name: 'A', purchase_price: null });
      expect(calls[0]).toEqual({ method: 'update', args: [{ display_name: 'A' }] });
   });

   it('drops them from a new row too', async () => {
      restrict('insert');
      await saveRow('product', { display_name: 'A', purchase_price: 3 });
      expect(calls[0]).toEqual({ method: 'insert', args: [{ display_name: 'A' }] });
   });

   it('drops them from a patch', async () => {
      restrict('update');
      await updateRow('product', 'p1', { display_name: 'A', purchase_price: 3 });
      expect(calls[0]).toEqual({ method: 'update', args: [{ display_name: 'A' }] });
   });
});

describe('updateRow', () => {
   it('patches one row by id and resolves the returned row', async () => {
      await expect(updateRow('purchase_order', 'p1', { status: 'sent' })).resolves.toEqual({
         id: 'saved'
      });
      expect(calls).toEqual([
         { method: 'update', args: [{ status: 'sent' }] },
         { method: 'eq', args: ['id', 'p1'] },
         { method: 'select', args: [] },
         { method: 'single', args: [] }
      ]);
   });
});
