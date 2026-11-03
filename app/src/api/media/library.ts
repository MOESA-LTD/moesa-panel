import type { DocumentEntity } from '@/api/document';
import type { MediaKind, MediaLibraryRow } from '@/api/media';
import { queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { supabase } from '@/lib/supabase';
import { useInfiniteQuery, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

export type MediaLibraryFilters = {
   /** One tenant's files, e.g. those a record of that tenant can link (a link shares its file's). */
   tenantId?: string | null;
   customerId?: string | null;
   /** With customerId, also the files of no customer (shared by every customer). */
   includeShared?: boolean;
   /** Empty: every kind. */
   kind?: MediaKind[] | null;
   tag?: string | null;
   /** The type of record a file is linked to, or 'none' for files linked and cited nowhere. */
   linkedType?: DocumentEntity | 'none' | null;
   /** With linkedType, the one record. */
   entityId?: string | null;
};

type FilterBuilder<Q> = {
   eq(column: string, value: unknown): Q;
   or(filters: string): Q;
   in(column: string, values: readonly unknown[]): Q;
   contains(column: string, value: readonly unknown[]): Q;
};

/** Adds the library's filters to a query of media_library; empty ones add nothing. */
export function applyMediaLibraryFilters<Q extends FilterBuilder<Q>>(
   query: Q,
   { tenantId, customerId, includeShared, kind, tag, linkedType, entityId }: MediaLibraryFilters
): Q {
   let q = query;
   if (tenantId) q = q.eq('tenant_id', tenantId);
   if (customerId)
      q = includeShared
         ? q.or(`customer_id.eq.${customerId},customer_id.is.null`)
         : q.eq('customer_id', customerId);
   if (kind?.length) q = q.in('kind', kind);
   if (tag) q = q.contains('tags', [tag]);
   if (linkedType === 'none') q = q.eq('link_count', 0).eq('document_count', 0);
   else if (linkedType) {
      q = q.contains('linked_types', [linkedType]);
      if (entityId) q = q.contains('linked_entities', [`${linkedType}:${entityId}`]);
   }
   return q;
}

export const MEDIA_PAGE_SIZE = 48;

/** The library's files, newest first, a page at a time. */
export function useMediaLibrary(filters: MaybeRefOrGetter<MediaLibraryFilters>) {
   const tenantId = useTenantKey();

   return useInfiniteQuery({
      queryKey: computed(() => queryKeys.list(tenantId.value, 'media_library', toValue(filters))),
      queryFn: async ({ pageParam, signal }) => {
         const from = pageParam * MEDIA_PAGE_SIZE;
         const { data } = await applyMediaLibraryFilters(
            supabase.from('media_library').select('*'),
            toValue(filters)
         )
            .order('created_at', { ascending: false })
            .range(from, from + MEDIA_PAGE_SIZE - 1)
            .abortSignal(signal)
            .throwOnError();
         return (data ?? []) as MediaLibraryRow[];
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
         lastPage.length === MEDIA_PAGE_SIZE ? pages.length : undefined
   });
}

/** How often a file is used: its links and the documents citing it (null until loaded). */
export function useMediaUsage(id: MaybeRefOrGetter<string | null | undefined>) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() => queryKeys.detail(tenantId.value, 'media_library', toValue(id))),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('media_library')
            .select('link_count, document_count')
            .eq('id', toValue(id)!)
            .abortSignal(signal)
            .maybeSingle()
            .throwOnError();
         return data;
      },
      enabled: computed(() => !!toValue(id))
   });
}

/** A file in use (linked to a record or cited by a document) is neither deleted nor moved. */
export const isMediaInUse = (
   usage: { link_count: number | null; document_count: number | null } | null | undefined
) => (usage?.link_count ?? 0) + (usage?.document_count ?? 0) > 0;
