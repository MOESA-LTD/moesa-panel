import { MEDIA_BUCKET } from '@/api/media';
import { supabase } from '@/lib/supabase';
import { computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue';

/** How long a signed URL is valid; the loader reuses one for less, so a cached URL still works. */
export const SIGNED_URL_SECONDS = 3600;

type Waiter = { resolve: (url: string) => void; reject: (reason: unknown) => void };

/**
 * Loads signed URLs for paths: the paths asked for in one tick are signed in one request, and a
 * URL is reused until `ttlMs` has passed.
 */
export function createSignedUrlLoader(
   sign: (paths: string[]) => Promise<Record<string, string>>,
   { ttlMs = 50 * 60_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {}
) {
   const cache = new Map<string, { url: string; signedAt: number }>();
   const inFlight = new Map<string, Promise<string>>();
   let batch: Map<string, Waiter> | null = null;

   const flush = async (waiters: Map<string, Waiter>) => {
      const paths = [...waiters.keys()];
      try {
         const urls = await sign(paths);
         const signedAt = now();
         for (const [path, { resolve, reject }] of waiters) {
            const url = urls[path];
            if (url) {
               cache.set(path, { url, signedAt });
               resolve(url);
            } else reject(new Error(`Could not sign ${path}`));
         }
      } catch (error) {
         waiters.forEach(({ reject }) => reject(error));
      } finally {
         paths.forEach((path) => inFlight.delete(path));
      }
   };

   function load(path: string): Promise<string> {
      const cached = cache.get(path);
      if (cached && now() - cached.signedAt < ttlMs) return Promise.resolve(cached.url);
      const pending = inFlight.get(path);
      if (pending) return pending;

      if (!batch) {
         const waiters = new Map<string, Waiter>();
         batch = waiters;
         queueMicrotask(() => {
            batch = null;
            void flush(waiters);
         });
      }
      const waiters = batch;
      const promise = new Promise<string>((resolve, reject) =>
         waiters.set(path, { resolve, reject })
      );
      inFlight.set(path, promise);
      return promise;
   }

   return { load };
}

const loader = createSignedUrlLoader(async (paths) => {
   const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
   if (error) throw error;
   return Object.fromEntries(
      (data ?? []).flatMap(({ path, signedUrl, error }) =>
         path && signedUrl && !error ? [[path, signedUrl]] : []
      )
   );
});

/** A signed URL for a file of the media bucket; undefined while it loads, without a path or on error. */
export function useSignedUrl(
   path: MaybeRefOrGetter<string | null>
): ComputedRef<string | undefined> {
   const url = ref<string>();

   watch(
      () => toValue(path),
      (current) => {
         url.value = undefined;
         if (!current) return;
         loader.load(current).then(
            (signed) => {
               if (toValue(path) === current) url.value = signed;
            },
            () => {}
         );
      },
      { immediate: true }
   );

   return computed(() => url.value);
}

/** Opens a file in a new tab, downloaded under its own name. */
export async function openMediaFile(path: string, fileName: string): Promise<void> {
   const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS, { download: fileName });
   if (error) throw error;
   window.open(data.signedUrl, '_blank', 'noopener');
}
