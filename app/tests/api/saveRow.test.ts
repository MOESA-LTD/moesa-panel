import { saveRow } from '@/api/saveRow';
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

beforeEach(() => (calls.length = 0));

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
