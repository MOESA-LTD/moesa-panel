-- The api schema (A-def): one view per business table, named like the table, that masks each
-- sensitive field per row tenant, with an INSTEAD OF forwarder in front of the base table.
--
-- api_owner              NOLOGIN, not BYPASSRLS, a member of authenticated (its RLS policies apply to
--                        the caller's rows, as the views are security_invoker = false). Owns every api
--                        view and the forwarder. Only postgres may SET ROLE to it; never authenticator,
--                        authenticated or anon. USAGE on private is its own (the forwarder's dynamic SQL
--                        names private functions); authenticated keeps no USAGE on private, as a view's
--                        stored expression reaches its functions by oid and only needs EXECUTE.
-- schema api             Exposed to PostgREST (config.toml; hosted projects: README). USAGE for
--                        authenticated and service_role; nothing for anon.
-- private.api_json_masked  The JSON columns whose keys a view masks (Task 12 fills it and adds
--                        mask_json_deep). Until then the generator refuses such a column.
-- private.enable_field_security(table, read_only)
--                        Generates api.<table> (api_view_query): FROM the base t CROSS JOIN a fenced
--                        one-row rights subquery m (SELECT (SELECT field_read_all(..)) AS a<n>,
--                        (SELECT field_read_tenants(..)) AS t<n>, ... OFFSET 0), with a pair only for
--                        the table's sensitive columns (n = attnum); system and open columns as they
--                        are; a sensitive one (or one missing from field_class: fail-closed) as
--                          CASE WHEN m.a<n> OR t.tenant_id = ANY (m.t<n>) THEN t.<c> END
--                        (on public.user: the row is the caller or one of m.u<n> = field_user_ids(c,
--                        FALSE), S5), cast back to the column's type unless that is a NOT NULL domain.
--                        The sub-selects make each field function an InitPlan of m: once per query,
--                        never per row (R10). The select list holds only Vars of m, never a SubLink,
--                        so a whole-row argument (R4's computed relationships) does not stop the
--                        planner from inlining the function. Then: owner api_owner; SELECT for authenticated; unless read_only,
--                        the write privileges authenticated holds on the base (or already holds on the
--                        view: a re-run after the cutover keeps them), a column-level UPDATE copied as
--                        the same column list, and the trigger api_forward. R4: for every foreign key
--                        through a sensitive column whose target already has its api view, the computed
--                        relationships api.<column without _id>(api.<t>) and api.<t>_by_<column without
--                        _id>(api.<target>); the migration creating the target's view re-runs this for
--                        the table. Last, the base write guard (051).
-- private.api_forward()  The INSTEAD OF trigger, SECURITY DEFINER owned by api_owner, keyed on the base
--                        primary key. UPDATE (S1): a column whose sent value differs from the masked OLD
--                        is a write; a sensitive one the caller may not write in the row's tenant raises
--                        field_write_forbidden, so a correct guess is refused like a wrong one. Only the
--                        changed columns are forwarded; with none, nothing is written, but the row is
--                        locked FOR UPDATE so the UPDATE policies still decide. INSERT: a non-NULL
--                        sensitive column the caller may not write in NEW.tenant_id raises the same; the
--                        non-NULL columns are forwarded and the base defaults fill the rest. Both re-read
--                        the row through the view, so RETURNING is masked (a re-read that finds nothing
--                        returns NEW as sent). A forwarded UPDATE or DELETE that reaches no base row (RLS)
--                        returns NULL, so the statement reports the rows actually changed.
--                        M2: an INSERT that sends NULL explicitly gets the column default (NULL is "not
--                        sent", as a masked NULL must be). M3: an INSERT without tenant_id that sets a
--                        sensitive column is refused (no tenant, no write right).
-- private.api_column_expr(table, column), api_rights_expr(table, column), api_view_from(table),
-- private.api_view_query(table)
--                        One select-list entry, a column's entries of m, the FROM and the whole query as
--                        the generator writes them (generator and drift share them).
-- private.api_view_drift()  For each public table with an api view: 'columns' (names or order differ);
--                        'expression <c>' (the deparsed column differs from what api_view_query would
--                        generate, built as a temporary view), 'definition' (the whole query differs:
--                        FROM, the rights subquery m, WHERE, ...), plus 'unmasked <c>' (a sensitive
--                        column not reading its m pair, or m without its field call) and 'masked <c>';
--                        'owner'; 'security_invoker' (not false); 'trigger' (authenticated may write the
--                        view but api_forward is missing); 'anon or public privilege' on the view;
--                        'anon or public execute <fn>' on a function over the view's row type (R4);
--                        'guard'. 053_api_schema.test.sql requires it empty.
-- private.field_calls_only_in_initplans(sql)
--                        Test support, executable by nobody but its owner: TRUE when every plan node
--                        naming a field function lies inside an InitPlan.
--
--   field_write_forbidden      (42501) a written field the caller may not write; DETAIL <table>.<field>
--   field_security_unsupported (generator) a table without tenant_id other than public.user has a
--                              sensitive field, a JSON-masked column before Task 12, no primary key,
--                              or a generated name over 63 bytes

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'api_owner') THEN
        CREATE ROLE api_owner NOLOGIN NOBYPASSRLS;
    END IF;
END;
$$;

GRANT authenticated TO api_owner;

GRANT api_owner TO postgres;

CREATE SCHEMA IF NOT EXISTS api;

GRANT USAGE ON SCHEMA api TO authenticated, service_role;

GRANT USAGE, CREATE ON SCHEMA api TO api_owner;

ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA private TO api_owner;

-- The forwarder reads the classification itself, not through authenticated's grant.
GRANT SELECT ON public.field_class TO api_owner;

CREATE TABLE IF NOT EXISTS private.api_json_masked (
   resource_name TEXT NOT NULL,
   field TEXT NOT NULL,
   PRIMARY KEY (resource_name, field)
);

REVOKE ALL ON private.api_json_masked FROM PUBLIC, anon, authenticated;

-- Fail-closed: a column missing from field_class is treated as sensitive.
CREATE OR REPLACE FUNCTION private.api_is_sensitive (p_resource TEXT, p_field TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT coalesce(
        (SELECT f.class NOT IN ('system', 'open') FROM public.field_class f WHERE f.resource_name = p_resource AND f.field = p_field),
        TRUE
    );
$$;

REVOKE ALL ON FUNCTION private.api_is_sensitive (TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.api_is_sensitive (TEXT, TEXT) TO api_owner;

CREATE OR REPLACE FUNCTION private.api_forward () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := pg_catalog.format('public.%I', TG_TABLE_NAME)::REGCLASS;
    resource TEXT := 'public.' || TG_TABLE_NAME;
    is_user BOOLEAN := TG_TABLE_NAME = 'user';
    has_tenant BOOLEAN;
    pk TEXT[];
    new_j JSONB;
    old_j JSONB;
    row_j JSONB;
    key_j JSONB;
    col RECORD;
    cols TEXT[] := '{}';
    allowed BOOLEAN;
    reread RECORD;
    n BIGINT;
BEGIN
    pk := ARRAY(
        SELECT a.attname::TEXT
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::INT2[])
        WHERE i.indrelid = base AND i.indisprimary
        ORDER BY pg_catalog.array_position(i.indkey::INT2[], a.attnum)
    );
    IF cardinality(pk) = 0 THEN
        RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'no primary key: ' || resource;
    END IF;

    IF TG_OP = 'DELETE' THEN
        EXECUTE pg_catalog.format(
            'DELETE FROM %s b WHERE %s', base,
            (SELECT pg_catalog.string_agg(pg_catalog.format('b.%1$I = ($1).%1$I', k), ' AND ') FROM unnest(pk) AS k)
        ) USING OLD;
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n = 0 THEN
            RETURN NULL;
        END IF;
        RETURN OLD;
    END IF;

    has_tenant := EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = base AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    );
    new_j := to_jsonb(NEW);
    -- The row whose rights apply: the stored (masked) row on UPDATE, the sent one on INSERT.
    IF TG_OP = 'UPDATE' THEN
        old_j := to_jsonb(OLD);
        row_j := old_j;
    ELSE
        row_j := new_j;
    END IF;

    FOR col IN
        SELECT a.attname::TEXT AS name, private.api_is_sensitive(resource, a.attname) AS sensitive
        FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = base AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ORDER BY a.attnum
    LOOP
        IF TG_OP = 'UPDATE' THEN
            CONTINUE WHEN NOT (new_j -> col.name IS DISTINCT FROM old_j -> col.name);
        ELSE
            CONTINUE WHEN coalesce(new_j -> col.name, 'null'::JSONB) = 'null'::JSONB;
        END IF;

        IF col.sensitive THEN
            IF is_user THEN
                allowed := (row_j ->> 'id')::UUID = auth.uid()
                        OR (row_j ->> 'id')::UUID = ANY (private.field_user_ids(col.name, TRUE));
            ELSIF has_tenant THEN
                allowed := (row_j ->> 'tenant_id')::UUID = ANY (private.field_write_tenants(resource, col.name));
            ELSE
                allowed := FALSE;
            END IF;
            IF NOT coalesce(allowed, FALSE) THEN
                RAISE EXCEPTION 'field_write_forbidden' USING ERRCODE = '42501', DETAIL = TG_TABLE_NAME || '.' || col.name;
            END IF;
        END IF;

        cols := cols || col.name;
    END LOOP;

    IF TG_OP = 'UPDATE' THEN
        -- One pass per project per statement (project_gate_guard): the forwarder writes one row at a time, each
        -- its own base statement, so the guard's flag is cleared between rows. Rows of one view statement share
        -- the statement timestamp; a second pass of a project under the same one is refused.
        IF TG_TABLE_NAME = 'project_gate' AND new_j ->> 'status' = 'passed' AND old_j ->> 'status' IS DISTINCT FROM 'passed' THEN
            IF pg_catalog.current_setting('moesa.api_gate_pass_' || replace(new_j ->> 'project_id', '-', '_'), TRUE) = pg_catalog.statement_timestamp()::TEXT THEN
                RAISE EXCEPTION 'gate_one_at_a_time' USING ERRCODE = 'check_violation';
            END IF;
            PERFORM pg_catalog.set_config('moesa.api_gate_pass_' || replace(new_j ->> 'project_id', '-', '_'), pg_catalog.statement_timestamp()::TEXT, TRUE);
        END IF;
        IF cardinality(cols) = 0 THEN
            -- Nothing to write, but RLS still decides: FOR UPDATE applies the UPDATE policies (a
            -- caller without update is refused as by a real UPDATE). Not a no-op UPDATE, which would
            -- bump updated_at and log an audit row.
            EXECUTE pg_catalog.format(
                'SELECT to_jsonb(b) FROM %s b WHERE %s FOR UPDATE', base,
                (SELECT pg_catalog.string_agg(pg_catalog.format('b.%1$I = ($1).%1$I', k), ' AND ') FROM unnest(pk) AS k)
            ) INTO key_j USING OLD;
            GET DIAGNOSTICS n = ROW_COUNT;
            IF n = 0 THEN
                RETURN NULL;
            END IF;
        ELSE
            EXECUTE pg_catalog.format(
                'UPDATE %s b SET (%s) = ROW (%s) WHERE %s RETURNING to_jsonb(b)', base,
                (SELECT pg_catalog.string_agg(pg_catalog.format('%I', c), ', ') FROM unnest(cols) AS c),
                (SELECT pg_catalog.string_agg(pg_catalog.format('($1).%I', c), ', ') FROM unnest(cols) AS c),
                (SELECT pg_catalog.string_agg(pg_catalog.format('b.%1$I = ($2).%1$I', k), ' AND ') FROM unnest(pk) AS k)
            ) INTO key_j USING NEW, OLD;
            GET DIAGNOSTICS n = ROW_COUNT;
            IF n = 0 THEN
                RETURN NULL;
            END IF;
        END IF;
    ELSIF cardinality(cols) = 0 THEN
        EXECUTE pg_catalog.format('INSERT INTO %s AS b DEFAULT VALUES RETURNING to_jsonb(b)', base) INTO key_j;
    ELSE
        EXECUTE pg_catalog.format(
            'INSERT INTO %s AS b (%s) VALUES (%s) RETURNING to_jsonb(b)', base,
            (SELECT pg_catalog.string_agg(pg_catalog.format('%I', c), ', ') FROM unnest(cols) AS c),
            (SELECT pg_catalog.string_agg(pg_catalog.format('($1).%I', c), ', ') FROM unnest(cols) AS c)
        ) INTO key_j USING NEW;
    END IF;

    -- The row as the caller may see it.
    EXECUTE pg_catalog.format(
        'SELECT v.* FROM api.%I v WHERE %s', TG_TABLE_NAME,
        (SELECT pg_catalog.string_agg(pg_catalog.format('v.%1$I = (jsonb_populate_record(NULL::%2$s, $1)).%1$I', k, base), ' AND ') FROM unnest(pk) AS k)
    ) INTO reread USING key_j;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
        NEW := reread;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.api_forward () FROM PUBLIC, anon, authenticated;

-- Changing a function's owner needs the new owner's CREATE on its schema; api_owner keeps only USAGE.
GRANT CREATE ON SCHEMA private TO api_owner;

ALTER FUNCTION private.api_forward () OWNER TO api_owner;

REVOKE CREATE ON SCHEMA private FROM api_owner;

-- One select-list entry of api.<table>: the column as it is, or its masking expression over the rights
-- subquery m (api_rights_expr). The generator and api_view_drift both use it (through api_view_query),
-- so drift compares a view with exactly what would be generated.
CREATE OR REPLACE FUNCTION private.api_column_expr (p_table TEXT, p_column TEXT) RETURNS TEXT LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    has_tenant BOOLEAN;
    n INT;
    cast_to TEXT;
    expr TEXT;
BEGIN
    has_tenant := EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = base AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    );
    SELECT a.attnum, CASE WHEN ty.typtype = 'd' AND ty.typnotnull THEN NULL ELSE format_type(a.atttypid, a.atttypmod) END INTO n, cast_to
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_type ty ON ty.oid = a.atttypid
    WHERE a.attrelid = base AND a.attname = p_column AND a.attnum > 0 AND NOT a.attisdropped;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'no such column: ' || resource || '.' || p_column;
    END IF;

    IF private.api_is_sensitive(resource, p_column) THEN
        IF p_table = 'user' THEN
            expr := format('CASE WHEN t.id = auth.uid() OR t.id = ANY (m.u%s) THEN t.%I END', n, p_column);
        ELSIF has_tenant THEN
            expr := format('CASE WHEN m.a%1$s OR t.tenant_id = ANY (m.t%1$s) THEN t.%2$I END', n, p_column);
        ELSE
            RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = resource || '.' || p_column;
        END IF;
        IF cast_to IS NOT NULL THEN
            expr := format('(%s)::%s', expr, cast_to);
        END IF;
        RETURN format('%s AS %I', expr, p_column);
    END IF;

    IF EXISTS (SELECT 1 FROM private.api_json_masked j WHERE j.resource_name = resource AND j.field = p_column) THEN
        RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'JSON masking needs mask_json_deep: ' || resource || '.' || p_column;
    END IF;
    RETURN format('t.%I', p_column);
END;
$$;

REVOKE ALL ON FUNCTION private.api_column_expr (TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- The entries a column adds to the rights subquery m: none for a plain column; for a sensitive one
-- a<n> (field_read_all) and t<n> (field_read_tenants), or u<n> (field_user_ids, public.user), n the
-- column's attnum. Each is a sub-select, so an InitPlan of m: once per query, never per row, even
-- when m is rescanned (R10).
CREATE OR REPLACE FUNCTION private.api_rights_expr (p_table TEXT, p_column TEXT) RETURNS TEXT[] LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    n INT;
BEGIN
    SELECT a.attnum INTO n
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = base AND a.attname = p_column AND a.attnum > 0 AND NOT a.attisdropped;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'no such column: ' || resource || '.' || p_column;
    END IF;
    IF NOT private.api_is_sensitive(resource, p_column) THEN
        RETURN '{}';
    END IF;
    IF p_table = 'user' THEN
        RETURN ARRAY[format('(SELECT private.field_user_ids(%L, FALSE)) AS u%s', p_column, n)];
    END IF;
    -- A table without tenant_id: api_column_expr refuses the column.
    RETURN ARRAY[
        format('(SELECT private.field_read_all(%L, %L)) AS a%s', resource, p_column, n),
        format('(SELECT private.field_read_tenants(%L, %L)) AS t%s', resource, p_column, n)
    ];
END;
$$;

REVOKE ALL ON FUNCTION private.api_rights_expr (TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- The FROM of api.<table>: the base as t and, when a column needs rights, the fenced one-row rights
-- subquery m (OFFSET 0 keeps it from being pulled up). The select list then holds plain Vars of m,
-- never a SubLink, so a whole-row argument of api.<table> (a computed relationship) is free of
-- subplans and the function is inlined.
CREATE OR REPLACE FUNCTION private.api_view_from (p_table TEXT) RETURNS TEXT LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    rights TEXT;
BEGIN
    SELECT string_agg(r.e, ', ' ORDER BY r.pos) INTO rights
    FROM (
        SELECT x.e, min(a.attnum * 100 + x.k) AS pos
        FROM pg_catalog.pg_attribute a,
             unnest(private.api_rights_expr(p_table, a.attname)) WITH ORDINALITY AS x (e, k)
        WHERE a.attrelid = base AND a.attnum > 0 AND NOT a.attisdropped
        GROUP BY x.e
    ) r;
    IF rights IS NULL THEN
        RETURN format('%s t', base);
    END IF;
    RETURN format('%s t CROSS JOIN (SELECT %s OFFSET 0) m', base, rights);
END;
$$;

REVOKE ALL ON FUNCTION private.api_view_from (TEXT) FROM PUBLIC, anon, authenticated;

-- The whole query of api.<table>, as the generator writes it and drift rebuilds it.
CREATE OR REPLACE FUNCTION private.api_view_query (p_table TEXT) RETURNS TEXT LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT format('SELECT %s FROM %s',
                  string_agg(private.api_column_expr(p_table, a.attname), ', ' ORDER BY a.attnum),
                  private.api_view_from(p_table))
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = format('public.%I', p_table)::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped;
$$;

REVOKE ALL ON FUNCTION private.api_view_query (TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enable_field_security (p_table TEXT, p_read_only BOOLEAN DEFAULT FALSE) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    expr TEXT;
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
    EXECUTE format('CREATE OR REPLACE VIEW api.%I WITH (security_invoker = false) AS %s',
                   p_table, private.api_view_query(p_table));

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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO api_owner', base);

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

REVOKE ALL ON FUNCTION private.enable_field_security (TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- The view's columns as pg_get_viewdef prints them: (position, expression without its alias).
CREATE OR REPLACE FUNCTION private.api_view_select_list (p_view REGCLASS) RETURNS TABLE (n INT, expr TEXT) LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
DECLARE
    def TEXT := btrim(pg_catalog.pg_get_viewdef(p_view, FALSE));
    i INT;
    ch TEXT;
    depth INT := 0;
    quote TEXT := NULL;
    item TEXT := '';
    k INT := 0;
BEGIN
    def := regexp_replace(def, '^SELECT\s+', '');
    i := 1;
    WHILE i <= length(def) LOOP
        ch := substr(def, i, 1);
        IF quote IS NOT NULL THEN
            IF ch = quote THEN
                quote := NULL;
            END IF;
        ELSIF ch IN ('''', '"') THEN
            quote := ch;
        ELSIF ch = '(' THEN
            depth := depth + 1;
        ELSIF ch = ')' THEN
            depth := depth - 1;
        ELSIF depth = 0 AND ch = ',' THEN
            k := k + 1;
            n := k;
            expr := regexp_replace(regexp_replace(item, '^\s+|\s+$', '', 'g'), '\s+AS\s+("([^"]|"")+"|\w+)$', '');
            RETURN NEXT;
            item := '';
            i := i + 1;
            CONTINUE;
        ELSIF depth = 0 AND substr(def, i) ~ '^\s+FROM\s' THEN
            EXIT;
        END IF;
        item := item || ch;
        i := i + 1;
    END LOOP;
    k := k + 1;
    n := k;
    expr := regexp_replace(regexp_replace(item, '^\s+|\s+$', '', 'g'), '\s+AS\s+("([^"]|"")+"|\w+)$', '');
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.api_view_select_list (REGCLASS) FROM PUBLIC, anon, authenticated;

-- VOLATILE: it builds the expected view as a temporary view and compares the two deparsed.
CREATE OR REPLACE FUNCTION private.api_view_drift () RETURNS TABLE (relation TEXT, problem TEXT) LANGUAGE plpgsql VOLATILE
SET
   search_path = '' AS $$
DECLARE
    v RECORD;
    c RECORD;
    resource TEXT;
    expected_ok BOOLEAN;
    anon_oid OID := (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = 'anon');
BEGIN
    FOR v IN
        SELECT b.oid AS base, w.oid AS view, w.reltype, w.reloptions, w.relacl, b.relname::TEXT AS name,
               pg_catalog.pg_get_userbyid(w.relowner)::TEXT AS owner
        FROM pg_catalog.pg_class w
        JOIN pg_catalog.pg_namespace wn ON wn.oid = w.relnamespace AND wn.nspname = 'api'
        JOIN pg_catalog.pg_class b ON b.relname = w.relname AND b.relkind IN ('r', 'p')
        JOIN pg_catalog.pg_namespace bn ON bn.oid = b.relnamespace AND bn.nspname = 'public'
        WHERE w.relkind = 'v'
        ORDER BY b.relname
    LOOP
        resource := 'public.' || v.name;
        relation := v.name;

        IF ARRAY(SELECT a.attname::TEXT FROM pg_catalog.pg_attribute a WHERE a.attrelid = v.base AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum)
           IS DISTINCT FROM
           ARRAY(SELECT a.attname::TEXT FROM pg_catalog.pg_attribute a WHERE a.attrelid = v.view AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) THEN
            problem := 'columns';
            RETURN NEXT;
        ELSE
            -- What the generator would produce, deparsed the same way as the live view.
            expected_ok := TRUE;
            IF to_regclass('pg_temp.api_drift_expected') IS NOT NULL THEN
                EXECUTE 'DROP VIEW pg_temp.api_drift_expected';
            END IF;
            BEGIN
                EXECUTE 'CREATE TEMPORARY VIEW api_drift_expected AS ' || private.api_view_query(v.name);
            EXCEPTION WHEN OTHERS THEN
                expected_ok := FALSE;
                problem := 'expected: ' || SQLERRM;
                RETURN NEXT;
            END;

            FOR c IN
                SELECT a.attname::TEXT AS name, s.expr, e.expr AS expected,
                       -- m's pairs are numbered by the base column's attnum (the view's skips dropped ones).
                       (SELECT b.attnum FROM pg_catalog.pg_attribute b WHERE b.attrelid = v.base AND b.attname = a.attname) AS n,
                       private.api_is_sensitive(resource, a.attname) AS sensitive,
                       EXISTS (SELECT 1 FROM private.api_json_masked j WHERE j.resource_name = resource AND j.field = a.attname) AS json_masked
                FROM pg_catalog.pg_attribute a
                JOIN private.api_view_select_list(v.view) s ON s.n = a.attnum
                LEFT JOIN private.api_view_select_list(CASE WHEN expected_ok THEN to_regclass('pg_temp.api_drift_expected') END) e ON e.n = a.attnum
                WHERE a.attrelid = v.view AND a.attnum > 0
                ORDER BY a.attnum
            LOOP
                IF c.sensitive THEN
                    -- The mask reads its own pair of the rights subquery m, and m holds the column's call.
                    IF (v.name = 'user' AND (c.expr !~ format('\mm\.u%s\M', c.n)
                                             OR strpos(replace(pg_catalog.pg_get_viewdef(v.view), '::text', ''), format('field_user_ids(%L', c.name)) = 0))
                       OR (v.name <> 'user' AND (c.expr !~ format('\mm\.t%s\M', c.n)
                                                 OR strpos(replace(pg_catalog.pg_get_viewdef(v.view), '::text', ''), format('field_read_tenants(%L, %L)', resource, c.name)) = 0)) THEN
                        problem := 'unmasked ' || c.name;
                        RETURN NEXT;
                    END IF;
                ELSIF c.expr <> format('t.%I', c.name) AND NOT (c.json_masked AND strpos(c.expr, 'mask_json_deep(') > 0) THEN
                    problem := 'masked ' || c.name;
                    RETURN NEXT;
                END IF;
                -- The whole expression, so `true OR ...` or a THEN naming another column is caught.
                IF expected_ok AND c.expr IS DISTINCT FROM c.expected THEN
                    problem := 'expression ' || c.name;
                    RETURN NEXT;
                END IF;
            END LOOP;
            -- The whole query (FROM, WHERE, ...), deparsed under the same search_path ''.
            IF expected_ok AND pg_catalog.pg_get_viewdef(v.view) IS DISTINCT FROM pg_catalog.pg_get_viewdef(to_regclass('pg_temp.api_drift_expected')) THEN
                problem := 'definition';
                RETURN NEXT;
            END IF;
            IF to_regclass('pg_temp.api_drift_expected') IS NOT NULL THEN
                EXECUTE 'DROP VIEW pg_temp.api_drift_expected';
            END IF;
        END IF;

        IF v.owner <> 'api_owner' THEN
            problem := 'owner';
            RETURN NEXT;
        END IF;

        IF NOT coalesce('security_invoker=false' = ANY (v.reloptions), FALSE) THEN
            problem := 'security_invoker';
            RETURN NEXT;
        END IF;

        -- Read-only is a view authenticated may not write; any other needs the forwarder.
        IF (has_table_privilege('authenticated', v.view, 'INSERT') OR has_table_privilege('authenticated', v.view, 'DELETE')
            OR has_any_column_privilege('authenticated', v.view, 'UPDATE'))
           AND NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_trigger t
               WHERE t.tgrelid = v.view AND t.tgname = 'api_forward' AND t.tgenabled = 'O'
                 AND t.tgfoid = 'private.api_forward()'::REGPROCEDURE
           ) THEN
            problem := 'trigger';
            RETURN NEXT;
        END IF;

        IF EXISTS (SELECT 1 FROM aclexplode(v.relacl) x WHERE x.grantee IN (0, anon_oid))
           OR EXISTS (
               SELECT 1 FROM pg_catalog.pg_attribute a, aclexplode(a.attacl) x
               WHERE a.attrelid = v.view AND x.grantee IN (0, anon_oid)
           ) THEN
            problem := 'anon or public privilege';
            RETURN NEXT;
        END IF;

        -- The R4 functions over this view: no ACL means EXECUTE for PUBLIC.
        FOR c IN
            SELECT p.proname::TEXT AS name
            FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace AND pn.nspname = 'api'
            WHERE (v.reltype = ANY (p.proargtypes::OID[]) OR p.prorettype = v.reltype)
              AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee IN (0, anon_oid)))
            ORDER BY p.proname
        LOOP
            problem := 'anon or public execute ' || c.name;
            RETURN NEXT;
        END LOOP;

        IF (EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = v.base AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped)
            OR EXISTS (SELECT 1 FROM public.field_class f WHERE f.resource_name = resource AND f.class = 'sensitive'))
           AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = v.base AND t.tgname = 'aa_field_write_guard' AND t.tgenabled = 'O') THEN
            problem := 'guard';
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.api_view_drift () FROM PUBLIC, anon, authenticated;

-- Test support (R10): runs EXPLAIN as the caller.
CREATE OR REPLACE FUNCTION private.field_calls_only_in_initplans (p_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    plan JSONB;
BEGIN
    EXECUTE 'EXPLAIN (VERBOSE, FORMAT JSON) ' || p_sql INTO plan;
    RETURN NOT EXISTS (
        WITH RECURSIVE nodes (node, in_initplan) AS (
            SELECT plan -> 0 -> 'Plan', coalesce(plan -> 0 -> 'Plan' ->> 'Subplan Name', '') LIKE 'InitPlan%'
            UNION ALL
            SELECT c.node, p.in_initplan OR coalesce(c.node ->> 'Subplan Name', '') LIKE 'InitPlan%'
            FROM nodes p, jsonb_array_elements(p.node -> 'Plans') AS c (node)
        )
        SELECT 1 FROM nodes
        WHERE NOT in_initplan
          -- Output and Filter, and every other expression of the node (Sort Key, Index Cond, ...).
          AND (node - 'Plans')::TEXT
              ~ '(field_read_tenants|field_read_all|field_user_ids|field_rights_map|hidden_media_ids)'
    );
END;
$$;

REVOKE ALL ON FUNCTION private.field_calls_only_in_initplans (TEXT) FROM PUBLIC, anon, authenticated;

SELECT private.enable_field_security('product');
