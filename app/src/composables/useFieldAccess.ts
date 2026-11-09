import { ability } from '@plugins/casl';
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

/** The columns of a list of `table` rows without those of fields the user may not read. */
export const readableColumns = <C extends { field?: unknown }>(table: string, columns: C[]) => {
   const { canRead } = useFieldAccess(VIEW_TABLES[table] ?? table);
   return columns.filter(({ field }) => typeof field !== 'string' || canRead(field));
};
