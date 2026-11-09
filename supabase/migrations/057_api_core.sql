-- 057: masked api views for the core, files and catalog tables, personal data of users (S5), the
-- read-only catalog views (S7) and the computed fields the app selects on the api views.
-- Read-only views (p_read_only) now also leave api_owner without write on the base table: restated generator.
CREATE OR REPLACE FUNCTION private.enable_field_security (p_table TEXT, p_read_only BOOLEAN DEFAULT FALSE) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    expr TEXT;
    select_list TEXT[] := '{}';
    priv TEXT;
    update_cols TEXT;
    fk RECORD;
    fk_col TEXT;
    link TEXT;
    forward_fn TEXT;
    reverse_fn TEXT;
    view_name TEXT := format('api.%I', p_table);
    existed BOOLEAN := to_regclass(format('api.%I', p_table)) IS NOT NULL;
    prior TEXT[] := '{}';
    prior_cols TEXT[] := '{}';
BEGIN
    -- What authenticated may already write through the view: table-level, then column-level UPDATE.
    IF existed THEN
        prior := ARRAY(
            SELECT p FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS p
            WHERE has_table_privilege('authenticated', view_name, p)
        );
        prior_cols := ARRAY(
            SELECT a.attname::TEXT FROM pg_catalog.pg_attribute a
            WHERE a.attrelid = view_name::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped
              AND has_column_privilege('authenticated', view_name::REGCLASS, a.attnum, 'UPDATE')
        );
    END IF;

    -- 1. The view.
    select_list := ARRAY(
        SELECT private.api_column_expr(p_table, a.attname)
        FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = base AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    );

    EXECUTE format('CREATE OR REPLACE VIEW api.%I WITH (security_invoker = false) AS SELECT %s FROM %s t',
                   p_table, array_to_string(select_list, ', '), base);

    -- 2. Ownership and grants. The write privileges mirror authenticated's on the base, never more
    -- (a default privilege on the schema does not count); those the view already had are kept, so a
    -- re-run after the cutover (Task 19 revokes the base) loses nothing.
    EXECUTE format('ALTER VIEW api.%I OWNER TO api_owner', p_table);
    IF NOT existed THEN
        prior := '{}';
    END IF;
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO update_cols
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = base AND a.attnum > 0 AND NOT a.attisdropped
      AND (has_column_privilege('authenticated', base, a.attnum, 'UPDATE')
           OR (existed AND a.attname::TEXT = ANY (prior_cols)));
    EXECUTE format('REVOKE ALL ON api.%I FROM PUBLIC, anon, authenticated', p_table);
    EXECUTE format('GRANT SELECT ON api.%I TO authenticated', p_table);
    IF NOT p_read_only THEN
        FOREACH priv IN ARRAY ARRAY['INSERT', 'DELETE'] LOOP
            IF has_table_privilege('authenticated', base, priv) OR priv = ANY (prior) THEN
                EXECUTE format('GRANT %s ON api.%I TO authenticated', priv, p_table);
            END IF;
        END LOOP;
        IF has_table_privilege('authenticated', base, 'UPDATE') OR 'UPDATE' = ANY (prior) THEN
            EXECUTE format('GRANT UPDATE ON api.%I TO authenticated', p_table);
        ELSIF update_cols IS NOT NULL THEN
            EXECUTE format('GRANT UPDATE (%s) ON api.%I TO authenticated', update_cols, p_table);
        END IF;
    END IF;
    IF p_read_only THEN
        -- A read-only view never writes its base: api_owner keeps SELECT only (and loses any write an earlier run gave it).
        EXECUTE format('GRANT SELECT ON %s TO api_owner', base);
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %s FROM api_owner', base);
    ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO api_owner', base);
    END IF;

    -- 3. The forwarder.
    IF p_read_only THEN
        EXECUTE format('DROP TRIGGER IF EXISTS api_forward ON api.%I', p_table);
    ELSE
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER api_forward INSTEAD OF INSERT OR UPDATE OR DELETE ON api.%I FOR EACH ROW EXECUTE FUNCTION private.api_forward ()',
            p_table
        );
    END IF;

    -- 4. R4: embeds across a sensitive link, once the target has its view.
    FOR fk IN
        SELECT tc.relname::TEXT AS target, c.conkey, c.confkey, c.conrelid, c.confrelid
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class tc ON tc.oid = c.confrelid
        JOIN pg_catalog.pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE c.conrelid = base AND c.contype = 'f' AND tn.nspname = 'public'
          AND to_regclass(format('api.%I', tc.relname)) IS NOT NULL
        ORDER BY c.conname
    LOOP
        FOR fk_col IN
            SELECT a.attname::TEXT
            FROM unnest(fk.conkey) AS k (attnum)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k.attnum
            WHERE private.api_is_sensitive(resource, a.attname) AND a.attname LIKE '%\_id'
        LOOP
            link := left(fk_col, -3);
            forward_fn := link;
            reverse_fn := p_table || '_by_' || link;
            IF octet_length(reverse_fn) > 63 THEN
                RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'name too long: ' || reverse_fn;
            END IF;
            -- The pairs of the key, as written in the constraint.
            expr := (
                SELECT string_agg(format('x.%I = $1.%I', ta.attname, sa.attname), ' AND ' ORDER BY k.n)
                FROM unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS k (src, dst, n)
                JOIN pg_catalog.pg_attribute sa ON sa.attrelid = fk.conrelid AND sa.attnum = k.src
                JOIN pg_catalog.pg_attribute ta ON ta.attrelid = fk.confrelid AND ta.attnum = k.dst
            );
            EXECUTE format(
                'CREATE OR REPLACE FUNCTION api.%1$I (api.%2$I) RETURNS SETOF api.%3$I ROWS 1 STABLE LANGUAGE sql SECURITY INVOKER AS %4$L',
                forward_fn, p_table, fk.target, format('SELECT x.* FROM api.%I x WHERE %s', fk.target, expr)
            );
            expr := (
                SELECT string_agg(format('x.%I = $1.%I', sa.attname, ta.attname), ' AND ' ORDER BY k.n)
                FROM unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS k (src, dst, n)
                JOIN pg_catalog.pg_attribute sa ON sa.attrelid = fk.conrelid AND sa.attnum = k.src
                JOIN pg_catalog.pg_attribute ta ON ta.attrelid = fk.confrelid AND ta.attnum = k.dst
            );
            EXECUTE format(
                'CREATE OR REPLACE FUNCTION api.%1$I (api.%2$I) RETURNS SETOF api.%3$I STABLE LANGUAGE sql SECURITY INVOKER AS %4$L',
                reverse_fn, fk.target, p_table, format('SELECT x.* FROM api.%I x WHERE %s', p_table, expr)
            );
            EXECUTE format('REVOKE ALL ON FUNCTION api.%I (api.%I) FROM PUBLIC, anon', forward_fn, p_table);
            EXECUTE format('REVOKE ALL ON FUNCTION api.%I (api.%I) FROM PUBLIC, anon', reverse_fn, fk.target);
            EXECUTE format('GRANT EXECUTE ON FUNCTION api.%I (api.%I) TO authenticated', forward_fn, p_table);
            EXECUTE format('GRANT EXECUTE ON FUNCTION api.%I (api.%I) TO authenticated', reverse_fn, fk.target);
        END LOOP;
    END LOOP;

    -- 5. The base write guard, the second line.
    PERFORM private.enable_field_write_guard(p_table);
