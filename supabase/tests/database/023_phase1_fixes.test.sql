CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The Phase 1 fixes on the MOESA demo company of seed.sql: approved documents need signatures,
-- superseded ones stay superseded and documents keep their identity; closed customers get no projects. What it writes is rolled back.
BEGIN;

SELECT plan(7);

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);
SELECT set_config('test.tho', (SELECT c.id FROM public.customer c
                               WHERE c.tenant_id = current_setting('test.tenant_id')::UUID AND c.code = 'THO')::TEXT, TRUE);
SELECT set_config('test.tips', (SELECT p.id FROM public.product p
                                WHERE p.tenant_id = current_setting('test.tenant_id')::UUID AND p.sku = 'THO-TIPS-6-50')::TEXT, TRUE);

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

-- Approved documents need the signature, the stamp, the official e-mail and the date.
SELECT throws_ok(
    $$
        INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, status, url)
        VALUES (current_setting('test.tenant_id')::UUID, current_setting('test.tho')::UUID, 'product',
                current_setting('test.tips')::UUID, 'spec_sheet', 'approved', 'https://example.test/tips-v1.pdf')
    $$,
    '23514',
    'document_signed_incomplete',
    'an approved spec sheet without signature, stamp, official e-mail and date is rejected'
);

SELECT is(
    (SELECT e.has_signed_spec FROM public.product_evidence e WHERE e.product_id = current_setting('test.tips')::UUID),
    FALSE,
    'the product still has no signed spec sheet'
);

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, version, status, url,
                             is_signed, is_stamped, sent_from_official_email, issued_on)
VALUES ('00000000-0000-4000-8000-000000000231', current_setting('test.tenant_id')::UUID,
        current_setting('test.tho')::UUID, 'product', current_setting('test.tips')::UUID, 'spec_sheet', 1, 'approved',
        'https://example.test/tips-v1.pdf', TRUE, TRUE, TRUE, current_date);

SELECT is(
    (SELECT e.has_signed_spec FROM public.product_evidence e WHERE e.product_id = current_setting('test.tips')::UUID),
    TRUE,
    'a fully flagged approved spec sheet counts as a signed spec sheet'
);

-- Version 2 supersedes version 1, which stays superseded.
INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, version, status, url)
VALUES (current_setting('test.tenant_id')::UUID, current_setting('test.tho')::UUID, 'product',
        current_setting('test.tips')::UUID, 'spec_sheet', 2, 'draft', 'https://example.test/tips-v2.pdf');

SELECT throws_ok(
    $$ UPDATE public.document SET status = 'signed' WHERE id = '00000000-0000-4000-8000-000000000231' $$,
    '23514',
    'document_superseded_sticky',
    'a superseded document cannot be signed again'
);

SELECT throws_ok(
    $$ UPDATE public.document SET version = 3 WHERE id = '00000000-0000-4000-8000-000000000231' $$,
    '23514',
    'document_identity_immutable',
    'a document''s version cannot be changed'
);

SELECT lives_ok(
    $$ UPDATE public.document SET notes = 'kept for the record' WHERE id = '00000000-0000-4000-8000-000000000231' $$,
    'a superseded document''s notes can still be edited'
);

-- A closed customer gets no new projects.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model, status)
VALUES ('00000000-0000-4000-8000-000000000232', current_setting('test.tenant_id')::UUID, 'CLS', 'Closed Trading',
        'trading_partner', 'closed');

SELECT throws_ok(
    $$
        INSERT INTO public.project (tenant_id, customer_id, display_name, type, path, packages)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000232', 'Too late', 'npi',
                'a_sourcing', ARRAY['A1'])
    $$,
    '23514',
    'customer_closed',
    'a closed customer gets no new projects'
);

SELECT * FROM finish();

ROLLBACK;
