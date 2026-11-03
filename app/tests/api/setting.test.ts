import { fromPickerDate, settingKind, toPickerDate, useSetting } from '@/api/setting';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, type ComputedRef } from 'vue';

// The settings rows the server returns once the request is released.
let release: (rows: { id: string; key: string; value: Json }[]) => void;
const builder = {
   select: () => builder,
   abortSignal: () => builder,
   throwOnError: () =>
      new Promise((resolve) => (release = (rows) => resolve({ data: rows, error: null })))
};
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => builder } }));
vi.mock('@/api/useTenantKey', () => ({ useTenantKey: () => computed(() => 't1') }));

let depositRate: ComputedRef<number>;

beforeEach(() => {
   mount(
      defineComponent({
         setup() {
            depositRate = useSetting('deposit_rate_default', 0);
            return () => h('div');
         }
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }
   );
});

describe('useSetting', () => {
   it('gives the fallback until the settings are loaded, then the stored value', async () => {
      expect(depositRate.value).toBe(0);

      release([{ id: 's1', key: 'deposit_rate_default', value: 30 }]);
      await flushPromises();

      expect(depositRate.value).toBe(30);
   });

   it('keeps the fallback for a key that is not stored', async () => {
      release([{ id: 's2', key: 'safety_stock_days', value: 30 }]);
      await flushPromises();

      expect(depositRate.value).toBe(0);
   });
});

describe('settingKind', () => {
   it('edits a value by its JSON type', () => {
      expect(settingKind(true)).toBe('boolean');
      expect(settingKind(30)).toBe('number');
      expect(settingKind('2026-12-31')).toBe('date');
      expect(settingKind('MOESA')).toBe('text');
   });
});

describe('picker dates', () => {
   it('round-trips a stored date through the picker as the same day', () => {
      const date = toPickerDate('2026-12-31');

      expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 11, 31]);
      expect(fromPickerDate(date)).toBe('2026-12-31');
   });
});
