import { signOutOtherSessions } from '@/api/account';
import {
   AvatarFileError,
   removeAvatar,
   uploadAvatar,
   validateAvatarFile
} from '@/api/account/avatar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The avatar bucket and Supabase Auth, recording what the account helpers ask of them.
const mock = vi.hoisted(() => ({
   upload: vi.fn(),
   remove: vi.fn(),
   getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: 'https://s/avatar/' + path } })),
   updateUser: vi.fn(),
   signOut: vi.fn(),
   rpc: vi.fn()
}));

vi.mock('@/lib/supabase', () => ({
   supabase: {
      storage: {
         from: () => ({
            upload: mock.upload,
            remove: mock.remove,
            getPublicUrl: mock.getPublicUrl
         })
      },
      auth: { updateUser: mock.updateUser, signOut: mock.signOut },
      rpc: mock.rpc
   }
}));

beforeEach(() => {
   mock.upload.mockReset().mockResolvedValue({ data: {}, error: null });
   mock.remove.mockReset().mockResolvedValue({ data: [], error: null });
   mock.updateUser.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
   mock.signOut.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => vi.useRealTimers());

describe('validateAvatarFile', () => {
   it('refuses an SVG', () => {
      expect(validateAvatarFile({ type: 'image/svg+xml', size: 10 })).toBe('avatar_type');
   });

   it('refuses a file over 1 MB and takes one of exactly 1 MB', () => {
      expect(validateAvatarFile({ type: 'image/png', size: 1048577 })).toBe('avatar_size');
      expect(validateAvatarFile({ type: 'image/png', size: 1048576 })).toBeNull();
   });
});

describe('uploadAvatar', () => {
   it('uploads to the user folder, saves a cache-busting URL and removes the other files', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1700000000000);
      const file = new File(['x'], 'me.jpeg', { type: 'image/jpeg' });

      const url = await uploadAvatar(file, 'u1');

      expect(mock.upload).toHaveBeenCalledWith('u1/avatar.jpg', file, {
         upsert: true,
         contentType: 'image/jpeg',
         cacheControl: '3600'
      });
      expect(mock.updateUser).toHaveBeenCalledWith({
         data: { avatar_url: 'https://s/avatar/u1/avatar.jpg?v=1700000000000' }
      });
      expect(mock.remove).toHaveBeenCalledWith(['u1/avatar.png', 'u1/avatar.webp']);
      expect(url).toBe('https://s/avatar/u1/avatar.jpg?v=1700000000000');
   });

   it('refuses an SVG before uploading', async () => {
      const file = new File(['<svg/>'], 'me.svg', { type: 'image/svg+xml' });

      const error = await uploadAvatar(file, 'u1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AvatarFileError);
      expect((error as AvatarFileError).code).toBe('avatar_type');
      expect(mock.upload).not.toHaveBeenCalled();
   });

   it('stops at an upload error without touching the profile', async () => {
      const failure = new Error('upload failed');
      mock.upload.mockResolvedValue({ data: null, error: failure });

      await expect(
         uploadAvatar(new File(['x'], 'me.png', { type: 'image/png' }), 'u1')
      ).rejects.toBe(failure);
      expect(mock.updateUser).not.toHaveBeenCalled();
   });
});

describe('removeAvatar', () => {
   it('clears the profile URL before removing the files', async () => {
      await removeAvatar('u1');

      expect(mock.updateUser).toHaveBeenCalledWith({ data: { avatar_url: null } });
      expect(mock.remove).toHaveBeenCalledWith([
         'u1/avatar.png',
         'u1/avatar.jpg',
         'u1/avatar.webp'
      ]);
      expect(mock.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
         mock.remove.mock.invocationCallOrder[0]!
      );
   });
});

describe('signOutOtherSessions', () => {
   it('signs out every other session', async () => {
      await signOutOtherSessions();

      expect(mock.signOut).toHaveBeenCalledWith({ scope: 'others' });
   });

   it('rejects with the sign-out error', async () => {
      const failure = new Error('sign-out failed');
      mock.signOut.mockResolvedValue({ error: failure });

      await expect(signOutOtherSessions()).rejects.toBe(failure);
   });
});
