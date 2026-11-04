CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(46);

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

-- A brand sourcing project (path A, package A1), one with listing (A1 + C), a reorder, a variant
-- and a private label project (path B, package A2).
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000000214', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Garden hose', 'npi', 'a_sourcing', ARRAY['A1']),
       ('00000000-0000-4000-8000-000000000215', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Garden hose with listing', 'npi', 'a_sourcing', ARRAY['A1', 'C']),
       ('00000000-0000-4000-8000-000000000218', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Hose reorder', 'reorder', NULL, ARRAY['A1']),
       ('00000000-0000-4000-8000-000000000219', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Hose 20 m variant', 'variant', NULL, ARRAY['A1']),
       ('00000000-0000-4000-8000-000000000220', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'Own brand hose', 'npi', 'b_private_label', ARRAY['A2']);

INSERT INTO public.project_product (project_id, product_id, tenant_id)
VALUES ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000213',
        current_setting('test.tenant_id')::UUID);

-- The gates the checks below use.
SELECT set_config('test.' || x.name, (SELECT g.id FROM public.project_gate g
    WHERE g.project_id = x.project_id AND g.code = x.code)::TEXT, TRUE)
FROM (VALUES ('g1', '00000000-0000-4000-8000-000000000214'::UUID, 'G1'::public.gate_code),
             ('g2', '00000000-0000-4000-8000-000000000214', 'G2'),
             ('g3', '00000000-0000-4000-8000-000000000214', 'G3'),
             ('g4', '00000000-0000-4000-8000-000000000214', 'G4'),
             ('c1', '00000000-0000-4000-8000-000000000215', 'G1'),
             ('c2', '00000000-0000-4000-8000-000000000215', 'G2'),
             ('v2', '00000000-0000-4000-8000-000000000219', 'G2'),
             ('b1', '00000000-0000-4000-8000-000000000220', 'G1')) AS x (name, project_id, code);

-- The customer's written approvals, one approval-like document of the wrong type, and the
-- product's signed spec sheet (added later).
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
SELECT x.id, current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', 'project_gate',
       current_setting('test.' || x.gate)::UUID, x.type, 'approved', 'https://example.test/' || x.gate || '.pdf'
FROM (VALUES ('00000000-0000-4000-8000-000000000216'::UUID, 'g1', 'gate_approval'::public.document_type),
             ('00000000-0000-4000-8000-000000000217', 'g2', 'gate_approval'),
             ('00000000-0000-4000-8000-000000000221', 'g3', 'gate_approval'),
             ('00000000-0000-4000-8000-000000000222', 'v2', 'gate_approval'),
             ('00000000-0000-4000-8000-000000000223', 'b1', 'gate_approval'),
             ('00000000-0000-4000-8000-000000000224', 'g1', 'other')) AS x (id, gate, type);

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
    $$ UPDATE public.project SET packages = ARRAY['A1', 'C'] WHERE id = '00000000-0000-4000-8000-000000000214' $$,
    '23514',
    'project_immutable_field',
    'a project''s packages cannot be changed once its gates exist'
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
    (SELECT array_agg(DISTINCT t.phase)::TEXT || ':' || count(*) FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000214'),
    '{P1}:' || (SELECT count(*) FROM public.task_template tt WHERE tt.phase = 'P1'),
    'a new product project gets the P1 checklist only'
);

-- Projects that are not new products start in the phase their first gate closes.
SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000218'),
    'P3',
    'a reorder project starts at P3'
);

SELECT is(
    (SELECT array_agg(DISTINCT t.phase)::TEXT || ':' || count(*) FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000218'),
    '{P3}:' || (SELECT count(*) FROM public.task_template tt WHERE tt.phase = 'P3'),
    'a reorder project gets the P3 checklist, not P1''s'
);

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000219'),
    'P2',
    'a variant project starts at P2'
);

SELECT is(public.initial_phase('npi', 'a_sourcing', ARRAY['A0'])::TEXT, 'PL1', 'an A0-only project starts at PL1');

SELECT is(public.initial_phase('reorder', NULL, ARRAY['B'])::TEXT, 'P5', 'a B-only project starts at P5');

SELECT is(public.phase_after('PL_G2', 'a_sourcing', ARRAY['A0'])::TEXT, 'closed', 'an A0-only project closes after PL-G2');

SELECT is(public.phase_after('PL_G2', 'b_private_label', ARRAY['A2'])::TEXT, 'PL4', 'a private label project goes on to PL4 after PL-G2');

-- Gate rules.
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

SELECT throws_ok(
    $$ UPDATE public.project_gate SET status = 'passed' WHERE id = current_setting('test.c1')::UUID $$,
    '23514',
    'gate_customer_approval_required',
    'a direct update of a gate obeys the same rules'
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

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g1')::UUID, 'go', '2026-11-03',
                                '00000000-0000-4000-8000-000000000224')
    $$,
    '23514',
    'gate_approval_document_invalid',
    'the approval document must be a gate approval of this gate'
);

