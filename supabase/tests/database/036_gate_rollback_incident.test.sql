CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- A gate rolls back only through an incident (036) on the MOESA demo company of seed.sql: the
-- pilot's G1 is passed, then a rollback without an incident, with another customer's incident and
-- with a closed one are refused, and one with an open incident of the customer rolls it back and is
-- remembered on the gate. What it writes is rolled back.
BEGIN;

SELECT plan(8);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('tr1', (SELECT id FROM public.supplier WHERE code = 'TR1')),
    ('cn1', (SELECT id FROM public.supplier WHERE code = 'CN1')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('tips', (SELECT id FROM public.product WHERE sku = 'THO-TIPS-6-50')),
    ('cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100')),
    ('spec_mop', (SELECT d.id FROM public.document d JOIN public.product p ON p.id = d.entity_id
                  WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet')),
    ('rosbach', (SELECT id FROM public.customer_warehouse WHERE display_name = 'Rosbach')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu'))
) AS x (k, v);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

-- G1 of the pilot passed the real way (032 pattern).
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000036011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000036011');
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000036001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened)
VALUES ('00000000-0000-4000-8000-000000036021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Brief changed', 'The customer changed the brief after G1.'),
       ('00000000-0000-4000-8000-000000036022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000036001', 'om', 's3', 'Zed brief', 'Another customer''s incident.'),
       ('00000000-0000-4000-8000-000000036023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Old issue', 'Closed long ago.');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000036023';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed') $$,
                 '23514', 'gate_rollback_incident_required', 'a rollback names its incident (K3)');
SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036022') $$,
                 '23514', 'gate_incident_invalid', 'not another customer''s incident');
SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036023') $$,
                 '23514', 'gate_incident_invalid', 'not a closed incident');
SELECT lives_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036021') $$,
                'an open incident of the customer rolls the gate back');
SELECT is((SELECT status || ':' || rolled_back_incident_id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'),
          'rolled_back:00000000-0000-4000-8000-000000036021', 'the gate remembers the incident');
SELECT is((SELECT count(*)::INT FROM public.project_gate WHERE rolled_back_incident_id = '00000000-0000-4000-8000-000000036021'), 1,
          'the incident lists the gate it rolled back');

-- Passed again, G1 drops its last rollback: a direct rollback names its own incident.
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok again', current_date, '00000000-0000-4000-8000-000000036011');
SELECT throws_ok($$ UPDATE public.project_gate SET status = 'rolled_back', rolled_back_reason = 'brief changed again'
                    WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1' $$,
                 '23514', 'gate_rollback_incident_required', 'a re-passed gate does not keep its old incident');
SELECT lives_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed again', '00000000-0000-4000-8000-000000036021') $$,
                'naming an open incident rolls it back again');

SELECT * FROM finish();

ROLLBACK;
