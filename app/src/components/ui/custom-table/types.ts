import type { ColumnProps, DataTableSlots } from 'primevue';
import type { ColumnSlots } from 'primevue/column';
import type { MenuItem } from 'primevue/menuitem';
import type { VNode } from 'vue';

type ColumnSlotScope<K extends keyof ColumnSlots> = Parameters<ColumnSlots[K]>[0];

/** Props of a `<field>_body` slot: PrimeVue's body scope with the row typed. */
export type CustomTableBodySlotProps<T = any> = Omit<ColumnSlotScope<'body'>, 'data' | 'field'> & {
   data: T;
   field: string;
};

/**
 * Column slots are named after the column's field in snake case, e.g. `email_body` or
 * `record_type_filter`. Header and footer slots also receive the column's props.
 */
export type CustomTableColumnSlots<T = any> = {
   [key: `${string}_body`]: (props: CustomTableBodySlotProps<T>) => VNode[];
   [key: `${string}_filter`]: (props: ColumnSlotScope<'filter'>) => VNode[];
   [key: `${string}_header`]: (props: ColumnProps & ColumnSlotScope<'header'>) => VNode[];
   [key: `${string}_footer`]: (props: ColumnProps & ColumnSlotScope<'footer'>) => VNode[];
};

export type CustomTableSlots<T = any> = Partial<DataTableSlots<T>> &
   CustomTableColumnSlots<T> & {
      /** Replaces the row action buttons. */
      table_actions?: () => VNode[];
   };

/**
 * A row action button. `command` gets the row's body scope and returns the click handler:
 * `command: ({ data }) => () => remove(data.id)`.
 */
export type CustomTableRowAction<T = any> = Omit<MenuItem, 'command'> & {
   command?: (body: CustomTableBodySlotProps<T>) => () => unknown;
};
