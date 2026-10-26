import { useAuthStore } from '@/store/auth';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

/**
 * A form is read-only when the user may not perform the action it would submit:
 * `modify` for an existing record, `create` for a new one.
 */
export function useFormReadonly(subject: string, id: MaybeRefOrGetter<unknown>) {
   const { ability } = useAuthStore();

   return computed(() => ability.cannot(toValue(id) ? 'modify' : 'create', subject));
}
