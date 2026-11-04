import i18n from '@plugins/i18n';

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

/** `Key (national_id)=(123) already exists.` → ['national_id'] */
const keyColumns = (details?: string | null) =>
   /Key \(([^)]+)\)=/
      .exec(details ?? '')?.[1]
      .split(',')
      .map((column) => column.trim()) ?? [];

/** A constraint is named after its table and columns, e.g. client_national_id_key. */
const constraintColumns = (message: string | undefined, fields: string[]) => {
   const constraint = /constraint "([^"]+)"/.exec(message ?? '')?.[1] ?? '';
   return fields.filter((field) => constraint.includes(field));
};

/**
 * Errors named by their constraint or raised message, and the one field and message they belong to.
 * Checked before the generic mapping, which would e.g. mark every column of a unique key. An entry
 * without a field documents a toast-level code (a status action's or an RPC's): it never maps to a
 * field, and appErrorHandler shows `errors.<name>`.
 */
export const NAMED_ERRORS: { code: string; name: string; field?: string; message: string }[] = [
   {
      code: '23505',
      name: 'unique_document_version',
      field: 'version',
      message: 'errors.document_version_exists'
   },
   {
      code: '23514',
      name: 'document_signed_incomplete',
      field: 'status',
      message: 'errors.document_signed_incomplete'
   },
   {
      code: '23514',
      name: 'document_has_file',
      field: 'url',
      message: 'errors.document_file_required'
   },
   {
      code: '23503',
      name: 'media_file_missing',
      field: 'media_id',
      message: 'errors.media_file_missing'
   },
   {
      code: '23514',
      name: 'media_type_not_allowed',
      field: 'media_id',
      message: 'errors.media_type_not_allowed'
   },
   { code: '23514', name: 'media_too_large', field: 'media_id', message: 'errors.media_too_large' },
   {
      code: '23514',
      name: 'media_file_immutable',
      field: 'media_id',
      message: 'errors.media_file_immutable'
   },
   { code: '23503', name: 'media_in_use', field: 'id', message: 'errors.media_in_use' },
   {
      code: '23503',
      name: 'media_link_entity_missing',
      field: 'media_id',
      message: 'errors.media_link_entity_missing'
   },
   {
      code: '42501',
      name: 'media_link_forbidden',
      field: 'media_id',
      message: 'errors.media_link_forbidden'
   },
   {
      code: '23514',
      name: 'media_link_identity_immutable',
      field: 'media_id',
      message: 'errors.media_link_identity_immutable'
   },
   {
      code: '23514',
      name: 'media_customer_mismatch',
      field: 'media_id',
      message: 'errors.media_customer_mismatch'
   },
   {
      code: '23514',
      name: 'media_customer_locked',
      field: 'customer_id',
      message: 'errors.media_customer_locked'
   },
   { code: '23503', name: 'media_missing', field: 'media_id', message: 'errors.media_missing' },
   {
      code: '23514',
      name: 'media_primary_not_image',
      field: 'role',
      message: 'errors.media_primary_not_image'
   },
   {
      code: '23505',
      name: 'unique_media_link',
      field: 'media_id',
      message: 'errors.media_already_linked'
   },
   // The demotion trigger moves the old primary first; this is left to a concurrent race.
   {
      code: '23505',
      name: 'media_link_one_primary',
      field: 'role',
      message: 'errors.media_primary_exists'
   },
   { code: '23505', name: 'product_gtin_active', field: 'gtin', message: 'errors.gtin_in_use' },
   {
      code: '23505',
      name: 'product_customer_id_sku_key',
      field: 'sku',
      message: 'errors.sku_in_use'
   },
   // Purchase orders (029_purchase_orders.sql, 030_purchase_order_rules.sql).
   {
      code: '23503',
      name: 'purchase_order_customer_missing',
      field: 'customer_id',
      message: 'errors.purchase_order_customer_missing'
   },
   {
      code: '23514',
      name: 'purchase_order_immutable_field',
      field: 'supplier_id',
      message: 'errors.purchase_order_immutable_field'
   },
   {
      code: '23514',
      name: 'purchase_order_incoterm_valid',
      field: 'incoterm',
      message: 'errors.incoterm_invalid'
   },
   {
      code: '23503',
      name: 'purchase_order_project_fkey',
      field: 'project_id',
      message: 'errors.po_project_customer'
   },
   {
      code: '23503',
      name: 'purchase_order_line_product_fkey',
      field: 'product_id',
      message: 'errors.po_line_product_customer'
   },
   {
      code: '23505',
      name: 'unique_purchase_order_line_product',
      field: 'product_id',
      message: 'errors.po_line_product_duplicate'
   },
   {
      code: '23514',
      name: 'purchase_order_pi_check_valid',
      field: 'pi_check',
      message: 'errors.pi_check_invalid'
   },
   {
      code: '23514',
      name: 'po_spec_sheet_required',
      field: 'spec_document_id',
      message: 'errors.po_spec_sheet_required'
   },
   {
      code: '23514',
      name: 'po_line_spec_invalid',
      field: 'spec_document_id',
      message: 'errors.po_line_spec_invalid'
   },
   {
      code: '23514',
      name: 'po_pi_document_invalid',
      field: 'pi_document_id',
      message: 'errors.po_pi_document_invalid'
   },
   // A locked term on the order form, a locked line on the line form.
   { code: '23514', name: 'po_locked', field: 'currency', message: 'errors.po_locked' },
   { code: '23514', name: 'po_locked', field: 'quantity', message: 'errors.po_locked' },
   // Raised by a status change, or by a child of a closed order: shown as a toast.
   ...[
      'po_status_order',
      'po_lines_required',
      'po_pi_required',
      'po_pi_checklist_incomplete',
      'po_pi_mismatch',
      'po_deposit_unpaid',
      'po_balance_unpaid',
      'po_closed',
      'po_line_identity_immutable'
   ].map((name) => ({ code: '23514', name, message: `errors.${name}` })),
   // Shipments (031_shipments.sql).
   {
      code: '23503',
      name: 'shipment_customer_missing',
      field: 'customer_id',
      message: 'errors.shipment_customer_missing'
   },
   {
      code: '23514',
      name: 'shipment_immutable_field',
      field: 'customer_id',
      message: 'errors.shipment_immutable_field'
   },
   {
      code: '23503',
      name: 'shipment_warehouse_fkey',
      field: 'delivery_warehouse_id',
      message: 'errors.shipment_warehouse_customer'
   },
   {
      code: '23514',
      name: 'shipment_incoterm_buy_valid',
      field: 'incoterm_buy',
      message: 'errors.incoterm_invalid'
   },
   {
      code: '23514',
      name: 'shipment_incoterm_sell_valid',
      field: 'incoterm_sell',
      message: 'errors.incoterm_invalid'
   },
   {
      code: '23514',
      name: 'shipment_po_not_open',
      field: 'purchase_order_id',
      message: 'errors.shipment_po_not_open'
   },
   {
      code: '23503',
      name: 'shipment_purchase_order_po_fkey',
      field: 'purchase_order_id',
      message: 'errors.shipment_po_customer'
   },
   {
      code: '23503',
      name: 'shipment_line_link_fkey',
      field: 'purchase_order_line_id',
      message: 'errors.shipment_line_po_not_linked'
   },
   {
      code: '23505',
      name: 'unique_shipment_line',
      field: 'purchase_order_line_id',
      message: 'errors.shipment_line_duplicate'
   },
   {
      code: '23514',
      name: 'shipment_quantity_exceeds_po',
      field: 'quantity',
      message: 'errors.shipment_quantity_exceeds_po'
   },
   { code: '23514', name: 'shipment_locked', field: 'quantity', message: 'errors.shipment_locked' },
   // Raised by a status change or by unlinking an order: shown as a toast.
   ...[
      'shipment_status_order',
      'shipment_po_required',
      'shipment_booking_date_required',
      'shipment_eta_required',
      'shipment_delivery_time_required',
      'shipment_delivery_receipt_required',
      'shipment_acceptance_issue',
      'shipment_po_has_lines'
   ].map((name) => ({ code: '23514', name, message: `errors.${name}` })),
   // Raised by passing G3 (pass_gate): shown as a toast.
   { code: '23514', name: 'gate_pi_required', message: 'errors.gate_pi_required' }
];

