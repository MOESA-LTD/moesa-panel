// The database types the app uses: the generated ones, with each `api` view typed after its table.
import type { Database } from '../../../supabase/functions/_shared/database.types';

type PublicTables = Database['public']['Tables'];
type ApiViews = Database['api']['Views'];

/**
 * The sensitive fields of each table (public.field_class, class 'sensitive'): the `api` views
 * return them null when the user may not read them. Keep in step with field_class.
 */
export type MaskedFields = {
   change_request: 'decision_note';
   customer:
      | 'contract_accepted_on'
      | 'contract_document_id'
      | 'deposit_rate'
      | 'extra_cost_rule'
      | 'notes'
      | 'restricted_drive_url'
      | 'start_on';
   customer_contact: 'email' | 'name' | 'phone';
   customer_platform_account: 'account_holder' | 'notes';
   customer_warehouse: 'receiving_person';
   document: 'notes';
   incident: 'affected_parties' | 'impact_note' | 'lessons' | 'root_cause_note';
   incident_log: 'cost_amount' | 'cost_currency' | 'cost_payer' | 'counterparty' | 'note';
   market_cell: 'notes';
   product:
      | 'company_price_eur'
      | 'landed_cost_eur'
      | 'landed_cost_on'
      | 'manufacturer_art_no'
      | 'notes'
      | 'price_list_version'
      | 'purchase_currency'
      | 'purchase_incoterm'
      | 'purchase_price'
      | 'supplier_id'
      | 'supplier_product_code'
      | 'target_price_eur';
   project: 'notes';
   project_gate: 'note';
   purchase_order:
      | 'deposit_rate'
      | 'incoterm'
      | 'incoterm_place'
      | 'notes'
      | 'penalty_rule'
      | 'pi_balance_amount'
      | 'pi_check'
      | 'pi_deposit_amount'
      | 'pi_discount_amount'
      | 'pi_document_id'
      | 'pi_extra_amount'
      | 'pi_number'
      | 'pi_subtotal'
      | 'pi_total'
      | 'supplier_id'
      | 'tolerance_pct';
   purchase_order_line: 'line_total' | 'notes' | 'pi_line_total' | 'unit_price';
   purchase_order_payment: 'amount' | 'currency' | 'notes';
   shipment: 'incoterm_buy' | 'notes';
   shipment_event: 'from_party' | 'note' | 'to_party';
   supplier:
      | 'cancellation_rule'
      | 'damage_notice_hours'
      | 'default_incoterm'
      | 'deposit_rate'
      | 'last_audit_on'
      | 'late_payment_penalty'
      | 'notes'
      | 'payment_terms'
      | 'rating'
      | 'storage_fee_rule';
   supplier_contact: 'email' | 'name' | 'phone' | 'role';
   user: 'email' | 'phone' | 'user_metadata';
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

/** What a view takes: as its table, but masked fields are optional (they may not be written). */
type ViewWrite<T, M extends PropertyKey> = Omit<T, M> & Partial<Pick<T, Extract<keyof T, M>>>;

/** The views of the tables, typed after them. */
export type ApiTables = {
   [K in keyof ApiViews & keyof PublicTables]: {
      Row: ViewRow<K>;
      Insert: ViewWrite<PublicTables[K]['Insert'], Masked<K>>;
      Update: PublicTables[K]['Update'];
      Relationships: ApiViews[K]['Relationships'];
   };
};

type TypedViews = Omit<ApiViews, keyof ApiTables> & ApiTables;

export type AppDatabase = Omit<Database, 'api'> & {
   api: Omit<Database['api'], 'Views'> & { Views: TypedViews };
};
