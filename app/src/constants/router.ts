export const DIALOG_POSITIONS = {
   LEFT: 'left',
   RIGHT: 'right',
   TOP: 'top',
   BOTTOM: 'bottom',
   CENTER: 'center',
   TOP_LEFT: 'topleft',
   TOP_RIGHT: 'topright',
   BOTTOM_LEFT: 'bottomleft',
   BOTTOM_RIGHT: 'bottomright'
} as const;

export type DialogPosition = (typeof DIALOG_POSITIONS)[keyof typeof DIALOG_POSITIONS];
