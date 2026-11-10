CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 054: the customer and supplier tables behind the masked api views, as portal, coordinator and a
-- restricted user; the product generator is re-run so the supplier relationships (R4) exist.
BEGIN;

SELECT plan(23);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

-- As portal in moesa.
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT deposit_rate, restricted_drive_url, notes FROM api.customer WHERE id = current_setting('test.tho')::UUID $$,
   $$ VALUES (0.4::NUMERIC, NULL::TEXT, NULL::TEXT) $$, 'OD2: portal reads contract terms, not the drive URL or notes');
SELECT is((SELECT count(*)::INT FROM api.customer WHERE restricted_drive_url LIKE '%THO%'), 0, 'drive URL filter oracle closed');
SELECT is((SELECT email FROM api.customer_contact WHERE id = current_setting('test.tho_contact')::UUID), 'buyer@tho.example', 'portal reads contact personal data');
SELECT is((SELECT count(*)::INT FROM api.supplier), 0, 'portal has no supplier table access');
SELECT is((SELECT notes FROM api.customer_platform_account WHERE id = current_setting('test.acct')::UUID), NULL, 'platform account notes masked for portal');
SELECT is((SELECT account_holder FROM api.customer_platform_account WHERE id = current_setting('test.acct')::UUID), 'Jane Doe', 'account holder readable (personal_data R)');

-- As koordinator in moesa.
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT deposit_rate FROM api.supplier WHERE id = current_setting('test.tsp')::UUID), 0.3::NUMERIC, 'coordinator reads supplier terms');
SELECT throws_ok($$ UPDATE api.supplier SET payment_terms = 'net 60' WHERE id = current_setting('test.tsp')::UUID $$, '42501', 'field_write_forbidden', 'coordinator cannot change supplier terms');
SELECT lives_ok($$ UPDATE api.supplier SET payment_terms = 'net 30', city = 'Shanghai' WHERE id = current_setting('test.tsp')::UUID $$, 'S1: sending the visible value unchanged is not a write');
SELECT is(t.peek('supplier', 'city', current_setting('test.tsp')::UUID), 'Shanghai', '… and the open change is forwarded');
SELECT throws_ok($$ UPDATE api.customer SET deposit_rate = 0.2 WHERE id = current_setting('test.tho')::UUID $$, '42501', 'field_write_forbidden', 'contract stays guarded through the view');
SELECT lives_ok($$ UPDATE api.supplier_contact SET phone = '+86 101' WHERE id = current_setting('test.tsp_contact')::UUID $$, 'coordinator writes supplier contacts');
SELECT lives_ok($$ INSERT INTO api.customer_warehouse (tenant_id, customer_id, display_name) VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'W-T') $$, 'insert through the view');
SELECT lives_ok($$ DELETE FROM api.customer_warehouse WHERE display_name = 'W-T' $$, 'delete through the view');
SELECT throws_ok($$ UPDATE api.customer_platform_account SET api_connection = 'connected' WHERE id = current_setting('test.acct')::UUID $$, '23514', 'platform_account_api_server_only', 'R6 holds through api');
SELECT is((SELECT s.code FROM api.product p, api.supplier(p) s WHERE p.id = current_setting('test.secret')::UUID), 'TS1', 'R4: the supplier embed works with the right');

-- As elif in moesa (t_restricted).
RESET ROLE;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE api.supplier SET deposit_rate = 0.3 WHERE id = current_setting('test.tsp')::UUID $$, '42501', 'field_write_forbidden', 'S1: a correct guess on a supplier term is refused');
SELECT throws_ok($$ UPDATE api.supplier SET deposit_rate = 0.9 WHERE id = current_setting('test.tsp')::UUID $$, '42501', 'field_write_forbidden', 'S1: a wrong guess is refused the same way');
SELECT is((SELECT count(*)::INT FROM api.product p, api.supplier(p) s WHERE p.id = current_setting('test.secret')::UUID), 0, 'R4: a hidden supplier link embeds nothing');
SELECT is((SELECT count(*)::INT FROM api.supplier s, api.product_by_supplier(s) p WHERE s.id = current_setting('test.tsp')::UUID), 0, 'R4: the reverse embed from supplier is empty');
SELECT lives_ok($$ UPDATE api.customer SET website = notes WHERE id = current_setting('test.tho')::UUID $$, 'T6d copying a masked column …');
SELECT isnt(t.peek('customer', 'website', current_setting('test.tho')::UUID), 'customer secret', '… never copies the secret');

SELECT * FROM finish();
ROLLBACK;
