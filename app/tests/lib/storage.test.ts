import {
   getStorage,
   readStorage,
   removeStorage,
   storageOrMemory,
   writeStorage
} from '@/lib/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NAMES = ['localStorage', 'sessionStorage'] as const;
const saved = NAMES.map(
   (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

/** Chrome with site data blocked: reading the property itself throws. */
const blockStorage = () => {
   for (const name of NAMES) {
      Object.defineProperty(globalThis, name, {
         configurable: true,
         get() {
            throw new DOMException(`Access to '${name}' is denied`, 'SecurityError');
         }
      });
   }
};

describe('storage helpers', () => {
   beforeEach(() => {
      localStorage.clear();
      sessionStorage.clear();
   });

   afterEach(() => {
      for (const [name, descriptor] of saved) Object.defineProperty(globalThis, name, descriptor!);
   });

   it('round-trips values in both storages', () => {
      expect(getStorage()).toBe(localStorage);
      expect(getStorage('session')).toBe(sessionStorage);

      expect(writeStorage('k', 'local value')).toBe(true);
      expect(writeStorage('k', 'session value', 'session')).toBe(true);
      expect(readStorage('k')).toBe('local value');
      expect(readStorage('k', 'session')).toBe('session value');

      expect(removeStorage('k')).toBe(true);
      expect(readStorage('k')).toBeNull();
      expect(readStorage('k', 'session')).toBe('session value');
      expect(writeStorage('k', null, 'session')).toBe(true);
      expect(readStorage('k', 'session')).toBeNull();
   });

   it('reads null for a missing key', () => {
      expect(readStorage('missing')).toBeNull();
   });

   it('gives null and false when storage is blocked', () => {
      blockStorage();

      for (const kind of ['local', 'session'] as const) {
         expect(getStorage(kind)).toBeNull();
         expect(readStorage('k', kind)).toBeNull();
         expect(writeStorage('k', 'v', kind)).toBe(false);
         expect(removeStorage('k', kind)).toBe(false);
      }
   });

   it('gives false when a write is refused (quota)', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
         throw new DOMException('full', 'QuotaExceededError');
      });
      expect(writeStorage('k', 'v')).toBe(false);
   });

   it('falls back to a working in-memory storage when blocked', () => {
      expect(storageOrMemory()).toBe(localStorage);
      blockStorage();

      const memory = storageOrMemory('session');
      memory.setItem('k', 'v');
      expect(memory.getItem('k')).toBe('v');
      expect(memory.length).toBe(1);
      expect(memory.key(0)).toBe('k');
      memory.removeItem('k');
      expect(memory.getItem('k')).toBeNull();
   });
});
