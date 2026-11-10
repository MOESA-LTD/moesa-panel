CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Market cells (034) on the MOESA demo company of seed.sql: a cell takes its product's customer,
-- one per product, platform and country, only the platform's countries, the project of the same
-- customer, the S05 status order, what live needs (L-G1) and keeps, the reasons suppressed, stopped
-- and removed need, the compliance note and the red rule, the fixed product, platform and country,
-- deleting only candidates, the product's live cell count, the overview, and another tenant that
-- sees none of them. What it writes is rolled back.
BEGIN;

SELECT plan(20);

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

INSERT INTO api.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000034001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO api.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000034002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000034001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
-- The first cell is sent with another customer: the trigger takes the product's.
INSERT INTO api.market_cell (id, tenant_id, customer_id, product_id, project_id, platform_id, country)
VALUES ('00000000-0000-4000-8000-000000034011', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000034001', current_setting('test.mop')::UUID, current_setting('test.pilot')::UUID, 'amazon', 'DE'),
       ('00000000-0000-4000-8000-000000034012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tips')::UUID, NULL, 'ebay', 'DE');

SELECT is((SELECT status || ':' || (customer_id = current_setting('test.tho')::UUID) FROM api.market_cell WHERE id = '00000000-0000-4000-8000-000000034011'),
          'candidate:true', 'a new cell is a candidate of its product''s customer');
SELECT throws_ok($$ INSERT INTO api.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'DE') $$,
                 '23505', NULL, 'one cell per product, platform and country');
SELECT throws_ok($$ INSERT INTO api.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'TR') $$,
                 '23514', 'market_cell_country_invalid', 'the country is one of the platform''s');
SELECT throws_ok($$ INSERT INTO api.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'de') $$,
                 '23514', NULL, 'an ISO 3166-1 alpha-2 code');
SELECT throws_ok($$ UPDATE api.market_cell SET project_id = '00000000-0000-4000-8000-000000034002' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23503', NULL, 'not another customer''s project');
SELECT throws_ok($$ UPDATE api.market_cell SET status = 'live' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_status_order', 'statuses move as S05 says');

UPDATE api.market_cell SET status = 'planned' WHERE id = '00000000-0000-4000-8000-000000034011';
UPDATE api.market_cell SET status = 'preparing' WHERE id = '00000000-0000-4000-8000-000000034011';
UPDATE api.market_cell SET status = 'uploaded' WHERE id = '00000000-0000-4000-8000-000000034011';

SELECT throws_ok($$ UPDATE api.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', price = 12.99, currency = 'EUR', stock_source = 'platform', content_status = 'translated'
                    WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'live needs approved content (L-G1)');
SELECT throws_ok($$ UPDATE api.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', stock_source = 'platform', content_status = 'approved'
                    WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'live needs the price');
UPDATE api.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', price = 12.99, currency = 'EUR', stock_source = 'platform', content_status = 'approved'
WHERE id = '00000000-0000-4000-8000-000000034011';

SELECT is((SELECT status || ':' || launched_on FROM api.market_cell WHERE id = '00000000-0000-4000-8000-000000034011'),
          'live:' || current_date, 'going live dates the launch');
SELECT is((SELECT live_cell_count FROM api.product_evidence WHERE product_id = current_setting('test.mop')::UUID), 1,
          'the product counts its live cells');
SELECT throws_ok($$ UPDATE api.market_cell SET status = 'suppressed' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_reason_required', 'a suppressed cell names its open issue');
SELECT throws_ok($$ UPDATE api.market_cell SET platform_product_id = NULL WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'a live cell keeps its listing data');
SELECT throws_ok($$ UPDATE api.market_cell SET platform_sku = '  ' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'a blanked SKU counts as missing');
SELECT throws_ok($$ UPDATE api.market_cell SET compliance = 'yellow' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_compliance_note_required', 'yellow needs a compliance note');

UPDATE api.market_cell SET status = 'planned' WHERE id = '00000000-0000-4000-8000-000000034012';

SELECT throws_ok($$ UPDATE api.market_cell SET compliance = 'red', compliance_note = 'No EPR registration' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_compliance_red', 'a red cell is not planned');
SELECT throws_ok($$ UPDATE api.market_cell SET country = 'FR' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_immutable_field', 'a cell keeps its product, platform and country');
SELECT throws_ok($$ DELETE FROM api.market_cell WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_delete_candidate_only', 'only a candidate is deleted');

INSERT INTO api.market_cell (id, tenant_id, product_id, platform_id, country)
VALUES ('00000000-0000-4000-8000-000000034013', current_setting('test.moesa')::UUID, current_setting('test.cones')::UUID, 'amazon', 'FR');

SELECT lives_ok($$ DELETE FROM api.market_cell WHERE id = '00000000-0000-4000-8000-000000034013' $$, 'a candidate is deleted');
SELECT is((SELECT cell_key || ':' || sku FROM api.market_cell_overview WHERE id = '00000000-0000-4000-8000-000000034011'),
          'amazon_DE:THO-MOP40-2P', 'the overview names the cell and its SKU');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM api.market_cell), 0, 'another tenant sees none');

SELECT * FROM finish();

ROLLBACK;
