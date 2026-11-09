CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 064: the cutover. anon and authenticated hold nothing on any public table or view, so the masked
-- views in api (owned by api_owner) are the only user-side data path. service_role and api_owner keep
-- their grants; api_owner still cannot write the tables its views only read (Task 10's carry).
BEGIN;

SELECT plan(27);

SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated') $$, 'no public relation grants anything to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclrole = 'postgres'::regrole
   AND d.defaclobjtype IN ('r', 'S') AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=') $$, 'new public tables and sequences grant nothing to anon/authenticated');
-- Every relation in public, sequences included: no ACL entry for anon, authenticated or PUBLIC (grantee 0).
-- This also covers objects created under supabase_admin's default privileges, which a hosted migration may not alter.
SELECT is_empty($$ SELECT c.relname, c.relkind FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
     AND x.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole) $$, 'no public relation or sequence has an ACL entry for anon, authenticated or PUBLIC');
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

-- Task 11's guard: outside tests authenticated has no USAGE on private (create_test_helpers grants it
-- for the transaction, so this runs first), and the roles PostgREST can reach have only the expected
-- memberships: no JWT role claim can switch into an owner that bypasses the masked views.
SELECT ok(NOT has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has no USAGE on schema private');
SELECT is(ARRAY(SELECT m.roleid::REGROLE::TEXT FROM pg_auth_members m WHERE m.member = 'api_owner'::REGROLE ORDER BY 1), ARRAY['authenticated'],
   'api_owner is a member of authenticated only');
SELECT is(ARRAY(SELECT m.roleid::REGROLE::TEXT FROM pg_auth_members m WHERE m.member = 'rfp_writer'::REGROLE ORDER BY 1), ARRAY['authenticated'],
   'rfp_writer is a member of authenticated only');
SELECT is(ARRAY(SELECT m.roleid::REGROLE::TEXT FROM pg_auth_members m WHERE m.member = 'authenticator'::REGROLE ORDER BY 1), ARRAY['anon', 'authenticated', 'service_role'],
   'authenticator can switch only to anon, authenticated and service_role');

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
-- The project's tasks done, so its first gate can pass (as in 058).
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.project')::UUID;

-- rfp_writer: the dedicated owner of private.save_role_field_rights, so role field rights are written
-- under the real generated RLS policies (it is a member of authenticated, not BYPASSRLS).
SELECT ok(NOT (SELECT rolcanlogin OR rolbypassrls FROM pg_roles WHERE rolname = 'rfp_writer'), 'rfp_writer cannot log in and does not bypass RLS');
SELECT is(ARRAY(SELECT DISTINCT m.member::REGROLE::TEXT FROM pg_auth_members m WHERE m.roleid = 'rfp_writer'::REGROLE), ARRAY['postgres'],
   'only postgres is a member of rfp_writer');
SELECT is(ARRAY(SELECT p.oid::REGPROCEDURE::TEXT FROM pg_proc p WHERE p.proowner = 'rfp_writer'::REGROLE), ARRAY['private.save_role_field_rights(uuid,jsonb)'],
   'rfp_writer owns exactly save_role_field_rights');

-- C1 fixture (as 050): MOESA LTD's coordinator may edit roles here, but still writes no supplier terms.
INSERT INTO public.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM public.role r
JOIN public.permission p ON p.resource_name IN ('public.role', 'public.role_permission', 'public.role_field_permission')
   AND p.command IN ('insert', 'update', 'delete')
WHERE r.tenant_id = current_setting('test.moesa')::UUID AND r.display_name = 'coordinator'
ON CONFLICT DO NOTHING;
SELECT set_config('test.europe_management', (SELECT r.id FROM public.role r JOIN public.tenant t ON t.id = r.tenant_id
   WHERE r.display_name = 'management' AND t.display_name = 'MOESA Europe')::TEXT, TRUE);
SELECT set_config('test.coordinator_role', (SELECT r.id FROM public.role r
   WHERE r.display_name = 'coordinator' AND r.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);

-- As koordinator in MOESA LTD.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT matches(t.error_of($$ SELECT 1 FROM public.product LIMIT 1 $$), '^42501:permission denied for table product', 'T8c direct base table refused');
SELECT matches(t.error_of($$ SELECT 1 FROM public.product_with_evidence LIMIT 1 $$), '^42501:permission denied for view product_with_evidence', 'old public views refused');
SELECT lives_ok($$ SELECT * FROM api.product_with_evidence LIMIT 1 $$, 'api views work after the cutover');
SELECT is((SELECT note FROM public.pass_gate(current_setting('test.gate')::UUID, NULL)), 'gate secret', 'converted RPCs work after the cutover and return what the caller may read');
SELECT ok(private.can_read_media_file(current_setting('test.pi_object')), 'Storage reads still work for an internal user');

SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM api.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'::JSONB) $$,
   'a legitimate save_role with field rights works (written under RLS by rfp_writer)');
SELECT results_eq($$ SELECT field, can_read, can_write FROM api.role_field_permission WHERE role_id = current_setting('test.t_restricted')::UUID $$,
   $$ VALUES ('deposit_rate', TRUE, FALSE) $$, '... and stored exactly the given right');
SELECT matches(t.error_of($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.europe_management'), 'display_name', 'management'),
   '{}'::UUID[], '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'::JSONB) $$),
   '^(42501|PGRST):', 'cross-tenant: save_role on another tenant''s role is refused');
SELECT throws_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.coordinator_role'), 'display_name', 'coordinator'),
   ARRAY(SELECT permission_id FROM api.role_permission WHERE role_id = current_setting('test.coordinator_role')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB) $$,
   '42501', 'field_grant_exceeds_own', 'self-grant: a write the coordinator lacks, on their own role, is refused');
-- The helper itself, called as save_role calls it (as api_owner, the caller's claims kept): the real
-- policies refuse another tenant's role, and the S7 trigger (not bypassed: claims are present) refuses
-- a right beyond the caller's own.
SET LOCAL ROLE api_owner;
SELECT matches(t.error_of($$ SELECT private.save_role_field_rights(current_setting('test.europe_management')::UUID,
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'::JSONB) $$),
   '^42501:You don''t have permission to (modify|"create") on role$', 'the helper writes under the real RLS policies (another tenant''s role refused)');
SELECT throws_ok($$ SELECT private.save_role_field_rights(current_setting('test.t_restricted')::UUID,
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB) $$,
   '42501', 'field_grant_exceeds_own', 'inside the helper the S7 trigger still applies C1');
SELECT ok(NOT private.field_guard_bypassed(), 'field_guard_bypassed() is false with request claims');

RESET ROLE;
SELECT private.unimpersonate();

SELECT * FROM finish();
ROLLBACK;
