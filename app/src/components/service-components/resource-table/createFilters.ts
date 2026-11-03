import { FilterMatchMode, FilterOperator } from '@primevue/core/api';

export type ColumnFilterDefinition = {
   operator?: string;
   dataType?: 'text' | 'numeric' | 'decimal' | 'date';
   constraints: Array<{ value: unknown; matchMode: string }>;
};

/** Shorthand per column: a kind of filter, or a full PrimeVue filter definition. */
export type FilterSpec =
   | 'text'
   | 'startsWith'
   | 'numeric'
   | 'decimal'
   | 'date'
   | ColumnFilterDefinition;

const constraint = (matchMode: string, value: unknown = null) => [{ value, matchMode }];

export const textFilter = (value: unknown = null): ColumnFilterDefinition => ({
   operator: FilterOperator.AND,
   constraints: constraint(FilterMatchMode.CONTAINS, value)
});

export const startsWithFilter = (value: unknown = null): ColumnFilterDefinition => ({
   operator: FilterOperator.AND,
   constraints: constraint(FilterMatchMode.STARTS_WITH, value)
});

export const equalsFilter = (value: unknown = null): ColumnFilterDefinition => ({
   operator: FilterOperator.AND,
   constraints: constraint(FilterMatchMode.EQUALS, value)
});

export const numberFilter = (
   dataType: 'numeric' | 'decimal' = 'numeric'
): ColumnFilterDefinition => ({
   operator: FilterOperator.AND,
   dataType,
   constraints: constraint(FilterMatchMode.EQUALS)
});

export const dateFilter = (): ColumnFilterDefinition => ({
   operator: FilterOperator.AND,
   dataType: 'date',
   constraints: constraint(FilterMatchMode.DATE_IS)
});

const SHORTHANDS = {
   text: () => textFilter(),
   startsWith: () => startsWithFilter(),
   numeric: () => numberFilter('numeric'),
   decimal: () => numberFilter('decimal'),
   date: () => dateFilter()
};

/**
 * Builds a ResourceTable `filters` object: a global (keyword) filter plus one filter per column.
 * `overrides` (e.g. a parent's `filters` attribute) replace columns with the same key.
 */
export function createFilters(
   spec: Record<string, FilterSpec>,
   overrides: Record<string, unknown> = {}
) {
   return {
      global: { value: null, matchMode: FilterMatchMode.CONTAINS },
      ..._mapValues(spec, (filter) => (typeof filter === 'string' ? SHORTHANDS[filter]() : filter)),
      ...overrides
   };
}
