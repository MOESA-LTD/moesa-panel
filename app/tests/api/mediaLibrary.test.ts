import { applyMediaLibraryFilters, type MediaLibraryFilters } from '@/api/media/library';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

// A filter builder recording [method, ...args].
const calls = (filters: MediaLibraryFilters) => {
   const recorded: unknown[][] = [];
   interface Builder {
      eq(column: string, value: unknown): Builder;
      or(filters: string): Builder;
      in(column: string, values: readonly unknown[]): Builder;
      contains(column: string, value: readonly unknown[]): Builder;
   }
   const builder: Builder = new Proxy({} as Builder, {
      get:
         (_, method: string) =>
         (...args: unknown[]) => {
            recorded.push([method, ...args]);
            return builder;
         }
   });
   applyMediaLibraryFilters(builder, filters);
   return recorded;
};

describe('applyMediaLibraryFilters', () => {
   it('filters by customer, with or without the shared files', () => {
      expect(calls({ customerId: 'c1' })).toEqual([['eq', 'customer_id', 'c1']]);
      expect(calls({ customerId: 'c1', includeShared: true })).toEqual([
         ['or', 'customer_id.eq.c1,customer_id.is.null']
      ]);
   });

   it('filters by kind and tag', () => {
      expect(calls({ kind: ['image', 'pdf'], tag: 'red' })).toEqual([
         ['in', 'kind', ['image', 'pdf']],
         ['contains', 'tags', ['red']]
      ]);
   });

   it('filters by the records a file is linked to', () => {
      expect(calls({ linkedType: 'product' })).toEqual([['contains', 'linked_types', ['product']]]);
      expect(calls({ linkedType: 'product', entityId: 'p1' })).toEqual([
         ['contains', 'linked_types', ['product']],
         ['contains', 'linked_entities', ['product:p1']]
      ]);
   });

   it('finds the files linked nowhere', () => {
      expect(calls({ linkedType: 'none' })).toEqual([
         ['eq', 'link_count', 0],
         ['eq', 'document_count', 0]
      ]);
   });

   it('adds nothing for empty values', () => {
      expect(calls({ tag: '', kind: null })).toEqual([]);
      expect(
         calls({
            customerId: null,
            includeShared: true,
            kind: [],
            linkedType: null,
            entityId: 'p1'
         })
      ).toEqual([]);
   });
});
