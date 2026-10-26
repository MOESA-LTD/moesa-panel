import { appErrorHandler } from '@/lib/appErrorHandler';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/vue-query';

// Database errors are deterministic; only network failures (fetch rejects with TypeError) are retried.
const shouldRetry = (failureCount: number, error: unknown) =>
   failureCount < 2 && error instanceof TypeError;

export const queryCache = new QueryCache({
   // Queries have no caller to rethrow to, so report their errors here. Mutation errors propagate
   // to the awaiting handler and from there to the app error handler.
   onError: (error, query) => {
      if (query.meta?.silent) return;
      appErrorHandler(error);
   }
});

export const mutationCache = new MutationCache();

export const queryClient = new QueryClient({
   queryCache,
   mutationCache,
   defaultOptions: {
      queries: {
         staleTime: 30_000,
         refetchOnWindowFocus: false,
         retry: shouldRetry
      },
      mutations: {
         retry: false
      }
   }
});

/** Drops all cached server data, e.g. on sign-out or tenant change. */
export function clearQueryCache() {
   queryClient.clear();
}
