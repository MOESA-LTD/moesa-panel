import { createSignedUrlLoader, openMediaFile, SIGNED_URL_SECONDS } from '@/api/media/signedUrls';
import { afterEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
   supabase: { storage: { from: () => ({ createSignedUrl: storage.createSignedUrl }) } }
}));

afterEach(() => vi.unstubAllGlobals());

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

describe('openMediaFile', () => {
   // A tab opened in the click itself, before any await, is not taken for a pop-up.
   const stubTab = () => {
      const tab = { opener: {} as unknown, location: { href: 'about:blank' }, close: vi.fn() };
      const open = vi.fn(() => tab);
      vi.stubGlobal('open', open);
      return { tab, open };
   };

   it('opens the tab at once, then sends it to the signed download', async () => {
      let resolve!: (value: unknown) => void;
      storage.createSignedUrl.mockReturnValue(new Promise((r) => (resolve = r)));
      const { tab, open } = stubTab();

      const opening = openMediaFile('t/m/sheet.pdf', 'Sheet.pdf');
      expect(open).toHaveBeenCalledOnce();
      expect(tab.opener).toBeNull();
      expect(tab.location.href).toBe('about:blank');

      resolve({ data: { signedUrl: 'https://signed' }, error: null });
      await opening;
      expect(storage.createSignedUrl).toHaveBeenCalledWith('t/m/sheet.pdf', SIGNED_URL_SECONDS, {
         download: 'Sheet.pdf'
      });
      expect(tab.location.href).toBe('https://signed');
   });

   it('closes the tab when the file cannot be signed', async () => {
      storage.createSignedUrl.mockResolvedValue({ data: null, error: new Error('gone') });
      const { tab } = stubTab();

      await expect(openMediaFile('t/m/x.pdf', 'x.pdf')).rejects.toThrow('gone');
      expect(tab.close).toHaveBeenCalledOnce();
   });
});
