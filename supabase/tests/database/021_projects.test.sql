CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(24);

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT set_config('test.other_tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Nova Yazılım')::TEXT, TRUE);

-- Another company's customer, made before signing in (the signed-in user cannot write there).
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000211', current_setting('test.other_tenant_id')::UUID, 'NOV', 'Nova Customer',
        'trading_partner');

-- The rest runs as a signed-in owner of Atlas.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000212', current_setting('test.tenant_id')::UUID, 'THO', 'Thor Trading',
        'trading_partner');

INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000000213', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'THO-001', 'Garden Hose 15 m');

-- A brand sourcing project (path A, package A1) and one with listing (A1 + C).
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000000214', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Garden hose', 'npi', 'a_sourcing', ARRAY['A1']);

INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000000215', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Garden hose with listing', 'npi', 'a_sourcing', ARRAY['A1', 'C']);

INSERT INTO public.project_product (project_id, product_id, tenant_id)
VALUES ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000213',
        current_setting('test.tenant_id')::UUID);

SELECT set_config('test.g1', (SELECT g.id FROM public.project_gate g
    WHERE g.project_id = '00000000-0000-4000-8000-000000000214' AND g.code = 'G1')::TEXT, TRUE);

SELECT set_config('test.g2', (SELECT g.id FROM public.project_gate g
    WHERE g.project_id = '00000000-0000-4000-8000-000000000214' AND g.code = 'G2')::TEXT, TRUE);

-- The customer's written approvals of G1 and G2.
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000000216', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'project_gate', current_setting('test.g1')::UUID, 'gate_approval',
        'approved', 'https://example.test/g1-approval.pdf'),
       ('00000000-0000-4000-8000-000000000217', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'project_gate', current_setting('test.g2')::UUID, 'gate_approval',
        'approved', 'https://example.test/g2-approval.pdf');

-- Positive control: the project the checks below look at is there and visible.
SELECT is(
    (SELECT count(*)::INT FROM public.project p
     WHERE p.id = '00000000-0000-4000-8000-000000000214' AND p.tenant_id = current_setting('test.tenant_id')::UUID),
    1,
    'Atlas sees its own project'
);

SELECT is(
    (SELECT array_agg(g.code ORDER BY g.position)::TEXT FROM public.project_gate g
     WHERE g.project_id = '00000000-0000-4000-8000-000000000214'),
    '{G1,G2,G3,G4,G5}',
    'a brand sourcing project gets G1 to G5, in order'
);

SELECT is(
    (SELECT array_agg(g.code ORDER BY g.position)::TEXT FROM public.project_gate g
     WHERE g.project_id = '00000000-0000-4000-8000-000000000214' AND NOT g.needs_customer_approval),
    '{G4}',
    'every gate but G4 needs the customer''s approval'
);

SELECT is(
    (SELECT array_agg(g.code ORDER BY g.position)::TEXT FROM public.project_gate g
     WHERE g.project_id = '00000000-0000-4000-8000-000000000215'),
    '{G1,G2,G3,G4,G5,L_G1,L_G2}',
    'package C adds the listing gates L-G1 and L-G2 at the end'
);

SELECT is(
    (SELECT p.code FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000214'),
    'THO-' || extract(year FROM now())::INT || '-001',
    'the project code is the customer code, the year and a number'
);

SELECT throws_ok(
    $$ UPDATE public.project SET code = 'THO-1999-999' WHERE id = '00000000-0000-4000-8000-000000000214' $$,
    '23514',
    'project_code_immutable',
    'a project''s code cannot be changed'
);

SELECT throws_ok(
    $$
        INSERT INTO public.project (tenant_id, customer_id, display_name, type, path, packages)
        VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000211', 'Foreign', 'npi',
                'a_sourcing', ARRAY['A1'])
    $$,
    '23503',
    NULL,
    'a project cannot point at another tenant''s customer'
);

