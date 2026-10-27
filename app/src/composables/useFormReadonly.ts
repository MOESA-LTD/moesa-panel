import { useAuthStore } from '@/store/auth';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

/**
 * A form is read-only when the user may not perform the action it would submit: `modify` for an
 * existing record, `create` for a new one, in the record's tenant (the active one for a new record).
 */
export function useFormReadonly(
   subject: string,
   id: MaybeRefOrGetter<unknown>,
   tenantId?: MaybeRefOrGetter<string | null | undefined>
) {
   const authStore = useAuthStore();

   return computed(
      () => !authStore.canIn(toValue(tenantId), toValue(id) ? 'modify' : 'create', subject)
   );
}
