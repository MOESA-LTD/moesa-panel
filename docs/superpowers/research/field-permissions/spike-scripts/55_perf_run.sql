\pset tuples_only on
\pset format unaligned
SELECT 'rows|L=' || count(*) FILTER (WHERE tenant_id = '72fd7328-1c1c-4694-b564-2510741ce128') || ' N=' || count(*) FILTER (WHERE tenant_id = '304b3d9c-72d3-4f65-81c8-761023fc525e') FROM public.product;
-- Baseline + prototype A (security_invoker views), restricted then internal.
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_perf('restricted|baseline public.product', 'public.product');
SELECT * FROM spike_perf('restricted|baseline public.product (B col list)', 'public.product', 'id, sku, display_name, status, customer_id, created_at, unit_net_g', 'unit_net_g');
SELECT * FROM spike_perf('restricted|A view (SELECT fn) InitPlan', 'api_spike.product');
SELECT * FROM spike_perf('restricted|A view plain fn call', 'api_spike.product_plain');
SELECT * FROM spike_perf('restricted|A view per-tenant array (mt)', 'api_spike.product_mt');
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_perf('internal|baseline public.product', 'public.product');
SELECT * FROM spike_perf('internal|A view (SELECT fn) InitPlan', 'api_spike.product');
SELECT * FROM spike_perf('internal|A view plain fn call', 'api_spike.product_plain');
SELECT * FROM spike_perf('internal|A view per-tenant array (mt)', 'api_spike.product_mt');

-- Prototype A-def (definer view owned by a non-bypassrls member of authenticated).
SET LOCAL ROLE postgres;
SAVEPOINT a_def;
CREATE ROLE spike_api_owner NOLOGIN NOBYPASSRLS;
GRANT authenticated TO spike_api_owner;
GRANT spike_api_owner TO postgres;
GRANT USAGE, CREATE ON SCHEMA api_spike TO spike_api_owner;
REVOKE ALL ON public.product FROM authenticated, anon;
GRANT SELECT ON public.product TO spike_api_owner;
SELECT public.spike_build_view('api_spike.product_def', 'sub', 'security_invoker = false, security_barrier = true') \g /dev/null
ALTER VIEW api_spike.product_def OWNER TO spike_api_owner;
GRANT SELECT ON api_spike.product_def TO authenticated;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_perf('restricted|A-def view (definer owner, security_barrier)', 'api_spike.product_def');
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_perf('internal|A-def view (definer owner, security_barrier)', 'api_spike.product_def');
SET LOCAL ROLE postgres;
ROLLBACK TO SAVEPOINT a_def;

-- Prototype B (column grants).
SAVEPOINT b;
CREATE ROLE spike_customer NOLOGIN NOBYPASSRLS;
CREATE ROLE spike_internal NOLOGIN NOBYPASSRLS;
GRANT authenticated TO spike_customer, spike_internal;
GRANT spike_customer, spike_internal TO postgres;
REVOKE SELECT, INSERT, UPDATE ON public.product FROM authenticated, anon;
DO $$
DECLARE cols TEXT;
BEGIN
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO cols FROM pg_attribute a
    WHERE a.attrelid = 'public.product'::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname NOT IN (SELECT field FROM private.spike_protected_field WHERE resource = 'product');
    EXECUTE format('GRANT SELECT (%1$s) ON public.product TO authenticated', cols);
END $$;
GRANT SELECT ON public.product TO spike_internal;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SET LOCAL ROLE spike_customer;
SELECT * FROM spike_perf('restricted|B column grants (col list)', 'public.product', 'id, sku, display_name, status, customer_id, created_at, unit_net_g', 'unit_net_g');
SET LOCAL ROLE postgres;
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SET LOCAL ROLE spike_internal;
SELECT * FROM spike_perf('internal|B column grants', 'public.product');
SET LOCAL ROLE postgres;
ROLLBACK TO SAVEPOINT b;
