CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Shipments (031) on the MOESA demo company of seed.sql: the code from next_code, the customer's own
-- warehouse and orders, the open orders only, the lines of linked orders, the quantity cap with the
-- order's tolerance (a cancelled shipment frees its quantity), the status flow and what each status
-- needs (a line before loading), the lock from loaded, the dispute deadline from the supplier's
-- damage notice, acceptance (the delivery receipt, no reservations straight from delivered, a
-- settled dispute as it is), the overview's orders, products and PSI warning, the
-- share lock on the shipment, the rules_bypass flag a user cannot use, and the cascade of a removed
-- shipment. What it writes is rolled back.
BEGIN;

SELECT plan(38);

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

-- Fixtures, as the coordinator.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000031001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.customer_warehouse (id, tenant_id, customer_id, display_name)
VALUES ('00000000-0000-4000-8000-000000031002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', 'WZ');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000031003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm, tolerance_pct)
VALUES ('00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.cn1')::UUID, 'USD', 'FOB', 5), ('00000000-0000-4000-8000-000000031012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL, NULL),
       ('00000000-0000-4000-8000-000000031013', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', current_setting('test.tr1')::UUID, 'USD', NULL, NULL);
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000031021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031011', current_setting('test.mop')::UUID, 1000, 2), ('00000000-0000-4000-8000-000000031022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031012', current_setting('test.cones')::UUID, 10, 1), ('00000000-0000-4000-8000-000000031023', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031013', '00000000-0000-4000-8000-000000031003', 1, 1);
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = 'pi_approved' WHERE id IN ('00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031013');
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'fcl20', current_setting('test.rosbach')::UUID
FROM (VALUES ('00000000-0000-4000-8000-000000031031'::UUID), ('00000000-0000-4000-8000-000000031032'), ('00000000-0000-4000-8000-000000031033'), ('00000000-0000-4000-8000-000000031034'), ('00000000-0000-4000-8000-000000031036')) AS x (id);

SELECT is((SELECT code FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'),
          'SHP-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT throws_ok($$ INSERT INTO public.shipment (tenant_id, customer_id, mode, delivery_warehouse_id)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', '00000000-0000-4000-8000-000000031002') $$,
                 '23503', NULL, 'not another customer''s warehouse');
SELECT throws_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031012', current_setting('test.moesa')::UUID) $$, '23514', 'shipment_po_not_open', 'a draft order is not shipped');
SELECT throws_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031013', current_setting('test.moesa')::UUID) $$, '23503', NULL, 'not another customer''s order');
SELECT lives_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID) $$, 'an approved order is linked');
SELECT throws_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031040', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031012', '00000000-0000-4000-8000-000000031022', 1) $$, '23503', NULL, 'a line needs its order on the shipment');
SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031041', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 1000) $$, 'the ordered quantity');

INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031032', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID);

SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031042', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031032', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 50) $$, 'within the 5 % tolerance');
SELECT throws_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031043', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 1) $$, '23514', 'shipment_quantity_exceeds_po', 'not beyond the tolerance');

UPDATE public.shipment SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000031032';

SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031043', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 50) $$, 'a cancelled shipment frees its quantity');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_status_order', 'no skipping statuses');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'booked' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_booking_date_required', 'booking needs its confirmation date');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'booked', booking_confirmed_on = current_date WHERE id = '00000000-0000-4000-8000-000000031034' $$,
                 '23514', 'shipment_po_required', 'booking needs an order');

INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031036', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID);
UPDATE public.shipment SET status = 'booked', booking_confirmed_on = current_date WHERE id = '00000000-0000-4000-8000-000000031036';

SELECT throws_ok($$ UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031036' $$,
                 '23514', 'shipment_lines_required', 'nothing is loaded without a line');

UPDATE public.shipment SET status = 'booked', booking_confirmed_on = current_date WHERE id = '00000000-0000-4000-8000-000000031031';
UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment_line SET quantity = 900 WHERE id = '00000000-0000-4000-8000-000000031041' $$,
                 '23514', 'shipment_locked', 'loaded goods do not change');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'in_transit' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_eta_required', 'in transit needs ETD and ETA');

UPDATE public.shipment SET status = 'in_transit', etd = current_date, eta = current_date + 20 WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment SET status = 'delivered' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_delivery_time_required', 'delivered needs the time');

UPDATE public.shipment SET status = 'delivered', delivered_at = '2027-01-10 10:00+00' WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT is((SELECT dispute_deadline_at FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'), '2027-01-12 10:00+00'::TIMESTAMPTZ,
          'the supplier''s 48 hours to report damage');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_delivery_receipt_required', 'acceptance needs the delivery receipt (G5)');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000031051', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'shipment', '00000000-0000-4000-8000-000000031031', 'delivery_receipt', 'approved', 'https://example.test/receipt.pdf');
