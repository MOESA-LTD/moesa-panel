CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The api schema (053): views named like the tables, owned by api_owner (NOLOGIN, not BYPASSRLS, a
-- member of authenticated, so the RLS policies still filter the caller's rows), mask each sensitive
-- column per row tenant; the INSTEAD OF forwarder refuses a write to a field the caller cannot write,
-- compared against the masked OLD, so a correct guess is refused like a wrong one (S1).
BEGIN;

SELECT plan(49);

-- The role and the generated objects.
SELECT ok(NOT (SELECT rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname = 'api_owner'), 'api_owner cannot log in and does not bypass RLS');
SELECT ok(NOT pg_has_role('authenticator', 'api_owner', 'MEMBER') AND NOT pg_has_role('authenticated', 'api_owner', 'MEMBER')
          AND NOT pg_has_role('anon', 'api_owner', 'MEMBER'), 'api_owner cannot be assumed');
SELECT ok(pg_has_role('api_owner', 'authenticated', 'MEMBER'), 'api_owner is a member of authenticated');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is((SELECT pg_get_userbyid(relowner)::TEXT FROM pg_class WHERE oid = 'api.product'::REGCLASS), 'api_owner', 'every api view is owned by api_owner');
SELECT is((SELECT pg_get_userbyid(proowner)::TEXT FROM pg_proc WHERE oid = 'private.api_forward()'::REGPROCEDURE), 'api_owner',
   'the forwarder is owned by api_owner, not postgres');
SELECT ok(has_table_privilege('authenticated', 'public.product', 'SELECT'), 'base still granted until the cutover (Task 19 flips this)');
SELECT ok(NOT has_table_privilege('anon', 'api.product', 'SELECT'), 'anon reads no api view');
SELECT ok(NOT has_table_privilege('authenticated', 'api.product', 'DELETE'), 'the view grants no write the base does not (products are never deleted)');
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has no USAGE on private outside the test helpers');

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
-- Test support only, revoked from everyone; this transaction lets the impersonated user call it.
GRANT EXECUTE ON FUNCTION private.field_calls_only_in_initplans (TEXT) TO authenticated;
-- Products are archived, never deleted (019: no DELETE for authenticated, no delete policy), so the
-- view gets no DELETE either. The DELETE path is exercised with a policy and grant local to this test.
CREATE POLICY t_delete_t5b ON public.product FOR DELETE TO authenticated USING (sku = 'T5B');
GRANT DELETE ON api.product TO authenticated;

-- As elif in MOESA LTD (t_restricted: product rights, no field rows).
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT sku FROM api.product WHERE id = current_setting('test.secret')::UUID $$, $$ VALUES ('SPIKE-SECRET') $$, 'T0 row visible');
SELECT results_eq($$ SELECT purchase_price, purchase_currency::CHAR(3), landed_cost_eur, target_price_eur, company_price_eur, supplier_id, supplier_product_code, notes
                     FROM api.product WHERE id = current_setting('test.secret')::UUID $$,
   $$ VALUES (NULL::NUMERIC, NULL::CHAR(3), NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::UUID, NULL::TEXT, NULL::TEXT) $$, 'T1 masked columns are NULL');
SELECT is((SELECT to_jsonb(x) ->> 'notes' FROM api.product x WHERE id = current_setting('test.secret')::UUID), NULL, 'T1b whole row masked');
SELECT is((SELECT count(*)::INT FROM api.product WHERE id = current_setting('test.secret')::UUID AND purchase_price > 10), 0, 'T2a filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.product WHERE purchase_price IS NOT NULL), 0, 'T2 IS NULL oracle closed');
SELECT is((SELECT array_agg(sku ORDER BY purchase_price) FILTER (WHERE purchase_price IS NOT NULL) FROM api.product), NULL, 'T2c ORDER BY oracle closed');
SELECT results_eq($$ SELECT count(*) FILTER (WHERE purchase_price IS NOT NULL)::INT, sum(purchase_price), max(landed_cost_eur) FROM api.product $$,
   $$ VALUES (0, NULL::NUMERIC, NULL::NUMERIC) $$, 'T3 aggregates closed');
SELECT is((SELECT 1 / (purchase_price - 12.5) FROM api.product WHERE id = current_setting('test.secret')::UUID), NULL, 'T6a division oracle closed');
SELECT is(t.error_of($$ SELECT ('x' || notes)::INT FROM api.product WHERE id = current_setting('test.secret')::UUID $$), 'ok', 'T6b a cast never sees the value');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 1 WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'field_write_forbidden', 'T4 a wrong guess is refused');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'field_write_forbidden', 'S1: a correct guess is refused like a wrong one');
SELECT throws_ok($$ UPDATE api.product SET notes = 'secret note' WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'field_write_forbidden', 'S1: a correct text guess is refused');
SELECT is(t.error_detail($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = current_setting('test.secret')::UUID $$),
   'product.purchase_price', 'the error names the field only');
