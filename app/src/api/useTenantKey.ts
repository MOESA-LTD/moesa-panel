import { useAuthStore } from '@/store/auth';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

/**
 * The tenants queries read (the active one, then the others selected); part of every query key,
 * so changing them fetches again instead of showing another selection's rows.
 */
export function useTenantKey() {
   // storeToRefs keeps it reactive; destructuring the store would copy the current value.
   const { tenantKey } = storeToRefs(useAuthStore());
   return computed<string | null>(() => tenantKey.value);
}
