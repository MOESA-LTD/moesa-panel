import { ability } from '@plugins/casl';
import { shallowRef } from 'vue';

// Bumped whenever the rights change, so templates and computeds asking below follow them.
const version = shallowRef(0);
ability.on('updated', () => version.value++);

/**
 * The user's rights on the fields of `table` (my_access.fields, through the ability): a field they
 * may not read is not shown, one they may not write is read-only. The `api` views enforce both.
 */
export function useFieldAccess(table: string) {
   return {
      canRead(field: string): boolean {
         void version.value;
         return ability.can('read', table, field);
      },
      /** Whether the user may write the field, in a new row or an existing one. */
      canWrite(field: string): boolean {
         void version.value;
         return ability.can('update', table, field) || ability.can('insert', table, field);
      }
   };
}
