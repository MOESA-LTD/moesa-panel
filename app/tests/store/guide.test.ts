import { guideForRoute, PAGE_GUIDES, visibleTasks } from '@/constants/guide';
import { useGuideStore } from '@/store/guide';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stubStorage = (storage: Partial<Storage>) => vi.stubGlobal('localStorage', storage);

describe('page guide store', () => {
   beforeEach(() => setActivePinia(createPinia()));
   afterEach(() => vi.unstubAllGlobals());

   it('opens a page once', () => {
      const stored = new Map<string, string>();
      const setItem = vi.fn((key: string, value: string) => void stored.set(key, value));
      stubStorage({ getItem: (key: string) => stored.get(key) ?? null, setItem });
      const guide = useGuideStore();

      guide.autoOpen('shipment');
      expect(guide.open).toBe(true);
      expect(guide.page).toBe('shipment');
      expect(setItem).toHaveBeenCalledWith('guide.dismissed.ops-shipment', '1');

      guide.hide();
      guide.autoOpen('shipment');
      expect(guide.open).toBe(false);
   });

   it('survives blocked storage', () => {
      const blocked = () => {
         throw new Error('blocked');
      };
      stubStorage({ getItem: blocked, setItem: blocked });
      const guide = useGuideStore();

      guide.autoOpen('shipment');
      expect(guide.open).toBe(true);

      guide.hide();
      guide.autoOpen('shipment');
      expect(guide.open).toBe(false);
   });

   it('finds the page of a route', () => {
      expect(
         guideForRoute([{ name: 'ops' }, { name: 'ops-shipment' }, { name: 'ops-shipment-list' }])
      ).toBe('shipment');
      expect(guideForRoute([{ name: 'account-profile' }])).toBeNull();
   });

   it('filters the tasks by permission', () => {
      expect(
         visibleTasks(PAGE_GUIDES.dashboard, (a, s) => a === 'update' && s === 'incident').map(
            (t) => t.id
         )
      ).toEqual(['close_incident']);
   });
});
