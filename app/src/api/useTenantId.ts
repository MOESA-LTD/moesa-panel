import { useAuthStore } from '@/store/auth';
import { computed } from 'vue';

/** Id of the tenant the user is working in; part of every query key. */
export function useTenantId() {
   const { currentTenant } = useAuthStore();
   return computed<string | null>(() => currentTenant?.id ?? null);
}
