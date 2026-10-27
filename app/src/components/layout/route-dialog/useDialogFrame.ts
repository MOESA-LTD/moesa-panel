import { onBeforeUnmount } from 'vue';

/** The sides a resize handle moves; a corner moves two. */
export type DialogEdges = { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };

export type DialogFrameOptions = {
   minWidth?: number;
   minHeight?: number;
   /** Called with the dialog's inline style after a move or resize, to keep it across renders. */
   onChange?: (style: string) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Moves and resizes a dialog with the pointer, inside the viewport.
 *
 * On the first move or resize the dialog is pinned where it is (fixed position, explicit size), as
 * PrimeVue's own drag does; from then on its box follows the pointer instead of the mask's layout.
 */
export function useDialogFrame(
   dialog: () => HTMLElement | null | undefined,
   { minWidth = 320, minHeight = 200, onChange }: DialogFrameOptions = {}
) {
   let stop: (() => void) | undefined;

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
         if (el) onChange?.(el.style.cssText);
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
      // Buttons and links in the header keep their own behaviour.
      if (!el || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input'))
         return;

      const start = pin(el);
      track(event, (dx, dy) => {
         el.style.left = `${clamp(start.left + dx, 0, innerWidth - start.width)}px`;
         el.style.top = `${clamp(start.top + dy, 0, innerHeight - start.height)}px`;
      });
   }

   function startResize(event: PointerEvent, edges: DialogEdges) {
      const el = dialog();
      if (!el || event.button !== 0) return;

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

   onBeforeUnmount(() => stop?.());

   return { startDrag, startResize };
}
