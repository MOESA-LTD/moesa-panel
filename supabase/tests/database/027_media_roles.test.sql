CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The media permissions given to the roles that exist (027): a role that may change products gets
-- the media group, and deleting files only when it may also change the company; a reading role
-- gets nothing, and granting again changes nothing. Then a branch holding a file, its link and a
-- document citing it is deleted (delete_branch): its rows go with it, its Storage object stays.
-- What it writes is rolled back.
BEGIN;

SELECT plan(9);

-- A company of its own (as the migration role, since signed-in users do not create companies)
-- with three roles of its own making, as they were before 027.
INSERT INTO public.tenant (display_name) VALUES ('pgTAP Media Roles');

SELECT set_config('test.company', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'pgTAP Media Roles')::TEXT, TRUE);

INSERT INTO public.role (display_name, tenant_id)
SELECT name, current_setting('test.company')::UUID
FROM unnest(ARRAY['Boss', 'Planner', 'Viewer']) AS name;

INSERT INTO public.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM public.role r
JOIN public.permission p ON CASE r.display_name
    WHEN 'Boss' THEN p.resource_name IN ('public.product', 'public.tenant') AND p.command IN ('select', 'update')
    WHEN 'Planner' THEN p.resource_name = 'public.product' AND p.command IN ('select', 'update')
    ELSE p.command = 'select' AND p.group_name <> 'media'
END
WHERE r.tenant_id = current_setting('test.company')::UUID;

SELECT private.grant_media_permissions();

-- The media permissions of one of the company's roles, as resource:command.
CREATE OR REPLACE FUNCTION pg_temp.media_of (role_name TEXT) RETURNS TEXT[] LANGUAGE sql AS $$
    SELECT coalesce(array_agg(p.resource_name || ':' || p.command ORDER BY p.resource_name, p.command), '{}')
    FROM public.role r
    JOIN public.role_permission rp ON rp.role_id = r.id
    JOIN public.permission p ON p.id = rp.permission_id
    WHERE r.tenant_id = current_setting('test.company')::UUID
      AND r.display_name = role_name
      AND p.group_name = 'media';
$$;

SELECT is(
    pg_temp.media_of('Boss'),
    (SELECT array_agg(p.resource_name || ':' || p.command ORDER BY p.resource_name, p.command)
     FROM public.permission p WHERE p.group_name = 'media'),
    'a role changing products and the company gets every media permission'
);

SELECT is(
    pg_temp.media_of('Planner'),
    (SELECT array_agg(p.resource_name || ':' || p.command ORDER BY p.resource_name, p.command)
     FROM public.permission p
     WHERE p.group_name = 'media' AND NOT (p.resource_name = 'public.media' AND p.command = 'delete')),
    'a role changing products gets them all but deleting files'
);

SELECT is(pg_temp.media_of('Viewer'), '{}'::TEXT[], 'a reading role gets none');

SELECT lives_ok($$ SELECT private.grant_media_permissions() $$, 'granting again is harmless');

SELECT is(
    (SELECT count(*)::INT FROM public.role_permission rp
     JOIN public.role r ON r.id = rp.role_id
     JOIN public.permission p ON p.id = rp.permission_id
     WHERE r.tenant_id = current_setting('test.company')::UUID AND p.group_name = 'media'),
    (SELECT 2 * count(*)::INT - 1 FROM public.permission p WHERE p.group_name = 'media'),
    'and adds nothing'
);

-- A branch of MOESA LTD holding a file, linked to a customer and cited by its document, deleted by
-- MOESA's owner. Written as the migration role; the deletion runs as the owner.
SELECT set_config('test.moesa', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);
SELECT set_config('test.baris', (SELECT u.id FROM public.user u WHERE u.email = 'baris@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.m271', '00000000-0000-4000-8000-000000000271', TRUE);

INSERT INTO public.tenant (display_name, parent_id) VALUES ('pgTAP Media Branch', current_setting('test.moesa')::UUID);

SELECT set_config('test.branch', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'pgTAP Media Branch')::TEXT, TRUE);

-- Each step below is a request of its own, so its audit transaction (010_init_audit.sql) is the
-- branch's, as it would be outside this test's single transaction. (Were the deletion to join the
-- branch's audit transaction, the cascade would remove that transaction under it and fail with
-- audit_log_transaction_id_fkey: an artefact of writing and deleting a branch in one transaction,
-- which no request does.)
SELECT set_config('audit.transaction_id', '', TRUE);

INSERT INTO public.customer (tenant_id, code, display_name, commercial_model)
VALUES (current_setting('test.branch')::UUID, 'PGT', 'pgTAP customer', 'trading_partner');

SELECT set_config('test.customer', (SELECT c.id FROM public.customer c
                                    WHERE c.tenant_id = current_setting('test.branch')::UUID)::TEXT, TRUE);

INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('media', current_setting('test.branch') || '/' || current_setting('test.m271') || '/c.pdf',
        '{"mimetype": "application/pdf", "size": 1000}'::JSONB);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
VALUES (current_setting('test.m271')::UUID, current_setting('test.branch')::UUID, current_setting('test.customer')::UUID,
        current_setting('test.branch') || '/' || current_setting('test.m271') || '/c.pdf', 'c.pdf', 'application/pdf', 1);

INSERT INTO public.media_link (tenant_id, media_id, entity_type, entity_id, role)
VALUES (current_setting('test.branch')::UUID, current_setting('test.m271')::UUID, 'customer',
        current_setting('test.customer')::UUID, 'attachment');

INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, media_id)
VALUES (current_setting('test.branch')::UUID, current_setting('test.customer')::UUID, 'customer',
        current_setting('test.customer')::UUID, 'contract', current_setting('test.m271')::UUID);

SELECT set_config('audit.transaction_id', '', TRUE);

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

SELECT lives_ok(
    $$ SELECT public.delete_branch(current_setting('test.branch')::UUID) $$,
    'the owner deletes a branch holding media'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::INT FROM public.media WHERE tenant_id = current_setting('test.branch')::UUID)
    + (SELECT count(*)::INT FROM public.media_link WHERE tenant_id = current_setting('test.branch')::UUID)
    + (SELECT count(*)::INT FROM public.document WHERE tenant_id = current_setting('test.branch')::UUID),
    0,
    'its media, links and documents go with it'
);

SELECT is(
    (SELECT count(*)::INT FROM public.tenant WHERE id = current_setting('test.branch')::UUID),
    0,
    'and the branch is gone'
);

SELECT is(
    (SELECT count(*)::INT FROM storage.objects
     WHERE bucket_id = 'media' AND name LIKE current_setting('test.branch') || '/%'),
    1,
    'its files stay in Storage, for a service-role cleanup (see 027_media_roles.sql)'
);

SELECT * FROM finish();

ROLLBACK;
