-- Field-security performance budget in SQL (Task 20, spec R10). Run with `pnpm perf:fields` from
-- app/ (scripts/field-security-perf.mjs pipes this file to psql in the local database container and
-- inlines field_security_perf_load.sql at the \ir line). Everything runs inside BEGIN … ROLLBACK.
--
-- For each actor, the spike's Q1–Q4 (spike.md §3), Q5 (the product list's embed shape: customer join
-- and the api.supplier(p) computed relationship) and Q6 (the purchase-order overview) run against
-- api.* and against the same query on public.* (temporarily granted to authenticated, so both sides
-- pay the same RLS). Each side: one warm-up, then 5 alternating runs; the median planning + execution
-- time of EXPLAIN ANALYZE. Budget (R10): reads, internal ≤ +15%, restricted and mixed ≤ +40%. Every
-- case here is a read; writes (R10 as amended 2026-11-09: ≤ +15 ms absolute) are measured over HTTP
-- by supabase/functions/scripts/field_perf_http.ts.
\set ON_ERROR_STOP 1
\pset pager off
\set QUIET 1

BEGIN;

\ir field_security_perf_load.sql

\o /dev/null
SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
\o

-- The baseline: the same queries on the base tables, with RLS, as the same caller.
GRANT SELECT ON public.product, public.customer, public.supplier, public.purchase_order, public.purchase_order_line,
    public.purchase_order_payment, public.project, public.document, public.purchase_order_overview TO authenticated;

-- Median planning + execution ms of `base` and `api`, alternating, after one warm-up of each.
CREATE FUNCTION t.perf_pair (base TEXT, api TEXT, n INT DEFAULT 5) RETURNS TABLE (base_ms NUMERIC, api_ms NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
    j JSON;
    b NUMERIC[] := '{}';
    a NUMERIC[] := '{}';
BEGIN
    EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || base INTO j;
    EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || api INTO j;
    FOR i IN 1..n LOOP
        EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || base INTO j;
        b := b || ((j -> 0 ->> 'Planning Time')::NUMERIC + (j -> 0 ->> 'Execution Time')::NUMERIC);
        EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || api INTO j;
        a := a || ((j -> 0 ->> 'Planning Time')::NUMERIC + (j -> 0 ->> 'Execution Time')::NUMERIC);
    END LOOP;
    base_ms := (SELECT x FROM unnest(b) x ORDER BY x OFFSET n / 2 LIMIT 1);
    api_ms := (SELECT x FROM unnest(a) x ORDER BY x OFFSET n / 2 LIMIT 1);
    RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION t.perf_pair (TEXT, TEXT, INT) TO authenticated;

CREATE TEMP TABLE perf_case (pos INT, name TEXT, sql TEXT);
INSERT INTO perf_case VALUES
    (1, 'Q1 list 50 newest', 'SELECT * FROM %1$s.product ORDER BY created_at DESC LIMIT 50'),
    (2, 'Q2 sku prefix', 'SELECT * FROM %1$s.product WHERE sku LIKE ''L-00012%%'''),
    (3, 'Q3 count', 'SELECT count(*) FROM %1$s.product'),
    (4, 'Q4 join customer + sum(price)',
        'SELECT c.code, count(*), sum(v.purchase_price) FROM %1$s.product v JOIN %1$s.customer c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id GROUP BY c.code'),
    (5, 'Q5 list 50 + customer, supplier embed', NULL),
    (6, 'Q6 purchase_order_overview 50', 'SELECT * FROM %1$s.purchase_order_overview LIMIT 50');
-- Q5: PostgREST's shape for product?select=*,customer(code),supplier(code): a join to customer and a
-- lateral subquery per embed; through api the supplier embed is the computed relationship.
UPDATE perf_case SET sql = 'SELECT p.*, c.code AS customer_code, s.code AS supplier_code FROM %1$s.product p '
    || 'LEFT JOIN %1$s.customer c ON c.id = p.customer_id '
    || 'LEFT JOIN LATERAL (%2$s) s ON TRUE ORDER BY p.created_at DESC LIMIT 50'
WHERE pos = 5;

CREATE TEMP TABLE perf_result (actor TEXT, pos INT, name TEXT, base_ms NUMERIC, api_ms NUMERIC);
GRANT SELECT ON perf_case TO authenticated;
GRANT INSERT, SELECT ON perf_result TO authenticated;

CREATE TEMP VIEW perf_queries AS
SELECT pos, name,
       format(sql, 'public', 'SELECT x.code FROM public.supplier x WHERE x.id = p.supplier_id') AS base,
       format(sql, 'api', 'SELECT x.code FROM api.supplier(p) x') AS api
FROM perf_case;
GRANT SELECT ON perf_queries TO authenticated;

-- Each (actor, query) pair is its own statement under a 60 s statement timeout: a pair that times out
-- leaves no row, prints its error, and counts as over budget below.
\set ON_ERROR_ROLLBACK on
CREATE TEMP VIEW perf_statements AS
SELECT pos, format('INSERT INTO perf_result SELECT current_setting(''perf.actor''), %s, %L, r.base_ms, r.api_ms FROM t.perf_pair(%L, %L) r',
                   pos, name, base, api) AS sql
FROM perf_queries;
GRANT SELECT ON perf_statements TO authenticated;

-- Internal: akif, management in MOESA LTD (every field: the fast path).
\o /dev/null
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test'), current_setting('test.moesa')::UUID);
SELECT set_config('perf.actor', 'internal', TRUE);
SET LOCAL statement_timeout = '60s';
\o
\set ON_ERROR_STOP 0
SELECT sql FROM perf_statements ORDER BY pos \gexec
\o /dev/null
RESET ROLE;
SET LOCAL statement_timeout = 0;
SELECT private.unimpersonate();
\set ON_ERROR_STOP 1
\o

-- Restricted: elif with t_restricted in MOESA LTD (no field rows: every sensitive field masked).
\o /dev/null
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('perf.actor', 'restricted', TRUE);
SET LOCAL statement_timeout = '60s';
\o
\set ON_ERROR_STOP 0
SELECT sql FROM perf_statements ORDER BY pos \gexec
\o /dev/null
RESET ROLE;
SET LOCAL statement_timeout = 0;
SELECT private.unimpersonate();
\set ON_ERROR_STOP 1
\o

-- Mixed: elif over MOESA LTD (t_restricted) and MOESA Europe (t_cost): the per-row tenant check.
\o /dev/null
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
    ARRAY[current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID]);
