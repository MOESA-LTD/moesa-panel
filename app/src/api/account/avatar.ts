import { LOGO_MAX_BYTES, LOGO_TYPES } from '@/api/branch';
import { supabase } from '@/lib/supabase';
import i18n from '@plugins/i18n';

/** The user's own photo, public, at `<user id>/avatar.<ext>` (see 028_account.sql). */
export const AVATAR_BUCKET = 'avatar';

/** The image types and size the avatar bucket takes: the tenant logo's. */
export const AVATAR_TYPES = LOGO_TYPES;
export const AVATAR_MAX_BYTES = LOGO_MAX_BYTES;

export type AvatarErrorCode = 'avatar_type' | 'avatar_size';

/** Why a photo cannot be used, or null when it can. */
export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): AvatarErrorCode | null {
   if (!AVATAR_TYPES.includes(file.type)) return 'avatar_type';
   if (file.size > AVATAR_MAX_BYTES) return 'avatar_size';
   return null;
}

/** A photo refused before uploading. */
export class AvatarFileError extends Error {
   constructor(readonly code: AvatarErrorCode) {
      super(i18n.t(`errors.${code}`));
      this.name = 'AvatarFileError';
   }
}

const extensionOf = (mimeType: string) => {
   const subtype = mimeType.split('/')[1] ?? '';
   return subtype === 'jpeg' ? 'jpg' : subtype;
};

/** Where the user's photo of this type is kept. */
export const avatarPath = (userId: string, mimeType: string) =>
   `${userId}/avatar.${extensionOf(mimeType)}`;

const allPaths = (userId: string) => AVATAR_TYPES.map((type) => avatarPath(userId, type));

/**
 * Makes `file` the user's photo and returns its URL, which is saved in the user's metadata
 * (`avatar_url`). The `?v=` changes with every upload, so cached copies of the old one are not
 * shown. A photo of another type is removed once the metadata points at the new one.
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
   const code = validateAvatarFile(file);
   if (code) throw new AvatarFileError(code);

   const path = avatarPath(userId, file.type);
   const bucket = supabase.storage.from(AVATAR_BUCKET);
   const { error } = await bucket.upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600'
   });
   if (error) throw error;

   const url = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
   const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
   if (updateError) throw updateError;

   // A leftover file is harmless (the metadata no longer points at it), so a failure is ignored.
   await bucket.remove(allPaths(userId).filter((other) => other !== path));
   return url;
}

/** Removes the user's photo: the metadata first, so nothing ever points at a missing file. */
export async function removeAvatar(userId: string): Promise<void> {
   const { error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
   if (error) throw error;
   await supabase.storage.from(AVATAR_BUCKET).remove(allPaths(userId));
}