END;
$$;

SELECT private.enable_field_security (t)
FROM unnest(ARRAY['document', 'media', 'media_link', 'setting', 'tenant', 'tenant_user', 'tenant_owner', 'user',
                  'role', 'user_role', 'role_permission', 'permission', 'module', 'plan', 'plan_limit', 'plan_module',
                  'platform', 'subscription', 'task_template', 'amazon_product_type_definition']) AS t;

SELECT private.enable_field_security (t, TRUE)
FROM unnest(ARRAY['role_field_permission', 'field_class', 'field_group', 'transfer', 'code_sequence']) AS t;

-- api.document now exists: the R4 relationships to it (contract_document, pi_document and their
-- reverses) are created by re-running the generator for their owners.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['customer', 'purchase_order']) AS t;

-- Computed fields. Each wraps the public function of the same name, which stays the single place of
-- the rule and already limits itself to the caller (owned_via by private.scope_and_above(),
-- managed_in by private.tenant_scope(), status is a pure function of the subscription's own dates).
-- The wrappers are definer only to read the base row by id; they return nothing but what the public
-- function returns, and the id comes from an api row the caller could already see.
CREATE OR REPLACE FUNCTION api.owned_via (api.user) RETURNS TEXT[] LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.owned_via (u) FROM public.user u WHERE u.id = $1.id
$$;

CREATE OR REPLACE FUNCTION api.managed_in (api.user) RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.managed_in (u) FROM public.user u WHERE u.id = $1.id
$$;

CREATE OR REPLACE FUNCTION api.status (api.subscription) RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
    SELECT public.status (s) FROM public.subscription s WHERE s.id = $1.id
$$;

-- Changing a function's owner needs the new owner's CREATE on its schema (as in 053).
GRANT CREATE ON SCHEMA api TO api_owner;

ALTER FUNCTION api.owned_via (api.user) OWNER TO api_owner;

ALTER FUNCTION api.managed_in (api.user) OWNER TO api_owner;

ALTER FUNCTION api.status (api.subscription) OWNER TO api_owner;

REVOKE CREATE ON SCHEMA api FROM api_owner;

REVOKE ALL ON FUNCTION api.owned_via (api.user) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION api.managed_in (api.user) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION api.status (api.subscription) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION api.owned_via (api.user) TO authenticated;

GRANT EXECUTE ON FUNCTION api.managed_in (api.user) TO authenticated;

GRANT EXECUTE ON FUNCTION api.status (api.subscription) TO authenticated;
