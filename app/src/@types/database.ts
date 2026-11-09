// The database types the app uses: the generated ones, with each `api` view typed after its table.
import type { Database } from '../../../supabase/functions/_shared/database.types';
import type { MASKED_FIELDS } from './maskedFields.generated';

type PublicTables = Database['public']['Tables'];
type ApiViews = Database['api']['Views'];

/**
 * The sensitive fields of each table (public.field_class, class 'sensitive'): the `api` views
 * return them null when the user may not read them. Generated (scripts/masked-fields.mjs).
 */
export type MaskedFields = {
   [K in keyof typeof MASKED_FIELDS]: (typeof MASKED_FIELDS)[K][number];
};

type Masked<K> = K extends keyof MaskedFields ? MaskedFields[K] : never;

/** A table's row as its view returns it: masked fields may be null, the others as in the table. */
type ViewRow<K extends keyof PublicTables & keyof ApiViews> = {
   [C in keyof ApiViews[K]['Row']]: C extends keyof PublicTables[K]['Row']
      ? C extends Masked<K>
         ? PublicTables[K]['Row'][C] | null
         : PublicTables[K]['Row'][C]
      : ApiViews[K]['Row'][C];
};

/**
 * What a view takes: as its table, but masked fields are optional and may be null (a form keeps a
 * masked field as null; saveRow leaves out the fields the user may not write).
 */
type ViewWrite<T, M extends PropertyKey> = Omit<T, M> & {
   [C in Extract<keyof T, M>]?: T[C] | null;
};

/** The views of the tables, typed after them. */
export type ApiTables = {
   [K in keyof ApiViews & keyof PublicTables]: {
      Row: ViewRow<K>;
      Insert: ViewWrite<PublicTables[K]['Insert'], Masked<K>>;
      Update: ViewWrite<PublicTables[K]['Update'], Masked<K>>;
      Relationships: ApiViews[K]['Relationships'];
   };
};

type TypedViews = Omit<ApiViews, keyof ApiTables> & ApiTables;

export type AppDatabase = Omit<Database, 'api'> & {
   api: Omit<Database['api'], 'Views'> & { Views: TypedViews };
};