UPDATE public.shipment SET quantity_matches = TRUE, has_damage = TRUE WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_acceptance_issue', 'damage means disputed, not accepted');

UPDATE public.shipment SET status = 'disputed' WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT lives_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                'a settled dispute is accepted with the damage it records');
SELECT is((SELECT has_damage FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'), TRUE,
          'the damage stays on record');

-- Beyond the brief: acceptance date, final status, the overview, the other guards, the share lock,
-- the bypass flag and the cascade.
SELECT is((SELECT accepted_on FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'), current_date,
          'acceptance is dated today by default');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'disputed' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_status_order', 'accepted is final');
SELECT is((SELECT purchase_order_codes FROM public.shipment_overview WHERE id = '00000000-0000-4000-8000-000000031031'),
          ARRAY[(SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000031011')],
          'the overview names the shipment''s orders');
SELECT is((SELECT product_ids FROM public.shipment_overview WHERE id = '00000000-0000-4000-8000-000000031031'),
          ARRAY[current_setting('test.mop')::UUID], 'the overview lists the products of its lines');
SELECT is((SELECT psi_missing_po_codes FROM public.shipment_overview WHERE id = '00000000-0000-4000-8000-000000031031'),
          ARRAY[(SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000031011')],
          'an order without an approved PSI is a warning');

INSERT INTO public.document (tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000031011', 'psi_report', 'approved', 'https://example.test/psi.pdf');

SELECT is((SELECT psi_missing_po_codes FROM public.shipment_overview WHERE id = '00000000-0000-4000-8000-000000031031'),
          '{}'::TEXT[], 'an approved PSI clears the warning');
SELECT throws_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031012', current_setting('test.moesa')::UUID) $$,
                 '23514', 'shipment_locked', 'a loaded shipment takes no order');
SELECT throws_ok($$ DELETE FROM public.shipment_purchase_order WHERE shipment_id = '00000000-0000-4000-8000-000000031033' $$,
                 '23514', 'shipment_po_has_lines', 'an order with lines on the shipment stays linked');
SELECT throws_ok($$ UPDATE public.shipment SET customer_id = '00000000-0000-4000-8000-000000031001' WHERE id = '00000000-0000-4000-8000-000000031034' $$,
                 '23514', 'shipment_immutable_field', 'the customer is fixed');

INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id, status)
VALUES ('00000000-0000-4000-8000-000000031035', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', current_setting('test.rosbach')::UUID, 'accepted');

SELECT is((SELECT status FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031035'), 'planned'::public.shipment_status,
          'a new shipment is planned whatever the client sends');
SELECT throws_ok($$ DELETE FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031034' $$,
                 '42501', NULL, 'shipments are cancelled, not deleted');
SELECT throws_ok($$ INSERT INTO public.shipment_event (tenant_id, shipment_id, step) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', 21) $$,
                 '23514', NULL, 'an event step is an S15 row');

-- The line guard reads its shipment FOR SHARE, so a concurrent move to loaded waits for the write
-- (the foreign key alone takes FOR KEY SHARE). pgrowlocks names a share lock 'For Share', or 'Share'
-- inside a multixact.
UPDATE public.shipment_line SET carton_count = 5 WHERE id = '00000000-0000-4000-8000-000000031043';
RESET ROLE;
CREATE EXTENSION IF NOT EXISTS pgrowlocks WITH SCHEMA extensions;
SELECT ok((SELECT r.modes && ARRAY['For Share', 'Share'] FROM extensions.pgrowlocks('public.shipment') r JOIN public.shipment s ON s.ctid = r.locked_row
           WHERE s.id = '00000000-0000-4000-8000-000000031033'), 'a line write share-locks its shipment');
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT set_config('moesa.rules_bypass', '1', TRUE);
SELECT throws_ok($$ UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031034' $$,
                 '23514', 'shipment_status_order', 'an impersonated user cannot use the bypass flag');
SELECT set_config('moesa.rules_bypass', '', TRUE);

-- A shipment removed with its tenant takes its orders, lines and events (the guards let the
-- cascade through); as postgres, on one shipment.
INSERT INTO public.shipment_event (tenant_id, shipment_id, step, note) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', 3, 'booking requested');
RESET ROLE;
SELECT lives_ok($$ DELETE FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031033' $$, 'a removed shipment cascades');
SELECT is((SELECT (SELECT count(*) FROM public.shipment_line WHERE shipment_id = '00000000-0000-4000-8000-000000031033')
                + (SELECT count(*) FROM public.shipment_purchase_order WHERE shipment_id = '00000000-0000-4000-8000-000000031033')
                + (SELECT count(*) FROM public.shipment_event WHERE shipment_id = '00000000-0000-4000-8000-000000031033'))::INT,
          0, 'its orders, lines and events go with it');

SELECT * FROM finish();

ROLLBACK;
