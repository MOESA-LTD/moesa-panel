import { invalidateTables } from '@/api/queryKeys';
import { queryClient } from '@plugins/tanstack-query';
import mitt from 'mitt';

export const emitter = mitt();

// Transitional bridge: modules not yet on src/api announce writes as `<table>-update`.
// Invalidate that table's queries so migrated views refresh too.
emitter.on('*', (type) => {
   const table = /^(.+)-update$/.exec(String(type))?.[1];
   if (table) invalidateTables(queryClient, [table.replace(/-/g, '_')]);
});
