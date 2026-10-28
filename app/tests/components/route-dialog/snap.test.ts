import {
   frameStyle,
   isDialogFrame,
   SNAP_CORNER,
   SNAP_EDGE,
   SNAP_HINT_REACH,
   snapZoneAt
} from '@/components/layout/route-dialog/snap';
import { describe, expect, it } from 'vitest';

const W = 1000;
const H = 800;
const zone = (x: number, y: number) => snapZoneAt(x, y, W, H);

describe('snapZoneAt', () => {
   it('is null away from the edges', () => {
      expect(zone(500, 400)).toBeNull();
      expect(zone(SNAP_EDGE + 1, 400)).toBeNull();
   });

   it('snaps to the halves along each edge', () => {
      expect(zone(0, 400)).toBe('left');
      expect(zone(W - 1, 400)).toBe('right');
      expect(zone(500, 0)).toBe('top');
      expect(zone(500, H - 1)).toBe('bottom');
   });

   it('snaps to the quarters near the corners, from either edge', () => {
      expect(zone(0, 10)).toBe('top-left');
      expect(zone(10, 0)).toBe('top-left');
      expect(zone(W - 1, SNAP_CORNER - 1)).toBe('top-right');
      expect(zone(0, H - 1)).toBe('bottom-left');
      expect(zone(W - SNAP_CORNER + 1, H - 1)).toBe('bottom-right');
   });

   it('takes a pointer past the edge (captured outside the window) as at the edge', () => {
      expect(zone(-50, 400)).toBe('left');
      expect(zone(5000, 5000)).toBe('bottom-right');
   });

   it('finds the zone the pointer is heading to within a wider reach', () => {
      expect(zone(SNAP_HINT_REACH, 400)).toBeNull();
      expect(snapZoneAt(SNAP_HINT_REACH, 400, W, H, SNAP_HINT_REACH)).toBe('left');
      expect(snapZoneAt(500, H - 50, W, H, SNAP_HINT_REACH)).toBe('bottom');
      expect(snapZoneAt(500, 400, W, H, SNAP_HINT_REACH)).toBeNull();
   });
});

describe('dialog frame from the query', () => {
   it('accepts maximized and the snap zones only', () => {
      expect(isDialogFrame('maximized')).toBe(true);
      expect(isDialogFrame('top-right')).toBe(true);
      expect(isDialogFrame('center')).toBe(false);
      expect(isDialogFrame(['left'])).toBe(false);
      expect(isDialogFrame(undefined)).toBe(false);
   });

   it('opens maximized over the whole viewport', () => {
      const { style, state } = frameStyle('maximized');
      expect(state).toBe('maximized');
      expect(style).toContain('width: 100vw');
      expect(style).toContain('height: 100vh');
   });

   it('opens snapped to the zone', () => {
      const { style, state } = frameStyle('right');
      expect(state).toBe('snapped');
      expect(style).toContain('left: 50vw');
      expect(style).toContain('width: 50vw');
      expect(style).toContain('height: 100vh');
   });
});
