import {
   decodeRouteMeta,
   encodeRouteMeta,
   initialSortMeta,
   resolveStateStorage
} from '@/components/ui/custom-table/useTableMeta';
import { describe, expect, it } from 'vitest';

describe('resolveStateStorage', () => {
   it('respects an explicit storage', () => {
      expect(resolveStateStorage({ stateStorage: 'session', useMeta: true })).toBe('session');
      expect(resolveStateStorage({ stateStorage: 'local', inDialog: true })).toBe('local');
   });

   it('uses local storage for page tables and session storage in dialogs or without meta', () => {
      expect(resolveStateStorage({ useMeta: true })).toBe('local');
      expect(resolveStateStorage({ useMeta: true, inDialog: true })).toBe('session');
      expect(resolveStateStorage({ useMeta: false })).toBe('session');
   });
});

describe('initialSortMeta', () => {
   it('sorts by the columns with a sortOrder, ordered by that value', () => {
      expect(
         initialSortMeta([
            { field: 'created_at', sortOrder: { value: 1 } },
            { field: 'email' },
            { field: 'display_name', sortField: 'client.display_name', sortOrder: { value: -1 } }
         ])
      ).toEqual([
         { field: 'client.display_name', order: -1 },
         { field: 'created_at', order: 1 }
      ]);
   });
});

describe('route meta', () => {
   it('round-trips through the compressed query parameter', () => {
      const meta = { 'dt-client': { first: 10, rows: 5, filters: { email: { value: 'a,b' } } } };
      expect(decodeRouteMeta(encodeRouteMeta(meta))).toEqual(meta);
   });

   it('ignores a missing or malformed parameter', () => {
      expect(decodeRouteMeta(undefined)).toEqual({});
      expect(decodeRouteMeta('not-a-valid-payload')).toEqual({});
   });
});
