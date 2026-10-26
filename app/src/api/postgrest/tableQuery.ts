import { isValidDate, localeDateString, parseDayjs } from '@/lib/dayjs';
import { FilterMatchMode, FilterOperator } from '@primevue/core/api';

/** PrimeVue DataTable filter state (menu or row display). */
export type ColumnFilter = {
   value?: unknown;
   matchMode?: string;
   operator?: string;
   dataType?: string;
   constraints?: Array<{ value?: unknown; matchMode?: string }>;
};

export type TableMeta = {
   // Loosely typed so PrimeVue's DataTableFilterMeta can be passed as is.
   filters?: Record<string, unknown>;
   first?: number;
   rows?: number;
   multiSortMeta?: Array<{ field?: unknown; order?: number | null }>;
};

/** A single PostgREST condition: `column=operator.value`. */
export type Condition = { column: string; operator: string; value: string };

/** Conditions that are ANDed, and OR groups in PostgREST logic-tree syntax (without `or=(...)`). */
export type FilterClauses = { conditions: Condition[]; orGroups: string[] };

// With the UTC offset: without it PostgreSQL reads the local time as UTC and shifts day filters.
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ssZ';

// Values in logic trees (`or=(...)`) and `in` lists must be quoted when they contain reserved
// characters, otherwise a search term like "a,b" splits the expression.
const RESERVED = /[,.:()"\\\s]/;
export const quoteValue = (value: string) =>
   RESERVED.test(value) ? `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"` : value;

/** A day (midnight) matches the whole day; a timestamp matches that second. */
const dateRange = (value: unknown) => {
   const date = parseDayjs({ value });
   const midnight = date.hour() === 0 && date.minute() === 0 && date.second() === 0;
   return {
      start: (midnight ? date : date.subtract(1, 'second')).format(DATE_TIME_FORMAT),
      end: (midnight ? date.add(1, 'day') : date.add(1, 'second')).format(DATE_TIME_FORMAT)
   };
};

const formatDate = (value: unknown) =>
   localeDateString({ value, returnFormat: DATE_TIME_FORMAT }) as string;

type Part = { all: Condition[] } | { any: Condition[] };

const all = (...conditions: Condition[]): Part => ({ all: conditions });
const any = (...conditions: Condition[]): Part => ({ any: conditions });
const cond = (column: string, operator: string, value: unknown): Condition => ({
   column,
   operator,
   value: String(value)
});

const MATCH_MODES: Record<string, (column: string, value: any) => Part | null> = {
   websearch: (c, v) => all(cond(c, 'wfts', v)),
   plain: (c, v) => all(cond(c, 'plfts', v)),
   phrase: (c, v) => all(cond(c, 'phfts', v)),
   [FilterMatchMode.STARTS_WITH]: (c, v) => all(cond(c, 'ilike', `${v}*`)),
   [FilterMatchMode.CONTAINS]: (c, v) => all(cond(c, 'ilike', `*${v}*`)),
   [FilterMatchMode.NOT_CONTAINS]: (c, v) => all(cond(c, 'not.ilike', `*${v}*`)),
   [FilterMatchMode.ENDS_WITH]: (c, v) => all(cond(c, 'ilike', `*${v}`)),
   [FilterMatchMode.EQUALS]: (c, v) => all(cond(c, 'eq', v)),
   [FilterMatchMode.NOT_EQUALS]: (c, v) => all(cond(c, 'neq', v)),
   [FilterMatchMode.IN]: (c, v: unknown[]) =>
      all(cond(c, 'in', `(${v.map((item) => quoteValue(String(item))).join(',')})`)),
   [FilterMatchMode.LESS_THAN]: (c, v) => all(cond(c, 'lt', v)),
   [FilterMatchMode.LESS_THAN_OR_EQUAL_TO]: (c, v) => all(cond(c, 'lte', v)),
   [FilterMatchMode.GREATER_THAN]: (c, v) => all(cond(c, 'gt', v)),
   [FilterMatchMode.GREATER_THAN_OR_EQUAL_TO]: (c, v) => all(cond(c, 'gte', v)),
   [FilterMatchMode.BETWEEN]: (c, v: unknown[]) =>
      v.length === 2 ? all(cond(c, 'gte', v[0]), cond(c, 'lte', v[1])) : null,
   [FilterMatchMode.DATE_IS]: (c, v) => {
      const { start, end } = dateRange(v);
      return all(cond(c, 'gte', start), cond(c, 'lt', end));
   },
   [FilterMatchMode.DATE_IS_NOT]: (c, v) => {
      const { start, end } = dateRange(v);
      return any(cond(c, 'lt', start), cond(c, 'gte', end));
   },
   [FilterMatchMode.DATE_BEFORE]: (c, v) => all(cond(c, 'lt', formatDate(v))),
   [FilterMatchMode.DATE_AFTER]: (c, v) => all(cond(c, 'gt', formatDate(v)))
};

/** Normalizes a filter value for its data type; null means the constraint is skipped. */
const normalizeValue = (value: unknown, dataType = 'text'): unknown => {
   if (value === null || value === undefined) return null;
   if ((typeof value === 'string' || Array.isArray(value)) && value.length === 0) return null;

   if (dataType === 'numeric') {
      const number = Number(value);
      return Number.isSafeInteger(number) ? number : null;
   }
   if (dataType === 'decimal') {
      const number = parseFloat(String(value));
      return Number.isNaN(number) ? null : number;
   }
   if (dataType === 'date' && !isValidDate({ value })) return null;

   return value;
};

const toPart = (
   column: string,
   matchMode: string | undefined,
   value: unknown,
   dataType?: string
) => {
   const build = matchMode && MATCH_MODES[matchMode];
   if (!build) {
      if (matchMode) console.warn(`Unsupported matchMode: ${matchMode}`);
      return null;
   }
   const normalized = normalizeValue(value, dataType);
   return normalized === null ? null : build(column, normalized);
};

const expression = ({ column, operator, value }: Condition) =>
   `${column}.${operator}.${operator === 'in' ? value : quoteValue(value)}`;

const partExpression = (part: Part) => {
   const [kind, conditions] = 'all' in part ? ['and', part.all] : ['or', part.any];
   return conditions.length === 1
      ? expression(conditions[0])
      : `${kind}(${conditions.map(expression).join(',')})`;
};

/**
 * Translates DataTable filters into PostgREST clauses:
 * - each column's constraints are ANDed, or form their own OR group with operator "or";
 * - the global filter becomes one OR group across all non-nested filter columns.
 */
export function buildFilterClauses(filters: TableMeta['filters'] = {}): FilterClauses {
   const clauses: FilterClauses = { conditions: [], orGroups: [] };
   const { global, ...columns } = (filters ?? {}) as Record<string, ColumnFilter>;

   for (const [column, filter] of Object.entries(columns)) {
      const { operator, dataType, constraints = [] } = filter ?? {};
      const parts = [
         toPart(column, filter?.matchMode, filter?.value, dataType),
         ...constraints.map(({ matchMode, value }) => toPart(column, matchMode, value, dataType))
      ].filter((part): part is Part => part !== null);

      if (!parts.length) continue;

      if (operator === FilterOperator.OR && parts.length > 1) {
         clauses.orGroups.push(parts.map(partExpression).join(','));
         continue;
      }

      for (const part of parts) {
         if ('all' in part) clauses.conditions.push(...part.all);
         else clauses.orGroups.push(part.any.map(expression).join(','));
      }
   }

   const globalValue = normalizeValue(global?.value);
   if (globalValue !== null) {
      const parts = Object.entries(columns)
         .filter(([column]) => !column.includes('.'))
         .map(([column, { dataType } = {}]) => {
            const matchMode =
               dataType === 'numeric' || dataType === 'decimal'
                  ? FilterMatchMode.EQUALS
                  : dataType === 'date'
                    ? FilterMatchMode.DATE_IS
                    : global.matchMode;
            return toPart(column, matchMode, globalValue, dataType);
         })
         .filter((part): part is Part => part !== null);

      if (parts.length) clauses.orGroups.push(parts.map(partExpression).join(','));
   }

   return clauses;
}

/** `a.b` sorts by column b of the embedded resource a: PostgREST `a(b)`. */
const orderColumn = (field: string) =>
   field
      .split('.')
      .reverse()
      .reduce((inner, part) => (inner ? `${part}(${inner})` : part), '');

// Structural type of the supabase-js filter builder methods used here.
type QueryBuilder<Q> = {
   filter(column: string, operator: string, value: unknown): Q;
   or(filters: string): Q;
   order(column: string, options?: { ascending?: boolean }): Q;
   range(from: number, to: number): Q;
};

/** Applies DataTable filters, sorting and paging to a supabase-js query. */
export function applyTableMeta<Q extends QueryBuilder<Q>>(
   query: Q,
   meta: TableMeta | null | undefined,
   { paginate = true }: { paginate?: boolean } = {}
): Q {
   if (!meta) return query;

   const { conditions, orGroups } = buildFilterClauses(meta.filters);

   for (const { column, operator, value } of conditions) {
      query = query.filter(column, operator, value);
   }
   for (const group of orGroups) {
      query = query.or(group);
   }

   for (const { field, order } of meta.multiSortMeta ?? []) {
      if (typeof field !== 'string' || !order) continue;
      query = query.order(orderColumn(field), { ascending: order > 0 });
   }

   if (paginate && meta.rows) {
      const first = meta.first ?? 0;
      query = query.range(first, first + meta.rows - 1);
   }

   return query;
}
