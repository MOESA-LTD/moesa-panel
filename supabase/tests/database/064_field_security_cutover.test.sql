CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 064: the cutover. anon and authenticated hold nothing on any public table or view, so the masked
-- views in api (owned by api_owner) are the only user-side data path. service_role and api_owner keep
-- their grants; api_owner still cannot write the tables its views only read (Task 10's carry).
BEGIN;

SELECT plan(12);

SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated') $$, 'no public relation grants anything to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclrole = 'postgres'::regrole
   AND d.defaclobjtype = 'r' AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=') $$, 'new public tables grant nothing to anon/authenticated');
SELECT ok(has_table_privilege('service_role', 'public.product', 'SELECT') AND has_table_privilege('service_role', 'public.product', 'UPDATE'), 'the service role keeps the base');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

-- Task 10's carry: once authenticated's base grants are gone, api_owner holds no write of its own on
-- the tables whose api views are read-only.
SELECT ok(NOT has_table_privilege('api_owner', 'public.code_sequence', 'INSERT') AND NOT has_table_privilege('api_owner', 'public.code_sequence', 'UPDATE')
   AND NOT has_table_privilege('api_owner', 'public.code_sequence', 'DELETE'), 'api_owner cannot write public.code_sequence');
SELECT ok(NOT has_table_privilege('api_owner', 'public.transfer', 'INSERT') AND NOT has_table_privilege('api_owner', 'public.transfer', 'UPDATE')
   AND NOT has_table_privilege('api_owner', 'public.transfer', 'DELETE'), 'api_owner cannot write public.transfer');
SELECT ok(NOT has_table_privilege('api_owner', 'public.role_field_permission', 'INSERT') AND NOT has_table_privilege('api_owner', 'public.role_field_permission', 'UPDATE')
   AND NOT has_table_privilege('api_owner', 'public.role_field_permission', 'DELETE'), 'api_owner cannot write public.role_field_permission');

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
-- The project's tasks done, so its first gate can pass (as in 058).
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.project')::UUID;

-- As koordinator in MOESA LTD.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT matches(t.error_of($$ SELECT 1 FROM public.product LIMIT 1 $$), '^42501:permission denied for table product', 'T8c direct base table refused');
SELECT matches(t.error_of($$ SELECT 1 FROM public.product_with_evidence LIMIT 1 $$), '^42501:permission denied for view product_with_evidence', 'old public views refused');
SELECT lives_ok($$ SELECT * FROM api.product_with_evidence LIMIT 1 $$, 'api views work after the cutover');
SELECT is((SELECT note FROM public.pass_gate(current_setting('test.gate')::UUID, NULL)), 'gate secret', 'converted RPCs work after the cutover and return what the caller may read');
SELECT ok(private.can_read_media_file(current_setting('test.pi_object')), 'Storage reads still work for an internal user');

RESET ROLE;
SELECT private.unimpersonate();

SELECT * FROM finish();
ROLLBACK;
