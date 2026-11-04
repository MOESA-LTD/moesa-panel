import {
   decodeRouteMeta,
   encodeRouteMeta,
   initialSortMeta,
   pruneStaleState,
   resolveStateStorage,
   type TableMetaState
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

describe('initialSortMeta priority', () => {
   it('places a column by its priority, whatever its direction', () => {
      expect(
         initialSortMeta([
            { field: 'opened_at', sortOrder: { value: -1, priority: 2 } },
            { field: 'severity', sortOrder: { value: 1, priority: 1 } }
         ])
      ).toEqual([
         { field: 'severity', order: 1 },
         { field: 'opened_at', order: -1 }
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

describe('pruneStaleState', () => {
   const columns = [{ field: 'table_name' }, { field: 'branch', sortField: 'branch.display_name' }];

   it('drops filters and sorts of columns the table no longer has', () => {
      const state = pruneStaleState(
         {
            filters: {
               global: { value: 'x', matchMode: 'contains' },
               table_name: { value: null, matchMode: 'in' },
               old_data: { value: null, matchMode: 'in' }
            },
            multiSortMeta: [
               { field: 'old_data', order: 1 },
               { field: 'branch.display_name', order: -1 }
            ]
         } as TableMetaState,
         { global: {}, table_name: {} },
         columns
      );

      expect(Object.keys(state.filters ?? {})).toEqual(['global', 'table_name']);
      expect(state.multiSortMeta).toEqual([{ field: 'branch.display_name', order: -1 }]);
   });

   it('keeps the state as is when the table declares no filters or columns', () => {
      const state = {
         filters: { a: { value: null, matchMode: 'in' } },
         multiSortMeta: [{ field: 'a', order: 1 }]
      } as TableMetaState;
      expect(pruneStaleState(structuredClone(state), undefined, [])).toEqual(state);
   });
});
