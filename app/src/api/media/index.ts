import { allValues } from '@/lib/enumValues';
import { defineResource, type ResourceInput } from '@/api/defineResource';
import type { DocumentEntity } from '@/api/document';
import { invalidateTables, queryKeys } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { optional } from '@/lib/form/fields';
import { publicSchema, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import * as z from 'zod';

type Enums = Db['public']['Enums'];
export type MediaRow = Tables['media']['Row'];
export type MediaLinkRow = Tables['media_link']['Row'];
export type MediaLibraryRow = Views['media_library']['Row'];
export type MediaRole = Enums['media_role'];
export type MediaKind = 'image' | 'pdf' | 'video';
export type EntityMediaLink = MediaLinkRow & { media: MediaRow };

/** The private bucket of the media files (see 024). */
export const MEDIA_BUCKET = 'media';
/** The types the bucket and the media table take; no SVG. */
export const MEDIA_TYPES = [
   'image/png',
   'image/jpeg',
   'image/webp',
   'application/pdf',
   'video/mp4'
] as const;
export const MEDIA_ROLES = allValues<MediaRole>()([
   'primary_image',
   'gallery',
   'evidence_photo',
   'attachment'
]);
export const MEDIA_KINDS = ['image', 'pdf', 'video'] as const satisfies readonly MediaKind[];
/** The setting media_max_mb's default, and the bucket's ceiling it is clamped to. */
export const MEDIA_MAX_MB_DEFAULT = 25;
export const MEDIA_MAX_MB_CEILING = 50;
/** An image's thumbnail: a webp whose longest side is this, at `<tenant>/<media>/thumb/`. */
export const THUMBNAIL_SIZE = 400;
export const THUMBNAIL_NAME = 'thumb.webp';

export const mediaKind = (mimeType: string): MediaKind =>
   mimeType.startsWith('image/') ? 'image' : mimeType === 'application/pdf' ? 'pdf' : 'video';

/**
 * A file name safe for a storage path: lower-case ASCII, words joined by `-`, the extension kept.
 * Path separators go with the other characters, so a name never reaches another folder.
 */
export function safeFileName(name: string): string {
   const extension = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
   const base =
      (extension ? name.slice(0, -(extension.length + 1)) : name)
         .normalize('NFKD')
         .replace(/\p{M}/gu, '')
         .replace(/ı/g, 'i')
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, '-')
         .replace(/^-+|-+$/g, '')
         .slice(0, 80)
         .replace(/-+$/, '') || 'file';
   return extension ? `${base}.${extension}` : base;
}

/** Where a file is stored: `<tenant>/<media id>/<safe name>` (the storage policies read the id). */
export const mediaPath = (tenantId: string, mediaId: string, fileName: string) =>
   `${tenantId}/${mediaId}/${safeFileName(fileName)}`;

export const mediaThumbnailPath = (tenantId: string, mediaId: string) =>
   `${tenantId}/${mediaId}/thumb/${THUMBNAIL_NAME}`;

/** Why a file cannot be uploaded, as its error code, or null. */
export function validateMediaFile(
   file: Pick<File, 'type' | 'size'>,
   maxBytes: number
): 'media_type_not_allowed' | 'media_too_large' | null {
   if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return 'media_type_not_allowed';
   if (file.size > maxBytes) return 'media_too_large';
   return null;
}

/** What shows a file in a list: an image's thumbnail, else the image; other files have none. */
export const thumbPath = (
   media: Pick<MediaRow, 'mime_type' | 'thumbnail_path' | 'storage_path'>
): string | null =>
   mediaKind(media.mime_type) === 'image' ? (media.thumbnail_path ?? media.storage_path) : null;

/** The role a newly linked file gets: a product's first image is its primary image. */
export function defaultLinkRole({
   kind,
   entityType,
   hasPrimary
}: {
   kind: MediaKind;
   entityType: DocumentEntity;
   hasPrimary: boolean;
}): MediaRole {
   if (kind !== 'image') return 'attachment';
   return entityType === 'product' && !hasPrimary ? 'primary_image' : 'gallery';
}

/** The roles of a batch of files linked together: only the batch's first image may be primary. */
export function defaultLinkRoles(
   kinds: readonly MediaKind[],
   entityType: DocumentEntity,
   hasPrimary: boolean
): MediaRole[] {
   let primary = hasPrimary;
   return kinds.map((kind) => {
      const role = defaultLinkRole({ kind, entityType, hasPrimary: primary });
      if (role === 'primary_image') primary = true;
      return role;
   });
}

export const mediaResource = defineResource('media');

/** What a file's edit form changes; its file, type and size are fixed once uploaded. */
export const mediaSchema = z.object({
   id: z.string().optional(),
   title: optional(z.string().max(200)),
   alt_text: optional(z.string().max(300)),
   tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20),
   customer_id: z.string().nullish()
});

export type MediaFormValues = z.input<typeof mediaSchema>;

export const toMediaFormValues = (media?: Partial<MediaRow> | null): MediaFormValues => ({
   id: media?.id ?? undefined,
   title: media?.title ?? '',
   alt_text: media?.alt_text ?? '',
   tags: media?.tags ?? [],
   customer_id: media?.customer_id ?? null
});

/**
 * The changes to save: the form's fields only, never the stored file's. A file is only ever
 * edited here (saved as an update by id); uploadMedia creates it.
 */
export const toMediaPayload = ({
   id,
   title,
   alt_text,
   tags,
   customer_id
}: z.output<typeof mediaSchema>) =>
   ({
      ...(id ? { id } : {}),
      title,
      alt_text,
      tags,
      customer_id: customer_id ?? null
   }) as ResourceInput<'media'>;

