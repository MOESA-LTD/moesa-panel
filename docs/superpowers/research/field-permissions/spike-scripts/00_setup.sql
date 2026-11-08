-- Field-permission spike: common setup. Always run inside BEGIN ... ROLLBACK (the runner adds them).
-- Tenants: L = MOESA LTD, E = MOESA Europe (both have products), N = Nova Yazilim (perf second tenant).
-- Users: koordinator (role "coordinator" in L: product select/insert/update, NO cost fields)
--        akif (role "management" in L and E: cost fields granted in L only)
SET LOCAL client_min_messages = warning;
SELECT set_config('spk.L', '72fd7328-1c1c-4694-b564-2510741ce128', TRUE),
       set_config('spk.E', '7dff10b5-2991-4378-b37a-1176e3cf43fd', TRUE),
       set_config('spk.N', '304b3d9c-72d3-4f65-81c8-761023fc525e', TRUE),
       set_config('spk.akif', '376e6320-e76b-4529-a834-6ab2ec36ee6f', TRUE),
       set_config('spk.koord', '4c50b2e6-9b85-4227-b041-4316cf5b1b0b', TRUE) \g /dev/null

-- The secrets: one product in L and one in E with known cost values.
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, supplier_id, supplier_product_code,
    purchase_price, purchase_currency, purchase_incoterm, landed_cost_eur, landed_cost_on, company_price_eur, notes)
VALUES
 ('5b1e0000-0000-4000-8000-000000000001', '72fd7328-1c1c-4694-b564-2510741ce128', '5eed0002-0000-4000-8000-000000000001',
  'SPIKE-SECRET', 'Spike product', '5eed0002-0000-4000-8000-000000000005', 'SUP-XYZ', 12.5, 'USD', 'FOB', 14.25,
  '2026-01-01', 19.99, 'secret note'),
 ('5b1e0000-0000-4000-8000-000000000002', '7dff10b5-2991-4378-b37a-1176e3cf43fd', 'f3c8004d-53be-448f-a91f-cb848ac99012',
  'SPIKE-EU', 'Spike EU product', NULL, 'SUP-EU', 77.7, 'EUR', 'EXW', 80.0, '2026-01-01', 99.0, 'eu secret note');

-- Field-permission catalog (would be real tables in a migration).
CREATE TABLE private.spike_protected_field (resource TEXT, field TEXT, PRIMARY KEY (resource, field));
CREATE TABLE private.spike_role_field (
    role_id UUID REFERENCES public.role (id) ON DELETE CASCADE,
    resource TEXT, field TEXT, can_read BOOLEAN NOT NULL DEFAULT FALSE, can_write BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role_id, resource, field));

INSERT INTO private.spike_protected_field
SELECT 'product', f FROM unnest(ARRAY['purchase_price','purchase_currency','purchase_incoterm','landed_cost_eur',
    'landed_cost_on','company_price_eur','supplier_id','supplier_product_code','notes']) f;

-- management in L reads and writes every protected field; management in E gets nothing; coordinator nothing.
INSERT INTO private.spike_role_field (role_id, resource, field, can_read, can_write)
SELECT r.id, 'product', f.field, TRUE, TRUE
FROM public.role r CROSS JOIN private.spike_protected_field f
WHERE r.display_name = 'management' AND r.tenant_id = '72fd7328-1c1c-4694-b564-2510741ce128';

-- Call counter (pg_stat_xact_user_functions is unavailable: track_functions is superuser-only here).
CREATE OR REPLACE FUNCTION private.spike_tick () RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('spike.calls', (coalesce(nullif(current_setting('spike.calls', TRUE), ''), '0')::INT + 1)::TEXT, TRUE);
$$;

-- Of the request's tenants, those where the caller may read (or write) the field. Owners and super
-- admins: every tenant of the scope. Same resolution as private.tenants_granting (roles in that tenant).
CREATE OR REPLACE FUNCTION private.spike_field_tenants (p_resource TEXT, p_field TEXT, p_write BOOLEAN DEFAULT FALSE)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    uid UUID := auth.uid();
    scope UUID[] := private.tenant_scope();
BEGIN
    PERFORM private.spike_tick();
    IF NOT EXISTS (SELECT 1 FROM private.spike_protected_field f WHERE f.resource = p_resource AND f.field = p_field) THEN
        RETURN scope;
    END IF;
    IF uid IS NULL THEN
        RETURN '{}';
    END IF;
    IF private.check_super_admin() THEN
        RETURN scope;
    END IF;
    RETURN ARRAY(
        SELECT DISTINCT r.tenant_id
        FROM public.user_role ur
        JOIN public.role r ON r.id = ur.role_id
        JOIN private.spike_role_field f ON f.role_id = r.id
        WHERE ur.user_id = uid AND r.tenant_id = ANY (scope)
          AND f.resource = p_resource AND f.field = p_field
          AND CASE WHEN p_write THEN f.can_write ELSE f.can_read END
        UNION
        SELECT t FROM unnest(scope) t WHERE t = ANY (private.owned_tenants(uid))
    );
END;
$$;

