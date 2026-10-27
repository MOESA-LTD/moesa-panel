import { onBeforeUnmount, readonly, ref } from 'vue';
import { SNAP_BOXES, snapZoneAt, type SnapBox, type SnapZone } from './snap';

/**
 * How the dialog is shown: as placed by the user, filling the viewport, as its header only, or
 * filling the part of the viewport it was dropped on (see snap.ts).
 */
export type DialogWindowState = 'normal' | 'maximized' | 'minimized' | 'snapped';

/** The sides a resize handle moves; a corner moves two. */
export type DialogEdges = { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };

/** What it takes to show the dialog the same way again (e.g. after a reload). */
export type DialogFrameSnapshot = {
   /** The dialog's inline style. */
   style: string;
   state: DialogWindowState;
   /** The normal box to restore to while maximized, minimized or snapped. */
   normalStyle: string;
};

export type DialogFrameOptions = {
   minWidth?: number;
   minHeight?: number;
   /** The state to start in, e.g. from an earlier snapshot; the style itself is the dialog's. */
   initial?: Partial<Pick<DialogFrameSnapshot, 'state' | 'normalStyle'>>;
   /** Called after every change, e.g. to keep the style across renders. */
   onChange?: (snapshot: DialogFrameSnapshot) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Moves, resizes, maximizes and minimizes a dialog, inside the viewport.
 *
 * On the first move or resize the dialog is pinned where it is (fixed position, explicit size), as
 * PrimeVue's own drag does; from then on its box follows the pointer instead of the mask's layout.
 * Maximizing, minimizing or snapping keeps the normal box and returns to it on restore.
 *
 * Dragged to an edge or corner of the viewport, the dialog shows where it would snap and fills that
 * half or quarter when dropped; it can still be resized there. A maximized or snapped dialog dragged
 * away gets its normal size back, under the pointer.
 */
export function useDialogFrame(
   dialog: () => HTMLElement | null | undefined,
   { minWidth = 320, minHeight = 200, initial, onChange }: DialogFrameOptions = {}
) {
   let stop: (() => void) | undefined;

   const state = ref<DialogWindowState>(initial?.state ?? 'normal');
   /** The dialog's inline style before it was maximized or minimized. */
   let normalStyle = initial?.normalStyle ?? '';

   const save = (el: HTMLElement) =>
      onChange?.({ style: el.style.cssText, state: state.value, normalStyle });

   const pin = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      Object.assign(el.style, {
         position: 'fixed',
         margin: '0',
         left: `${rect.left}px`,
         top: `${rect.top}px`,
         width: `${rect.width}px`,
         minWidth: `${Math.min(minWidth, rect.width)}px`,
         maxWidth: '100vw',
         maxHeight: '100vh'
      });
      return rect;
   };

   /** Shows where a dropped dialog would snap, just below it in the dialog's mask. */
   let preview: HTMLElement | null = null;
   const showPreview = (el: HTMLElement, zone: SnapZone | null) => {
      if (!zone) return hidePreview();
      if (!preview) {
         preview = document.createElement('div');
         preview.className = 'route_dialog__snap-preview';
         preview.setAttribute('aria-hidden', 'true');
      }
      if (preview.nextElementSibling !== el) el.before(preview);
      Object.assign(preview.style, SNAP_BOXES[zone]);
   };
   const hidePreview = () => {
      preview?.remove();
      preview = null;
   };

   /**
    * Follows the pointer until it is released; `move` gets the distance from the start and the
    * event, `end` whether the gesture was completed (not cancelled).
    */
   const track = (
      event: PointerEvent,
      move: (dx: number, dy: number, event: PointerEvent) => void,
      end?: (completed: boolean) => void
   ) => {
      // A gesture whose release was missed (e.g. released outside the window) ends here.
      stop?.();
      event.preventDefault();

      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      document.body.classList.add('select-none');

      const onMove = (e: PointerEvent) =>
         move(e.clientX - event.clientX, e.clientY - event.clientY, e);
      const onUp = (e: PointerEvent) => {
         stop?.();
         end?.(e.type === 'pointerup');
         const el = dialog();
         if (el) save(el);
      };

      stop = () => {
         target.removeEventListener('pointermove', onMove);
         target.removeEventListener('pointerup', onUp);
         target.removeEventListener('pointercancel', onUp);
         document.body.classList.remove('select-none');
         hidePreview();
         stop = undefined;
      };

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
   };

   /**
    * A maximized or snapped dialog back at its normal size, placed so the pointer keeps its place
    * on the header (horizontally in proportion, as the width changes).
    */
   function detach(el: HTMLElement, event: PointerEvent) {
      const from = el.getBoundingClientRect();
      const share = from.width ? (event.clientX - from.left) / from.width : 0.5;
      const grabY = event.clientY - from.top;

      el.style.cssText = normalStyle;
      state.value = 'normal';
      const { width, height } = pin(el);
      el.style.left = `${clamp(event.clientX - share * width, 0, Math.max(innerWidth - width, 0))}px`;
      el.style.top = `${clamp(event.clientY - grabY, 0, Math.max(innerHeight - height, 0))}px`;
   }

   /** Fills `zone`; the box it had before the drag is kept to return to. */
   function snap(el: HTMLElement, zone: SnapZone, before: string) {
      normalStyle = before;
      Object.assign(el.style, {
         position: 'fixed',
         margin: '0',
         minWidth: '0',
         maxWidth: '100vw',
         maxHeight: '100vh',
         ...SNAP_BOXES[zone]
      } satisfies Partial<CSSStyleDeclaration> & SnapBox);
      state.value = 'snapped';
   }

   function startDrag(event: PointerEvent) {
      const el = dialog();
      // Buttons and links in the header keep their own behaviour.
      if (!el || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input'))
         return;

      if (state.value === 'maximized' || state.value === 'snapped') detach(el, event);

      // A minimized dialog only moves; the others can be dropped on an edge to snap.
      const snaps = state.value === 'normal';
      const start = pin(el);
      const before = el.style.cssText;
      let zone: SnapZone | null = null;

      track(
         event,
         (dx, dy, e) => {
            el.style.left = `${clamp(start.left + dx, 0, innerWidth - start.width)}px`;
            el.style.top = `${clamp(start.top + dy, 0, innerHeight - start.height)}px`;
            if (!snaps) return;
            zone = snapZoneAt(e.clientX, e.clientY, innerWidth, innerHeight);
            showPreview(el, zone);
         },
         (completed) => {
            if (completed && zone) snap(el, zone, before);
         }
      );
   }

   /** The box in viewport units, so a snapped dialog keeps its share of a resized window. */
   function toViewportUnits(el: HTMLElement) {
      const rect = el.getBoundingClientRect();
      const share = (value: number, of: number) => `${+((value / of) * 100).toFixed(4)}`;
      Object.assign(el.style, {
         left: `${share(rect.left, innerWidth)}vw`,
         top: `${share(rect.top, innerHeight)}vh`,
         width: `${share(rect.width, innerWidth)}vw`,
         height: `${share(rect.height, innerHeight)}vh`,
         minWidth: '0'
      });
   }

   /** Resizes a normal or snapped dialog; a snapped one stays snapped, at its new size. */
   function startResize(event: PointerEvent, edges: DialogEdges) {
      const el = dialog();
      const snapped = state.value === 'snapped';
      if (!el || event.button !== 0 || !(state.value === 'normal' || snapped)) return;

      const start = pin(el);
      el.style.height = `${start.height}px`;
      const right = start.left + start.width;
      const bottom = start.top + start.height;

      track(
         event,
         (dx, dy) => {
            if (edges.right) {
               el.style.width = `${clamp(start.width + dx, minWidth, innerWidth - start.left)}px`;
            }
            if (edges.left) {
               const width = clamp(start.width - dx, minWidth, right);
               el.style.width = `${width}px`;
               el.style.left = `${right - width}px`;
            }
            if (edges.bottom) {
               el.style.height = `${clamp(start.height + dy, minHeight, innerHeight - start.top)}px`;
            }
            if (edges.top) {
               const height = clamp(start.height - dy, minHeight, bottom);
               el.style.height = `${height}px`;
               el.style.top = `${bottom - height}px`;
            }
         },
         () => {
            if (snapped) toViewportUnits(el);
         }
      );
   }

   /** Back to the normal box; a dialog moved while minimized stays where it was moved to. */
   function restore() {
      const el = dialog();
      if (!el || state.value === 'normal') return;

      const moved = state.value === 'minimized' ? el.getBoundingClientRect() : null;
      el.style.cssText = normalStyle;

      if (moved) {
         // Pinned at its normal size, but where the header was left (it may not have been pinned yet).
         const { width, height } = pin(el);
         el.style.left = `${clamp(moved.left, 0, Math.max(innerWidth - width, 0))}px`;
         el.style.top = `${clamp(moved.top, 0, Math.max(innerHeight - height, 0))}px`;
      }

      state.value = 'normal';
      save(el);
   }

   /** Switches to `next`, or back to normal when the dialog is already in it. */
   function toggle(next: Exclude<DialogWindowState, 'normal'>) {
      const el = dialog();
      if (!el) return;
      if (state.value === next) return restore();

      restore();
      stop?.();
      normalStyle = el.style.cssText;

      if (next === 'maximized') {
         Object.assign(el.style, {
            position: 'fixed',
            margin: '0',
            left: '0',
            top: '0',
            width: '100vw',
            height: '100vh',
            minWidth: '0',
            maxWidth: '100vw',
            maxHeight: '100vh'
         });
      } else {
         // The header alone, where the dialog is; the component hides the body.
         pin(el);
         el.style.height = '';
      }

      state.value = next;
      save(el);
   }

   onBeforeUnmount(() => {
      stop?.();
      hidePreview();
   });

   return {
      state: readonly(state),
      startDrag,
      startResize,
      toggleMaximize: () => toggle('maximized'),
      toggleMinimize: () => toggle('minimized'),
      restore
   };
}
