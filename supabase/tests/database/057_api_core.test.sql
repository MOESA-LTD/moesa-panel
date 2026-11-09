CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 057: core, files and catalog tables behind the api views; personal data (S5), computed fields, read-only catalog.
BEGIN;

SELECT plan(22);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is_empty($$ SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
   AND c.relname NOT IN ('audit_log','audit_transaction') AND to_regclass('api.' || c.relname) IS NULL $$, 'every business table has an api view');
SELECT ok(NOT has_column_privilege('authenticated', 'api.setting', 'key', 'UPDATE') AND has_column_privilege('authenticated', 'api.setting', 'value', 'UPDATE'), 'setting keeps its column grant on the view');
SELECT ok(NOT has_column_privilege('authenticated', 'api.tenant', 'parent_id', 'UPDATE'), 'tenant keeps its column grant on the view');

RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT email FROM api.user WHERE id = current_setting('test.koordinator')::UUID), 'koordinator@moesa-panel.test', 'a user reads their own e-mail');
SELECT is((SELECT email FROM api.user WHERE id = current_setting('test.akif')::UUID), 'akif@moesa-panel.test', 'a colleague of a tenant holding the right is readable');

RESET ROLE;
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.user WHERE id <> current_setting('test.portal')::UUID AND email IS NOT NULL), 0, 'portal reads only its own e-mail');

-- Fixture gap: elif's roles hold no 'user' group permission, so she could not read public.user rows at all.
-- Give t_cost (Europe) the select permission on public.user, as postgres, to test the S5 masking.
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.role_permission (role_id, permission_id)
SELECT current_setting('test.t_cost')::UUID, p.id FROM public.permission p WHERE p.resource_name = 'public.user' AND p.command = 'select';
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.europe')::UUID,
   ARRAY[current_setting('test.europe')::UUID, current_setting('test.moesa')::UUID]);
SELECT is((SELECT email FROM api.user WHERE id = current_setting('test.akif')::UUID), 'akif@moesa-panel.test', 'S5: a member of Europe is readable');
SELECT is((SELECT email FROM api.user WHERE id = current_setting('test.koordinator')::UUID), NULL, 'S5: a user only in another scope tenant stays masked');

RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE api.user SET phone = '+1' WHERE id = current_setting('test.koordinator')::UUID $$, '42501', 'field_write_forbidden', 'no one writes another user''s phone');
SELECT lives_ok($$ SELECT api.owned_via(u), api.managed_in(u) FROM api.user u $$, 'computed fields owned_via and managed_in resolve on api.user');
SELECT ok(to_regprocedure('api.status(api.subscription)') IS NOT NULL, 'computed field status on api.subscription');
SELECT ok(to_regprocedure('api.pi_document(api.purchase_order)') IS NOT NULL AND to_regprocedure('api.contract_document(api.customer)') IS NOT NULL, 'R4 relationships to documents exist');
SELECT matches(t.error_of($$ INSERT INTO api.role_field_permission (role_id, resource_name, field, can_read, can_write) VALUES (current_setting('test.t_restricted')::UUID, 'public.product', 'purchase_price', TRUE, TRUE) $$), '^42501:permission denied for view role_field_permission', 'S7: api.role_field_permission is read-only');
SELECT ok(NOT has_table_privilege('authenticated', 'api.role_field_permission', 'INSERT') AND NOT has_table_privilege('authenticated', 'api.role_field_permission', 'UPDATE') AND NOT has_table_privilege('authenticated', 'api.role_field_permission', 'DELETE'), 'S7: no write grant on the view');

RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id WHERE r.tenant_id <> current_setting('test.moesa')::UUID), 0, 'field rights of other tenants'' roles are invisible');
SELECT ok((SELECT count(*) > 0 FROM api.field_class WHERE class = 'sensitive'), 'the catalog is readable');

SELECT ok(NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.transfer'::regclass AND a.grantee = 'api_owner'::regrole AND a.privilege_type IN ('INSERT','UPDATE','DELETE')), 'api_owner holds no direct write grant on public.transfer');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'api.transfer'::regclass AND tgname = 'api_forward') AND NOT has_table_privilege('authenticated', 'api.transfer', 'INSERT'), 'api.transfer has no forwarder and no INSERT grant');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.code_sequence'::regclass AND a.grantee = 'api_owner'::regrole AND a.privilege_type IN ('INSERT','UPDATE','DELETE')), 'api_owner holds no direct write grant on public.code_sequence');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'api.code_sequence'::regclass AND tgname = 'api_forward') AND NOT has_table_privilege('authenticated', 'api.code_sequence', 'INSERT'), 'api.code_sequence has no forwarder and no INSERT grant');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.role_field_permission'::regclass AND a.grantee = 'api_owner'::regrole AND a.privilege_type IN ('INSERT','UPDATE','DELETE')), 'api_owner holds no direct write grant on public.role_field_permission');

SELECT * FROM finish();
ROLLBACK;