UPDATE public.project SET status = 'on_hold' WHERE id = '00000000-0000-4000-8000-000000000215';

SELECT throws_ok(
    $$ SELECT public.pass_gate(current_setting('test.c1')::UUID, 'paused') $$,
    '23514',
    'project_not_active',
    'a gate of a project on hold cannot pass'
);

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
    (SELECT array_agg(DISTINCT t.phase)::TEXT FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000214'),
    '{P1,P2}',
    'entering P2 adds the P2 checklist'
);

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000214' AND phase = 'P2' AND blocks_gate;

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.v2')::UUID, 'samples ok', '2026-11-03',
                                '00000000-0000-4000-8000-000000000222')
    $$,
    '23514',
    'gate_spec_sheet_required',
    'G2 cannot pass for a project without products'
);

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g2')::UUID, 'samples ok', '2026-11-03',
                                '00000000-0000-4000-8000-000000000217')
    $$,
    '23514',
    'gate_spec_sheet_required',
    'G2 cannot pass while a product of the project has no signed spec sheet'
);

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, version, status, issued_on,
                             is_signed, is_stamped, sent_from_official_email, url)
VALUES ('00000000-0000-4000-8000-000000000225', current_setting('test.tenant_id')::UUID,
        '00000000-0000-4000-8000-000000000212', 'product', '00000000-0000-4000-8000-000000000213', 'spec_sheet', 1,
        'signed', '2026-11-01', TRUE, TRUE, TRUE, 'https://example.test/spec-v1.pdf');

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
    $$ SELECT public.rollback_gate(current_setting('test.g3')::UUID, 'not yet') $$,
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

-- On to G4: G2 again, then G3 (its blocking P3 tasks done), then the P4 tasks.
SELECT public.pass_gate(current_setting('test.g2')::UUID, 'samples ok', '2026-11-04',
                        '00000000-0000-4000-8000-000000000217');

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000214' AND phase = 'P3' AND blocks_gate;

