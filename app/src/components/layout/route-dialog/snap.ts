/** Where a dragged dialog can be dropped to fill part of the viewport, as on desktops. */
export type SnapZone =
   | 'left'
   | 'right'
   | 'top'
   | 'bottom'
   | 'top-left'
   | 'top-right'
   | 'bottom-left'
   | 'bottom-right';

/** How close to a viewport edge the pointer has to be to snap. */
export const SNAP_EDGE = 16;
/** How far along an edge from a corner still snaps to the corner (a quarter). */
export const SNAP_CORNER = 96;

/** The zone under the pointer, if it is at an edge of the viewport. */
export function snapZoneAt(x: number, y: number, width: number, height: number): SnapZone | null {
   const atLeft = x <= SNAP_EDGE;
   const atRight = x >= width - 1 - SNAP_EDGE;
   const atTop = y <= SNAP_EDGE;
   const atBottom = y >= height - 1 - SNAP_EDGE;

   const vertical = y < SNAP_CORNER ? 'top' : y > height - 1 - SNAP_CORNER ? 'bottom' : null;
   const horizontal = x < SNAP_CORNER ? 'left' : x > width - 1 - SNAP_CORNER ? 'right' : null;

   if (atLeft || atRight) {
      const side = atLeft ? 'left' : 'right';
      return vertical ? `${vertical}-${side}` : side;
   }
   if (atTop || atBottom) {
      const side = atTop ? 'top' : 'bottom';
      return horizontal ? `${side}-${horizontal}` : side;
   }
   return null;
}

export type SnapBox = { left: string; top: string; width: string; height: string };

const HALF_W = '50vw';
const HALF_H = '50vh';

/** Each zone's box, in viewport units so it follows the window's size. */
export const SNAP_BOXES: Record<SnapZone, SnapBox> = {
   left: { left: '0px', top: '0px', width: HALF_W, height: '100vh' },
   right: { left: HALF_W, top: '0px', width: HALF_W, height: '100vh' },
   top: { left: '0px', top: '0px', width: '100vw', height: HALF_H },
   bottom: { left: '0px', top: HALF_H, width: '100vw', height: HALF_H },
   'top-left': { left: '0px', top: '0px', width: HALF_W, height: HALF_H },
   'top-right': { left: HALF_W, top: '0px', width: HALF_W, height: HALF_H },
   'bottom-left': { left: '0px', top: HALF_H, width: HALF_W, height: HALF_H },
   'bottom-right': { left: HALF_W, top: HALF_H, width: HALF_W, height: HALF_H }
};
