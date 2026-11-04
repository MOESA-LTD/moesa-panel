CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Incidents (035) on the MOESA demo company of seed.sql: the code from the family and the customer,
-- the customer notice time of S1 and S2 (business days), the deadlines the incident calculates, the
-- overview's linked record and next deadline, the Y10 card of the incident's family, the fixed
-- family, the linked record of the same customer, the management notice before an S1 leaves open,
-- what closing needs and that management closes an S1, a closed incident's log, the final closed
-- status, a cost with its currency and payer, no deleting, and another tenant that sees none of
-- them. What it writes is rolled back.
BEGIN;

SELECT plan(23);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
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

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000035001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000035002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
-- An S1 on Friday morning about the pilot, an S2 on Saturday about a document request.
INSERT INTO public.incident (id, tenant_id, customer_id, code, family, severity, title, what_happened, entity_type, entity_id, opened_at)
VALUES ('00000000-0000-4000-8000-000000035011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'X', 'ol', 's1', 'Pallets short at Rosbach',
        'Two pallets fewer than the packing list.', 'project', current_setting('test.pilot')::UUID, '2026-11-06 09:00+00'),
       ('00000000-0000-4000-8000-000000035012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, NULL, 'oa', 's2', 'GPSR document request',
        'Amazon DE asks for the GPSR safety information.', NULL, NULL, '2026-11-07 10:00+00');
INSERT INTO public.incident_deadline (id, tenant_id, incident_id, kind)
VALUES ('00000000-0000-4000-8000-000000035021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035012', 'document_request'),
       ('00000000-0000-4000-8000-000000035022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'supplier_damage');

SELECT is((SELECT code || ':' || status FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          'OL-THO-' || extract(year FROM now())::INT || '-001:open', 'the code is the family, the customer, the year and the number');
SELECT is((SELECT customer_notice_due_at FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          '2026-11-06 13:00+00'::TIMESTAMPTZ, 'S1: the customer within four hours');
SELECT is((SELECT customer_notice_due_at FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035012'),
          '2026-11-09 23:59:59+00'::TIMESTAMPTZ, 'S2 on a Saturday: by the end of Monday');
SELECT is(public.add_business_days('2026-11-06', 5), '2026-11-13'::DATE, 'five business days from a Friday');
SELECT is(public.add_business_days('2026-11-07', 0), '2026-11-09'::DATE, 'a weekend day rolls to Monday');
SELECT is((SELECT due_at FROM public.incident_deadline WHERE id = '00000000-0000-4000-8000-000000035021'),
          '2026-11-13 23:59:59+00'::TIMESTAMPTZ, 'a document request: five business days');
SELECT is((SELECT due_at FROM public.incident_deadline WHERE id = '00000000-0000-4000-8000-000000035022'),
          '2026-11-08 09:00+00'::TIMESTAMPTZ, 'the supplier damage notice: 48 hours');
SELECT throws_ok($$ INSERT INTO public.incident_deadline (tenant_id, incident_id, kind) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'other') $$,
                 '23502', NULL, 'another deadline needs its date');
SELECT is((SELECT entity_label FROM public.incident_overview WHERE id = '00000000-0000-4000-8000-000000035011'),
          (SELECT code FROM public.project WHERE id = current_setting('test.pilot')::UUID), 'the overview names the linked record');
SELECT is((SELECT next_deadline_at FROM public.incident_overview WHERE id = '00000000-0000-4000-8000-000000035012'),
          '2026-11-13 23:59:59+00'::TIMESTAMPTZ, 'the next deadline');
SELECT throws_ok($$ UPDATE public.incident SET incident_type = 'OA-02' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_type_family', 'the Y10 card is of the incident''s family');
SELECT throws_ok($$ UPDATE public.incident SET incident_type = 'OL-1' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', NULL, 'a Y10 card code');
SELECT throws_ok($$ UPDATE public.incident SET family = 'om' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_immutable_field', 'the family is fixed with the code');
SELECT throws_ok($$ UPDATE public.incident SET entity_id = '00000000-0000-4000-8000-000000035002' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_entity_invalid', 'not another customer''s record');
SELECT throws_ok($$ UPDATE public.incident SET status = 'contained' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_management_notice_required', 'S1 leaves open only once management is told');

UPDATE public.incident SET management_notified_at = '2026-11-06 09:30+00', status = 'contained' WHERE id = '00000000-0000-4000-8000-000000035011';

SELECT throws_ok($$ UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_closure_incomplete', 'closing needs the outcome, root cause and preventive action');
SELECT throws_ok($$ UPDATE public.incident SET status = 'closed', outcome = 'partial_recovery', root_cause = 'carrier', preventive_action = 'Y07 §4.3: count pallets at loading (v1.2)'
                    WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '42501', 'incident_close_management', 'management closes an S1');

RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
UPDATE public.incident SET status = 'closed', outcome = 'partial_recovery', root_cause = 'carrier', preventive_action = 'Y07 §4.3: count pallets at loading (v1.2)'
WHERE id = '00000000-0000-4000-8000-000000035011';

SELECT is((SELECT status || ':' || (closed_on = current_date) FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          'closed:true', 'closing dates it');
SELECT throws_ok($$ INSERT INTO public.incident_log (tenant_id, incident_id, note) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'late note') $$,
                 '23514', 'incident_closed', 'a closed incident''s log no longer changes');
SELECT throws_ok($$ UPDATE public.incident SET status = 'open' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_status_order', 'closed is final');
SELECT throws_ok($$ INSERT INTO public.incident_log (tenant_id, incident_id, note, cost_amount) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035012', 'storage fee', 100) $$,
                 '23514', NULL, 'a cost names its currency and payer');
SELECT throws_ok($$ DELETE FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035012' $$,
                 '42501', NULL, 'incidents are not deleted');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.incident), 0, 'another tenant sees none');

SELECT * FROM finish();

ROLLBACK;
