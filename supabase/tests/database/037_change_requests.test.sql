CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Change requests (037) on the MOESA demo company of seed.sql: the code from the customer, the
-- decision due date (five business days, or 24 hours when urgent), at least one kind of change, the
-- affected document of the same customer, the status flow, the customer's written approval after a
-- passed gate that needs it, MOESA's approval date and approver, the new version an applied request
-- needs, the reason of a rejection, the products of the same customer, no deleting, and another
-- tenant that sees none of them. What it writes is rolled back.
BEGIN;

SELECT plan(24);

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

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000037001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000037001');
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000037002', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000037003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000037002', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000037004', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000037002', 'customer', '00000000-0000-4000-8000-000000037002', 'contract', 'https://example.test/zed-contract.pdf');
INSERT INTO public.change_request (id, tenant_id, customer_id, code, project_id, title, source, change_kinds, current_value, requested_value, reason, affected_gate_code, affected_document_id)
VALUES ('00000000-0000-4000-8000-000000037011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'X', current_setting('test.pilot')::UUID, 'Tolerance 3 mm', 'supplier',
        ARRAY['spec']::public.change_kind[], 'Tolerance ± 5 mm', 'Tolerance ± 3 mm', 'Sample T02 edge deviation.', 'G1', current_setting('test.spec_mop')::UUID);
INSERT INTO public.change_request (id, tenant_id, customer_id, title, source, urgency, change_kinds, current_value, requested_value, reason)
VALUES ('00000000-0000-4000-8000-000000037012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Ready date +7 days', 'customer', 'urgent',
        ARRAY['deadline']::public.change_kind[], 'Ready 2027-01-10', 'Ready 2027-01-17', 'The customer moved the launch.');

SELECT is((SELECT code || ':' || status FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          'CR-THO-' || extract(year FROM now())::INT || '-001:open', 'CR-<customer>-<year>-<number> (K5, S08)');
SELECT is((SELECT decision_due_on FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          public.add_business_days((now() AT TIME ZONE 'UTC')::DATE, 5), 'a normal request is decided in five business days');
SELECT is((SELECT decision_due_on FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037012'),
          (now() AT TIME ZONE 'UTC')::DATE + 1, 'an urgent one in 24 hours');
SELECT throws_ok($$ INSERT INTO public.change_request (tenant_id, customer_id, title, source, change_kinds, current_value, requested_value, reason)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Nothing', 'moesa', ARRAY[]::public.change_kind[], 'a', 'b', 'c') $$,
                 '23514', NULL, 'at least one kind of change');
SELECT throws_ok($$ UPDATE public.change_request SET affected_document_id = '00000000-0000-4000-8000-000000037004' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_document_invalid', 'not another customer''s document');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_status_order', 'approved before applied');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'approved' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_customer_approval_required', 'a passed (M) gate needs the customer''s written approval');
SELECT throws_ok($$ UPDATE public.change_request SET customer_approval_document_id = current_setting('test.spec_mop')::UUID WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_approval_document_invalid', 'the approval is a document of the request');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000037021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'change_request', '00000000-0000-4000-8000-000000037011',
        'change_request', 'approved', 'https://example.test/cr-approval.pdf');
UPDATE public.change_request SET customer_approved_on = current_date, customer_approval_document_id = '00000000-0000-4000-8000-000000037021', status = 'approved'
WHERE id = '00000000-0000-4000-8000-000000037011';

SELECT is((SELECT moesa_approved_on = (now() AT TIME ZONE 'UTC')::DATE AND moesa_approved_by = current_setting('test.koordinator')::UUID FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          TRUE, 'approval records MOESA''s date and approver');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_new_version_required', 'applied needs the new version');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000037031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product', current_setting('test.mop')::UUID, 'label_artwork', 'https://example.test/label.pdf');

SELECT throws_ok($$ UPDATE public.change_request SET result_document_id = '00000000-0000-4000-8000-000000037031', status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_new_version_required', 'the new version is of the same document');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, version, url)
VALUES ('00000000-0000-4000-8000-000000037032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product', current_setting('test.mop')::UUID, 'spec_sheet', 3, 'https://example.test/spec-v03.pdf');
UPDATE public.change_request SET result_document_id = '00000000-0000-4000-8000-000000037032', status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011';

SELECT is((SELECT status || ':' || (closed_on = (now() AT TIME ZONE 'UTC')::DATE) FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          'applied:true', 'the spec''s new version applies the request');
SELECT throws_ok($$ UPDATE public.change_request SET result_document_id = NULL WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_immutable_field', 'an applied request keeps its new version');
SELECT throws_ok($$ UPDATE public.change_request SET affected_document_id = NULL WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_immutable_field', 'nor does its affected document change');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'rejected' WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '23514', 'change_request_decision_note_required', 'a rejection says why');
SELECT throws_ok($$ INSERT INTO public.change_request_product (change_request_id, product_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000037012', '00000000-0000-4000-8000-000000037003', current_setting('test.moesa')::UUID) $$,
                 '23503', NULL, 'not another customer''s product');
SELECT throws_ok($$ DELETE FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '42501', NULL, 'change requests are not deleted');

-- The approver, the approval date and the closing date are the server's, whatever the client sends.
UPDATE public.change_request SET status = 'approved', moesa_approved_by = current_setting('test.akif')::UUID, moesa_approved_on = '2020-01-01', closed_on = '2020-01-01'
WHERE id = '00000000-0000-4000-8000-000000037012';

SELECT is((SELECT moesa_approved_by = current_setting('test.koordinator')::UUID AND moesa_approved_on = (now() AT TIME ZONE 'UTC')::DATE AND closed_on IS NULL
           FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037012'),
          TRUE, 'the approver, approval date and closing date are not the client''s');
SELECT throws_ok($$ UPDATE public.change_request SET result_document_id = '00000000-0000-4000-8000-000000037004' WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '23514', 'change_request_document_invalid', 'the resulting document is the customer''s, even without an affected document');
SELECT throws_ok($$ UPDATE public.change_request SET customer_approval_document_id = NULL, customer_approved_on = NULL WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_immutable_field', 'the customer''s approval stays once the request is approved');
SELECT throws_ok($$ UPDATE public.change_request SET created_at = now() - INTERVAL '10 days' WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '23514', 'change_request_immutable_field', 'when the request was made does not change');

-- The customer's approval may be entered after MOESA approves (the current version 2); an entered
-- one stays.
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, version, url)
VALUES ('00000000-0000-4000-8000-000000037041', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'change_request', '00000000-0000-4000-8000-000000037012',
        'change_request', 'approved', 1, 'https://example.test/cr-012-approval.pdf'),
       ('00000000-0000-4000-8000-000000037042', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'change_request', '00000000-0000-4000-8000-000000037012',
        'change_request', 'approved', 2, 'https://example.test/cr-012-approval-2.pdf');

SELECT lives_ok($$ UPDATE public.change_request SET customer_approved_on = current_date, customer_approval_document_id = '00000000-0000-4000-8000-000000037042'
                   WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                'the customer''s approval is entered after MOESA approves');
SELECT throws_ok($$ UPDATE public.change_request SET customer_approval_document_id = '00000000-0000-4000-8000-000000037041' WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '23514', 'change_request_immutable_field', 'an entered approval is not swapped');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.change_request), 0, 'another tenant sees none');

SELECT * FROM finish();

ROLLBACK;
