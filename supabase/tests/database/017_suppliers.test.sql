CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(12);

SELECT has_table('public', 'supplier', 'supplier table');

SELECT has_table('public', 'supplier_contact', 'supplier_contact table');

-- Another company's supplier, made before signing in (the signed-in user cannot write there).
SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT set_config('test.other_tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')::TEXT, TRUE);

INSERT INTO public.supplier (id, tenant_id, code, display_name, country)
VALUES ('00000000-0000-4000-8000-000000000171', current_setting('test.other_tenant_id')::UUID, 'CN9', 'Nova Supplier', 'China');

-- The rest runs as a signed-in owner of Atlas.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

SELECT throws_ok(
    $$
        INSERT INTO api.supplier (tenant_id, code, display_name, country)
        VALUES (current_setting('test.tenant_id')::UUID, 'cn1', 'Lowercase', 'China')
    $$,
    '23514',
    NULL,
    'a code is two capital letters and one to three digits'
);

INSERT INTO api.supplier (id, tenant_id, code, display_name, country)
VALUES ('00000000-0000-4000-8000-000000000172', current_setting('test.tenant_id')::UUID, 'CN1', 'Atlas Supplier', 'China');

INSERT INTO api.supplier_contact (tenant_id, supplier_id, name, email, is_primary)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000172', 'Li Wei', 'li@example.test', TRUE);

SELECT throws_ok(
    $$
        INSERT INTO api.supplier (tenant_id, code, display_name, country)
        VALUES (current_setting('test.tenant_id')::UUID, 'CN1', 'Duplicate', 'China')
    $$,
    '23505',
    NULL,
    'a code is used once per tenant'
);

-- Now that suppliers exist, a document's supplier must exist in the document's tenant.
SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, entity_type, entity_id, type, url)
        VALUES (current_setting('test.tenant_id')::UUID, 'supplier', gen_random_uuid(), 'contract',
                'https://example.test/contract.pdf')
    $$,
    '23503',
    'document_entity_missing',
    'a document cannot point at a supplier that does not exist'
);

SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, entity_type, entity_id, type, url)
        VALUES (current_setting('test.tenant_id')::UUID, 'supplier', '00000000-0000-4000-8000-000000000171', 'contract',
                'https://example.test/contract.pdf')
    $$,
    '23503',
    'document_entity_missing',
    'a document cannot point at another tenant''s supplier'
);

SELECT lives_ok(
    $$
        INSERT INTO api.document (tenant_id, entity_type, entity_id, type, url)
        VALUES (current_setting('test.tenant_id')::UUID, 'supplier', '00000000-0000-4000-8000-000000000172', 'contract',
                'https://example.test/contract.pdf')
    $$,
    'a document attaches to the tenant''s own supplier'
);

SELECT throws_ok(
    $$
        INSERT INTO api.supplier_contact (tenant_id, supplier_id, name)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000171', 'Intruder')
    $$,
    '23503',
    NULL,
    'a contact cannot point at another tenant''s supplier'
);

SELECT is(
    (SELECT count(*)::INT FROM api.supplier s
     JOIN api.supplier_contact c ON c.supplier_id = s.id
     WHERE s.code = 'CN1' AND s.tenant_id = current_setting('test.tenant_id')::UUID),
    1,
    'Atlas sees its own CN1 and its contact'
);

SELECT is(
    (SELECT count(*)::INT FROM api.supplier WHERE id = '00000000-0000-4000-8000-000000000171'),
    0,
    'another tenant''s supplier is not visible'
);

-- Another company's owner sees none of Atlas's suppliers or contacts.
RESET ROLE;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ali@moesa-panel.test'),
    current_setting('test.other_tenant_id')::UUID
);

SELECT is(
    (SELECT count(*)::INT FROM api.supplier_contact WHERE supplier_id = '00000000-0000-4000-8000-000000000172'),
    0,
    'another tenant does not see the contacts'
);

-- Suppliers are suspended rather than deleted (no delete permission); the cascade is a database rule.
RESET ROLE;

DELETE FROM public.supplier WHERE id = '00000000-0000-4000-8000-000000000172';

SELECT is(
    (SELECT count(*)::INT FROM public.supplier_contact WHERE supplier_id = '00000000-0000-4000-8000-000000000172'),
    0,
    'deleting a supplier deletes its contacts'
);

SELECT * FROM finish();

ROLLBACK;
