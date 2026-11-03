CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(9);

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

SELECT is(
    (SELECT s.value FROM public.setting s
     WHERE s.tenant_id = current_setting('test.tenant_id')::UUID AND s.key = 'management_gates'),
    '["G1"]'::JSONB,
    'existing companies get the management_gates setting, G1 by default'
);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000301', current_setting('test.tenant_id')::UUID, 'DSH', 'Dash Trading',
        'trading_partner');

-- Two brand sourcing projects of the customer; the second is put on hold below.
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000000302', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'Dash lamp', 'npi', 'a_sourcing', ARRAY['A1']),
       ('00000000-0000-4000-8000-000000000303', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'Dash chair', 'npi', 'a_sourcing', ARRAY['A1']);

SELECT is(
    (SELECT string_agg(d.gate_code || ':' || d.owner_role || ':' || d.needs_customer_approval || ':'
                       || d.needs_management, ',')
     FROM public.dashboard_gate_pending d WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    'G1:coordinator:true:true',
    'a new project waits on G1 only: the coordinator''s, with the customer''s approval and management''s'
);

SELECT is(
    (SELECT d.waiting_days FROM public.dashboard_gate_pending d
     WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    0,
    'the first gate has waited since the project was created: 0 days'
);

UPDATE public.project SET status = 'on_hold' WHERE id = '00000000-0000-4000-8000-000000000303';

SELECT is(
    (SELECT count(*)::INT FROM public.dashboard_gate_pending d
     WHERE d.project_id = '00000000-0000-4000-8000-000000000303'),
    0,
    'a project on hold has no pending gate on the dashboard'
);

-- Pass G1: its blocking tasks done and the customer's written approval attached to the gate.
UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000302' AND phase = 'P1' AND blocks_gate;

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
SELECT '00000000-0000-4000-8000-000000000304', current_setting('test.tenant_id')::UUID,
       '00000000-0000-4000-8000-000000000301', 'project_gate', g.id, 'gate_approval', 'approved',
       'https://example.test/dash-g1.pdf'
FROM public.project_gate g
WHERE g.project_id = '00000000-0000-4000-8000-000000000302' AND g.code = 'G1';

SELECT public.pass_gate(
    (SELECT g.id FROM public.project_gate g
     WHERE g.project_id = '00000000-0000-4000-8000-000000000302' AND g.code = 'G1'),
    'go', current_date, '00000000-0000-4000-8000-000000000304'
);

SELECT is(
    (SELECT string_agg(d.gate_code || ':' || d.owner_role || ':' || d.needs_management, ',')
     FROM public.dashboard_gate_pending d WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    'G2:supply_qc:false',
    'once G1 passes, G2 waits: supply and QC''s, without management'
);

-- Two open P2 tasks of the active project, due in 3 and in 10 days.
UPDATE public.project_task SET due_on = current_date + 3
WHERE id = (SELECT t.id FROM public.project_task t
            WHERE t.project_id = '00000000-0000-4000-8000-000000000302' AND t.phase = 'P2'
            ORDER BY t.position LIMIT 1);

UPDATE public.project_task SET due_on = current_date + 10
WHERE id = (SELECT t.id FROM public.project_task t
            WHERE t.project_id = '00000000-0000-4000-8000-000000000302' AND t.phase = 'P2'
            ORDER BY t.position DESC LIMIT 1);

SELECT is(
    (SELECT string_agg(d.days_left || ':' || d.overdue, ',')
     FROM public.dashboard_task_due d WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    '3:false',
    'a task due in 3 days is listed, one due in 10 days is not'
);

UPDATE public.project_task SET due_on = current_date - 2
WHERE project_id = '00000000-0000-4000-8000-000000000302' AND due_on = current_date + 3;

SELECT is(
    (SELECT string_agg(d.days_left || ':' || d.overdue, ',')
     FROM public.dashboard_task_due d WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    '-2:true',
    'a task due 2 days ago is overdue'
);

-- Two active products (one with a signed spec sheet, the other with complete compliance), a
-- concept and an archived one.
INSERT INTO public.product (id, tenant_id, customer_id, sku, status, compliance_status)
VALUES ('00000000-0000-4000-8000-000000000305', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'DSH-001', 'development', 'none'),
       ('00000000-0000-4000-8000-000000000306', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'DSH-002', 'on_sale', 'complete'),
       ('00000000-0000-4000-8000-000000000307', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'DSH-003', 'concept', 'none'),
       ('00000000-0000-4000-8000-000000000308', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000301', 'DSH-004', 'archived', 'none');

INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000301', 'product',
        '00000000-0000-4000-8000-000000000305', 'spec_sheet', 'approved', 'https://example.test/dsh-001.pdf');

SELECT is(
    (SELECT d.customer_code || ':' || d.active_sku_count || ':' || d.signed_spec_count || ':'
            || d.compliance_complete_count || ':' || d.unsigned_sku_count
     FROM public.dashboard_product_evidence d WHERE d.customer_id = '00000000-0000-4000-8000-000000000301'),
    'DSH:2:1:1:1',
    'evidence counts: 2 active SKUs (concept and archived left out), 1 signed, 1 compliant, 1 unsigned'
);

-- The management gates come from the company's setting.
UPDATE public.setting SET value = '["G1", "G2"]'::JSONB
WHERE tenant_id = current_setting('test.tenant_id')::UUID AND key = 'management_gates';

SELECT is(
    (SELECT d.needs_management FROM public.dashboard_gate_pending d
     WHERE d.project_id = '00000000-0000-4000-8000-000000000302'),
    TRUE,
    'a gate listed in the company''s management_gates setting needs management'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
