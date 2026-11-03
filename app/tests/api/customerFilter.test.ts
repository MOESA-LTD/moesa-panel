import { withCustomerFilter } from '@/api/customerFilter';
import { useCustomerFilter } from '@/store/customerFilter';
import { createPinia, setActivePinia } from 'pinia';
import { FilterMatchMode, FilterOperator } from '@primevue/core/api';
import { beforeEach, describe, expect, it } from 'vitest';

describe('withCustomerFilter', () => {
   it('adds an equality condition on customer_id', () => {
      expect(withCustomerFilter({}, 'c1').customer_id).toEqual({
         operator: FilterOperator.AND,
         constraints: [{ value: 'c1', matchMode: FilterMatchMode.EQUALS }]
      });
   });

   it('replaces the condition of another customer and keeps the other filters', () => {
      const name = {
         operator: FilterOperator.AND,
         constraints: [{ value: 'Ac', matchMode: FilterMatchMode.STARTS_WITH }]
      };
      const filters = withCustomerFilter({ name, ...withCustomerFilter({}, 'c1') }, 'c2');

      expect(filters.name).toBe(name);
      expect(filters.customer_id?.constraints).toEqual([
         { value: 'c2', matchMode: FilterMatchMode.EQUALS }
      ]);
   });

   it('removes the condition when no customer is selected, without changing the input', () => {
      const filters = withCustomerFilter({}, 'c1');
      const cleared = withCustomerFilter(filters, null);

      expect(cleared).not.toHaveProperty('customer_id');
      expect(filters).toHaveProperty('customer_id');
   });
});

describe('useCustomerFilter', () => {
   beforeEach(() => {
      localStorage.clear();
      setActivePinia(createPinia());
   });

   it('keeps the selected customer across visits until cleared', () => {
      useCustomerFilter().set('c1');

      setActivePinia(createPinia());
      const filter = useCustomerFilter();
      expect(filter.customerId).toBe('c1');

      filter.clear();
      setActivePinia(createPinia());
      expect(useCustomerFilter().customerId).toBeNull();
   });
});
