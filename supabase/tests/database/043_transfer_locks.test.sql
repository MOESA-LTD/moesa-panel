CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgrowlocks WITH SCHEMA extensions;

-- A real run (042, transfer_customer) locks every package row with an id FOR UPDATE before it
-- builds the report it writes, and holds the lock until commit: a concurrent edit of a package
-- row, or a child inserted under one (its FK takes KEY SHARE), waits for the transfer instead of
-- being lost or orphaned. A dry run locks nothing below the customer. Here akif copies THO from
-- MOESA into Europe with the GTINs cleared. What it writes is rolled back.
BEGIN;

SELECT plan(4);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu'))
) AS x (k, v);

-- The rows of a table locked FOR UPDATE by this transaction.
CREATE FUNCTION pg_temp.locked (tbl TEXT) RETURNS SETOF TID LANGUAGE sql AS $$
    SELECT l.locked_row FROM extensions.pgrowlocks(tbl) l
    WHERE 'For Update' = ANY (l.modes) AND txid_current()::TEXT::XID = ANY (l.xids);
$$;

CREATE FUNCTION pg_temp.transfer (decisions JSONB, dry_run BOOLEAN, report_hash TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
        decisions => decisions, dry_run => dry_run, report_hash => report_hash
    );
$$;

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.d', (
    SELECT jsonb_object_agg(c ->> 'key', '{"action": "clear_gtin"}'::JSONB)
    FROM jsonb_array_elements(pg_temp.transfer('{}', TRUE, NULL) -> 'conflicts') c
    WHERE c ->> 'kind' = 'gtin'
)::TEXT, TRUE);
SELECT set_config('test.h', pg_temp.transfer(current_setting('test.d')::JSONB, TRUE, NULL) ->> 'report_hash', TRUE);
RESET ROLE;

-- 1. The dry runs locked no product.
SELECT is((SELECT count(*) FROM pg_temp.locked('public.product')), 0::BIGINT, 'a dry run locks no package row');

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT pg_temp.transfer(current_setting('test.d')::JSONB, FALSE, current_setting('test.h'));
RESET ROLE;

-- 2–4. The run holds every package product, the project and its tasks.
SELECT set_eq(
    $$ SELECT ctid AS row_ctid FROM public.product WHERE tenant_id = current_setting('test.moesa')::UUID AND customer_id = current_setting('test.tho')::UUID $$,
    $$ SELECT l AS row_ctid FROM pg_temp.locked('public.product') l $$,
    'the run locks every package product'
);
SELECT set_eq(
    $$ SELECT ctid AS row_ctid FROM public.project WHERE id = current_setting('test.pilot')::UUID $$,
    $$ SELECT l AS row_ctid FROM pg_temp.locked('public.project') l $$,
    'and the project'
);
SELECT set_eq(
    $$ SELECT ctid AS row_ctid FROM public.project_task WHERE project_id = current_setting('test.pilot')::UUID $$,
    $$ SELECT l AS row_ctid FROM pg_temp.locked('public.project_task') l $$,
    'and the tasks under it'
);

SELECT * FROM finish();

ROLLBACK;
