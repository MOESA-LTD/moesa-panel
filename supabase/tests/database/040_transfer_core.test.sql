CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer core (040): the registry covers every table that refers to a registry table and
-- every document entity, users never write a transfer row, the transaction-local flag holds only
-- for a transfer row of the current transaction, a transfer's audit transactions are not reverted,
-- another company sees no transfer, and the seed's transfer tenants and grants. What it writes is
-- rolled back.
BEGIN;

SELECT plan(16);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('trading', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Trading GmbH')),
    ('nova', (SELECT id FROM public.tenant WHERE display_name = 'Nova Yazılım')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('baris', (SELECT id FROM public.user WHERE email = 'baris@moesa-panel.test')),
    ('ali', (SELECT id FROM public.user WHERE email = 'ali@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO'))
) AS x (k, v);

-- The tables of schema public with a foreign key to a registry table, that are not registered.
CREATE FUNCTION pg_temp.unregistered () RETURNS TEXT[] LANGUAGE sql AS $$
    SELECT ARRAY(
        SELECT DISTINCT c.conrelid::REGCLASS::TEXT
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class f ON f.oid = c.confrelid AND f.relnamespace = 'public'::REGNAMESPACE
        JOIN pg_catalog.pg_class s ON s.oid = c.conrelid
        WHERE c.contype = 'f'
          AND c.connamespace = 'public'::REGNAMESPACE
          AND f.relname IN (SELECT r.table_name FROM private.transfer_registry r)
          AND s.relname NOT IN (SELECT r.table_name FROM private.transfer_registry r)
        ORDER BY 1
    );
$$;

SELECT is(pg_temp.unregistered(), '{}'::TEXT[], 'every table with a foreign key to a registry table is registered');

CREATE TABLE public.zz_probe (
    id UUID PRIMARY KEY,
    tenant_id UUID,
    product_id UUID,
    FOREIGN KEY (product_id, tenant_id) REFERENCES public.product (id, tenant_id)
);

SELECT is(pg_temp.unregistered(), ARRAY['zz_probe'], 'a new table referring to a registry table is caught');

SELECT is(
    ARRAY(SELECT unnest(enum_range(NULL::public.document_entity))::TEXT EXCEPT SELECT entity::TEXT FROM private.transfer_registry),
    '{}'::TEXT[],
    'every document entity is a registry table'
);

SELECT is(
    ARRAY(SELECT c.table_name::TEXT FROM information_schema.columns c
          JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public' AND c.udt_name = 'document_entity' AND t.table_type = 'BASE TABLE'
          EXCEPT SELECT table_name FROM private.transfer_registry),
    '{}'::TEXT[],
    'every table scoped by a document entity is registered'
);

-- Users never write a transfer row.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok(
    $$ INSERT INTO api.transfer (tenant_id, source_tenant_id, customer_id, mode, path, started_by, report)
       VALUES (current_setting('test.moesa')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
               'copy', 'copy', current_setting('test.akif')::UUID, '{}') $$,
    -- Through api the read-only view refuses the insert before any privilege check: it joins the rights
    -- subquery (053), so it is not auto-updatable, and it has no INSTEAD OF trigger.
    '55000',
    NULL,
    'a user cannot insert a transfer row'
);

RESET ROLE;

-- The flag.
SELECT is(private.transferring(), FALSE, 'no flag, no transfer');

INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, mode, path, started_by, report)
VALUES ('00000000-0000-4000-8000-000000040001', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
        current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}');

SELECT set_config('moesa.transfer_id', '00000000-0000-4000-8000-000000040001', TRUE);

SELECT is(private.transferring(), TRUE, 'a transfer row of this transaction raises the flag');

-- The business-rule guards are SECURITY DEFINER, called by the user: so is this probe.
CREATE FUNCTION public.zz_rules_bypassed () RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT private.rules_bypassed(); $$;

GRANT EXECUTE ON FUNCTION public.zz_rules_bypassed () TO authenticated;

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

SELECT is(public.zz_rules_bypassed(), TRUE, 'the rules are bypassed during a transfer, for the user too');

RESET ROLE;

SELECT set_config('moesa.transfer_id', gen_random_uuid()::TEXT, TRUE);

SELECT is(private.transferring(), FALSE, 'an unknown transfer id does not enable the flag');

INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, mode, path, started_by, report, xact_id)
VALUES ('00000000-0000-4000-8000-000000040002', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
        current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}', '1'::XID8);

SELECT set_config('moesa.transfer_id', '00000000-0000-4000-8000-000000040002', TRUE);

SELECT is(private.transferring(), FALSE, 'a transfer id from another transaction does not enable the flag');

SELECT set_config('moesa.transfer_id', '', TRUE);

-- The revert guard.
SELECT set_config('audit.transaction_id', '', TRUE);

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

INSERT INTO api.customer (tenant_id, code, display_name, commercial_model)
VALUES (current_setting('test.moesa')::UUID, 'ZZT', 'Zed Transfer', 'trading_partner');

SELECT set_config('test.tx1', current_setting('audit.transaction_id'), TRUE);

SELECT set_config('audit.transaction_id', '', TRUE);

RESET ROLE;

UPDATE public.transfer SET audit_transaction_ids = ARRAY[current_setting('test.tx1')::UUID]
WHERE id = '00000000-0000-4000-8000-000000040001';

SELECT set_config('audit.transaction_id', '', TRUE);

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_like(
    format('SELECT public.revert_audit_transaction(%L)', current_setting('test.tx1')),
    '%audit_transfer_not_revertable%',
    'a transfer''s audit transactions cannot be reverted'
);

RESET ROLE;

SELECT set_config('audit.transaction_id', '', TRUE);

UPDATE public.transfer SET missing_files = '{x}' WHERE id = '00000000-0000-4000-8000-000000040001';

SELECT set_config('test.tx2', current_setting('audit.transaction_id'), TRUE);

SELECT set_config('audit.transaction_id', '', TRUE);

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_like(
    format('SELECT public.revert_audit_transaction(%L)', current_setting('test.tx2')),
    '%audit_transfer_not_revertable%',
    'an update of a transfer cannot be reverted'
);

RESET ROLE;

-- Another company sees none of them.
SELECT private.impersonate(current_setting('test.ali')::UUID, current_setting('test.nova')::UUID);

SELECT is((SELECT count(*) FROM api.transfer), 0::BIGINT, 'another company sees no transfer');

RESET ROLE;

-- The seed's transfer tenants and grants.
SELECT is(
    (SELECT parent_id FROM public.tenant WHERE display_name = 'MOESA Europe'),
    current_setting('test.moesa')::UUID,
    'MOESA Europe is a branch of MOESA LTD'
);

SELECT ok(
    private.owns_company(current_setting('test.baris')::UUID, current_setting('test.trading')::UUID)
    AND NOT private.owns_company(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID),
    'baris owns MOESA Trading GmbH; akif, management in MOESA Europe, owns no company'
);

SELECT is(
    ARRAY(SELECT r.display_name FROM public.role r
          JOIN public.role_permission rp ON rp.role_id = r.id
          JOIN public.permission p ON p.id = rp.permission_id
          WHERE r.tenant_id = current_setting('test.moesa')::UUID
            AND p.resource_name = 'public.transfer'
            AND p.command = 'insert'
          ORDER BY r.display_name),
    ARRAY['Branch manager', 'management'],
    'the roles that may change the settings start a transfer, the coordinator does not'
);

SELECT * FROM finish();

ROLLBACK;
