CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer targets and the file check (045) on the demo companies of seed.sql: the caller's
-- candidate targets come with their refusal (none to a branch, none to a company both of whose
-- roots the caller owns, read-only for an owner, owner required for a member); a file missing from
-- Storage leaves the transfer partial, and that check cannot be reverted from the log; once every
-- file is in, the transfer is done; a user who neither started the transfer nor may transfer does
-- not find it; both functions are SECURITY DEFINER with an empty search_path. A customer an
-- earlier transfer is still copying files into is refused (transfer_files_pending), in the options
-- given that customer and in the rehearsal; so is a package file such a transfer has not copied
-- yet. What it writes is rolled back.
BEGIN;

SELECT plan(14);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('trading', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Trading GmbH')),
    ('eski', (SELECT id FROM public.tenant WHERE display_name = 'Eski Ticaret')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('baris', (SELECT id FROM public.user WHERE email = 'baris@moesa-panel.test')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('transfer', '00000000-0000-4000-8000-000000045001'::UUID)
) AS x (k, v);

-- The two files of the transfer, in Europe's folder.
SELECT set_config('test.first', current_setting('test.europe') || '/00000000-0000-4000-8000-000000045002/x.png', TRUE);
SELECT set_config('test.second', current_setting('test.europe') || '/00000000-0000-4000-8000-000000045003/y.png', TRUE);

-- 1–2. akif, from MOESA: its branch Europe is a target, MOESA itself is not.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(
    public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.europe'), 'same_company', TRUE, 'refusal', NULL)),
    'a branch of the same company is an allowed target'
);
SELECT ok(
    NOT (public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.moesa')))),
    'the source is not a target'
);
RESET ROLE;

-- 3. baris owns both companies.
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(
    public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.trading'), 'same_company', FALSE, 'refusal', NULL)),
    'another company both of whose roots the caller owns is an allowed target'
);
RESET ROLE;

-- 4. baris owns Eski Ticaret too, which has no subscription: the owner check passes, then read-only.
INSERT INTO public.tenant_owner (tenant_id, user_id) VALUES (current_setting('test.eski')::UUID, current_setting('test.baris')::UUID);
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(
    public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.eski'), 'refusal', 'transfer_target_read_only')),
    'a read-only target is listed with its refusal'
);
RESET ROLE;

-- 5. akif is a member of Eski Ticaret but owns no root: the owner check comes first. Eski is
-- read-only, so the membership goes in past the plan check.
ALTER TABLE public.tenant_user DISABLE TRIGGER check_user_limit;
INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (current_setting('test.eski')::UUID, current_setting('test.akif')::UUID);
ALTER TABLE public.tenant_user ENABLE TRIGGER check_user_limit;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(
    public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.eski'), 'refusal', 'transfer_owner_required')),
    'another company is listed with the owner refusal for a member'
);
RESET ROLE;

-- 6. A transfer into Europe with two files, only the first of them in Storage.
INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, mode, path, started_by, report, files, files_status)
VALUES (
    current_setting('test.transfer')::UUID, current_setting('test.europe')::UUID, current_setting('test.moesa')::UUID,
    current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}',
    jsonb_build_array(jsonb_build_object('to', current_setting('test.first')), jsonb_build_object('to', current_setting('test.second'))),
    'pending'
);
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('media', current_setting('test.first'), '{"mimetype": "image/png", "size": 1000}'::JSONB);
SELECT set_config('audit.transaction_id', '', TRUE);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID);
SELECT set_config('test.check', to_jsonb(public.transfer_check_files(current_setting('test.transfer')::UUID))::TEXT, TRUE);
SELECT set_config('test.check_tx', current_setting('audit.transaction_id'), TRUE);
SELECT is(
    (SELECT row(c ->> 'files_status', c -> 'missing_files') FROM (SELECT current_setting('test.check')::JSONB AS c) s),
    row('partial'::TEXT, jsonb_build_array(current_setting('test.second'))),
    'a missing source file leaves the transfer partial'
);
RESET ROLE;

