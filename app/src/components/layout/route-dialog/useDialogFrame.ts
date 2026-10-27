import { onBeforeUnmount, readonly, ref } from 'vue';

/** How the dialog is shown: as placed by the user, filling the viewport, or as its header only. */
export type DialogWindowState = 'normal' | 'maximized' | 'minimized';

/** The sides a resize handle moves; a corner moves two. */
export type DialogEdges = { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };

/** What it takes to show the dialog the same way again (e.g. after a reload). */
export type DialogFrameSnapshot = {
   /** The dialog's inline style. */
   style: string;
   state: DialogWindowState;
   /** The normal box to restore to while maximized or minimized. */
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
 * Maximizing or minimizing keeps the normal box and returns to it on restore.
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

   /** Follows the pointer until it is released; `move` gets the distance from the start. */
   const track = (event: PointerEvent, move: (dx: number, dy: number) => void) => {
      // A gesture whose release was missed (e.g. released outside the window) ends here.
      stop?.();
      event.preventDefault();

      const target = event.currentTarget as HTMLElement;
      target.setPointerCapture(event.pointerId);
      document.body.classList.add('select-none');

      const onMove = (e: PointerEvent) =>
         move(e.clientX - event.clientX, e.clientY - event.clientY);
      const onUp = () => {
         stop?.();
         const el = dialog();
         if (el) save(el);
      };

      stop = () => {
         target.removeEventListener('pointermove', onMove);
         target.removeEventListener('pointerup', onUp);
         target.removeEventListener('pointercancel', onUp);
         document.body.classList.remove('select-none');
         stop = undefined;
      };

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
   };

   function startDrag(event: PointerEvent) {
      const el = dialog();
      // Buttons and links in the header keep their own behaviour; a maximized dialog stays put.
      if (
         !el ||
         event.button !== 0 ||
         state.value === 'maximized' ||
         (event.target as HTMLElement).closest('button, a, input')
      )
         return;

      const start = pin(el);
      track(event, (dx, dy) => {
         el.style.left = `${clamp(start.left + dx, 0, innerWidth - start.width)}px`;
         el.style.top = `${clamp(start.top + dy, 0, innerHeight - start.height)}px`;
      });
   }

   function startResize(event: PointerEvent, edges: DialogEdges) {
      const el = dialog();
      if (!el || event.button !== 0 || state.value !== 'normal') return;

      const start = pin(el);
      el.style.height = `${start.height}px`;
      const right = start.left + start.width;
      const bottom = start.top + start.height;

      track(event, (dx, dy) => {
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
      });
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

   onBeforeUnmount(() => stop?.());

   return {
      state: readonly(state),
      startDrag,
      startResize,
      toggleMaximize: () => toggle('maximized'),
      toggleMinimize: () => toggle('minimized'),
      restore
   };
}
