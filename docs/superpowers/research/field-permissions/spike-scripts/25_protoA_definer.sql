\pset tuples_only on
\pset format unaligned
SET LOCAL ROLE postgres;
-- A-def: the base table is closed to authenticated; the API view runs as a dedicated owner role that
-- is NOT BYPASSRLS and IS a member of authenticated (so the existing "TO authenticated" policies, which
-- read auth.uid()/request.headers, still filter rows).
CREATE ROLE spike_api_owner NOLOGIN NOBYPASSRLS;
GRANT authenticated TO spike_api_owner;
GRANT spike_api_owner TO postgres;
GRANT USAGE, CREATE ON SCHEMA api_spike TO spike_api_owner;
REVOKE ALL ON public.product FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.product TO spike_api_owner;
SELECT public.spike_build_view('api_spike.product_def', 'sub', 'security_invoker = false, security_barrier = true') \g /dev/null
ALTER VIEW api_spike.product_def OWNER TO spike_api_owner;
GRANT SELECT, INSERT, UPDATE ON api_spike.product_def TO authenticated;
CREATE FUNCTION api_spike.product_def_iud () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed TEXT[]; new_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        changed := ARRAY(SELECT e.key FROM jsonb_each(to_jsonb(NEW)) e WHERE e.value IS DISTINCT FROM to_jsonb(OLD) -> e.key);
        IF cardinality(changed) > 0 THEN
            EXECUTE format('UPDATE public.product p SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.product, $1) r) WHERE p.id = $2',
                (SELECT string_agg(format('%I', c), ', ') FROM unnest(changed) c), (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(changed) c))
            USING to_jsonb(NEW), OLD.id;
        END IF;
        new_id := coalesce(NEW.id, OLD.id);
    ELSE
        changed := ARRAY(SELECT e.key FROM jsonb_each(to_jsonb(NEW)) e WHERE e.value <> 'null'::JSONB);
        EXECUTE format('INSERT INTO public.product (%s) SELECT %s FROM jsonb_populate_record(NULL::public.product, $1) r RETURNING id',
            (SELECT string_agg(format('%I', c), ', ') FROM unnest(changed) c), (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(changed) c))
        USING to_jsonb(NEW) INTO new_id;
    END IF;
    SELECT v.* INTO NEW FROM api_spike.product_def v WHERE v.id = new_id;
    RETURN NEW;
END;
$$;
ALTER FUNCTION api_spike.product_def_iud () OWNER TO spike_api_owner;
CREATE TRIGGER product_def_iud INSTEAD OF INSERT OR UPDATE ON api_spike.product_def FOR EACH ROW EXECUTE FUNCTION api_spike.product_def_iud ();

SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT * FROM spike_suite('api_spike.product_def', 'A-def/view');
SELECT 'A-def/view|T11c INSERT into tenant E (no product insert there) through definer view|' || spike_try_dml($$INSERT INTO api_spike.product_def (tenant_id, customer_id, sku) VALUES ('7dff10b5-2991-4378-b37a-1176e3cf43fd', 'f3c8004d-53be-448f-a91f-cb848ac99012', 'SPIKE-X-TENANT') RETURNING sku$$);
SELECT 'A-def/view|T11b other tenant rows through definer view (all products count)|' || spike_try($$SELECT count(*) FROM api_spike.product_def$$);
SELECT spike_as('akif', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT 'A-def/internal|T1 read|' || spike_try($$SELECT purchase_price, notes FROM api_spike.product_def WHERE sku = 'SPIKE-SECRET'$$);
SELECT 'A-def/internal|T4 update cost|' || spike_try_dml($$UPDATE api_spike.product_def SET purchase_price = 14 WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price$$);
SELECT 'A-def/internal|T5 insert with cost|' || spike_try_dml($$INSERT INTO api_spike.product_def (tenant_id, customer_id, sku, purchase_price) VALUES ('72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001', 'SPIKE-INT-DEF', 6) RETURNING sku, purchase_price$$);

-- Pitfall: the same definer view owned by postgres (BYPASSRLS) ignores every RLS policy.
SET LOCAL ROLE postgres;
SELECT public.spike_build_view('api_spike.product_pg', 'sub', 'security_invoker = false') \g /dev/null
GRANT SELECT ON api_spike.product_pg TO authenticated;
SELECT spike_as('koord', '72fd7328-1c1c-4694-b564-2510741ce128') \g /dev/null
SELECT 'A-def/pitfall view owned by postgres|T11 cross-tenant rows (SPIKE-EU in tenant E)|' || spike_try($$SELECT count(*) FROM api_spike.product_pg WHERE sku = 'SPIKE-EU'$$);
SELECT 'A-def/pitfall view owned by postgres|T11b row count vs RLS view|' || spike_try($$SELECT (SELECT count(*) FROM api_spike.product_pg) || ' vs ' || (SELECT count(*) FROM api_spike.product_def)$$);
SET LOCAL ROLE postgres;
SELECT 'state|after A-def|' || string_agg(format('%s pp=%s notes=%s', sku, purchase_price, notes), ' ; ' ORDER BY sku) FROM public.product WHERE sku LIKE 'SPIKE%';
