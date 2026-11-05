CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer rehearsal (042) on the MOESA demo company of seed.sql: a dry run collects the THO
-- package and writes nothing; the refusals come in their order (mode, same tenant, owner of both
-- companies, target read-only, permissions, source read-only); a missing customer and a product of
-- another customer are refused; a product-only run leaves the customer's contacts out. What it
-- writes is rolled back.
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
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P'))
) AS x (k, v);

SELECT set_config('test.gates', (SELECT count(*)::TEXT FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID), TRUE);
SELECT set_config('test.tasks', (SELECT count(*)::TEXT FROM public.project_task WHERE project_id = current_setting('test.pilot')::UUID), TRUE);

-- baris owns Eski Ticaret too, so between MOESA and Eski the ownership check passes.
INSERT INTO public.tenant_owner (tenant_id, user_id) VALUES (current_setting('test.eski')::UUID, current_setting('test.baris')::UUID);

-- A second customer ZZZ in MOESA, with a product.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000042001', current_setting('test.moesa')::UUID, 'ZZZ', 'ZZZ Handel', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000042002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042001', 'ZZZ-1', 'ZZZ ürün');

-- 1–3. akif, a copy from MOESA to its branch Europe, rehearsed.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.r', public.transfer_customer(
    current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy'
)::TEXT, TRUE);
SELECT is(
    current_setting('test.r')::JSONB -> 'counts',
    jsonb_build_object(
        'customer', 1, 'customer_contact', 1, 'customer_warehouse', 1, 'customer_platform_account', 1,
        'customer_brand', 1, 'supplier', 3, 'product', 3, 'project', 1, 'project_product', 1,
        'project_gate', current_setting('test.gates')::INT, 'project_task', current_setting('test.tasks')::INT,
        'document', 1
    ),
    'the dry run counts the THO package'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.transfer), 0::BIGINT, 'a dry run leaves no transfer row');
SELECT is((SELECT count(*) FROM public.customer WHERE tenant_id = current_setting('test.europe')::UUID), 0::BIGINT,
          'a dry run writes nothing to the target');

-- 4. akif does not own MOESA Trading.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_owner_required%',
    'between two companies only an owner of both transfers'
);
RESET ROLE;

-- 5. baris owns both.
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    'the owner of both companies rehearses'
);
RESET ROLE;

-- 6. The coordinator has no transfer right.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_forbidden%',
    'the coordinator may not transfer'
);
RESET ROLE;

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

-- 7. Into a read-only target.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.eski')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_target_read_only%',
    'nothing is transferred into a read-only target'
);

-- 8. A move out of a read-only source.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.eski')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'move') $$,
    '%transfer_source_read_only%',
    'a read-only source is not moved from'
);

-- 9. A copy out of it, of a customer that is not there.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.eski')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_customer_missing%',
    'the customer must be in the source'
);

-- 10. The same tenant.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_same_tenant%',
    'the target differs from the source'
);

-- 11. An unknown mode.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'clone') $$,
    '%transfer_invalid_mode%',
    'the mode is copy or move'
);
RESET ROLE;

-- 12. A product of another customer.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
           product_ids => ARRAY['00000000-0000-4000-8000-000000042002'::UUID]) $$,
    '%transfer_products_invalid%',
    'the products are of the customer'
);

-- 13–14. The mop alone.
SELECT set_config('test.r', public.transfer_customer(
    current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
    product_ids => ARRAY[current_setting('test.mop')::UUID]
)::TEXT, TRUE);
SELECT is((current_setting('test.r')::JSONB -> 'counts' ->> 'product')::INT, 1, 'a product-only run takes the selected product');
SELECT ok(NOT (current_setting('test.r')::JSONB -> 'counts') ? 'customer_contact', 'and leaves the customer''s contacts out');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
