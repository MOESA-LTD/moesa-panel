CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Gate evidence from orders and shipments (032) on the MOESA demo company of seed.sql: another
-- project's PI is not evidence, G3 needs the PI of one of the project's orders whose PI is
-- approved, that PI passes G3, a shipment's delivery receipt is G5 evidence, and the project still
-- advances as before. What it writes is rolled back.
BEGIN;

SELECT plan(5);

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

-- Gate approvals (G1, G2, G3, G5), and G1 and G2 passed the real way.
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate', (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = x.code::public.gate_code),
       'gate_approval', 'approved', 'https://example.test/' || x.code || '.pdf'
FROM (VALUES ('00000000-0000-4000-8000-000000032011'::UUID, 'G1'), ('00000000-0000-4000-8000-000000032012', 'G2'), ('00000000-0000-4000-8000-000000032013', 'G3'), ('00000000-0000-4000-8000-000000032015', 'G5')) AS x (id, code);
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000032011');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G2'), 'spec ok', current_date, '00000000-0000-4000-8000-000000032012');

-- Orders: P (the pilot's, PI approved), P2 (the pilot's, only sent), Q (no project); a shipment of P.
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, project_id, currency)
VALUES ('00000000-0000-4000-8000-000000032021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, current_setting('test.pilot')::UUID, 'USD'), ('00000000-0000-4000-8000-000000032022', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, current_setting('test.pilot')::UUID, 'USD'),
       ('00000000-0000-4000-8000-000000032023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, NULL, 'USD');
INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
SELECT current_setting('test.moesa')::UUID, x.id, current_setting('test.mop')::UUID, 10, 1 FROM (VALUES ('00000000-0000-4000-8000-000000032021'::UUID), ('00000000-0000-4000-8000-000000032022'), ('00000000-0000-4000-8000-000000032023')) AS x (id);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000032031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032021', 'pi', 'https://example.test/pi-p.pdf'),
       ('00000000-0000-4000-8000-000000032032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032022', 'pi', 'https://example.test/pi-p2.pdf'),
       ('00000000-0000-4000-8000-000000032033', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032023', 'pi', 'https://example.test/pi-q.pdf');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000032031', status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000032021';
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000032032', status = 'sent' WHERE id = '00000000-0000-4000-8000-000000032022';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
VALUES ('00000000-0000-4000-8000-000000032041', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', current_setting('test.rosbach')::UUID);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000032041', '00000000-0000-4000-8000-000000032021', current_setting('test.moesa')::UUID);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000032042', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'shipment', '00000000-0000-4000-8000-000000032041', 'delivery_receipt', 'approved', 'https://example.test/receipt.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;

SELECT throws_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032033']::UUID[]) $$,
                 '23514', 'gate_evidence_invalid', 'another project''s PI is not evidence');
SELECT throws_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032032']::UUID[]) $$,
                 '23514', 'gate_pi_required', 'G3 needs an approved PI');
SELECT lives_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032031']::UUID[]) $$,
                'the project''s approved PO PI passes G3');

UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G4'), 'PSI ok');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;

SELECT lives_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G5'), 'delivered', current_date, '00000000-0000-4000-8000-000000032015', ARRAY['00000000-0000-4000-8000-000000032042']::UUID[]) $$,
                'the shipment''s delivery receipt is G5 evidence');
SELECT is((SELECT current_phase FROM public.project WHERE id = current_setting('test.pilot')::UUID), 'L1'::public.project_phase,
          'the project still advances as before');

SELECT * FROM finish();

ROLLBACK;
