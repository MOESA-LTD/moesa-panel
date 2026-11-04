CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Dashboard boxes for orders and shipments (033) on the MOESA demo company of seed.sql: only open
-- orders (neither draft, closed nor cancelled) with their planned balance date, the late flag and
-- the days to ETA of open shipments, accepted shipments left out, and another tenant that sees
-- none of them. What it writes is rolled back.
BEGIN;

SELECT plan(6);

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

-- Four orders (one left a draft, one cancelled below) and three shipments (one accepted below).
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD'
FROM (VALUES ('00000000-0000-4000-8000-000000033011'::UUID), ('00000000-0000-4000-8000-000000033012'), ('00000000-0000-4000-8000-000000033013'), ('00000000-0000-4000-8000-000000033014')) AS x (id);
INSERT INTO public.purchase_order_payment (tenant_id, purchase_order_id, kind, amount, currency, planned_on)
VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000033012', 'balance', 100, 'USD', '2027-02-01');
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', current_setting('test.rosbach')::UUID FROM (VALUES ('00000000-0000-4000-8000-000000033041'::UUID), ('00000000-0000-4000-8000-000000033042'), ('00000000-0000-4000-8000-000000033043')) AS x (id);
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = x.status::public.purchase_order_status
FROM (VALUES ('00000000-0000-4000-8000-000000033011'::UUID, 'sent'), ('00000000-0000-4000-8000-000000033012', 'in_production'), ('00000000-0000-4000-8000-000000033014', 'cancelled')) AS x (id, status)
WHERE purchase_order.id = x.id;
UPDATE public.shipment SET status = x.status::public.shipment_status, eta = x.eta
FROM (VALUES ('00000000-0000-4000-8000-000000033041'::UUID, 'in_transit', current_date - 2), ('00000000-0000-4000-8000-000000033042', 'loaded', current_date + 3),
             ('00000000-0000-4000-8000-000000033043', 'accepted', current_date)) AS x (id, status, eta)
WHERE shipment.id = x.id;
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT is((SELECT string_agg(status::TEXT, ',' ORDER BY status) FROM public.dashboard_purchase_order
           WHERE purchase_order_id IN ('00000000-0000-4000-8000-000000033011', '00000000-0000-4000-8000-000000033012', '00000000-0000-4000-8000-000000033013', '00000000-0000-4000-8000-000000033014')),
          'sent,in_production', 'open orders only');
SELECT is((SELECT balance_planned_on FROM public.dashboard_purchase_order WHERE purchase_order_id = '00000000-0000-4000-8000-000000033012'),
          '2027-02-01'::DATE, 'the balance date');
SELECT is((SELECT overdue FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033041'), TRUE, 'a passed ETA is late');
SELECT is((SELECT days_to_eta FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033042'), 3, 'days to ETA');
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033043'), 0,
          'accepted shipments leave the dashboard');

-- Another company's user: private is not reachable while impersonating, so back to postgres first.
RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment), 0, 'another tenant sees none');

SELECT * FROM finish();

ROLLBACK;
