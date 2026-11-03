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
/** How close to an edge the pointer gets before that edge's drop zone is highlighted. */
export const SNAP_HINT_REACH = 120;

/** All zones, for showing where a dragged dialog can be dropped. */
export const SNAP_ZONES: SnapZone[] = [
   'left',
   'right',
   'top',
   'bottom',
   'top-left',
   'top-right',
   'bottom-left',
   'bottom-right'
];

/**
 * The zone under the pointer, if it is within `edge` pixels of an edge of the viewport: SNAP_EDGE
 * to snap, SNAP_HINT_REACH for the zone the pointer is heading to.
 */
export function snapZoneAt(
   x: number,
   y: number,
   width: number,
   height: number,
   edge = SNAP_EDGE
): SnapZone | null {
   const atLeft = x <= edge;
   const atRight = x >= width - 1 - edge;
   const atTop = y <= edge;
   const atBottom = y >= height - 1 - edge;

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

/** How a dialog can be told to open (`?dialogFrame=`): filling the viewport, or one snap zone. */
export type DialogFrame = 'maximized' | SnapZone;

export const isDialogFrame = (value: unknown): value is DialogFrame =>
   value === 'maximized' || SNAP_ZONES.includes(value as SnapZone);

/** The inline style of a dialog filling the viewport. */
export const MAXIMIZED_STYLE = {
   position: 'fixed',
   margin: '0',
   left: '0',
   top: '0',
   width: '100vw',
   height: '100vh',
   minWidth: '0',
   maxWidth: '100vw',
   maxHeight: '100vh'
} as const;

/** The inline style of a dialog filling `zone`. */
export const snapStyle = (zone: SnapZone) =>
   ({
      position: 'fixed',
      margin: '0',
      minWidth: '0',
      maxWidth: '100vw',
      maxHeight: '100vh',
      ...SNAP_BOXES[zone]
   }) as const;

/** The style and window state a dialog opens with for `frame`. */
export function frameStyle(frame: DialogFrame) {
   const el = document.createElement('div');
   Object.assign(el.style, frame === 'maximized' ? MAXIMIZED_STYLE : snapStyle(frame));
   return {
      style: el.style.cssText,
      state: frame === 'maximized' ? ('maximized' as const) : ('snapped' as const)
   };
}
