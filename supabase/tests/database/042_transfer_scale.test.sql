CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer rehearsal (042) at scale: THO with 1000 more products, each with an active GTIN (a
-- skippable conflict in a copy), rehearses well inside the 8 s statement timeout of
-- authenticated, and every GTIN conflict still says what its skip drops (here nothing).
BEGIN;

SELECT plan(3);

INSERT INTO public.product (tenant_id, customer_id, sku, display_name, gtin)
SELECT c.tenant_id, c.id, 'SCALE-' || n, 'Scale ' || n,
       (SELECT g.base || d FROM generate_series(0, 9) AS d WHERE private.gtin_valid(g.base || d))
FROM public.customer c
CROSS JOIN generate_series(1, 1000) AS n
CROSS JOIN LATERAL (SELECT '29' || lpad(n::TEXT, 10, '0') AS base) g
WHERE c.code = 'THO' AND c.tenant_id = (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD');

SELECT private.impersonate(
    (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test'),
    (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')
);
SELECT set_config('test.t0', clock_timestamp()::TEXT, TRUE);
SELECT set_config('test.r', public.transfer_customer(
    (SELECT id FROM api.tenant WHERE display_name = 'MOESA LTD'),
    (SELECT id FROM api.tenant WHERE display_name = 'MOESA Europe'),
    (SELECT id FROM api.customer WHERE code = 'THO' AND tenant_id = (SELECT id FROM api.tenant WHERE display_name = 'MOESA LTD')),
    'copy'
)::TEXT, TRUE);
SELECT set_config('test.elapsed', extract(EPOCH FROM clock_timestamp() - current_setting('test.t0')::TIMESTAMPTZ)::TEXT, TRUE);
RESET ROLE;

SELECT cmp_ok(current_setting('test.elapsed')::NUMERIC, '<', 3::NUMERIC, 'a copy of 1000 GTIN products rehearses in under 3 s');

SELECT is(
    (SELECT count(*) FROM jsonb_array_elements(current_setting('test.r')::JSONB -> 'conflicts') c
     WHERE c ->> 'kind' = 'gtin' AND c ->> 'label' LIKE '29%'),
    1000::BIGINT,
    'each new product has its GTIN conflict'
);

SELECT is(
    (SELECT count(*) FROM jsonb_array_elements(current_setting('test.r')::JSONB -> 'conflicts') c
     WHERE c ->> 'kind' = 'gtin' AND c ->> 'label' LIKE '29%' AND c -> 'skip_drops' = '{}'::JSONB),
    1000::BIGINT,
    'a skip of a product with nothing under it drops nothing else'
);

SELECT * FROM finish();

ROLLBACK;
