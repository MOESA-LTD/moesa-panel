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

/** A row action value, or a function of the row's body scope that returns it. */
type RowActionValue<V, T> = V | ((body: CustomTableBodySlotProps<T>) => V);

/**
 * A row action button. Function values get the row's body scope: `disabled: ({ data }) => ...`.
 * `command` returns the click handler: `command: ({ data }) => () => remove(data.id)`.
 */
export type CustomTableRowAction<T = any> = Omit<
   MenuItem,
   'command' | 'label' | 'icon' | 'disabled' | 'visible'
> & {
   label?: RowActionValue<string, T>;
   icon?: RowActionValue<string, T>;
   disabled?: RowActionValue<boolean, T>;
   visible?: RowActionValue<boolean, T>;
   command?: (body: CustomTableBodySlotProps<T>) => () => unknown;
   /**
    * A tooltip over the button that shows while it is disabled too (on a wrapper: a disabled
    * button gets no pointer events), e.g. why the action is unavailable. Without it, the label.
    */
   tooltip?: RowActionValue<string | undefined, T>;
   /**
    * The permission it needs, checked in the row's own tenant (`data.tenant_id`), which may be
    * another of the branches shown; without it the button is disabled.
    */
   requires?: { action: string; subject: string };
};
