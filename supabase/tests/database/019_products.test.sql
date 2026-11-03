CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(17);

-- GTIN check digits (GS1 mod-10), before signing in.
SELECT is(private.gtin_valid('4260696025800'), TRUE, 'a GTIN-13 with the right check digit is valid');

SELECT is(private.gtin_valid('4260696025801'), FALSE, 'a GTIN-13 with the wrong check digit is not');

SELECT is(private.gtin_valid('12345'), FALSE, 'five digits are not a GTIN');

SELECT is(private.gtin_valid('96385074'), TRUE, 'a GTIN-8 with the right check digit is valid');

SELECT is(private.gtin_valid('10614141000415'), TRUE, 'a GTIN-14 with the right check digit is valid');

SELECT is(private.gtin_valid('10614141000416'), FALSE, 'a GTIN-14 with the wrong check digit is not');

-- Another company's customer, made before signing in (the signed-in user cannot write there).
SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT set_config('test.other_tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')::TEXT, TRUE);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000191', current_setting('test.other_tenant_id')::UUID, 'NOV', 'Nova Customer',
        'trading_partner');

-- The rest runs as a signed-in owner of Atlas.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000192', current_setting('test.tenant_id')::UUID, 'THO', 'Thor Trading',
        'trading_partner');

INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, gtin)
VALUES ('00000000-0000-4000-8000-000000000193', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000192', 'THO-001', 'Garden Hose 15 m', '4260696025800');

-- Positive control: the row the negative checks below compare against is there and visible.
SELECT is(
    (SELECT count(*)::INT FROM public.product p
     WHERE p.sku = 'THO-001' AND p.tenant_id = current_setting('test.tenant_id')::UUID),
    1,
    'Atlas sees its own product'
);

SELECT throws_ok(
    $$
        INSERT INTO public.product (tenant_id, customer_id, sku, gtin)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000192', 'THO-BAD',
                '4260696025801')
    $$,
    '23514',
    NULL,
    'a GTIN with a wrong check digit is rejected'
);

SELECT throws_ok(
    $$
        INSERT INTO public.product (tenant_id, customer_id, sku, gtin)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000192', 'THO-002',
                '4260696025800')
    $$,
    '23505',
    NULL,
    'two active products cannot share a GTIN'
);

UPDATE public.product SET status = 'archived' WHERE id = '00000000-0000-4000-8000-000000000193';

SELECT lives_ok(
    $$
        INSERT INTO public.product (tenant_id, customer_id, sku, gtin)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000192', 'THO-002',
                '4260696025800')
    $$,
    'an archived product frees its GTIN'
);

SELECT throws_ok(
    $$
        INSERT INTO public.product (tenant_id, customer_id, sku)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000192', 'THO-001')
    $$,
    '23505',
    NULL,
    'a SKU is unique within its customer'
);

SELECT throws_ok(
    $$
        INSERT INTO public.product (tenant_id, customer_id, sku)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000191', 'NOV-001')
    $$,
    '23503',
    NULL,
    'a product cannot point at another tenant''s customer'
);

SELECT lives_ok(
    $$
        UPDATE public.product SET display_name = 'Garden Hose 20 m', unit_net_g = 1250
        WHERE id = '00000000-0000-4000-8000-000000000193'
    $$,
    'a product''s details can be changed'
);

-- Evidence: no signed spec sheet yet.
SELECT is(
    (SELECT has_signed_spec FROM public.product_evidence WHERE product_id = '00000000-0000-4000-8000-000000000193'),
    FALSE,
    'without a signed spec sheet the product has no spec evidence'
);

INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, version, status, issued_on,
                             is_signed, is_stamped, sent_from_official_email, url)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000192', 'product',
        '00000000-0000-4000-8000-000000000193', 'spec_sheet', 2, 'signed', '2026-11-01', TRUE, TRUE, TRUE,
        'https://example.test/spec-v2.pdf');

SELECT is(
    (SELECT has_signed_spec FROM public.product_evidence WHERE product_id = '00000000-0000-4000-8000-000000000193'),
    TRUE,
    'a signed spec sheet is spec evidence'
);

SELECT is(
    (SELECT spec_version FROM public.product_evidence WHERE product_id = '00000000-0000-4000-8000-000000000193'),
    2,
    'the evidence names the signed spec sheet''s version'
);

-- Products are archived (status), not deleted.
SELECT throws_ok(
    $$
        DELETE FROM public.product WHERE id = '00000000-0000-4000-8000-000000000193'
    $$,
    '42501',
    NULL,
    'products cannot be deleted'
);

SELECT * FROM finish();

ROLLBACK;
