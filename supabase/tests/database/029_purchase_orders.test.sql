CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Purchase orders (M6) on the MOESA demo company of seed.sql: the code from next_code, the terms
-- defaulted from the supplier and the company setting, the Incoterms and PI checklist checks, the
-- fixed code and supplier, the lines (computed total, the order's customer, one per product, the
-- customer's own products), the project of the same customer, no deleting, and the product's last
-- order in public.product_evidence. What it writes is rolled back.
BEGIN;

SELECT plan(14);

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

-- Another customer with its own product and project, and a supplier whose incoterm is not a code.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000029001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000029002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029001', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000029003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
-- Supplier terms: management (the coordinator only reads them).
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.supplier (id, tenant_id, code, display_name, country, default_incoterm, status)
VALUES ('00000000-0000-4000-8000-000000029004', current_setting('test.moesa')::UUID, 'TR9', 'Dokuz', 'Türkiye', 'Ex Works', 'approved');
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, code)
VALUES ('00000000-0000-4000-8000-000000029011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 'X');

SELECT is((SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'),
          'PO-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT is((SELECT incoterm || ':' || deposit_rate FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'),
          'EXW:30.00', 'incoterm and deposit come from the supplier');

RESET ROLE;
UPDATE public.setting SET value = '25' WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'deposit_rate_default';
-- Management from here: the orders below set the Incoterm and PI fields, which the coordinator only reads.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm)
VALUES ('00000000-0000-4000-8000-000000029012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, '00000000-0000-4000-8000-000000029004', 'USD', 'FOB');

SELECT is((SELECT deposit_rate FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029012'), 25.00::NUMERIC(5,2),
          'without a supplier deposit, the company setting');
SELECT throws_ok($$ INSERT INTO public.purchase_order (tenant_id, customer_id, supplier_id, currency)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, '00000000-0000-4000-8000-000000029004', 'USD') $$,
                 '23502', NULL, 'an invalid supplier incoterm is not copied; incoterm stays required');
SELECT throws_ok($$ INSERT INTO public.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 'XYZ') $$,
                 '23514', NULL, 'only Incoterms 2020 codes');
SELECT throws_ok($$ UPDATE public.purchase_order SET code = 'PO-X' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', 'purchase_order_immutable_field', 'the code is fixed');
SELECT throws_ok($$ UPDATE public.purchase_order SET supplier_id = current_setting('test.cn1')::UUID WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', 'purchase_order_immutable_field', 'the supplier is fixed');

INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, customer_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000029021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', '00000000-0000-4000-8000-000000029001', current_setting('test.mop')::UUID, 3, 1.9);

SELECT is((SELECT line_total::TEXT || ':' || (customer_id = current_setting('test.tho')::UUID) FROM public.purchase_order_line WHERE id = '00000000-0000-4000-8000-000000029021'),
          '5.7000:true', 'the line total is computed; the line takes the order''s customer');
SELECT throws_ok($$ INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', '00000000-0000-4000-8000-000000029002', 1, 1) $$,
                 '23503', NULL, 'not another customer''s product');
SELECT throws_ok($$ INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', current_setting('test.mop')::UUID, 1, 1) $$,
                 '23505', NULL, 'a product once per order');
SELECT throws_ok($$ UPDATE public.purchase_order SET project_id = '00000000-0000-4000-8000-000000029003' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23503', NULL, 'not another customer''s project');
SELECT throws_ok($$ UPDATE public.purchase_order SET pi_check = '{"31":"ok"}' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', NULL, 'only the 30 S09 items');
SELECT throws_ok($$ DELETE FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '42501', NULL, 'purchase orders are not deleted');
SELECT is((SELECT last_po_code FROM public.product_evidence WHERE product_id = current_setting('test.mop')::UUID),
          (SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'), 'the product shows its last order');

SELECT * FROM finish();

ROLLBACK;
