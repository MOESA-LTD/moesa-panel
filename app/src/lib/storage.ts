/**
 * Browser storage that survives being blocked. With site data blocked (or in some private modes)
 * reading `window.localStorage` itself throws a SecurityError, so even `localStorage?.getItem` fails.
 * These helpers return null/false instead, and the app runs without persistence.
 */

export type StorageKind = 'local' | 'session';

/** The browser storage, or null when it is blocked or there is no window. */
export function getStorage(kind: StorageKind = 'local'): Storage | null {
   try {
      if (typeof window === 'undefined') return null;
      return (kind === 'local' ? window.localStorage : window.sessionStorage) ?? null;
   } catch {
      return null;
   }
}

/** The stored value, or null when it is missing or storage is unavailable. */
export function readStorage(key: string, kind: StorageKind = 'local'): string | null {
   try {
      return getStorage(kind)?.getItem(key) ?? null;
   } catch {
      return null;
   }
}

/** Stores a value (removes it for null); false when storage is unavailable or full. */
export function writeStorage(
   key: string,
   value: string | null,
   kind: StorageKind = 'local'
): boolean {
   try {
      const storage = getStorage(kind);
      if (!storage) return false;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      return true;
   } catch {
      return false;
   }
}

/** Removes a value; false when storage is unavailable. */
export function removeStorage(key: string, kind: StorageKind = 'local'): boolean {
   return writeStorage(key, null, kind);
}

/** A Storage that lives in memory, for when the browser's is blocked. */
export function createMemoryStorage(): Storage {
   const items = new Map<string, string>();
   return {
      get length() {
         return items.size;
      },
      clear: () => items.clear(),
      getItem: (key) => items.get(key) ?? null,
      key: (index) => [...items.keys()][index] ?? null,
      removeItem: (key) => void items.delete(key),
      setItem: (key, value) => void items.set(key, String(value))
   };
}

/**
 * The browser storage, or an in-memory one when it is blocked: for VueUse's useStorage, whose own
 * fallback logs a SecurityError and, for sessionStorage, falls back to localStorage.
 */
export const storageOrMemory = (kind: StorageKind = 'local'): Storage =>
   getStorage(kind) ?? createMemoryStorage();