-- The spec's form: may the caller read the field in the ACTIVE tenant (x-tenant-id)?
CREATE OR REPLACE FUNCTION private.spike_has_field (p_resource TEXT, p_field TEXT, p_write BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
    active UUID := private.tenant_id();
BEGIN
    IF active IS NULL THEN
        RETURN coalesce(private.check_super_admin(), FALSE) AND auth.uid() IS NOT NULL;
    END IF;
    RETURN active = ANY (private.spike_field_tenants(p_resource, p_field, p_write));
END;
$$;

GRANT EXECUTE ON FUNCTION private.spike_tick (), private.spike_field_tenants (TEXT, TEXT, BOOLEAN),
    private.spike_has_field (TEXT, TEXT, BOOLEAN) TO authenticated;

-- Base-table write guard: a protected field may change only where the caller may write it (the row's
-- own tenant). Rows written without a signed-in user (service role, postgres, cron) are not checked.
CREATE OR REPLACE FUNCTION private.spike_product_write_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
    f TEXT;
    new_j JSONB := to_jsonb(NEW);
    old_j JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    FOR f IN SELECT pf.field FROM private.spike_protected_field pf WHERE pf.resource = 'product' LOOP
        IF (TG_OP = 'INSERT' AND new_j ->> f IS NOT NULL)
           OR (TG_OP = 'UPDATE' AND new_j -> f IS DISTINCT FROM old_j -> f) THEN
            IF NOT NEW.tenant_id = ANY (private.spike_field_tenants('product', f, TRUE)) THEN
                RAISE EXCEPTION 'You don''t have permission to write the % field of product', f USING ERRCODE = '42501';
            END IF;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER spike_write_guard BEFORE INSERT OR UPDATE ON public.product
FOR EACH ROW EXECUTE FUNCTION private.spike_product_write_guard ();

-- Test helpers: run SQL, return 'OK <rows>' or 'ERR <sqlstate> <message>'. Invoker rights.
CREATE OR REPLACE FUNCTION public.spike_try (q TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
    EXECUTE format('SELECT coalesce(string_agg(x::TEXT, '' | ''), ''<no rows>'') FROM (%s) x', q) INTO r;
    RETURN 'OK ' || r;
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

-- DML variant (UPDATE/INSERT ... RETURNING) via a CTE.
CREATE OR REPLACE FUNCTION public.spike_try_dml (q TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
    EXECUTE format('WITH w AS (%s) SELECT coalesce(string_agg(w::TEXT, '' | ''), ''<no rows>'') FROM w', q) INTO r;
    RETURN 'OK ' || r;
EXCEPTION WHEN OTHERS THEN
    RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;

-- An attacker's "leaky" function: records every value it is called with (stands for RAISE NOTICE /
-- a side channel). Not LEAKPROOF (only a superuser can mark a function leakproof).
CREATE OR REPLACE FUNCTION public.spike_leak (v ANYELEMENT) RETURNS BOOLEAN LANGUAGE plpgsql COST 0.0000001 AS $$
BEGIN
    PERFORM set_config('spike.leaked', coalesce(current_setting('spike.leaked', TRUE), '') || ',' || coalesce(v::TEXT, 'NULL'), TRUE);
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spike_try (TEXT), public.spike_try_dml (TEXT), public.spike_leak (ANYELEMENT) TO PUBLIC;

-- Sign in as: private.impersonate(user, active tenant) + optional x-tenant-ids override.
CREATE OR REPLACE FUNCTION public.spike_as (who TEXT, active UUID, scope TEXT DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('role', 'postgres', TRUE);
    PERFORM private.impersonate(current_setting('spk.' || who)::UUID, active);
    IF scope IS NOT NULL THEN
        PERFORM set_config('request.headers', json_build_object('x-tenant-id', active, 'x-tenant-ids', scope)::TEXT, TRUE);
    END IF;
    PERFORM set_config('access.tenant_scope', '', TRUE);
    PERFORM set_config('spike.calls', '0', TRUE);
    PERFORM set_config('spike.leaked', '', TRUE);
END;
$$;

-- Builds a masking view over public.product: every column in table order, protected ones wrapped.
-- mode 'plain': CASE WHEN private.spike_has_field(..) THEN col END       (per-row call?)
-- mode 'sub'  : CASE WHEN (SELECT private.spike_has_field(..)) THEN col END  (InitPlan)
-- mode 'mt'   : CASE WHEN tenant_id = ANY ((SELECT private.spike_field_tenants(..))) THEN col END (per-row tenant)
CREATE OR REPLACE FUNCTION public.spike_build_view (view_name TEXT, mode TEXT, opts TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE cols TEXT;
BEGIN
    SELECT string_agg(
        CASE WHEN pf.field IS NULL THEN format('p.%I', a.attname)
             WHEN mode = 'plain' THEN format('CASE WHEN private.spike_has_field(%L, %L) THEN p.%I END AS %I', 'product', a.attname, a.attname, a.attname)
             WHEN mode = 'sub' THEN format('CASE WHEN (SELECT private.spike_has_field(%L, %L)) THEN p.%I END AS %I', 'product', a.attname, a.attname, a.attname)
             WHEN mode = 'mt' THEN format('CASE WHEN p.tenant_id = ANY ((SELECT private.spike_field_tenants(%L, %L))::UUID[]) THEN p.%I END AS %I', 'product', a.attname, a.attname, a.attname)
        END, ', ' ORDER BY a.attnum)
    INTO cols
    FROM pg_attribute a
    LEFT JOIN private.spike_protected_field pf ON pf.resource = 'product' AND pf.field = a.attname
    WHERE a.attrelid = 'public.product'::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped;
    EXECUTE format('CREATE VIEW %s WITH (%s) AS SELECT %s FROM public.product p', view_name, opts, cols);
END;
$$;
