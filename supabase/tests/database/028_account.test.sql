CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The account area (028) on the seed.sql demo users: the public `avatar` bucket and its limits
-- (PNG, JPEG, WebP, no SVG, up to 1 MiB), its policies (a user lists the folder named by their own
-- id and writes, replaces and removes there only avatar.<ext>; anon writes nothing) and public.my_memberships
-- (the caller's tenant roles by name, one row per tenant, nothing of another user's). What it
-- writes is rolled back.
BEGIN;

SELECT plan(16);

SELECT set_config('test.moesa', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);
SELECT set_config('test.atlas', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);
SELECT set_config('test.koordinator', (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.ayse', (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test')::TEXT, TRUE);

SELECT is((SELECT public FROM storage.buckets WHERE id = 'avatar'), TRUE, 'avatar bucket is public');

SELECT is(
    (SELECT file_size_limit FROM storage.buckets WHERE id = 'avatar'),
    1048576::BIGINT,
    'avatar bucket takes up to 1 MiB'
);

SELECT is(
    (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'avatar'),
    ARRAY['image/png', 'image/jpeg', 'image/webp'],
    'avatar bucket types, no SVG'
);

SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/avatar.png') $$,
    'a user uploads into their own folder'
);

SELECT throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.ayse') || '/avatar.png') $$,
    '42501',
    NULL,
    'not into another user''s folder'
);

SELECT throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', 'avatar.png') $$,
    '42501',
    NULL,
    'not outside a folder'
);

SELECT throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/x/avatar.png') $$,
    '42501',
    NULL,
    'not into a folder nested in their own'
);

SELECT throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/other.png') $$,
    '42501',
    NULL,
    'not under another file name'
);

SELECT is(
    (SELECT roles FROM public.my_memberships() WHERE tenant_id = current_setting('test.moesa')::UUID),
    ARRAY['coordinator'],
    'my_memberships names the user''s roles in a tenant'
);

RESET ROLE;

SELECT private.impersonate(current_setting('test.ayse')::UUID, current_setting('test.atlas')::UUID);

SELECT is(
    (SELECT count(*)::INT FROM storage.objects
     WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'),
    0,
    'another user cannot list the folder'
);

-- A data-modifying WITH must be at the top level, so the assertion selects from it.
WITH u AS (
    UPDATE storage.objects SET metadata = '{}'
    WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'
    RETURNING 1
)
SELECT is(count(*)::INT, 0, 'another user cannot replace the file') FROM u;

DELETE FROM storage.objects
WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png';

SELECT is(
    (SELECT count(*)::INT FROM public.my_memberships() WHERE tenant_id = current_setting('test.moesa')::UUID),
    0,
    'my_memberships shows only the caller''s roles'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::INT FROM storage.objects
     WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'),
    1,
    'another user cannot delete the file'
);

SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

DELETE FROM storage.objects
WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png';

RESET ROLE;

SELECT is(
    (SELECT count(*)::INT FROM storage.objects
     WHERE bucket_id = 'avatar' AND name = current_setting('test.koordinator') || '/avatar.png'),
    0,
    'the owner deletes their file'
);

SELECT ok(NOT has_function_privilege('anon', 'public.my_memberships()', 'EXECUTE'), 'anon cannot call my_memberships');

SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatar', current_setting('test.koordinator') || '/avatar.webp') $$,
    '42501',
    NULL,
    'anon cannot upload'
);

SELECT * FROM finish();

ROLLBACK;
