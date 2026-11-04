CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(11);

SELECT has_table('public', 'document', 'document table');

SELECT has_function('private', 'document_check_entity', 'document_check_entity');

-- The rest runs as a signed-in owner of a demo company. Its id is kept in a setting: the signed-in
-- user cannot call private functions.
SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

-- The documents below belong to an incident of Atlas (035 made `incident` a table, so the
-- document's record must be there; the row-missing branch is tested with suppliers).
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000015', current_setting('test.tenant_id')::UUID, 'DOC', 'Doc Trading', 'trading_partner');
INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened)
VALUES ('00000000-0000-4000-8000-000000000016', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000015',
        'om', 's3', 'Documents', 'The incident the documents belong to.');

SELECT lives_ok(
    $$
        INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name)
        VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'spec_sheet', 1,
                'https://example.test/spec-v1.pdf', 'spec-v1.pdf')
    $$,
    'v1 attaches to its incident'
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

SELECT throws_ok(
    $$
        INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name, status,
                                     is_signed, is_stamped, sent_from_official_email, issued_on)
        VALUES (current_setting('test.tenant_id')::UUID, 'incident', '00000000-0000-4000-8000-000000000016', 'contract', 1,
                'https://example.test/contract.pdf', 'contract.pdf', 'signed', TRUE, FALSE, TRUE, '2026-11-03')
    $$,
    '23514',
    'document_signed_incomplete',
    'signed needs the stamp'
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

-- Its own version of the same entity, type and a higher version supersedes nothing of Atlas's. No
-- incident of Nova has that id, so the entity check is switched off for this insert (as postgres,
-- rolled back with the test).
RESET ROLE;

ALTER TABLE public.document DISABLE TRIGGER document_check_entity;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ali@moesa-panel.test'),
    (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')
);

INSERT INTO public.document (tenant_id, entity_type, entity_id, type, version, url, file_name)
VALUES ((SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım'), 'incident',
        '00000000-0000-4000-8000-000000000016', 'spec_sheet', 999, 'https://example.test/nova.pdf', 'nova.pdf');

RESET ROLE;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

SELECT is(
    (SELECT status::TEXT FROM public.document
     WHERE entity_id = '00000000-0000-4000-8000-000000000016' AND type = 'spec_sheet' AND version = 2),
    'draft',
    'another tenant''s higher version does not supersede this tenant''s documents'
);

SELECT * FROM finish();

ROLLBACK;