SELECT lives_ok($$ UPDATE api.product SET purchase_price = NULL, notes = NULL WHERE id = current_setting('test.secret')::UUID $$, 'T4b wipe is accepted …');
SELECT is(t.peek('product', 'notes', current_setting('test.secret')::UUID), 'secret note', 'T4b … and is a no-op');
SELECT results_eq($$ UPDATE api.product SET display_name = 'r2' WHERE id = current_setting('test.secret')::UUID RETURNING purchase_price, notes $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T7 RETURNING is masked');
SELECT is(t.peek('product', 'display_name', current_setting('test.secret')::UUID), 'r2', 'T4c the allowed column was written');
SELECT results_eq($$ WITH z AS (UPDATE api.product SET display_name = 'x' WHERE purchase_price < 100 RETURNING 1) SELECT count(*)::INT FROM z $$,
   $$ VALUES (0) $$, 'T8 an update filtered on a masked field affects 0 rows');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku, purchase_price)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'T5', 3) $$,
   '42501', 'field_write_forbidden', 'T5 insert with a masked field refused');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'T5B') $$,
   'T5b insert without masked fields works');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ DELETE FROM api.product WHERE sku = 'T5B' $$, 'DELETE through the view');
SELECT is(t.peek('product', 'sku', (SELECT l.record_id FROM public.audit_log l WHERE l.operation = 'INSERT' AND l.new_data ->> 'sku' = 'T5B' LIMIT 1)), NULL,
   'the deleted row is gone from the base table');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t
                     WHERE t.id = (SELECT l.transaction_id FROM public.audit_log l WHERE l.operation = 'INSERT' AND l.new_data ->> 'sku' = 'T5B' ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('product', 'INSERT') $$, 'audit through a view keeps the top-level row');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t
                     WHERE t.id = (SELECT l.transaction_id FROM public.audit_log l WHERE l.operation = 'DELETE' AND l.old_data ->> 'sku' = 'T5B' ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('product', 'DELETE') $$, 'a DELETE through the view is logged as a DELETE, not a cascade');
SELECT is((SELECT count(*)::INT FROM api.product WHERE id = current_setting('test.spike_eu')::UUID), 0, 'T11 another tenant''s rows stay invisible');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (current_setting('test.nova')::UUID, current_setting('test.tho')::UUID, 'T11C') $$,
   '42501', NULL, 'T11c insert into a tenant without product insert refused');

-- As elif over MOESA LTD and Europe (t_cost in Europe: every cost field).
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
   ARRAY[current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID]);
SELECT results_eq($$ SELECT sku, purchase_price FROM api.product WHERE id IN (current_setting('test.secret')::UUID, current_setting('test.spike_eu')::UUID) ORDER BY sku $$,
   $$ VALUES ('SPIKE-EU', 77.7::NUMERIC), ('SPIKE-SECRET', NULL::NUMERIC) $$, 'T9 multi-tenant: Europe row visible, LTD row masked');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'field_write_forbidden', 'T9 write follows the row tenant');
SELECT results_eq($$ UPDATE api.product SET purchase_price = 78 WHERE id = current_setting('test.spike_eu')::UUID RETURNING purchase_price $$,
   $$ VALUES (78::NUMERIC) $$, 'T9 the tenant with the right writes the field');

-- As akif in MOESA LTD (owner: every field).
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT purchase_price FROM api.product WHERE id = current_setting('test.secret')::UUID), 12.5::NUMERIC, 'internal reads cost');
SELECT results_eq($$ UPDATE api.product SET purchase_price = 13 WHERE id = current_setting('test.secret')::UUID RETURNING purchase_price $$,
   $$ VALUES (13::NUMERIC) $$, 'internal writes cost, RETURNING shows it');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.product ORDER BY created_at DESC LIMIT 50'), 'the field function is an InitPlan, never per row');

-- Without the test helpers' USAGE on private: the masking path runs through the view's stored
-- expressions and the forwarder through api_owner's own USAGE.
RESET ROLE;
REVOKE USAGE ON SCHEMA private FROM authenticated;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT sku, purchase_price, notes FROM api.product WHERE id = current_setting('test.secret')::UUID $$,
   $$ VALUES ('SPIKE-SECRET', NULL::NUMERIC, NULL::TEXT) $$, 'a plain user without USAGE on private reads the masked view');
SELECT results_eq($$ UPDATE api.product SET display_name = 'no usage' WHERE id = current_setting('test.secret')::UUID RETURNING display_name, purchase_price $$,
   $$ VALUES ('no usage', NULL::NUMERIC) $$, '… and writes an open field through the forwarder');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'field_write_forbidden', '… and is refused a masked one');

-- R4: once api.supplier exists, the product generator adds the computed relationships across the
-- sensitive link; the argument row is already masked.
RESET ROLE;
SELECT private.enable_field_security('supplier');
SELECT private.enable_field_security('product');
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.product p, api.supplier(p) s WHERE p.id = current_setting('test.secret')::UUID), 0,
   'R4 a masked link embeds nothing');
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT s.code, (SELECT count(*)::INT FROM api.product_by_supplier(s) x WHERE x.id = current_setting('test.secret')::UUID)
                     FROM api.product p, api.supplier(p) s WHERE p.id = current_setting('test.secret')::UUID $$,
   $$ VALUES ('TS1', 1) $$, 'R4 a readable link embeds both ways');

-- Drift: a hand-written view (every column plain) and a wrong owner are reported.
RESET ROLE;
SELECT private.unimpersonate();
DROP VIEW api.product CASCADE;
CREATE VIEW api.product AS SELECT * FROM public.product;
SELECT ok(EXISTS (SELECT 1 FROM private.api_view_drift() WHERE relation = 'product' AND problem = 'unmasked purchase_price'),
   'drift reports an unmasked sensitive column');
SELECT ok(EXISTS (SELECT 1 FROM private.api_view_drift() WHERE relation = 'product' AND problem = 'owner'), 'drift reports an owner other than api_owner');

SELECT * FROM finish();
ROLLBACK;
