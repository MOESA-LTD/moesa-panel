CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(9);

SELECT has_table('public', 'document', 'document table');

SELECT has_function('private', 'document_check_entity', 'document_check_entity');

-- The rest runs as a signed-in owner of a demo company. Its id is kept in a setting: the signed-in
-- user cannot call private functions.
SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

-- `incident` is a Phase 2 table: while it does not exist, any entity_id passes. (The row-missing
-- branch is tested with suppliers, the first referenced table to exist.)
SELECT lives_ok(
    $$
        INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name)
        VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'spec_sheet', 1,
                'https://example.test/spec-v1.pdf', 'spec-v1.pdf')
    $$,
    'v1 attaches to an entity whose table does not exist yet'
);

INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name)
VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'spec_sheet', 2,
        'https://example.test/spec-v2.pdf', 'spec-v2.pdf');

SELECT is(
    (SELECT status::TEXT FROM public.document
     WHERE entity_id = '00000000-0000-4000-8000-000000000016' AND type = 'spec_sheet' AND version = 1),
    'superseded',
    'a new version supersedes the older one'
);

SELECT is(
    (SELECT status::TEXT FROM public.document
     WHERE entity_id = '00000000-0000-4000-8000-000000000016' AND type = 'spec_sheet' AND version = 2),
    'draft',
    'the new version keeps its own status'
);

SELECT throws_ok(
    $$
        INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name, status,
                                     is_signed, is_stamped, sent_from_official_email)
        VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'contract', 1,
                'https://example.test/contract.pdf', 'contract.pdf', 'signed', TRUE, TRUE, TRUE)
    $$,
    '23514',
    'document_signed_incomplete',
    'signed needs signature, stamp, official e-mail and issue date'
);

SELECT lives_ok(
    $$
        INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name, status,
                                     is_signed, is_stamped, sent_from_official_email, issued_on)
        VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'contract', 1,
                'https://example.test/contract.pdf', 'contract.pdf', 'signed', TRUE, TRUE, TRUE, '2026-11-03')
    $$,
    'signed with every requirement met'
);

SELECT throws_ok(
    $$ DELETE FROM public.document WHERE entity_id = '00000000-0000-4000-8000-000000000016' $$,
    '42501',
    NULL,
    'documents are never deleted'
);

-- Another company's owner sees none of them.
RESET ROLE;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ali@moesa-panel.test'),
    (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')
);

SELECT is(
    (SELECT count(*)::INT FROM public.document WHERE entity_id = '00000000-0000-4000-8000-000000000016'),
    0,
    'another tenant does not see the documents'
);

SELECT * FROM finish();

ROLLBACK;
