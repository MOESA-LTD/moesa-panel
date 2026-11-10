CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 062: roles that hold a public.role_permission permission hold the matching public.role_field_permission one,
-- so the people editing roles can read the field rights.
BEGIN;

SELECT plan(3);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

SELECT is((SELECT count(*)::INT
   FROM public.role_permission rp
   JOIN public.permission p ON p.id = rp.permission_id AND p.resource_name = 'public.role_permission'
   WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permission rp2
      JOIN public.permission fp ON fp.id = rp2.permission_id AND fp.resource_name = 'public.role_field_permission'
      WHERE rp2.role_id = rp.role_id AND fp.command = p.command)), 0,
   'every role-permission right has its field-right twin');

-- As koordinator (coordinator, MOESA LTD).
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT ok((SELECT count(*) FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id
   WHERE r.tenant_id = current_setting('test.moesa')::UUID) > 0, 'a coordinator reads its tenant''s role field rights');
SELECT is((SELECT count(*)::INT FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id
   WHERE r.tenant_id <> current_setting('test.moesa')::UUID), 0, 'and no other tenant''s');

SELECT * FROM finish();
ROLLBACK;
