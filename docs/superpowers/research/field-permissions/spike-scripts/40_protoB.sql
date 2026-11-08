\pset tuples_only on
\pset format unaligned
SET LOCAL ROLE postgres;
-- Prototype B: column GRANTs. authenticated keeps only the non-protected columns; spike_internal adds
-- the rest. Both app roles are members of authenticated, so the "TO authenticated" RLS policies apply
-- (policy roles match by membership) and authenticated's other privileges are inherited.
CREATE ROLE spike_customer NOLOGIN NOBYPASSRLS;
CREATE ROLE spike_internal NOLOGIN NOBYPASSRLS;
GRANT authenticated TO spike_customer, spike_internal;
GRANT spike_customer, spike_internal TO authenticator;   -- what PostgREST needs to SET ROLE into them
GRANT spike_customer, spike_internal TO postgres;
CREATE ROLE spike_outsider NOLOGIN NOBYPASSRLS;           -- not a member of authenticated
GRANT spike_outsider TO postgres;

REVOKE SELECT, INSERT, UPDATE ON public.product FROM authenticated, anon;
DO $$
DECLARE cols TEXT;
BEGIN
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO cols
    FROM pg_attribute a
    WHERE a.attrelid = 'public.product'::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname NOT IN (SELECT field FROM private.spike_protected_field WHERE resource = 'product');
    EXECUTE format('GRANT SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s) ON public.product TO authenticated', cols);
    EXECUTE format('GRANT SELECT (%1$s) ON public.product TO spike_outsider', cols);
END $$;
GRANT SELECT, INSERT, UPDATE ON public.product TO spike_internal;
-- The write guard of prototype A is dropped: B relies on GRANTs only.
DROP TRIGGER spike_write_guard ON public.product;

SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SET LOCAL ROLE spike_customer;
SELECT 'B|current_user|' || current_user;
SELECT * FROM spike_suite('public.product', 'B/customer');
SELECT 'B/customer|T5c INSERT without masked column, RETURNING allowed cols|' || spike_try_dml($$INSERT INTO public.product (tenant_id, customer_id, sku) VALUES ('72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001', 'SPIKE-OK-B') RETURNING sku$$);
SELECT 'B/customer|T8d join to customer, allowed cols|' || spike_try($$SELECT v.sku, c.code FROM public.product v JOIN public.customer c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id WHERE v.sku = 'SPIKE-SECRET'$$);
SELECT 'B/customer|T1d explicit allowed columns (what select=<cols> sends)|' || spike_try($$SELECT sku, display_name, status FROM public.product WHERE sku = 'SPIKE-SECRET'$$);
SELECT 'B/customer|T1e PostgREST select=* shape ("public"."product".*)|' || spike_try($$SELECT "public"."product".* FROM "public"."product" WHERE sku = 'SPIKE-SECRET'$$);
SELECT 'B/customer|T7c UPDATE allowed col with RETURNING of allowed cols|' || spike_try_dml($$UPDATE public.product SET display_name = 'b1' WHERE sku = 'SPIKE-SECRET' RETURNING sku, display_name$$);
SELECT 'B/customer|T7d PostgREST upsert shape (ON CONFLICT DO UPDATE)|' || spike_try_dml($$INSERT INTO public.product (tenant_id, customer_id, sku, display_name) VALUES ('72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001', 'SPIKE-SECRET', 'b2') ON CONFLICT (customer_id, sku) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING sku$$);
SELECT 'B/customer|T12 role escalation: set_config(role, spike_internal) from a request|' || spike_try($$SELECT set_config('role', 'spike_internal', TRUE)$$);
SET LOCAL ROLE postgres;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SET LOCAL ROLE spike_outsider;
SELECT 'B/role not member of authenticated|policies TO authenticated do not apply: rows seen|' || spike_try($$SELECT count(*) FROM public.product$$);

-- Internal role (akif): everything.
SET LOCAL ROLE postgres;
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SET LOCAL ROLE spike_internal;
SELECT 'B/internal|T1 read|' || spike_try($$SELECT purchase_price, notes FROM public.product WHERE sku = 'SPIKE-SECRET'$$);
SELECT 'B/internal|T1c select *|' || spike_try($$SELECT count(*) FROM (SELECT * FROM public.product) z$$);
SELECT 'B/internal|T4 update cost|' || spike_try_dml($$UPDATE public.product SET purchase_price = 15 WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price$$);
SELECT 'B/internal|T5 insert with cost|' || spike_try_dml($$INSERT INTO public.product (tenant_id, customer_id, sku, purchase_price) VALUES ('72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001', 'SPIKE-INT-B', 7) RETURNING sku, purchase_price$$);
SELECT 'B/internal|T11 RLS still on (SPIKE-EU in E, active L)|' || spike_try($$SELECT count(*) FROM public.product WHERE sku = 'SPIKE-EU'$$);
-- Multi-tenant: one DB role per request. akif with scope L,E as spike_internal sees E's costs too.
SET LOCAL ROLE postgres;
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128', '72fd7328-1c1c-4694-b564-2510741ce128,7dff10b5-2991-4378-b37a-1176e3cf43fd') \g /dev/null
SET LOCAL ROLE spike_internal;
SELECT 'B/internal|T9 multi-tenant scope L,E (cost granted in L only)|' || spike_try($$SELECT sku, purchase_price FROM public.product WHERE sku IN ('SPIKE-EU','SPIKE-SECRET') ORDER BY sku$$);
SET LOCAL ROLE postgres;
SELECT 'state|after B|' || string_agg(format('%s pp=%s notes=%s name=%s', sku, purchase_price, notes, display_name), ' ; ' ORDER BY sku) FROM public.product WHERE sku LIKE 'SPIKE%';
