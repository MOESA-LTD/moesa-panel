import {
   equalsFilter,
   type ColumnFilterDefinition
} from '@/components/service-components/resource-table/createFilters';
import { omit } from 'lodash';

/**
 * The filters with an equality condition on `customer_id` for the selected customer, or without
 * one when no customer is selected. Returns a new object; the given filters are left as they are.
 */
export function withCustomerFilter<Filters extends Record<string, unknown>>(
   filters: Filters,
   customerId: string | null
): Omit<Filters, 'customer_id'> & { customer_id?: ColumnFilterDefinition } {
   const rest = omit(filters, 'customer_id');
   return customerId ? { ...rest, customer_id: equalsFilter(customerId) } : rest;
}
