import {
   fetchMediaMaxBytes,
   MEDIA_BUCKET,
   mediaKind,
   mediaPath,
   mediaThumbnailPath,
   THUMBNAIL_SIZE,
   validateMediaFile,
   type MediaRow
} from '@/api/media';
import { invalidateTables } from '@/api/queryKeys';
import { useTenantKey } from '@/api/useTenantKey';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import i18n from '@plugins/i18n';
import { useMutation, useQueryClient } from '@tanstack/vue-query';

export type MediaFileErrorCode = 'media_type_not_allowed' | 'media_too_large';

/** A file refused before uploading, with the message the database would give. */
export class MediaFileError extends Error {
   constructor(readonly code: MediaFileErrorCode) {
      super(i18n.t(`errors.${code}`));
      this.name = 'MediaFileError';
   }
}

const isImage = (file: File) => mediaKind(file.type) === 'image';

/** An image's size in pixels, or null for other files or one the browser cannot read. */
export async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
   if (!isImage(file)) return null;
   try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
   } catch {
      return null;
   }
}

/**
 * A webp copy of an image whose longest side is `size` (never enlarged), or null for other files,
 * or when the browser cannot draw or encode it (e.g. one that encodes PNG instead of webp).
 */
export async function makeThumbnail(file: File, size = THUMBNAIL_SIZE): Promise<Blob | null> {
   if (!isImage(file)) return null;
   try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
         canvas.toBlob(resolve, 'image/webp', 0.8)
      );
      return blob?.type === 'image/webp' ? blob : null;
   } catch {
      return null;
   }
}

/** The name a file is titled by: its name without the extension. */
const titleOf = (name: string) => name.replace(/\.[^.]*$/, '') || name;

/**
 * Uploads a file and creates its media row. The file goes to a folder of its own (a new id), so
 * two files of the same name never meet; when the row is refused, the uploaded objects are removed.
 */
export async function uploadMedia(
   file: File,
   {
      tenantId,
      customerId,
      maxBytes
   }: { tenantId: string; customerId: string | null; maxBytes: number }
): Promise<MediaRow> {
   const refused = validateMediaFile(file, maxBytes);
   if (refused) throw new MediaFileError(refused);

   const id = crypto.randomUUID();
   const bucket = supabase.storage.from(MEDIA_BUCKET);
   const storagePath = mediaPath(tenantId, id, file.name);

   const { error: uploadError } = await bucket.upload(storagePath, file, {
      contentType: file.type,
      upsert: false
   });
   if (uploadError) throw uploadError;
   const uploaded = [storagePath];

   // A file without a thumbnail is shown by itself (thumbPath), so a failed one is left out.
   let thumbnailPath: string | null = null;
   const [size, thumbnail] = await Promise.all([readImageSize(file), makeThumbnail(file)]);
   if (thumbnail) {
      const path = mediaThumbnailPath(tenantId, id);
      const { error } = await bucket.upload(path, thumbnail, {
         contentType: 'image/webp',
         upsert: false
      });
      if (!error) {
         thumbnailPath = path;
         uploaded.push(path);
      }
   }

   const { data, error } = await supabase
      .from('media')
      .insert({
         id,
         tenant_id: tenantId,
         customer_id: customerId,
         storage_path: storagePath,
         thumbnail_path: thumbnailPath,
         file_name: file.name,
         mime_type: file.type,
         size_bytes: file.size,
         width: size?.width ?? null,
         height: size?.height ?? null,
         title: titleOf(file.name)
      })
      .select()
      .single();
   if (error) {
      await bucket.remove(uploaded);
      throw error;
   }
   return data as MediaRow;
}

/** Uploads a file to the active tenant, for the customer given (null: shared by every customer). */
export function useUploadMedia() {
   const queryClient = useQueryClient();
   const authStore = useAuthStore();
   const tenantKey = useTenantKey();

   return useMutation({
      mutationFn: async ({ file, customerId }: { file: File; customerId: string | null }) => {
         const tenantId = authStore.currentTenant?.id;
         if (!tenantId) throw new Error('No active tenant');
         const maxBytes = await fetchMediaMaxBytes(queryClient, tenantKey.value);
         return uploadMedia(file, { tenantId, customerId, maxBytes });
      },
      onSuccess: () => invalidateTables(queryClient, ['media'])
   });
}
