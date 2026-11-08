-- Why is the definer view slower on Q2/Q3? Compare plans with and without security_barrier.
\pset tuples_only on
\pset format unaligned
SET LOCAL ROLE postgres;
CREATE ROLE spike_api_owner NOLOGIN NOBYPASSRLS;
GRANT authenticated TO spike_api_owner;
GRANT spike_api_owner TO postgres;
GRANT USAGE, CREATE ON SCHEMA api_spike TO spike_api_owner;
REVOKE ALL ON public.product FROM authenticated, anon;
GRANT SELECT ON public.product TO spike_api_owner;
SELECT public.spike_build_view('api_spike.product_def', 'sub', 'security_invoker = false, security_barrier = true') \g /dev/null
SELECT public.spike_build_view('api_spike.product_def_nosb', 'sub', 'security_invoker = false') \g /dev/null
ALTER VIEW api_spike.product_def OWNER TO spike_api_owner;
ALTER VIEW api_spike.product_def_nosb OWNER TO spike_api_owner;
GRANT SELECT ON api_spike.product_def, api_spike.product_def_nosb TO authenticated;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT spike_explain('restricted|A-def sb|Q3 count', 'SELECT count(*) FROM api_spike.product_def');
SELECT spike_explain('restricted|A-def no sb|Q3 count', 'SELECT count(*) FROM api_spike.product_def_nosb');
SELECT spike_explain('restricted|A-def no sb|Q2 sku prefix', $$SELECT * FROM api_spike.product_def_nosb WHERE sku LIKE 'L-00012%'$$);
SELECT spike_explain('restricted|A-def no sb|Q4 join', 'SELECT c.code, count(*), sum(v.purchase_price) FROM api_spike.product_def_nosb v JOIN public.customer c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id GROUP BY c.code');
SELECT spike_explain('restricted|A-def no sb|Q1 newest', 'SELECT * FROM api_spike.product_def_nosb ORDER BY created_at DESC LIMIT 50');
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT count(*) FROM api_spike.product_def;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT count(*) FROM api_spike.product_def_nosb;
-- Leak re-check without security_barrier (leaky fn over masked col)
SELECT 'A-def no sb|T2d leaky fn rows|' || spike_try($$SELECT count(*) FROM api_spike.product_def_nosb WHERE sku = 'SPIKE-SECRET' AND spike_leak(purchase_price) AND spike_leak(notes)$$);
SELECT 'A-def no sb|T2d values seen|' || current_setting('spike.leaked', TRUE);
SELECT 'A-def no sb|T2a filter|' || spike_try($$SELECT count(*) FROM api_spike.product_def_nosb WHERE sku = 'SPIKE-SECRET' AND purchase_price > 10$$);
