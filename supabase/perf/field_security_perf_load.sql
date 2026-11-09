-- The field-security performance load (Task 20, R10), as the spike's 50_perf_objects.sql: 100 000
-- products in MOESA LTD and 100 000 in Nova Yazılım, plus 20 000 purchase orders (one line each) in
-- each, then ANALYZE. No transaction control here: field_security_perf.sql runs it inside
-- BEGIN … ROLLBACK, field_perf_http.ts inside BEGIN … COMMIT (and the caller resets the database
-- afterwards). Run as postgres; triggers are skipped for the bulk load only (session_replication_role).
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE perf_ids ON COMMIT DROP AS
SELECT
    (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD') AS moesa,
    (SELECT id FROM public.tenant WHERE display_name = 'Nova Yazılım') AS nova,
    ARRAY(SELECT c.id FROM public.customer c JOIN public.tenant t ON t.id = c.tenant_id
          WHERE t.display_name = 'MOESA LTD' ORDER BY c.code) AS moesa_customers,
    ARRAY(SELECT s.id FROM public.supplier s JOIN public.tenant t ON t.id = s.tenant_id
          WHERE t.display_name = 'MOESA LTD' ORDER BY s.code) AS moesa_suppliers,
    'feed0000-0000-4000-8000-0000000000c1'::UUID AS nova_customer;

DO $$
BEGIN
    IF (SELECT moesa IS NULL OR nova IS NULL OR cardinality(moesa_customers) = 0 OR cardinality(moesa_suppliers) = 0 FROM perf_ids) THEN
        RAISE EXCEPTION 'perf load: MOESA LTD / Nova Yazılım or their customers and suppliers are missing (run supabase db reset)';
    END IF;
END $$;

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
SELECT nova_customer, nova, 'PNV', 'Nova perf customer', 'trading_partner' FROM perf_ids;
INSERT INTO public.supplier (id, tenant_id, code, display_name, country, deposit_rate)
SELECT 'feed0000-0000-4000-8000-0000000000a1', nova, 'PN1', 'Nova perf supplier', 'CN', 30 FROM perf_ids;

-- Products: MOESA LTD with every cost field, a supplier and a note; Nova with a price and a note.
INSERT INTO public.product (id, tenant_id, customer_id, supplier_id, sku, display_name, status, purchase_price, purchase_currency,
    purchase_incoterm, landed_cost_eur, landed_cost_on, company_price_eur, supplier_product_code, notes, unit_net_g, created_at)
SELECT ('feed0001-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, p.moesa,
       p.moesa_customers[1 + i % cardinality(p.moesa_customers)], p.moesa_suppliers[1 + i % cardinality(p.moesa_suppliers)],
       'L-' || lpad(i::TEXT, 6, '0'), 'Product ' || i, (enum_range(NULL::public.product_status))[1 + i % 7],
       round((random() * 100)::NUMERIC, 4), 'USD', 'FOB', round((random() * 120)::NUMERIC, 4), DATE '2026-01-01',
       round((random() * 150)::NUMERIC, 4), 'SUP-' || i, 'note ' || i, i % 500, now() - i * INTERVAL '1 minute'
FROM perf_ids p, generate_series(1, 100000) i;
INSERT INTO public.product (id, tenant_id, customer_id, supplier_id, sku, display_name, purchase_price, notes, created_at)
SELECT ('feed0002-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, p.nova, p.nova_customer,
       'feed0000-0000-4000-8000-0000000000a1', 'N-' || lpad(i::TEXT, 6, '0'), 'Nova ' || i,
       round((random() * 100)::NUMERIC, 4), 'n', now() - i * INTERVAL '1 minute'
FROM perf_ids p, generate_series(1, 100000) i;

-- Purchase orders with one line each (the overview's figures come from the lines).
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, code, currency, incoterm, deposit_rate, pi_number,
    pi_total, notes, created_at)
SELECT ('feed0003-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, p.moesa,
       p.moesa_customers[1 + i % cardinality(p.moesa_customers)], p.moesa_suppliers[1 + i % cardinality(p.moesa_suppliers)],
       'PERF-' || lpad(i::TEXT, 6, '0'), 'USD', 'FOB', 30, 'PI-' || i, 1000 + i % 1000, 'po note ' || i,
       now() - i * INTERVAL '5 minutes'
FROM perf_ids p, generate_series(1, 20000) i;
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, code, currency, incoterm, deposit_rate, notes, created_at)
SELECT ('feed0004-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, p.nova, p.nova_customer,
       'feed0000-0000-4000-8000-0000000000a1', 'PERF-' || lpad(i::TEXT, 6, '0'), 'USD', 'FOB', 30, 'n',
       now() - i * INTERVAL '5 minutes'
FROM perf_ids p, generate_series(1, 20000) i;
INSERT INTO public.purchase_order_line (tenant_id, customer_id, purchase_order_id, product_id, quantity, unit_price, pi_line_total)
SELECT p.moesa, p.moesa_customers[1 + i % cardinality(p.moesa_customers)], ('feed0003-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID,
       ('feed0001-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, 10 + i % 90, round((random() * 50)::NUMERIC, 4), 1000 + i % 1000
FROM perf_ids p, generate_series(1, 20000) i;
INSERT INTO public.purchase_order_line (tenant_id, customer_id, purchase_order_id, product_id, quantity, unit_price)
SELECT p.nova, p.nova_customer, ('feed0004-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID,
       ('feed0002-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::UUID, 10, 5
FROM perf_ids p, generate_series(1, 20000) i;

SET LOCAL session_replication_role = origin;
ANALYZE public.product;
ANALYZE public.customer;
ANALYZE public.supplier;
ANALYZE public.purchase_order;
ANALYZE public.purchase_order_line;
