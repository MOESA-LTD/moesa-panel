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
      expect(setItem).toHaveBeenCalledWith(
         'guide.dismissed',
         JSON.stringify({ 'ops-shipment': true })
      );

      guide.hide();
      // A new store: only the stored key keeps it closed.
      setActivePinia(createPinia());
      const later = useGuideStore();
      later.autoOpen('shipment');
      expect(later.open).toBe(false);
   });

   it('keeps the other routes when a second page is dismissed', () => {
      const stored = new Map<string, string>([
         ['guide.dismissed', JSON.stringify({ dashboard: true })]
      ]);
      stubStorage({
         getItem: (key: string) => stored.get(key) ?? null,
         setItem: (key: string, value: string) => void stored.set(key, value)
      });
      const guide = useGuideStore();

      guide.autoOpen('shipment');

      expect(JSON.parse(stored.get('guide.dismissed') ?? '{}')).toEqual({
         dashboard: true,
         'ops-shipment': true
      });
   });

   it('treats an unreadable stored value as nothing dismissed', () => {
      stubStorage({ getItem: () => '{not json', setItem: vi.fn() });
      const guide = useGuideStore();

      guide.autoOpen('shipment');

      expect(guide.open).toBe(true);
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

   it('moves an open panel to the page navigated to', () => {
      stubStorage({
         getItem: () => JSON.stringify({ dashboard: true, 'ops-shipment': true }),
         setItem: vi.fn()
      });
      const guide = useGuideStore();
      guide.show('dashboard', 'close_incident');

      guide.followRoute('shipment');

      expect(guide.open).toBe(true);
      expect(guide.page).toBe('shipment');
      expect(guide.focusTask).toBeNull();
   });

   it('closes an open panel on a route without a guide', () => {
      stubStorage({
         getItem: () => JSON.stringify({ dashboard: true, 'ops-shipment': true }),
         setItem: vi.fn()
      });
      const guide = useGuideStore();
      guide.show('dashboard');

      guide.followRoute(null);

      expect(guide.open).toBe(false);
   });

   it('leaves a closed panel closed on a visited page', () => {
      stubStorage({
         getItem: () => JSON.stringify({ dashboard: true, 'ops-shipment': true }),
         setItem: vi.fn()
      });
      const guide = useGuideStore();

      guide.followRoute('shipment');

      expect(guide.open).toBe(false);
   });

   it('opens a term on the page of the route', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.followRoute('shipment');
      guide.hide();

      guide.showTerm('ETA');

      expect(guide.open).toBe(true);
      expect(guide.page).toBe('shipment');
      expect(guide.focusTerm).toBe('ETA');
      expect(guide.focusTask).toBeNull();
   });

   it('opens a term alone on a route without a guide', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.followRoute('shipment');
      guide.hide();
      guide.followRoute(null);

      guide.showTerm('S09');

      expect(guide.open).toBe(true);
      expect(guide.page).toBeNull();
   });

   it('keeps the open task when a term is clicked on the same page', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.followRoute('dashboard');
      guide.show('dashboard', 'close_incident');

      guide.showTerm('S1');

      expect(guide.page).toBe('dashboard');
      expect(guide.focusTerm).toBe('S1');
      expect(guide.focusTask).toBe('close_incident');
   });

   it('drops the task when a term opens the guide of another page', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.followRoute('shipment');
      guide.show('dashboard', 'close_incident');

      guide.showTerm('ETA');

      expect(guide.page).toBe('shipment');
      expect(guide.focusTask).toBeNull();
   });

   it('drops the task when a term reopens a closed panel', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.followRoute('dashboard');
      guide.show('dashboard', 'close_incident');
      guide.hide();

      guide.showTerm('S1');

      expect(guide.focusTask).toBeNull();
   });

   it('drops the term when a page guide is shown', () => {
      stubStorage({ getItem: () => null, setItem: vi.fn() });
      const guide = useGuideStore();
      guide.showTerm('PI');

      guide.show('dashboard', 'close_gates');

      expect(guide.focusTerm).toBeNull();
      expect(guide.focusTask).toBe('close_gates');
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
