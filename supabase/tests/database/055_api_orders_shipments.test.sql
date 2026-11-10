CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 055: purchase orders and shipments behind the masked api views, as elif (t_restricted) and akif.
BEGIN;

SELECT plan(19);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

RESET ROLE;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT pi_total, pi_number, deposit_rate, incoterm, supplier_id, notes FROM api.purchase_order WHERE id = current_setting('test.po_draft')::UUID $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC, NULL::TEXT, NULL::UUID, NULL::TEXT) $$, 'PO cost, terms, supplier link and notes masked');
SELECT results_eq($$ SELECT unit_price, line_total, pi_line_total FROM api.purchase_order_line WHERE id = current_setting('test.line_draft')::UUID $$, $$ VALUES (NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC) $$, 'line prices masked incl. the generated total');
SELECT is((SELECT amount FROM api.purchase_order_payment WHERE id = current_setting('test.payment')::UUID), NULL, 'payment amount masked (finance)');
SELECT is((SELECT count(*)::INT FROM api.purchase_order WHERE supplier_id = current_setting('test.tsp')::UUID), 0, 'filter on a masked FK reveals nothing');
SELECT is((SELECT count(*)::INT FROM api.purchase_order po, api.supplier(po) s WHERE po.id = current_setting('test.po_draft')::UUID), 0, 'R4: supplier embed through the masked FK is empty');
SELECT is((SELECT count(*)::INT FROM api.supplier s, api.purchase_order_by_supplier(s) po WHERE s.id = current_setting('test.tsp')::UUID), 0, 'R4: reverse embed from supplier is empty');
SELECT lives_ok($$ UPDATE api.purchase_order_line SET quantity = 12 WHERE id = current_setting('test.line_draft')::UUID $$, 'quantity edits work without cost rights');
SELECT throws_ok($$ UPDATE api.purchase_order_line SET unit_price = 1 WHERE id = current_setting('test.line_draft')::UUID $$, '42501', 'field_write_forbidden', 'unit price write refused');
SELECT throws_ok($$ UPDATE api.purchase_order_line SET unit_price = 12.5 WHERE id = current_setting('test.line_draft')::UUID $$, '42501', 'field_write_forbidden', 'S1: a correct unit price guess is refused');
SELECT is(t.error_of($$ DELETE FROM api.purchase_order_line WHERE id = current_setting('test.line_approved')::UUID $$), '23514:po_locked', 'R7 through api: a locked PO line delete is refused');
SELECT results_eq($$ SELECT incoterm_buy, notes FROM api.shipment WHERE id = current_setting('test.shp')::UUID $$, $$ VALUES (NULL::TEXT, NULL::TEXT) $$, 'shipment terms and notes masked');
SELECT results_eq($$ SELECT from_party, to_party, note FROM api.shipment_event WHERE id = current_setting('test.shp_event')::UUID $$, $$ VALUES (NULL::TEXT, NULL::TEXT, NULL::TEXT) $$, 'OD2: event parties masked (supplier_identity)');
SELECT is((SELECT count(*)::INT FROM api.shipment_purchase_order WHERE shipment_id = current_setting('test.shp')::UUID AND purchase_order_id = current_setting('test.po_approved')::UUID), 1, 'a key-only join row reads through its composite key');
SELECT throws_ok($$ INSERT INTO api.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate) VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tsp')::UUID, 'USD', 'FOB', 0.3) $$, '42501', 'field_write_forbidden', 'a PO needs supplier and terms write rights');
SELECT set_config('audit.transaction_id', '', TRUE);
-- Deviation: authenticated has no DELETE on public.purchase_order (029), so the view mirrors that.
SELECT is(split_part(t.error_of($$ DELETE FROM api.purchase_order WHERE id = current_setting('test.po_draft')::UUID $$), ':', 1), '42501', 'a PO delete through api is refused like the base table (no DELETE grant)');
SELECT lives_ok($$ DELETE FROM api.purchase_order_line WHERE id = current_setting('test.line_draft')::UUID $$, 'a draft PO line deletes through api');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM api.audit_transaction t WHERE t.id = (SELECT l.transaction_id FROM api.audit_log l WHERE l.table_name = 'purchase_order_line' AND l.operation = 'DELETE' AND l.record_id = current_setting('test.line_draft')::UUID ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('purchase_order_line','DELETE') $$, 'the audit transaction through api names the deleted row');
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ INSERT INTO api.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate) VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tsp')::UUID, 'USD', 'FOB', 0.3) RETURNING code ~ '^PO-' $$,
   $$ VALUES (TRUE) $$, 'purchase_order_set_code runs through the forwarder');

SELECT * FROM finish();
ROLLBACK;
