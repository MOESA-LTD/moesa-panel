import type { DialogPosition } from '@/constants/router';
import type { DialogFrameSnapshot } from './useDialogFrame';

/**
 * The route dialogs open in this tab, kept in sessionStorage so that a reload reopens them as they
 * were (see useRouteDialogRestore). Like form drafts they belong to the signed-in user and are
 * cleared on sign-out.
 */
export type SavedRouteDialog = Partial<DialogFrameSnapshot> & {
   id: string;
   userId: string;
   /** The route's full path, including `?showDialog=<position>`. */
   path: string;
   position: DialogPosition;
};

const KEY = 'route-dialogs';

function read(): SavedRouteDialog[] {
   try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
   } catch {
      return [];
   }
}

function write(dialogs: SavedRouteDialog[]) {
   try {
      if (dialogs.length) sessionStorage.setItem(KEY, JSON.stringify(dialogs));
      else sessionStorage.removeItem(KEY);
   } catch {
      // Not kept; dialogs simply are not reopened after a reload.
   }
}

/** Adds the dialog, or replaces it when it is being reopened. */
export function rememberDialog(dialog: SavedRouteDialog) {
   write([...read().filter(({ id }) => id !== dialog.id), dialog]);
}

export function updateDialog(id: string, frame: DialogFrameSnapshot) {
   write(read().map((dialog) => (dialog.id === id ? { ...dialog, ...frame } : dialog)));
}

export function forgetDialog(id: string) {
   write(read().filter((dialog) => dialog.id !== id));
}

/** The user's dialogs in the order they were opened. */
export const savedDialogs = (userId: string) => read().filter((dialog) => dialog.userId === userId);

export function clearDialogs() {
   write([]);
}

// The dialogs on screen in this page. Opening a dialog's URL directly saves it before the restore
// runs, so the restore skips those instead of opening them a second time.
const onScreen = new Set<string>();

export const markOnScreen = (id: string) => onScreen.add(id);
export const markOffScreen = (id: string) => onScreen.delete(id);

/** The user's saved dialogs that are not on screen, in the order they were opened. */
export const dialogsToRestore = (userId: string) =>
   savedDialogs(userId).filter(({ id }) => !onScreen.has(id));

// A dialog being reopened by useRouteDialogRestore, matched by path when the guard opens it.
const reopening = new Map<string, SavedRouteDialog>();

export const markReopening = (dialog: SavedRouteDialog) => reopening.set(dialog.path, dialog);

export function takeReopening(path: string) {
   const dialog = reopening.get(path);
   reopening.delete(path);
   return dialog;
}
