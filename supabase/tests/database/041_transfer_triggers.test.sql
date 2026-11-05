CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Transfer-aware triggers (041) on the MOESA demo company of seed.sql: the 49 composite foreign
-- keys are deferrable and keep their ON DELETE action, a passed gate is frozen unless a transfer
-- runs, a transfer keeps a project's code and phase and creates no gates, a transfer writes a media
-- row without its Storage object, and the code counters take a tenant. What it writes is rolled
-- back.
BEGIN;

SELECT plan(12);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('trading', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Trading GmbH')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu'))
) AS x (k, v);
-- A phase that is not the initial one.
SELECT set_config('test.phase', (SELECT p::TEXT FROM unnest(enum_range(NULL::public.project_phase)) AS p OFFSET 2 LIMIT 1), TRUE);

-- G1 of the pilot passed, as in 037.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000041001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000041001');

RESET ROLE;

INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, mode, path, started_by, report)
VALUES ('00000000-0000-4000-8000-000000041002', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
        current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}');

-- The deferrable foreign keys.
CREATE FUNCTION pg_temp.deferrable_fkeys () RETURNS TEXT[] LANGUAGE sql AS $$
    SELECT ARRAY[
        'customer_contract_document_fkey', 'customer_contact_customer_fkey', 'customer_warehouse_customer_fkey',
        'customer_platform_account_customer_fkey', 'customer_brand_customer_fkey', 'document_customer_fkey',
        'document_media_fkey', 'product_customer_fkey', 'product_supplier_fkey', 'product_parent_fkey',
        'project_customer_fkey', 'project_product_project_fkey', 'project_product_product_fkey',
        'project_gate_project_fkey', 'project_gate_approval_document_fkey', 'project_gate_rollback_incident_fkey',
        'project_task_project_fkey', 'media_customer_fkey', 'media_link_media_fkey', 'purchase_order_customer_fkey',
        'purchase_order_supplier_fkey', 'purchase_order_project_fkey', 'purchase_order_pi_document_fkey',
        'purchase_order_packing_document_fkey', 'purchase_order_line_po_fkey', 'purchase_order_line_product_fkey',
        'purchase_order_line_spec_fkey', 'purchase_order_payment_po_fkey', 'purchase_order_update_po_fkey',
        'shipment_customer_fkey', 'shipment_warehouse_fkey', 'shipment_purchase_order_shipment_fkey',
        'shipment_purchase_order_po_fkey', 'shipment_line_shipment_fkey', 'shipment_line_link_fkey',
        'shipment_line_po_line_fkey', 'shipment_event_shipment_fkey', 'market_cell_product_fkey',
        'market_cell_project_fkey', 'incident_customer_fkey', 'incident_log_incident_fkey',
        'incident_deadline_incident_fkey', 'change_request_customer_fkey', 'change_request_project_fkey',
        'change_request_affected_document_fkey', 'change_request_approval_document_fkey',
        'change_request_result_document_fkey', 'change_request_product_cr_fkey', 'change_request_product_product_fkey'
    ];
$$;

SELECT is(
    ARRAY(SELECT conname::TEXT FROM pg_constraint WHERE conname = ANY (pg_temp.deferrable_fkeys()) AND NOT condeferrable),
    '{}'::TEXT[],
    'the composite foreign keys are deferrable'
);
SELECT is((SELECT count(*) FROM pg_constraint WHERE conname = ANY (pg_temp.deferrable_fkeys())), 49::BIGINT, 'all 49 of them');
SELECT is((SELECT confdeltype FROM pg_constraint WHERE conname = 'customer_contact_customer_fkey'), 'c'::"char", 'the ON DELETE action is kept');

-- A passed gate is frozen, unless a transfer runs.
SELECT throws_like(
    $$ UPDATE public.project_gate SET passed_at = passed_at - INTERVAL '1 day' WHERE code = 'G1' AND project_id = current_setting('test.pilot')::UUID $$,
    '%gate_not_pending%',
    'without the flag, a passed gate is not changed'
);

SELECT set_config('moesa.transfer_id', '00000000-0000-4000-8000-000000041002', TRUE);

SELECT lives_ok(
    $$ UPDATE public.project_gate SET passed_at = passed_at - INTERVAL '1 day' WHERE code = 'G1' AND project_id = current_setting('test.pilot')::UUID $$,
    'a transfer writes a passed gate as it is'
);

-- A transfer keeps the project's code and phase, and creates no gates.
INSERT INTO public.project (id, tenant_id, customer_id, code, current_phase, display_name, type, path, packages)
SELECT '00000000-0000-4000-8000-000000041003', p.tenant_id, p.customer_id, 'THO-2020-999', current_setting('test.phase')::public.project_phase,
       'Carried project', p.type, p.path, p.packages
FROM public.project p
WHERE p.id = current_setting('test.pilot')::UUID;

SELECT is((SELECT code FROM public.project WHERE id = '00000000-0000-4000-8000-000000041003'), 'THO-2020-999', 'the copied code is kept');
SELECT is((SELECT current_phase::TEXT FROM public.project WHERE id = '00000000-0000-4000-8000-000000041003'), current_setting('test.phase'), 'the copied phase is kept');
SELECT is((SELECT count(*) FROM public.project_gate WHERE project_id = '00000000-0000-4000-8000-000000041003'), 0::BIGINT, 'no gates are created: they are carried');

-- A transfer writes a media row before its file is copied.
SELECT lives_ok(
    $$ INSERT INTO public.media (id, tenant_id, storage_path, file_name, mime_type, size_bytes)
       VALUES ('00000000-0000-4000-8000-000000041004', current_setting('test.moesa')::UUID,
               current_setting('test.moesa') || '/00000000-0000-4000-8000-000000041004/x.png', 'x.png', 'image/png', 10) $$,
    'a transfer writes a media row without its Storage object'
);
SELECT is((SELECT mime_type FROM public.media WHERE id = '00000000-0000-4000-8000-000000041004'), 'image/png', 'and keeps its mime type');

-- The counters per tenant.
SELECT is(private.next_code_in(current_setting('test.trading')::UUID, 'project', 'THO'), 'THO-' || extract(year FROM now())::INT || '-001',
          'the counter of the given tenant');

SELECT set_config('request.headers', '', TRUE);
SELECT set_config('request.jwt.claims', '', TRUE);

SELECT throws_like($$ SELECT public.next_code('project', 'THO') $$, '%tenant_required%', 'next_code still needs the request''s tenant');

SELECT * FROM finish();

ROLLBACK;
