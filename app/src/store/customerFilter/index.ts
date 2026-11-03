import { defineStore } from 'pinia';
import { ref } from 'vue';

export { withCustomerFilter } from '@/api/customerFilter';

const STORAGE_KEY = 'customer-filter';

// Storage may be unavailable (private mode, blocked site data); the filter then lasts the session.
const readStored = (): string | null => {
   try {
      return localStorage.getItem(STORAGE_KEY) || null;
   } catch {
      return null;
   }
};

const writeStored = (id: string | null) => {
   try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
   } catch {
      // Kept in memory only.
   }
};

/** The customer the operations lists are narrowed to (all customers when null), kept across visits. */
export const useCustomerFilter = defineStore('customerFilter', () => {
   const customerId = ref<string | null>(readStored());

   const set = (id: string | null) => {
      customerId.value = id;
      writeStored(id);
   };
   const clear = () => set(null);

   return { customerId, set, clear };
});