/**
 * Maps a database error to messages for the form fields it concerns, so e.g. a duplicate national
 * id shows under that field instead of as a generic toast. Returns null when no field matches.
 */
export function mapPostgrestError(error: unknown, fields: string[]): Record<string, string> | null {
   const { code, message, details } = (error ?? {}) as PostgrestLikeError;

   const matches = NAMED_ERRORS.filter(
      (entry) => entry.code === code && message?.includes(entry.name)
   );
   for (const { field, message: text } of matches)
      if (field && fields.includes(field)) return { [field]: i18n.t(text) };
   // A toast-level code belongs to no field, whatever the generic mapping would find.
   if (matches.some(({ field }) => field === undefined)) return null;

   let columns: string[] = [];
   let text: string;

   switch (code) {
      case '23505': // unique_violation
         columns = keyColumns(details);
         if (!columns.length) columns = constraintColumns(message, fields);
         text = i18n.t('form.already_exists');
         break;
      case '23503': // foreign_key_violation
         columns = keyColumns(details);
         text = i18n.t('form.invalid_reference');
         break;
      case '23502': // not_null_violation
         columns = [/column "([^"]+)"/.exec(message ?? '')?.[1] ?? ''];
         text = i18n.t('form.required');
         break;
      case '23514': // check_violation
         columns = constraintColumns(message, fields);
         text = i18n.t('form.invalid_value');
         break;
      default:
         return null;
   }

   const known = columns.filter((column) => fields.includes(column));
   return known.length ? Object.fromEntries(known.map((column) => [column, text])) : null;
}
