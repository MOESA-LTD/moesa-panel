import {
   experimental_createQueryPersister,
   StoragePersisterOptions
} from '@tanstack/query-persist-client-core';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/vue-query';
import { del, delMany, entries, get, keys as keysInStorage, set } from 'idb-keyval';

export const queryCache = new QueryCache();
export const mutationCache = new MutationCache();

const persisterOptions = {
   storage: {
      getItem: get,
      setItem: set,
      removeItem: del,
      entries
   },
   filters: {
      predicate(query) {
         return !query.isStale() && query.gcTime > 1000;
      }
   },
   prefix: 'echochart'
} satisfies StoragePersisterOptions;

export const clientPersister: ReturnType<typeof experimental_createQueryPersister> =
   experimental_createQueryPersister(persisterOptions);

export const queryClient = new QueryClient({
   queryCache,
   mutationCache,
   defaultOptions: {
      queries: {
         persister: clientPersister.persisterFn
      }
   }
});

/** Drops cached server data from memory and IndexedDB, e.g. on sign-out or tenant change. */
export async function clearQueryCache() {
   queryClient.clear();

   const keys = await keysInStorage();
   await delMany(keys.filter((key) => String(key).startsWith(persisterOptions.prefix)));
}
