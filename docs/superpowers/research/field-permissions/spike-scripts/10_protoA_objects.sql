-- Prototype A objects: api_spike schema + masking views + INSTEAD OF write path.
CREATE SCHEMA api_spike;
GRANT USAGE ON SCHEMA api_spike TO authenticated;

SELECT public.spike_build_view('api_spike.product', 'sub', 'security_invoker = true');
SELECT public.spike_build_view('api_spike.product_plain', 'plain', 'security_invoker = true');
SELECT public.spike_build_view('api_spike.product_mt', 'mt', 'security_invoker = true');
SELECT public.spike_build_view('api_spike.product_sb', 'sub', 'security_invoker = true, security_barrier = true');
SELECT public.spike_build_view('api_spike.product_naive', 'sub', 'security_invoker = true');
GRANT SELECT, INSERT, UPDATE ON api_spike.product, api_spike.product_plain, api_spike.product_mt, api_spike.product_sb, api_spike.product_naive TO authenticated;

-- INSTEAD OF UPDATE: only the columns the caller changed (NEW vs the masked OLD) reach the base table,
-- so a masked NULL is never written back; the base guard refuses protected fields; the row returned
-- (RETURNING) is read again through the same masking view.
CREATE OR REPLACE FUNCTION api_spike.product_iud () RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    changed TEXT[];
    new_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        changed := ARRAY(SELECT e.key FROM jsonb_each(to_jsonb(NEW)) e WHERE e.value IS DISTINCT FROM to_jsonb(OLD) -> e.key);
        IF cardinality(changed) > 0 THEN
            EXECUTE format('UPDATE public.product p SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.product, $1) r) WHERE p.id = $2',
                (SELECT string_agg(format('%I', c), ', ') FROM unnest(changed) c),
                (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(changed) c))
            USING to_jsonb(NEW), OLD.id;
        END IF;
        new_id := coalesce(NEW.id, OLD.id);
    ELSE
        changed := ARRAY(SELECT e.key FROM jsonb_each(to_jsonb(NEW)) e WHERE e.value <> 'null'::JSONB);
        EXECUTE format('INSERT INTO public.product (%s) SELECT %s FROM jsonb_populate_record(NULL::public.product, $1) r RETURNING id',
            (SELECT string_agg(format('%I', c), ', ') FROM unnest(changed) c),
            (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(changed) c))
        USING to_jsonb(NEW) INTO new_id;
    END IF;
    EXECUTE format('SELECT v.* FROM %I.%I v WHERE v.id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME) INTO NEW USING new_id;
    RETURN NEW;
END;
$$;

-- The tempting but wrong version: returns the base row (RETURNING then shows unmasked values).
CREATE OR REPLACE FUNCTION api_spike.product_iud_naive () RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE changed TEXT[];
BEGIN
    changed := ARRAY(SELECT e.key FROM jsonb_each(to_jsonb(NEW)) e WHERE e.value IS DISTINCT FROM to_jsonb(OLD) -> e.key);
    IF cardinality(changed) > 0 THEN
        EXECUTE format('UPDATE public.product p SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.product, $1) r) WHERE p.id = $2',
            (SELECT string_agg(format('%I', c), ', ') FROM unnest(changed) c),
            (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(changed) c))
        USING to_jsonb(NEW), OLD.id;
    END IF;
    NEW := (SELECT jsonb_populate_record(NEW, to_jsonb(p)) FROM public.product p WHERE p.id = OLD.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER product_iud INSTEAD OF INSERT OR UPDATE ON api_spike.product FOR EACH ROW EXECUTE FUNCTION api_spike.product_iud ();
CREATE TRIGGER product_iud INSTEAD OF INSERT OR UPDATE ON api_spike.product_mt FOR EACH ROW EXECUTE FUNCTION api_spike.product_iud ();
CREATE TRIGGER product_iud INSTEAD OF UPDATE ON api_spike.product_naive FOR EACH ROW EXECUTE FUNCTION api_spike.product_iud_naive ();
