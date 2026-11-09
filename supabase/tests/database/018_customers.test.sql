CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(10);

-- Another company's customer, made before signing in (the signed-in user cannot write there).
SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT set_config('test.other_tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')::TEXT, TRUE);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000181', current_setting('test.other_tenant_id')::UUID, 'NOV', 'Nova Customer',
        'trading_partner');

-- The rest runs as a signed-in owner of Atlas.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

INSERT INTO api.customer (id, tenant_id, code, display_name, commercial_model, packages)
VALUES ('00000000-0000-4000-8000-000000000182', current_setting('test.tenant_id')::UUID, 'THO', 'Thor Trading',
        'trading_partner', ARRAY['A0', 'B']);

INSERT INTO api.customer_warehouse (tenant_id, customer_id, display_name, type, is_default)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000182', 'Hamburg', 'third_party', TRUE);

-- Positive control: the rows the negative checks below compare against are there and visible.
SELECT is(
    (SELECT count(*)::INT FROM api.customer c
     JOIN api.customer_warehouse w ON w.customer_id = c.id
     WHERE c.code = 'THO' AND c.tenant_id = current_setting('test.tenant_id')::UUID),
    1,
    'Atlas sees its own THO and its warehouse'
);

SELECT throws_ok(
    $$
        INSERT INTO api.customer (tenant_id, code, display_name, commercial_model)
        VALUES (current_setting('test.tenant_id')::UUID, 'tho', 'Lowercase', 'trading_partner')
    $$,
    '23514',
    NULL,
    'a code is three capital letters'
);

SELECT throws_ok(
    $$
        UPDATE api.customer SET code = 'THX' WHERE id = '00000000-0000-4000-8000-000000000182'
    $$,
    '23514',
    'customer_code_immutable',
    'a customer code never changes'
);

SELECT throws_ok(
    $$
        INSERT INTO api.customer (tenant_id, code, display_name, commercial_model, packages)
        VALUES (current_setting('test.tenant_id')::UUID, 'PKG', 'Unknown package', 'trading_partner', ARRAY['X'])
    $$,
    '23514',
    NULL,
    'packages are among A0, A1, A2, B, C, D and E'
);

SELECT throws_ok(
    $$
        INSERT INTO api.customer_platform_account (tenant_id, customer_id, platform_id)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000182', 'no_such_platform')
    $$,
    '23503',
    NULL,
    'a platform account names a known platform'
);

SELECT throws_ok(
    $$
        INSERT INTO api.customer_warehouse (tenant_id, customer_id, display_name, type)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000181', 'Intruder', 'own')
    $$,
    '23503',
    NULL,
    'a warehouse cannot point at another tenant''s customer'
);

SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, customer_id, entity_type, entity_id, type, url)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000181', 'customer',
                '00000000-0000-4000-8000-000000000182', 'contract', 'https://example.test/contract.pdf')
    $$,
    '23503',
    NULL,
    'a document cannot name another tenant''s customer'
);

-- Customers are closed (status), not deleted.
SELECT throws_ok(
    $$
        DELETE FROM api.customer WHERE id = '00000000-0000-4000-8000-000000000182'
    $$,
    '42501',
    NULL,
    'customers cannot be deleted'
);

-- Another company's owner sees none of Atlas's customers.
RESET ROLE;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ali@moesa-panel.test'),
    current_setting('test.other_tenant_id')::UUID
);

SELECT is(
    (SELECT count(*)::INT FROM api.customer WHERE id = '00000000-0000-4000-8000-000000000182'),
    0,
    'another tenant does not see the customer'
);

-- The cascade is a database rule (no delete permission on customers).
RESET ROLE;

DELETE FROM public.customer WHERE id = '00000000-0000-4000-8000-000000000182';

SELECT is(
    (SELECT count(*)::INT FROM public.customer_warehouse WHERE customer_id = '00000000-0000-4000-8000-000000000182'),
    0,
    'deleting a customer deletes its warehouses'
);

SELECT * FROM finish();

ROLLBACK;