-- G3 needs an approved PI of one of the project's orders (032): an order of the project whose PI
-- is approved, seeded past the PO rules.
INSERT INTO public.supplier (id, tenant_id, code, display_name, country, status)
VALUES ('00000000-0000-4000-8000-000000021901', current_setting('test.tenant_id')::UUID, 'AT1', 'Atlas Hose Works', 'Türkiye', 'approved');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, project_id, currency, incoterm)
VALUES ('00000000-0000-4000-8000-000000021902', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000021901', '00000000-0000-4000-8000-000000000214', 'USD', 'FOB');
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000021903', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000021902', '00000000-0000-4000-8000-000000000213', 10, 1);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000021904', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', 'purchase_order', '00000000-0000-4000-8000-000000021902', 'pi', 'https://example.test/pi.pdf');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000021904', status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000021902';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate((SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'), current_setting('test.tenant_id')::UUID);

SELECT public.pass_gate(current_setting('test.g3')::UUID, 'PI ok', '2026-11-05',
                        '00000000-0000-4000-8000-000000000221',
                        ARRAY['00000000-0000-4000-8000-000000021904']::UUID[]);

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000214' AND phase = 'P4' AND blocks_gate;

SELECT throws_ok(
    $$
        SELECT public.pass_gate(current_setting('test.g4')::UUID, 'PSI ok', NULL, NULL,
                                ARRAY['00000000-0000-4000-8000-000000000225']::UUID[])
    $$,
    '23514',
    'gate_evidence_invalid',
    'evidence must be a document of the gate or its project'
);

SELECT lives_ok(
    $$ SELECT public.pass_gate(current_setting('test.g4')::UUID, 'PSI ok') $$,
    'G4, an internal gate, passes without the customer''s approval'
);

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000214')
    || ' ' || (SELECT array_agg(DISTINCT t.phase)::TEXT FROM public.project_task t
               WHERE t.project_id = '00000000-0000-4000-8000-000000000214'),
    'P5 {P1,P2,P3,P4,P5,P6}',
    'after G4 the project is in P5 with the checklists of P5 and P6 (G5 closes P6)'
);

-- Un-passing a gate directly: only a rollback, with a reason, from the last passed gate back.
SELECT throws_ok(
    $$ UPDATE public.project_gate SET status = 'pending' WHERE id = current_setting('test.g4')::UUID $$,
    '23514',
    'gate_not_pending',
    'a passed gate cannot be set back to pending'
);

SELECT throws_ok(
    $$ UPDATE public.project_gate SET status = 'rolled_back' WHERE id = current_setting('test.g4')::UUID $$,
    '23514',
    'gate_reason_required',
    'a direct rollback needs a reason'
);

SELECT throws_ok(
    $$
        UPDATE public.project_gate SET status = 'rolled_back', rolled_back_reason = 'brief changed'
        WHERE id = current_setting('test.g1')::UUID
    $$,
    '23514',
    'gate_rollback_order',
    'a gate cannot be rolled back directly while a later gate is still passed'
);

UPDATE public.project_gate SET status = 'rolled_back', rolled_back_reason = 'PSI to be redone'
WHERE id = current_setting('test.g4')::UUID;

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000214'),
    'P4',
    'a direct rollback of the last passed gate takes the project back to the phase it closes'
);

-- One pass per project per statement.
UPDATE public.project SET status = 'active' WHERE id = '00000000-0000-4000-8000-000000000215';

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000215' AND blocks_gate;

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
SELECT x.id, current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', 'project_gate',
       current_setting('test.' || x.gate)::UUID, 'gate_approval', 'approved', 'https://example.test/' || x.gate || '.pdf'
FROM (VALUES ('00000000-0000-4000-8000-000000000227'::UUID, 'c1'),
             ('00000000-0000-4000-8000-000000000228', 'c2')) AS x (id, gate);

SELECT throws_ok(
    $$
        UPDATE public.project_gate
        SET status = 'passed',
            customer_approved_on = '2026-11-03',
            approval_document_id = CASE code
                WHEN 'G1' THEN '00000000-0000-4000-8000-000000000227'::UUID
                ELSE '00000000-0000-4000-8000-000000000228'::UUID
            END
        WHERE project_id = '00000000-0000-4000-8000-000000000215' AND code IN ('G1', 'G2')
    $$,
    '23514',
    'gate_one_at_a_time',
    'two gates of a project cannot pass in one statement'
);

-- Path B: G1 leads to PL1, and PL_G1 closes PL2.
SELECT is(
    (SELECT array_agg(DISTINCT t.phase)::TEXT FROM public.project_task t
     WHERE t.project_id = '00000000-0000-4000-8000-000000000220'),
    '{P1}',
    'a new private label project has the P1 checklist only'
);

UPDATE public.project_task SET status = 'done'
WHERE project_id = '00000000-0000-4000-8000-000000000220' AND phase = 'P1' AND blocks_gate;

SELECT public.pass_gate(current_setting('test.b1')::UUID, 'go', '2026-11-03',
                        '00000000-0000-4000-8000-000000000223');

SELECT is(
    (SELECT p.current_phase::TEXT FROM public.project p WHERE p.id = '00000000-0000-4000-8000-000000000220')
    || ' ' || (SELECT array_agg(DISTINCT t.phase)::TEXT FROM public.project_task t
               WHERE t.project_id = '00000000-0000-4000-8000-000000000220'),
    'PL1 {P1,PL1,PL2}',
    'after G1 on path B the project is in PL1 with the checklists of PL1 and PL2'
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
    $$ SELECT public.pass_gate(current_setting('test.c1')::UUID, 'not mine') $$,
    'PGRST',
    NULL,
    'Nova cannot pass Atlas''s gate'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