SELECT set_config('perf.actor', 'mixed', TRUE);
SET LOCAL statement_timeout = '60s';
\o
\set ON_ERROR_STOP 0
SELECT sql FROM perf_statements ORDER BY pos \gexec
\o /dev/null
RESET ROLE;
SET LOCAL statement_timeout = 0;
SELECT private.unimpersonate();
\set ON_ERROR_STOP 1
\o

\set ON_ERROR_STOP 1

-- A pair without a result (timed out or failed) is reported as over budget.
INSERT INTO perf_result
SELECT a.actor, q.pos, q.name, NULL, NULL
FROM (VALUES ('internal'), ('restricted'), ('mixed')) a (actor) CROSS JOIN perf_queries q
WHERE NOT EXISTS (SELECT 1 FROM perf_result r WHERE r.actor = a.actor AND r.pos = q.pos);

\unset QUIET
SELECT actor, name AS query, round(base_ms, 2) AS public_ms, round(api_ms, 2) AS api_ms,
       coalesce(to_char(100 * (api_ms / nullif(base_ms, 0) - 1), 'S99990.0') || '%', 'timeout/error') AS delta,
       CASE actor WHEN 'internal' THEN '+15%' ELSE '+40%' END AS budget,
       CASE WHEN api_ms IS NULL OR api_ms / nullif(base_ms, 0) > CASE actor WHEN 'internal' THEN 1.15 ELSE 1.40 END THEN 'OVER' ELSE 'ok' END AS verdict
FROM perf_result
ORDER BY CASE actor WHEN 'internal' THEN 1 WHEN 'restricted' THEN 2 ELSE 3 END, pos;

DO $$
DECLARE
    over TEXT;
BEGIN
    SELECT string_agg(format('%s %s (%s ms vs %s ms)', actor, name, coalesce(round(api_ms, 2)::TEXT, 'timeout'),
                             coalesce(round(base_ms, 2)::TEXT, '-')), '; ') INTO over
    FROM perf_result
    WHERE api_ms IS NULL OR api_ms / nullif(base_ms, 0) > CASE actor WHEN 'internal' THEN 1.15 ELSE 1.40 END;
    IF over IS NOT NULL THEN
        RAISE EXCEPTION 'budget: %', over;
    END IF;
END $$;

ROLLBACK;