SELECT is(
    (SELECT count(*)::INT FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000214' AND t.phase = 'P1'),
    (SELECT count(*)::INT FROM public.task_template tt WHERE tt.phase = 'P1'),
    'a new project gets the P1 checklist'
);

SELECT throws_ok(
    $$ SELECT public.pass_gate(current_setting('test.g2')::UUID, 'too early') $$,
    '23514',
    'gate_order',
    'G2 cannot pass while G1 is pending'
);

SELECT throws_ok(
    $$ SELECT public.pass_gate(current_setting('test.g1')::UUID, 'no approval') $$,
    '23514',
    'gate_customer_approval_required',
    'G1 needs the customer''s approval date and document'
);

-- The P1 tasks that block the gate are still to do.
SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g1')::UUID, 'go', '2026-11-03',
                                '00000000-0000-4000-8000-000000000216')
    $$,
    '23514',
    'gate_blocked_by_task',
    'G1 cannot pass while a blocking P1 task is not done'
);

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000214' AND phase = 'P1' AND blocks_gate;

SELECT lives_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g1')::UUID, 'go', '2026-11-03',
                                '00000000-0000-4000-8000-000000000216')
    $$,
    'G1 passes with the customer''s approval'
);

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000214'),
    'P2',
    'passing G1 on path A moves the project to P2'
);

SELECT is(
    (SELECT count(*)::INT FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000214' AND t.phase = 'P2'),
    (SELECT count(*)::INT FROM public.task_template tt WHERE tt.phase = 'P2'),
    'entering P2 adds the P2 checklist'
);

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000214' AND phase = 'P2' AND blocks_gate;

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g2')::UUID, 'samples ok', '2026-11-03',
                                '00000000-0000-4000-8000-000000000217')
    $$,
    '23514',
    'gate_spec_sheet_required',
    'G2 cannot pass while a product of the project has no signed spec sheet'
);

INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, version, status, issued_on,
                             is_signed, is_stamped, sent_from_official_email, url)
VALUES (current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', 'product',
        '00000000-0000-4000-8000-000000000213', 'spec_sheet', 1, 'signed', '2026-11-01', TRUE, TRUE, TRUE,
        'https://example.test/spec-v1.pdf');

SELECT lives_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g2')::UUID, 'samples ok', '2026-11-03',
                                '00000000-0000-4000-8000-000000000217')
    $$,
    'G2 passes once the product''s spec sheet is signed'
);

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g2')::UUID, 'again', '2026-11-03',
                                '00000000-0000-4000-8000-000000000217')
    $$,
    '23514',
    'gate_not_pending',
    'a passed gate cannot pass again'
);

SELECT throws_ok(
    $$ SELECT public.rollback_gate(current_setting('test.g1')::UUID, NULL) $$,
    '23514',
    'gate_reason_required',
    'a rollback needs a reason'
);

SELECT throws_ok(
    $$
        SELECT public.rollback_gate((SELECT g.id FROM public.project_gate g
            WHERE g.project_id = '00000000-0000-4000-8000-000000000214' AND g.code = 'G3'), 'not yet')
    $$,
    '23514',
    'gate_not_passed',
    'only a passed gate can be rolled back'
);

SELECT public.rollback_gate(current_setting('test.g1')::UUID, 'customer changed the brief');

SELECT is(
    (SELECT array_agg(g.code || ':' || g.status ORDER BY g.position)::TEXT FROM public.project_gate g
     WHERE g.project_id = '00000000-0000-4000-8000-000000000214' AND g.code IN ('G1', 'G2', 'G3')),
    '{G1:rolled_back,G2:rolled_back,G3:pending}',
    'rolling back G1 rolls back the gates passed after it'
);

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000214'),
    'P1',
    'rolling back G1 takes the project back to P1'
);

SELECT lives_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g1')::UUID, 'go again', '2026-11-04',
                                '00000000-0000-4000-8000-000000000216')
    $$,
    'a rolled-back gate can be passed again'
);

-- Another company sees none of it.
RESET ROLE;

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ali@moesa-panel.test'),
    current_setting('test.other_tenant_id')::UUID
);

SELECT is(
    (SELECT count(*)::INT FROM public.project_gate g WHERE g.project_id = '00000000-0000-4000-8000-000000000214'),
    0,
    'Nova sees none of Atlas''s gates'
);

SELECT throws_ok(
    $$ SELECT public.pass_gate(current_setting('test.g2')::UUID, 'not mine') $$,
    'PGRST',
    NULL,
    'Nova cannot pass Atlas''s gate'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
