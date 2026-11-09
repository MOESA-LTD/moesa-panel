import { ability, isFieldWriteForbidden } from '@plugins/casl';
import { inject, provide, shallowRef, type InjectionKey } from 'vue';

// Bumped whenever the rights change, so templates and computeds asking below follow them.
const version = shallowRef(0);
ability.on('updated', () => version.value++);

export type FieldAccess = {
   canRead(field: string): boolean;
   canWrite(field: string): boolean;
};

/**
 * The user's rights on the fields of `table` (my_access.fields, through the ability): a field they
 * may not read is not shown, one they may not write is read-only. The `api` views enforce both.
 */
export function useFieldAccess(table: string): FieldAccess {
   return {
      canRead(field: string): boolean {
         void version.value;
         return ability.can('read', table, field);
      },
      /** Whether the user may write the field, in a new row or an existing one. */
      canWrite(field: string): boolean {
         void version.value;
         return ability.can('update', table, field) || ability.can('insert', table, field);
      }
   };
}

const FIELD_ACCESS: InjectionKey<FieldAccess> = Symbol('fieldAccess');

/**
 * Makes `table` the one whose fields the FormFields below name (their `field` prop): a field the
 * user may not read is not rendered, one they may not write is read-only.
 */
export function provideFieldAccess(table: string): FieldAccess {
   const access = useFieldAccess(table);
   provide(FIELD_ACCESS, access);
   return access;
}

/** The field rights a form provided (provideFieldAccess), if any. */
export const injectFieldAccess = () => inject(FIELD_ACCESS, null);

/** Views listing a table's rows with its columns: their fields follow the table's rights. */
const VIEW_TABLES: Record<string, string> = {
   product_with_evidence: 'product',
   purchase_order_overview: 'purchase_order',
   shipment_overview: 'shipment',
   incident_overview: 'incident',
   market_cell_overview: 'market_cell'
};

/**
 * The columns of a list of `table` rows without those of fields the user may not read. A table the
 * user reads without a permission of its own (audit_transaction, through RLS) has no field rights,
 * so it keeps every column, as isFieldWriteForbidden does for writes.
 */
export const readableColumns = <C extends { field?: unknown }>(table: string, columns: C[]) => {
   void version.value;
   const subject = VIEW_TABLES[table] ?? table;
   if (!ability.can('read', subject)) return columns;
   const { canRead } = useFieldAccess(subject);
   return columns.filter(({ field }) => typeof field !== 'string' || canRead(field));
};

/**
 * The sensitive columns a new row cannot do without: NOT NULL, without a default and not filled by
 * a trigger (purchase_order's incoterm and deposit_rate come from the supplier). saveRow leaves out
 * a column the user may not write, so the insert would fail (23502); no form offers it then.
 * user.email is left out: users are invited through the user Edge Function, not saveRow.
 */
export const REQUIRED_MASKED_FIELDS: Readonly<Record<string, readonly string[]>> = {
   customer_contact: ['name'],
   incident_log: ['note'],
   purchase_order: ['supplier_id'],
   purchase_order_line: ['unit_price'],
   purchase_order_payment: ['amount', 'currency'],
   supplier_contact: ['name']
};

/**
 * Whether the field rights leave a new row of `table` possible: no column it needs is one the user
 * may not write. The table permission (`create`) is asked separately.
 */
export function canInsertFields(table: string): boolean {
   void version.value;
   return !(REQUIRED_MASKED_FIELDS[table] ?? []).some((field) =>
      isFieldWriteForbidden(table, field)
   );
}