-- 7. The check's audit transaction is a transfer's.
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.europe')::UUID);
SELECT throws_like(
    $$ SELECT public.revert_audit_transaction(current_setting('test.check_tx')::UUID) $$,
    '%audit_transfer_not_revertable%',
    'the file check cannot be reverted'
);
RESET ROLE;

-- 8. The second file in: done.
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('media', current_setting('test.second'), '{"mimetype": "image/png", "size": 1000}'::JSONB);
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID);
SELECT is(
    (SELECT row(t.files_status, t.missing_files) FROM public.transfer_check_files(current_setting('test.transfer')::UUID) t),
    row('done'::TEXT, '{}'::TEXT[]),
    'with every file in, the transfer is done'
);
RESET ROLE;

-- 9. The coordinator neither started it nor may transfer.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.europe')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_check_files(current_setting('test.transfer')::UUID) $$,
    '%transfer_not_found%',
    'a user who may not transfer does not find the transfer'
);
RESET ROLE;

-- 10–11. A transfer into MOESA's THO whose files are still pending: THO is not transferred again.
INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, target_customer_id, mode, path, started_by, report, files, files_status)
VALUES (
    '00000000-0000-4000-8000-000000045011', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
    gen_random_uuid(), current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}', '[]', 'pending'
);
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(
    public.transfer_options(current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.europe'), 'refusal', 'transfer_files_pending'))
    AND public.transfer_options(current_setting('test.moesa')::UUID) -> 'targets'
        @> jsonb_build_array(jsonb_build_object('id', current_setting('test.europe'), 'refusal', NULL)),
    'given the customer, the options refuse it while files are pending'
);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_files_pending%',
    'and so does the rehearsal'
);
RESET ROLE;

-- 12–13. That transfer done, but another one (into some other customer) still has to copy a file
-- of a THO media row: a missing one blocks THO, a copied one does not.
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('media', current_setting('test.moesa') || '/00000000-0000-4000-8000-000000045012/z.png', '{"mimetype": "image/png", "size": 1000}'::JSONB);
INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
VALUES ('00000000-0000-4000-8000-000000045012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000045012/z.png', 'z.png', 'image/png', 1000);
SELECT set_config('moesa.rules_bypass', '', TRUE);
UPDATE public.transfer SET files_status = 'done' WHERE id = '00000000-0000-4000-8000-000000045011';
INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, target_customer_id, mode, path, started_by, report, files, files_status, missing_files)
VALUES (
    '00000000-0000-4000-8000-000000045013', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
    gen_random_uuid(), gen_random_uuid(), 'copy', 'copy', current_setting('test.akif')::UUID, '{}',
    jsonb_build_array(jsonb_build_object(
        'media_id', '00000000-0000-4000-8000-000000045012', 'from', 'x', 'keep_source', FALSE,
        'to', current_setting('test.moesa') || '/00000000-0000-4000-8000-000000045012/z.png'
    )),
    'partial', ARRAY[current_setting('test.moesa') || '/00000000-0000-4000-8000-000000045012/z.png']
);
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_files_pending%',
    'a package file another transfer has not copied yet is refused'
);
RESET ROLE;
UPDATE public.transfer SET missing_files = '{}' WHERE id = '00000000-0000-4000-8000-000000045013';
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    'a package file a partial transfer did copy is not'
);
RESET ROLE;

-- 14. Both run as their owner, with an empty search_path; authenticated may call them, anon may not.
SELECT is(
    ARRAY(
        SELECT p.proname::TEXT FROM pg_proc p
        WHERE p.proname IN ('transfer_options', 'transfer_check_files')
          AND p.pronamespace = 'public'::REGNAMESPACE
          AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
          AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY 1
    ),
    ARRAY['transfer_check_files', 'transfer_options'],
    'both functions are SECURITY DEFINER with an empty search_path, for authenticated only'
);

SELECT * FROM finish();

ROLLBACK;
