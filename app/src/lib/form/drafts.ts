/**
 * Unsaved form edits kept in the tab's sessionStorage, so a reload does not lose them. They are
 * scoped to the user and tenant, live only as long as the tab, and are cleared on sign-out.
 * Storage may be unavailable (private mode, quota); drafts are then simply not kept.
 */

const PREFIX = 'draft:';

export type FormDraft<T = unknown> = {
   /** The edited values. */
   values: T;
   /** The values the edits started from, to tell whether the row changed since. */
   base: T;
   savedAt: number;
};

/** Dates survive JSON as tagged ISO strings (DatePicker values are Date objects). */
const DATE_TAG = '__date';

function replacer(this: Record<string, unknown>, key: string, value: unknown) {
   const raw = this[key];
   return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value;
}

function reviver(_key: string, value: unknown) {
   if (value && typeof value === 'object' && DATE_TAG in value) {
      return new Date((value as Record<typeof DATE_TAG, string>)[DATE_TAG]);
   }
   return value;
}

/** The storage key of a form: who edits it, in which tenant, and which form/row it is. */
export const draftKey = (scope: { userId: string; tenantId: string | null }, form: string) =>
   `${PREFIX}${scope.userId}:${scope.tenantId ?? '-'}:${form}`;

export function loadDraft<T>(key: string): FormDraft<T> | null {
   try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw, reviver) as FormDraft<T>) : null;
   } catch {
      return null;
   }
}

export function saveDraft<T>(key: string, draft: Omit<FormDraft<T>, 'savedAt'>) {
   try {
      sessionStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }, replacer));
   } catch {
      // Not kept; the form keeps working.
   }
}

export function removeDraft(key: string) {
   try {
      sessionStorage.removeItem(key);
   } catch {
      // Nothing to remove.
   }
}

/** Removes every draft, e.g. on sign-out. */
export function clearDrafts() {
   try {
      Object.keys(sessionStorage)
         .filter((key) => key.startsWith(PREFIX))
         .forEach((key) => sessionStorage.removeItem(key));
   } catch {
      // Nothing to clear.
   }
}
