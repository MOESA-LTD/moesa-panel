import { createSignedUrlLoader } from '@/api/media/signedUrls';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const signer = () =>
   vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((path) => [path, `signed:${path}`]))
   );

describe('createSignedUrlLoader', () => {
   it('signs the paths asked for in one tick together', async () => {
      const sign = signer();
      const loader = createSignedUrlLoader(sign);

      const urls = await Promise.all([loader.load('a'), loader.load('b'), loader.load('a')]);

      expect(urls).toEqual(['signed:a', 'signed:b', 'signed:a']);
      expect(sign).toHaveBeenCalledTimes(1);
      expect(sign).toHaveBeenCalledWith(['a', 'b']);
   });

   it('reuses a URL until it is old, then signs again', async () => {
      let time = 0;
      const sign = signer();
      const loader = createSignedUrlLoader(sign, { ttlMs: 1000, now: () => time });

      await loader.load('a');
      time = 999;
      await loader.load('a');
      expect(sign).toHaveBeenCalledTimes(1);

      time = 1000;
      await loader.load('a');
      expect(sign).toHaveBeenCalledTimes(2);
   });

   it('rejects a path the signer did not sign, and tries it again next time', async () => {
      const sign = vi.fn(async (): Promise<Record<string, string>> => ({}));
      const loader = createSignedUrlLoader(sign);

      await expect(loader.load('gone')).rejects.toThrow('gone');
      await expect(loader.load('gone')).rejects.toThrow();
      expect(sign).toHaveBeenCalledTimes(2);
   });

   it('rejects every path of a batch whose signing failed', async () => {
      const loader = createSignedUrlLoader(async () => {
         throw new Error('offline');
      });

      const results = await Promise.allSettled([loader.load('a'), loader.load('b')]);
      expect(results.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
   });
});
