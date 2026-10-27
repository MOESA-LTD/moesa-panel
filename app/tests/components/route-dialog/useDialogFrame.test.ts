import { useDialogFrame, type DialogEdges } from '@/components/layout/route-dialog/useDialogFrame';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

// happy-dom has no layout: the dialog's box comes from the inline style, as after a move.
const VIEWPORT = { width: 1000, height: 800 };
const START = { left: 100, top: 100, width: 400, height: 300 };
const HEADER_HEIGHT = 40;

let dialog: HTMLElement;
let handle: HTMLElement;
let frame: ReturnType<typeof useDialogFrame>;
let saved: string | undefined;

const px = (value: string) => Math.round(parseFloat(value));
const box = () => ({
   left: px(dialog.style.left),
   top: px(dialog.style.top),
   width: px(dialog.style.width),
   height: px(dialog.style.height)
});

/** Presses on `handle`, moves by (dx, dy) and releases. */
function gesture(start: (event: PointerEvent) => void, dx: number, dy: number, button = 0) {
   const init = { bubbles: true, pointerId: 1, button, clientX: 500, clientY: 500 };
   handle.addEventListener('pointerdown', start, { once: true });
   handle.dispatchEvent(new PointerEvent('pointerdown', init));
   handle.dispatchEvent(
      new PointerEvent('pointermove', { ...init, clientX: 500 + dx, clientY: 500 + dy })
   );
   handle.dispatchEvent(new PointerEvent('pointerup', init));
}
const resize = (edges: DialogEdges, dx: number, dy: number, button = 0) =>
   gesture((e) => frame.startResize(e, edges), dx, dy, button);
const drag = (dx: number, dy: number) => gesture((e) => frame.startDrag(e), dx, dy);

beforeEach(() => {
   vi.stubGlobal('innerWidth', VIEWPORT.width);
   vi.stubGlobal('innerHeight', VIEWPORT.height);
   HTMLElement.prototype.setPointerCapture = () => {};

   dialog = document.createElement('div');
   handle = document.createElement('span');
   dialog.appendChild(handle);
   dialog.getBoundingClientRect = () =>
      ({
         left: px(dialog.style.left),
         top: px(dialog.style.top),
         width: px(dialog.style.width),
         // Without a height the dialog shows its header only (minimized).
         height: px(dialog.style.height) || HEADER_HEIGHT
      }) as DOMRect;
   Object.assign(dialog.style, {
      left: `${START.left}px`,
      top: `${START.top}px`,
      width: `${START.width}px`,
      height: `${START.height}px`
   });

   saved = undefined;
   mount(
      defineComponent({
         setup() {
            frame = useDialogFrame(() => dialog, {
               minWidth: 200,
               minHeight: 150,
               onChange: (style) => (saved = style)
            });
            return () => h('div');
         }
      })
   );
});

afterEach(() => vi.unstubAllGlobals());

describe('useDialogFrame', () => {
   it('pins the dialog in place on the first gesture', () => {
      resize({ right: true }, 0, 0);

      expect(dialog.style.position).toBe('fixed');
      expect(box()).toEqual(START);
   });

   it('resizes from the right and bottom edges', () => {
      resize({ right: true, bottom: true }, 50, 20);
      expect(box()).toEqual({ ...START, width: 450, height: 320 });
   });

   it('resizes from the left and top edges, keeping the opposite edges in place', () => {
      resize({ left: true, top: true }, 30, 40);
      expect(box()).toEqual({ left: 130, top: 140, width: 370, height: 260 });
   });

   it('stops at the minimum size', () => {
      resize({ right: true, bottom: true }, -5000, -5000);
      expect(box()).toEqual({ ...START, width: 200, height: 150 });
   });

   it('stops at the minimum size from the left, keeping the right edge', () => {
      resize({ left: true }, 5000, 0);
      expect(box()).toMatchObject({ left: 300, width: 200 });
   });

   it('stays inside the viewport', () => {
      resize({ right: true, bottom: true }, 5000, 5000);
      expect(box()).toEqual({ ...START, width: 900, height: 700 });

      resize({ left: true, top: true }, -5000, -5000);
      expect(box()).toEqual({ left: 0, top: 0, width: 1000, height: 800 });
   });

   it('moves the dialog inside the viewport', () => {
      drag(50, -20);
      expect(box()).toMatchObject({ left: 150, top: 80 });

      drag(5000, 5000);
      expect(box()).toMatchObject({ left: 600, top: 500 });
   });

   it('ignores buttons other than the primary one', () => {
      resize({ right: true }, 100, 0, 2);
      expect(box()).toEqual(START);
   });

   it('reports the style after a gesture so it can be kept', () => {
      resize({ right: true }, 10, 0);
      expect(saved).toContain('width: 410px');
   });

   describe('window state', () => {
      it('maximizes to the viewport and restores the previous box', () => {
         resize({ right: true }, 50, 0);
         frame.toggleMaximize();

         expect(frame.state.value).toBe('maximized');
         expect(dialog.style).toMatchObject({
            left: '0px',
            top: '0px',
            width: '100vw',
            height: '100vh'
         });

         frame.toggleMaximize();
         expect(frame.state.value).toBe('normal');
         expect(box()).toEqual({ ...START, width: 450 });
      });

      it('neither moves nor resizes while maximized', () => {
         frame.toggleMaximize();
         drag(50, 50);
         resize({ right: true }, 50, 0);

         expect(dialog.style).toMatchObject({ left: '0px', top: '0px', width: '100vw' });
      });

      it('minimizes to the header and restores the height', () => {
         frame.toggleMinimize();

         expect(frame.state.value).toBe('minimized');
         expect(dialog.style.height).toBe('');

         frame.toggleMinimize();
         expect(box()).toEqual(START);
      });

      it('restores a dialog moved while minimized where it was moved to', () => {
         frame.toggleMinimize();
         drag(100, 50);
         frame.restore();

         expect(box()).toEqual({ ...START, left: 200, top: 150 });
      });

      it('keeps the restored box inside the viewport', () => {
         frame.toggleMinimize();
         drag(5000, 5000);
         frame.restore();

         expect(box()).toEqual({ ...START, left: 600, top: 500 });
      });

      it('switches between maximized and minimized through the normal box', () => {
         frame.toggleMaximize();
         frame.toggleMinimize();
         expect(frame.state.value).toBe('minimized');

         frame.restore();
         expect(box()).toEqual(START);
      });

      it('reports the style after a state change', () => {
         frame.toggleMaximize();
         expect(saved).toContain('width: 100vw');
      });
   });
});
