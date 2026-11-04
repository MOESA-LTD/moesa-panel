import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { currentTenant: { id: 'tenant-a' }, scopeTenants: [{ id: 'tenant-a' }] };
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));

const { supabase } = await import('@/lib/supabase');

describe('customFetch', () => {
   const fetchMock = vi.fn();

   beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response('[]', { status: 201 }));
      vi.stubGlobal('fetch', fetchMock);
   });
   afterEach(() => vi.unstubAllGlobals());

   const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

   it('adds the active tenant to a single inserted row', async () => {
      await supabase.from('market_cell').insert({ country: 'DE' } as never);
      expect(sentBody()).toEqual({ country: 'DE', tenant_id: 'tenant-a' });
   });

   it('adds the active tenant to each row of a bulk insert, keeping a named one', async () => {
      await supabase
         .from('market_cell')
         .insert([{ country: 'DE' }, { country: 'FR', tenant_id: 'tenant-b' }] as never);
      expect(sentBody()).toEqual([
         { country: 'DE', tenant_id: 'tenant-a' },
         { country: 'FR', tenant_id: 'tenant-b' }
      ]);
      // The named columns carry tenant_id, or PostgREST would drop it.
      const columns = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('columns');
      expect(columns?.split(',')).toContain('"tenant_id"');
   });

   it('names tenant_id once when every row of a bulk insert lacks it', async () => {
      await supabase.from('market_cell').insert([{ country: 'DE' }, { country: 'FR' }] as never);
      const columns = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('columns');
      expect(columns).toBe('"country","tenant_id"');
   });

   it('leaves an rpc body alone', async () => {
      await supabase.rpc('rollback_gate' as never, { gate_id: 'g' } as never);
      expect(sentBody()).toEqual({ gate_id: 'g' });
   });
});
