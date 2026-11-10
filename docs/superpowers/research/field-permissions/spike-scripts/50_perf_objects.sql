\pset tuples_only on
\pset format unaligned
SET LOCAL ROLE postgres;
-- 100 000 products in L (MOESA LTD, 5 customers) and 100 000 in N (Nova, 1 new customer).
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('5b1e0000-0000-4000-8000-0000000000c1', '304b3d9c-72d3-4f65-81c8-761023fc525e', 'NVX', 'Nova Spike Customer', 'trading_partner');
SET LOCAL session_replication_role = replica;   -- skip audit/guard triggers for the bulk load only
INSERT INTO public.product (tenant_id, customer_id, sku, display_name, status, purchase_price, purchase_currency,
    purchase_incoterm, landed_cost_eur, landed_cost_on, company_price_eur, supplier_product_code, notes, unit_net_g, created_at)
SELECT '72fd7328-1c1c-4694-b564-2510741ce128',
       (ARRAY['5eed0002-0000-4000-8000-000000000001','5eed0002-0000-4000-8000-000000000002','5eed0002-0000-4000-8000-000000000003',
              '5eed0002-0000-4000-8000-000000000004','e76544e9-7215-4fad-92f4-507bdbed94e5']::UUID[])[1 + i % 5],
       'L-' || lpad(i::TEXT, 6, '0'), 'Product ' || i, (enum_range(NULL::public.product_status))[1 + i % 7],
       round((random() * 100)::NUMERIC, 4), 'USD', 'FOB', round((random() * 120)::NUMERIC, 4), DATE '2026-01-01',
       round((random() * 150)::NUMERIC, 4), 'SUP-' || i, 'note ' || i, i % 500, now() - i * INTERVAL '1 minute'
FROM generate_series(1, 100000) i;
INSERT INTO public.product (tenant_id, customer_id, sku, display_name, purchase_price, notes, created_at)
SELECT '304b3d9c-72d3-4f65-81c8-761023fc525e', '5b1e0000-0000-4000-8000-0000000000c1', 'N-' || lpad(i::TEXT, 6, '0'),
       'Nova ' || i, round((random() * 100)::NUMERIC, 4), 'n', now() - i * INTERVAL '1 minute'
FROM generate_series(1, 100000) i;
SET LOCAL session_replication_role = origin;
ANALYZE public.product;
ANALYZE public.customer;

-- EXPLAIN (ANALYZE, BUFFERS) n times: median planning/execution, shared hit buffers, how many times the
-- field function ran during one execution (spike.calls counter), and where it sits in the plan.
CREATE OR REPLACE FUNCTION public.spike_explain (label TEXT, q TEXT, n INT DEFAULT 5) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    j JSON; pl NUMERIC[] := '{}'; ex NUMERIC[] := '{}'; hits TEXT; calls INT; plan_txt TEXT := ''; l TEXT;
BEGIN
    EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || q INTO j;   -- warm-up
    FOR i IN 1..n LOOP
        PERFORM set_config('spike.calls', '0', TRUE);
        EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || q INTO j;
        calls := current_setting('spike.calls')::INT;
        pl := pl || (j -> 0 ->> 'Planning Time')::NUMERIC;
        ex := ex || (j -> 0 ->> 'Execution Time')::NUMERIC;
        hits := (j -> 0 -> 'Plan' ->> 'Shared Hit Blocks');
    END LOOP;
    FOR l IN EXECUTE 'EXPLAIN (VERBOSE, COSTS OFF) ' || q LOOP plan_txt := plan_txt || l || E'\n'; END LOOP;
    RETURN format('%s|plan_ms=%s|exec_ms=%s|shared_hit=%s|field_fn_calls=%s|fn_in_initplan=%s|fn_per_row=%s',
        label,
        (SELECT x FROM unnest(pl) x ORDER BY x OFFSET n / 2 LIMIT 1),
        (SELECT x FROM unnest(ex) x ORDER BY x OFFSET n / 2 LIMIT 1),
        hits, calls,
        plan_txt ~ 'Output: private\.spike_(has_field|field_tenants)',
        plan_txt ~ 'CASE WHEN private\.spike_has_field');
END;
$$;
GRANT EXECUTE ON FUNCTION public.spike_explain (TEXT, TEXT, INT) TO PUBLIC;

-- The four queries for a relation; cols = '*' or an explicit list.
CREATE OR REPLACE FUNCTION public.spike_perf (tag TEXT, v TEXT, cols TEXT DEFAULT '*', price TEXT DEFAULT 'purchase_price') RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
BEGIN
    RETURN NEXT spike_explain(tag || '|Q1 list 50 newest', format('SELECT %s FROM %s ORDER BY created_at DESC LIMIT 50', cols, v));
    RETURN NEXT spike_explain(tag || '|Q2 sku prefix', format('SELECT %s FROM %s WHERE sku LIKE %L', cols, v, 'L-00012%'));
    RETURN NEXT spike_explain(tag || '|Q3 count', format('SELECT count(*) FROM %s', v));
    RETURN NEXT spike_explain(tag || '|Q4 join customer + sum(price)', format('SELECT c.code, count(*), sum(v.%s) FROM %s v JOIN public.customer c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id GROUP BY c.code', price, v));
END;
$$;
GRANT EXECUTE ON FUNCTION public.spike_perf (TEXT, TEXT, TEXT, TEXT) TO PUBLIC;