/**
 * The largest upload in bytes: the company's media_max_mb, clamped to the bucket's ceiling (see
 * media_max_bytes). Keyed under `setting`, so a changed setting is read again.
 */
const maxBytesQuery = (tenantId: string | null) => ({
   queryKey: queryKeys.list(tenantId, 'setting', { rpc: 'media_max_bytes' }),
   queryFn: async () => {
      const { data } = await publicSchema.rpc('media_max_bytes').throwOnError();
      return data;
   }
});

export function useMediaMaxBytes() {
   const tenantId = useTenantKey();
   return useQuery(computed(() => maxBytesQuery(tenantId.value)));
}

/** The upload limit, loaded if no query holds it yet (for a mutation). */
export const fetchMediaMaxBytes = (queryClient: QueryClient, tenantId: string | null) =>
   queryClient.ensureQueryData(maxBytesQuery(tenantId));

/** A record's files, the primary image first and then in their order. */
export function useEntityMedia(
   entityType: MaybeRefOrGetter<DocumentEntity>,
   entityId: MaybeRefOrGetter<string>
) {
   const tenantId = useTenantKey();

   return useQuery({
      queryKey: computed(() =>
         queryKeys.list(tenantId.value, 'media_link', {
            entityType: toValue(entityType),
            entityId: toValue(entityId)
         })
      ),
      queryFn: async ({ signal }) => {
         const { data } = await supabase
            .from('media_link')
            .select('*, media(*)')
            .eq('entity_type', toValue(entityType))
            .eq('entity_id', toValue(entityId))
            .order('position')
            .order('created_at')
            .abortSignal(signal)
            .throwOnError();
         const links = (data ?? []) as EntityMediaLink[];
         // Stable, so the rest keep their position order.
         return links.sort(
            (a, b) => Number(b.role === 'primary_image') - Number(a.role === 'primary_image')
         );
      },
      enabled: computed(() => !!toValue(entityId))
   });
}

/** A mutation that marks the media links (and what derives from them) stale once done. */
const useMediaMutation = <T, R>(
   mutationFn: (input: T) => Promise<R>,
   tables: Parameters<typeof invalidateTables>[1] = ['media_link']
) => {
   const queryClient = useQueryClient();
   return useMutation({ mutationFn, onSuccess: () => invalidateTables(queryClient, tables) });
};

export type LinkMediaInput = {
   entityType: DocumentEntity;
   entityId: string;
   /** The record's tenant, which may be another branch shown; the active tenant by default. */
   tenantId?: string | null;
   links: { mediaId: string; role: MediaRole }[];
};

/** The rows linking files to a record, numbered from `start`, in the record's tenant. */
export const mediaLinkRows = (
   { entityType, entityId, tenantId, links }: LinkMediaInput,
   start: number
) =>
   links.map(({ mediaId, role }, index) => ({
      ...(tenantId ? { tenant_id: tenantId } : {}),
      media_id: mediaId,
      entity_type: entityType,
      entity_id: entityId,
      role,
      position: start + index
   })) as Tables['media_link']['Insert'][];

/** Links files to a record, after its last file. */
export function useLinkMedia() {
   const authStore = useAuthStore();

   return useMediaMutation(async (input: LinkMediaInput) => {
      const { entityType, entityId, links } = input;
      if (!links.length) return [];
      const { data: last } = await supabase
         .from('media_link')
         .select('position')
         .eq('entity_type', entityType)
         .eq('entity_id', entityId)
         .order('position', { ascending: false })
         .limit(1)
         .maybeSingle()
         .throwOnError();
      const start = (last?.position ?? -1) + 1;

      // A row without tenant_id goes to the active tenant (customFetch), so the links name the
      // record's own (a file and its links share a tenant, see 025), else the active one.
      const tenantId = input.tenantId ?? authStore.currentTenant?.id;
      const { data } = await supabase
         .from('media_link')
         .insert(mediaLinkRows({ ...input, tenantId }, start))
         .select()
         .throwOnError();
      return (data ?? []) as MediaLinkRow[];
   });
}

export function useUnlinkMedia() {
   return useMediaMutation(async ({ linkIds }: { linkIds: string[] }) => {
      await supabase.from('media_link').delete().in('id', linkIds).throwOnError();
   });
}

export function useSetLinkRole() {
   return useMediaMutation(
      async ({
         linkIds,
         role
      }: {
         linkIds: string[];
         role: Exclude<MediaRole, 'primary_image'>;
      }) => {
         await supabase.from('media_link').update({ role }).in('id', linkIds).throwOnError();
      }
   );
}

/** Makes a link its record's primary image; the old one becomes a gallery image (see 025). */
export function useSetPrimaryMedia() {
   return useMediaMutation(async ({ linkId }: { linkId: string }) => {
      const { data } = await publicSchema
         .rpc('set_primary_media', { link_id: linkId })
         .throwOnError();
      return data as MediaLinkRow;
   });
}

/**
 * Deletes a file: the row first (the database refuses one that is linked or cited by a document,
 * media_in_use), then its objects, which the storage policy lets go only once the row is gone.
 */
export function useDeleteMedia() {
   return useMediaMutation(
      async ({ media }: { media: Pick<MediaRow, 'id' | 'storage_path' | 'thumbnail_path'> }) => {
         await supabase.from('media').delete().eq('id', media.id).throwOnError();
         // The row is gone; an object left behind is unreachable, so a failure here is not shown,
         // only logged.
         const { error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .remove(
               [media.storage_path, media.thumbnail_path].filter((path): path is string => !!path)
            );
         if (error) console.warn('Media file left in storage', media.id, error);
      },
      ['media']
   );
}
