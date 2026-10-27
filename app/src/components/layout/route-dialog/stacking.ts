/**
 * Brings a dialog's mask in front of the other open dialogs, keeping their order. PrimeVue only
 * stacks dialogs by opening order; with several route dialogs open, the one clicked comes first.
 */
export function bringToFront(mask: HTMLElement) {
   const masks = [
      ...document.querySelectorAll<HTMLElement>('.p-dialog-mask:has(.p-dialog[role="dialog"])')
   ].sort((a, b) => +a.style.zIndex - +b.style.zIndex);
   const top = masks.at(-1);

   if (!top || top === mask) return;

   const topZIndex = +top.style.zIndex;
   masks.forEach((element) => (element.style.zIndex = `${+element.style.zIndex - 1}`));
   mask.style.zIndex = `${topZIndex + 1}`;
}
