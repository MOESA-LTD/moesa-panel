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
      is(column: string, value: null): Builder;
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

   it('offers only the shared files to a record of no customer', () => {
      // The database refuses linking a customer's file to a record of no customer.
      expect(calls({ customerId: null, includeShared: true })).toEqual([
         ['is', 'customer_id', null]
      ]);
      expect(calls({ includeShared: true })).toEqual([['is', 'customer_id', null]]);
      // Without includeShared (the library page), no customer means every file.
      expect(calls({ customerId: null })).toEqual([]);
   });

   it('filters by tenant, so a record is offered only files of its own tenant', () => {
      expect(calls({ tenantId: 't1', customerId: 'c1' })).toEqual([
         ['eq', 'tenant_id', 't1'],
         ['eq', 'customer_id', 'c1']
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
      expect(calls({ tag: '', kind: null, tenantId: null })).toEqual([]);
      expect(
         calls({
            customerId: null,
            kind: [],
            linkedType: null,
            entityId: 'p1'
         })
      ).toEqual([]);
   });
});
