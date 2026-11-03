import { useLookup } from '@/api/useLookup';
import type { CustomerOption } from '@/components/service-components/customer-filter/CustomerFilter.vue';
import type { MaybeRefOrGetter } from 'vue';

/** The tenant's customers by code, for the customer filter and customer pickers. */
export const useCustomerOptions = (enabled: MaybeRefOrGetter<boolean> = true) =>
   useLookup<CustomerOption>(
      'customer',
      { select: 'id, code, display_name', order: 'code' },
      enabled
   );
