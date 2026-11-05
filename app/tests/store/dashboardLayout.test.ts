import { DASHBOARD_BOX_IDS, type DashboardBoxId } from '@/constants/dashboard';
import { defaultLayout, normalizeLayout, useDashboardLayout } from '@/store/dashboardLayout';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ALL = [...DASHBOARD_BOX_IDS];
const stored = new Map<string, string>();
const stubStorage = (overrides: Partial<Storage> = {}) =>
   vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: vi.fn((k: string, v: string) => void stored.set(k, v)),
      removeItem: (k: string) => void stored.delete(k),
      ...overrides
   });
const store = (userId: string, layout: unknown) =>
   stored.set(`dashboard.layout.${userId}`, JSON.stringify(layout));
const read = (userId: string) => JSON.parse(stored.get(`dashboard.layout.${userId}`) ?? 'null');
const editing = (userId = 'u1') => {
   const s = useDashboardLayout();
   s.load(userId);
   s.edit();
   return s;
};

beforeEach(() => {
   stored.clear();
   stubStorage();
   setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

describe('normalizeLayout', () => {
   it('falls back to the default for nothing, null, an array, a number or a string', () => {
      for (const raw of [undefined, null, [], 3, 'x'])
         expect(normalizeLayout(raw)).toEqual(defaultLayout());
   });
   it('drops unknown and duplicate ids and appends new boxes visible', () => {
      expect(
         normalizeLayout({ order: ['old_box', 'po_action', 'po_action'], hidden: ['gone'] })
      ).toEqual({
         order: ['po_action', ...ALL.filter((id) => id !== 'po_action')],
         sizes: {},
         hidden: []
      });
   });
   it('takes a hidden id out of the order', () => {
      expect(normalizeLayout({ order: ALL, hidden: ['notifications'] })).toEqual({
         order: ALL.filter((id) => id !== 'notifications'),
         sizes: {},
         hidden: ['notifications']
      });
   });
   it('keeps only valid sizes that differ from the default', () => {
      expect(
         normalizeLayout({
            order: ALL,
            sizes: {
               po_action: 'wide',
               shipments_late: 'narrow',
               market_summary: 'huge',
               gone: 'wide'
            }
         }).sizes
      ).toEqual({ po_action: 'wide' });
   });
   it('treats order and hidden that are not arrays as empty', () => {
      expect(normalizeLayout({ order: 'po_action', hidden: { a: 1 } })).toEqual(defaultLayout());
   });
});

describe('useDashboardLayout', () => {
   it('reads the layout of the signed-in user only', () => {
      store('u1', { order: ALL, hidden: ['notifications'] });
      const s = useDashboardLayout();
      s.load('u1');
      expect(s.layout.hidden).toEqual(['notifications']);
      s.load('u2');
      expect(s.layout).toEqual(defaultLayout());
   });
   it('opens on the default layout when storage is unreadable or blocked', () => {
      stored.set('dashboard.layout.u1', '{not json');
      const s = useDashboardLayout();
      s.load('u1');
      expect(s.layout).toEqual(defaultLayout());
      stubStorage({
         getItem: () => {
            throw new Error('blocked');
         }
      });
      s.load('u1');
      expect(s.layout).toEqual(defaultLayout());
      s.load(null);
      expect(s.layout).toEqual(defaultLayout());
   });
   it('edits a draft and leaves the saved layout alone until save', () => {
      const s = editing();
      s.hide('po_action');
      s.setSize('market_summary', 'wide');
      expect(s.saved.order).toContain('po_action');
      expect(s.layout.order).not.toContain('po_action');
      expect(s.layout.hidden).toEqual(['po_action']);
      expect(s.sizeOf('market_summary')).toBe('wide');
      s.setSize('market_summary', 'narrow');
      expect(s.layout.sizes).toEqual({});
   });
   it('unhides a box at the end of the order', () => {
      const s = editing();
      s.hide('gates_team');
      s.unhide('gates_team');
      expect(s.layout.order.at(-1)).toBe('gates_team');
      expect(s.layout.hidden).toEqual([]);
   });
   it('saves the whole layout under the user key, no merge with what another tab stored', () => {
      store('u1', { order: ALL, hidden: ['notifications'] });
      const s = editing();
      store('u1', { order: ALL, hidden: ['po_action'] }); // another tab saved meanwhile
      s.unhide('notifications');
      expect(s.save()).toBe(true);
      expect(read('u1')).toEqual({ order: ALL, sizes: {}, hidden: [] });
      expect(s.editing).toBe(false);
   });
   it('discard returns to the last saved layout', () => {
      const s = editing();
      s.hide('po_action');
      s.discard();
      expect(s.editing).toBe(false);
      expect(s.layout).toEqual(defaultLayout());
      expect(stored.size).toBe(0);
   });
   it('reset to default shows everything in registry order and writes only on save', () => {
      store('u1', { order: ALL, hidden: ['po_action'], sizes: { market_summary: 'wide' } });
      const s = editing();
      const before = stored.get('dashboard.layout.u1');
      s.resetToDefault();
      expect(s.layout).toEqual(defaultLayout());
      expect(stored.get('dashboard.layout.u1')).toBe(before);
      s.save();
      expect(read('u1')).toEqual(defaultLayout());
   });
   it('keeps the layout for the visit when storage refuses the write', () => {
      stubStorage({
         setItem: () => {
            throw new Error('quota');
         }
      });
      const s = editing();
      s.hide('po_action');
      expect(s.save()).toBe(false);
      expect(s.saved.hidden).toEqual(['po_action']);
      expect(s.editing).toBe(false);
   });
   it('does nothing outside edit mode', () => {
      const s = useDashboardLayout();
      s.load('u1');
      s.hide('po_action');
      s.setSize('po_action', 'wide');
      expect(s.layout).toEqual(defaultLayout());
   });
   it('moves past boxes the user cannot see and keeps their slots', () => {
      const canSee = (id: DashboardBoxId) => id !== 'gates_management';
      const s = editing();
      s.move('gates_team', 1, canSee);
      expect(s.layout.order.slice(0, 3)).toEqual([
         'gates_customer',
         'gates_management',
         'gates_team'
      ]);
      s.move('gates_customer', -1, canSee);
      expect(s.layout.order.slice(0, 3)).toEqual([
         'gates_customer',
         'gates_management',
         'gates_team'
      ]);
   });
   it('reorders the shown boxes and leaves the others in place', () => {
      const canSee = (id: DashboardBoxId) => id !== 'po_action';
      const s = editing();
      const shown = s.visibleBoxes(canSee).shown;
      s.reorder([shown[1], shown[0], ...shown.slice(2)], canSee);
      expect(s.layout.order.indexOf('po_action')).toBe(ALL.indexOf('po_action'));
      expect(s.layout.order.slice(0, 2)).toEqual(['gates_management', 'gates_team']);
      s.reorder(['gates_team'], canSee); // not the shown set: ignored
      expect(s.layout.order.slice(0, 2)).toEqual(['gates_management', 'gates_team']);
   });
   it('offers neither shown nor hidden boxes the user cannot see', () => {
      store('u1', { order: ALL, hidden: ['incidents_open'] });
      const s = useDashboardLayout();
      s.load('u1');
      const { shown, hidden } = s.visibleBoxes((id) => id !== 'incidents_open');
      expect(hidden).toEqual([]);
      expect(shown).not.toContain('incidents_open');
   });
});
