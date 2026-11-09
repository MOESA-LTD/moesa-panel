CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(11);

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT set_config('test.other_tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')::TEXT, TRUE);

-- Another company's customer, made before signing in: its code is unknown to Atlas.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000201', current_setting('test.other_tenant_id')::UUID, 'NOV', 'Nova Customer',
        'trading_partner');

-- The rest runs as a signed-in owner of Atlas.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

INSERT INTO api.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000202', current_setting('test.tenant_id')::UUID, 'IMP', 'Import Trading',
        'trading_partner'),
       ('00000000-0000-4000-8000-000000000203', current_setting('test.tenant_id')::UUID, 'OTH', 'Other Trading',
        'trading_partner');

-- An active product of another customer holding a GTIN the import must not take.
INSERT INTO api.product (tenant_id, customer_id, sku, display_name, gtin)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000203', 'OTH-001', 'Held GTIN',
        '4260696025855');

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-001", "display_name": "Mop 40 cm", "gtin": "4260696025817", "purchase_price": 1.9},
        {"customer_code": "IMP", "sku": "IMP-002", "display_name": "Mop 60 cm", "gtin": "4260696025824"}
    ]$$::JSONB),
    '{"ok": true, "inserted": 2, "updated": 0}'::JSONB,
    'two new rows are inserted'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-001", "display_name": "Mop 40 cm", "gtin": "4260696025817", "purchase_price": 1.9},
        {"customer_code": "IMP", "sku": "IMP-002", "display_name": "Mop 60 cm", "gtin": "4260696025824"}
    ]$$::JSONB),
    '{"ok": true, "inserted": 0, "updated": 2}'::JSONB,
    'the same file again updates the two rows'
);

SELECT set_config('test.gtin_clash', public.import_products($$[
    {"customer_code": "IMP", "sku": "IMP-003", "display_name": "Bucket", "gtin": "4260696025862"},
    {"customer_code": "IMP", "sku": "IMP-004", "display_name": "Clash", "gtin": "4260696025855"}
]$$::JSONB)::TEXT, TRUE);

SELECT is(
    current_setting('test.gtin_clash')::JSONB ->> 'ok',
    'false',
    'a GTIN held by another active product fails the import'
);

SELECT is(
    current_setting('test.gtin_clash')::JSONB -> 'errors' -> 0,
    '{"row": 2, "field": "gtin", "code": "gtin_in_use", "sku": "OTH-001"}'::JSONB,
    'the error names the row and the product holding the GTIN'
);

SELECT is(
    (SELECT count(*)::INT FROM api.product p WHERE p.customer_id = '00000000-0000-4000-8000-000000000202'),
    2,
    'a failed import writes nothing, not even its valid rows'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "NOV", "sku": "NOV-001", "display_name": "Not ours"}
    ]$$::JSONB) -> 'errors' -> 0 ->> 'field',
    'customer_code',
    'another tenant''s customer code is unknown'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-010", "display_name": "First"},
        {"customer_code": "IMP", "sku": "IMP-010", "display_name": "Again"}
    ]$$::JSONB) -> 'errors' -> 0,
    '{"row": 2, "field": "sku", "code": "sku_duplicate"}'::JSONB,
    'a SKU twice in the file is reported on its second row'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-012", "display_name": "Bad check digit", "gtin": "4260696025801"}
    ]$$::JSONB) -> 'errors' -> 0,
    '{"row": 1, "field": "gtin", "code": "gtin_invalid"}'::JSONB,
    'a GTIN with a wrong check digit is reported'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-011", "display_name": "Odd", "status": "bogus", "unit_net_g": "abc"}
    ]$$::JSONB) -> 'errors',
    '[{"row": 1, "field": "status", "code": "invalid_value"}, {"row": 1, "field": "unit_net_g", "code": "invalid_value"}]'::JSONB,
    'values the columns cannot hold are reported per field'
);

SELECT is(
    public.import_products($$[
        {"customer_code": "IMP", "sku": "IMP-020-S", "display_name": "Mop small", "parent_sku": "IMP-020"},
        {"customer_code": "IMP", "sku": "IMP-020", "display_name": "Mop"}
    ]$$::JSONB) ->> 'ok',
    'true',
    'a variant may name a parent that comes later in the file'
);

SELECT is(
    (SELECT c.parent_id FROM api.product c WHERE c.customer_id = '00000000-0000-4000-8000-000000000202' AND c.sku = 'IMP-020-S'),
    (SELECT p.id FROM api.product p WHERE p.customer_id = '00000000-0000-4000-8000-000000000202' AND p.sku = 'IMP-020'),
    'the variant points at its parent'
);

SELECT * FROM finish();

ROLLBACK;
