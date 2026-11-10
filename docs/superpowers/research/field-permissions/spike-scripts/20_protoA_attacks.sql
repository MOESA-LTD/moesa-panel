\pset tuples_only on
\pset format unaligned
-- Restricted user: koordinator (coordinator in L), active tenant L, scope L.
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_suite('api_spike.product', 'A-inv/view(sub)');
SELECT 'calls after suite: ' || current_setting('spike.calls', TRUE);
-- The same attacks straight at the base table (what PostgREST would allow if public.product stays exposed).
SELECT * FROM spike_suite('public.product', 'A-inv/base-direct');
SELECT * FROM spike_suite('api_spike.product_plain', 'A-inv/view(plain)') WHERE split_part($$x$$,'',1) IS NOT NULL AND (split_part(spike_suite, '|', 2) ~ '^T(0|1 |2a|2d leaky fn:|3 )');
SELECT * FROM spike_suite('api_spike.product_sb', 'A-inv/view(sub,security_barrier)') WHERE split_part(spike_suite, '|', 2) ~ '^T(1 |2a|2b|2d leaky fn:|3 )';
-- Naive INSTEAD OF trigger: RETURNING
SELECT 'A-inv/naive-trigger|T7 RETURNING masked cols|' || spike_try_dml($$UPDATE api_spike.product_naive SET display_name = 'n1' WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price, notes$$);
-- Plan of the filter through the view: is the predicate applied to the CASE or to the raw column?
SET LOCAL ROLE postgres;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
EXPLAIN (COSTS OFF, VERBOSE) SELECT sku FROM api_spike.product WHERE purchase_price > 10;
EXPLAIN (COSTS OFF, VERBOSE) SELECT sku FROM api_spike.product_plain WHERE purchase_price > 10;

-- Multi-tenant scope: akif, active L (cost fields granted) + scope L,E (no cost fields in E).
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128', '72fd7328-1c1c-4694-b564-2510741ce128,7dff10b5-2991-4378-b37a-1176e3cf43fd') \g /dev/null
SELECT 'A-inv/view(sub)|T9 multi-tenant scope: E row cost fields (active=L)|' || spike_try($$SELECT sku, purchase_price, notes FROM api_spike.product WHERE sku IN ('SPIKE-EU','SPIKE-SECRET') ORDER BY sku$$);
SELECT 'A-inv/view(mt)|T9 multi-tenant scope: E row cost fields (active=L)|' || spike_try($$SELECT sku, purchase_price, notes FROM api_spike.product_mt WHERE sku IN ('SPIKE-EU','SPIKE-SECRET') ORDER BY sku$$);
SELECT 'A-inv/view(mt)|T9b write E cost field|' || spike_try_dml($$UPDATE api_spike.product_mt SET purchase_price = 1 WHERE sku = 'SPIKE-EU' RETURNING sku$$);

-- Internal user: akif, active L, scope L: sees and writes everything.
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT 'A-inv/internal|T1 read|' || spike_try($$SELECT purchase_price, landed_cost_eur, notes, supplier_id FROM api_spike.product WHERE sku = 'SPIKE-SECRET'$$);
SELECT 'A-inv/internal|T2a filter >10|' || spike_try($$SELECT count(*) FROM api_spike.product WHERE sku = 'SPIKE-SECRET' AND purchase_price > 10$$);
SELECT 'A-inv/internal|T4 update cost|' || spike_try_dml($$UPDATE api_spike.product SET purchase_price = 13, notes = 'n2' WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price, notes$$);
SELECT 'A-inv/internal|T5 insert with cost|' || spike_try_dml($$INSERT INTO api_spike.product (tenant_id, customer_id, sku, purchase_price) VALUES ('72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001', 'SPIKE-INT-1', 5) RETURNING sku, purchase_price$$);

-- Base-table state afterwards (as postgres): did any restricted write slip through / wipe values?
SET LOCAL ROLE postgres;
SELECT 'state|after A-inv|' || string_agg(format('%s pp=%s notes=%s name=%s pack=%s', sku, purchase_price, notes, display_name, pack_qty), ' ; ' ORDER BY sku)
FROM public.product WHERE sku LIKE 'SPIKE%';
SELECT 'side|authenticated has TRUNCATE on public.product|' || has_table_privilege('authenticated', 'public.product', 'TRUNCATE');
