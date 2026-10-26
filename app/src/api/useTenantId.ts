import { useAuthStore } from '@/store/auth';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

/** Id of the tenant the user is working in; part of every query key. */
export function useTenantId() {
   // storeToRefs keeps it reactive; destructuring the store would copy the current value.
   const { currentTenant } = storeToRefs(useAuthStore());
   return computed<string | null>(() => currentTenant.value?.id ?? null);
}
