CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Dashboard boxes for the market matrix, incidents and change requests (038) on the MOESA demo
-- company of seed.sql: the live, preparing and suppressed cells of a customer against its target,
-- the open incidents only with the missing management notice and the late customer notice, the
-- change requests past their decision date, applied requests leaving the box, and another tenant
-- that sees none of them. What it writes is rolled back.
BEGIN;

SELECT plan(7);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('tips', (SELECT id FROM public.product WHERE sku = 'THO-TIPS-6-50')),
    ('cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100'))
) AS x (k, v);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

INSERT INTO api.market_cell (id, tenant_id, product_id, platform_id, country)
SELECT x.id, current_setting('test.moesa')::UUID, x.product, x.platform, x.country
FROM (VALUES ('00000000-0000-4000-8000-000000038011'::UUID, current_setting('test.mop')::UUID, 'amazon', 'DE'),
             ('00000000-0000-4000-8000-000000038012', current_setting('test.mop')::UUID, 'amazon', 'FR'),
             ('00000000-0000-4000-8000-000000038013', current_setting('test.tips')::UUID, 'ebay', 'DE'),
             ('00000000-0000-4000-8000-000000038014', current_setting('test.cones')::UUID, 'amazon', 'IT')) AS x (id, product, platform, country);
INSERT INTO api.incident (id, tenant_id, customer_id, family, severity, title, what_happened, opened_at)
VALUES ('00000000-0000-4000-8000-000000038021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'ol', 's1', 'Truck refused', 'The warehouse refused the truck.', now() - INTERVAL '5 hours'),
       ('00000000-0000-4000-8000-000000038022', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'ot', 's3', 'Late sample', 'The supplier sent the sample late.', now()),
       ('00000000-0000-4000-8000-000000038023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Old', 'Closed.', now());
INSERT INTO api.change_request (id, tenant_id, customer_id, title, source, change_kinds, current_value, requested_value, reason, created_at)
VALUES ('00000000-0000-4000-8000-000000038031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Carton print', 'company', ARRAY['packaging']::public.change_kind[],
        'Black print', 'Two-colour print', 'Brand guide v2.', now() - INTERVAL '10 days'),
       ('00000000-0000-4000-8000-000000038032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Price', 'supplier', ARRAY['price']::public.change_kind[],
        '1.90 USD', '1.95 USD', 'Cotton price.', now());
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.market_cell SET status = x.status::public.market_cell_status
FROM (VALUES ('00000000-0000-4000-8000-000000038011'::UUID, 'live'), ('00000000-0000-4000-8000-000000038012', 'preparing'), ('00000000-0000-4000-8000-000000038013', 'suppressed')) AS x (id, status)
WHERE market_cell.id = x.id;
UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000038023';
UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000038032';
-- created_at is set to now() on insert and decision_due_on recomputed from it on every write, so
-- the request made "ten days ago" gets its past decision date with the trigger off.
ALTER TABLE public.change_request DISABLE TRIGGER change_request_due;
UPDATE public.change_request SET decision_due_on = current_date - 3 WHERE id = '00000000-0000-4000-8000-000000038031';
ALTER TABLE public.change_request ENABLE TRIGGER change_request_due;
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT is((SELECT live_count || ':' || preparing_count || ':' || suppressed_count || ':' || target_count FROM api.dashboard_market WHERE customer_id = current_setting('test.tho')::UUID),
          '1:1:1:3', 'live, preparing and suppressed against the target (candidates are not targets)');
SELECT is((SELECT count(*)::INT FROM api.dashboard_incident WHERE incident_id IN ('00000000-0000-4000-8000-000000038021', '00000000-0000-4000-8000-000000038022', '00000000-0000-4000-8000-000000038023')),
          2, 'open incidents only');
SELECT is((SELECT management_notice_missing FROM api.dashboard_incident WHERE incident_id = '00000000-0000-4000-8000-000000038021'), TRUE,
          'an S1 without the management notice is flagged');
SELECT is((SELECT customer_notice_late FROM api.dashboard_incident WHERE incident_id = '00000000-0000-4000-8000-000000038021'), TRUE,
          'four hours passed without telling the customer');
SELECT is((SELECT overdue FROM api.dashboard_change_request WHERE change_request_id = '00000000-0000-4000-8000-000000038031'), TRUE,
          'a request past its decision date');
SELECT is((SELECT count(*)::INT FROM api.dashboard_change_request WHERE change_request_id = '00000000-0000-4000-8000-000000038032'), 0,
          'applied requests leave the dashboard');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM api.dashboard_market), 0, 'another tenant sees none');

SELECT * FROM finish();
ROLLBACK;
