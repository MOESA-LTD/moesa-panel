-- 059: the audit history and the transfer reports through api, masked per row tenant (OD4, S4), the
-- actor/reverter embeds over api.user (R9) and the revert refused when it would write a field the
-- caller may not write (C3, R8).
--
-- private.mask_json_deep(data, tenant, readable, sensitive)
--                        IMMUTABLE, recursive over objects and arrays: a key k at any depth becomes
--                        {"masked": true} when k is a sensitive field of some table of `sensitive`
--                        ({"<table>": [fields]}, sensitive_fields_map) and one of those '<table>.<k>' is
--                        missing from readable -> tenant ({"<tenant>": ["<table>.<field>"]},
--                        field_rights_map). A NULL tenant masks every such key (fail closed). The value
--                        is replaced whatever it is (JSON null too), so a filter on it learns nothing.
-- private.mask_audit_data(table, tenant, data, readable, sensitive)
--                        IMMUTABLE: a top-level key of `data` that is a sensitive field of `table` the
--                        tenant's readers may not read becomes {"masked": true} ("changed", without the
--                        value); for transfer, report and decisions go through mask_json_deep. A NULL
--                        tenant masks every sensitive key.
--                        Both are SECURITY DEFINER only so their bodies may call each other by name
--                        (authenticated has no USAGE on private); they read no table.
-- private.api_json_masked  transfer.report, transfer.decisions (mask_json_deep) and audit_log.old_data,
--                        audit_log.new_data (mask_audit_data over the row's table_name).
-- private.api_column_expr  Restated (053): a JSON-masked column is generated as its mask call with the
--                        rights map and the sensitive map as sub-selects (InitPlans, once per query).
-- private.api_view_drift   Restated (053): a JSON-masked column may also carry mask_audit_data; the
--                        whole expression is still compared with api_column_expr.
-- api.transfer           Re-generated read-only (S4); api_owner keeps SELECT only on public.transfer.
-- api.audit_transaction, api.audit_log
--                        Generated read-only, owner api_owner: plain columns, old_data/new_data masked.
-- api.actor, api.reverter (api.audit_transaction)
--                        SECURITY INVOKER over api.user: a colleague's personal data masked per S5.
-- api.dashboard_notification_feed
--                        010's feed over api.audit_transaction, api.audit_log and api.user (security
--                        invoker, explicit column list, SELECT for authenticated only).
-- public.revert_audit_transaction
--                        040's revert as a SECURITY DEFINER owned by api_owner (R8). Before anything is
--                        written it collects the changed sensitive keys of the transaction's rows
--                        (UPDATE: the keys of old_data, which holds only the changed ones; INSERT: the
--                        non-NULL keys of new_data; DELETE: the non-NULL keys of old_data) and refuses
--                        when one is not writable in the row's tenant (C3). System paths pass as at the
--                        base write guard (private.field_guard_bypassed, S2). The conflict check still
--                        compares with the base rows.
--                        A transaction that touched public.role_field_permission still fails with
--                        role_field_permission_save_role_only (S7): its trigger refuses any write
--                        outside save_role, so such a revert is refused whole, never applied in part.
--
--   audit_revert_field_forbidden (42501) the revert would write a field the caller may not write;
--                                DETAIL <table>.<field>

-- 1. Masking functions.

-- p_data with every key of p_hidden, at any depth, replaced by {"masked": true}.
CREATE OR REPLACE FUNCTION private.mask_json_keys (p_data JSONB, p_hidden TEXT[]) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF p_data IS NULL OR coalesce(cardinality(p_hidden), 0) = 0 THEN
        RETURN p_data;
    END IF;
    CASE jsonb_typeof(p_data)
        WHEN 'object' THEN
            RETURN coalesce((
                SELECT jsonb_object_agg(
                    e.key,
                    CASE WHEN e.key = ANY (p_hidden) THEN '{"masked": true}'::JSONB ELSE private.mask_json_keys(e.value, p_hidden) END
                )
                FROM jsonb_each(p_data) AS e
            ), '{}'::JSONB);
        WHEN 'array' THEN
            RETURN coalesce((
                SELECT jsonb_agg(private.mask_json_keys(e.value, p_hidden) ORDER BY e.n)
                FROM jsonb_array_elements(p_data) WITH ORDINALITY AS e (value, n)
            ), '[]'::JSONB);
        ELSE
            RETURN p_data;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION private.mask_json_deep (p_data JSONB, p_tenant UUID, p_readable JSONB, p_sensitive JSONB) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    hidden TEXT[];
BEGIN
    IF p_data IS NULL THEN
        RETURN NULL;
    END IF;
    -- A key is hidden when any table classifying it sensitive does not grant it to the tenant.
    hidden := ARRAY(
        SELECT DISTINCT f.field
        FROM jsonb_each(coalesce(p_sensitive, '{}'::JSONB)) AS s (tbl, fields),
             jsonb_array_elements_text(s.fields) AS f (field)
        WHERE p_tenant IS NULL
           OR NOT coalesce((p_readable -> (p_tenant::TEXT)) ? (s.tbl || '.' || f.field), FALSE)
    );
    RETURN private.mask_json_keys(p_data, hidden);
END;
$$;

CREATE OR REPLACE FUNCTION private.mask_audit_data (p_table TEXT, p_tenant UUID, p_data JSONB, p_readable JSONB, p_sensitive JSONB) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    hidden TEXT[];
    result JSONB;
    k TEXT;
BEGIN
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RETURN p_data;
    END IF;
    hidden := ARRAY(
        SELECT f.field
        FROM jsonb_array_elements_text(coalesce(p_sensitive -> p_table, '[]'::JSONB)) AS f (field)
        WHERE p_tenant IS NULL
           OR NOT coalesce((p_readable -> (p_tenant::TEXT)) ? (p_table || '.' || f.field), FALSE)
    );
    result := coalesce((
        SELECT jsonb_object_agg(e.key, CASE WHEN e.key = ANY (hidden) THEN '{"masked": true}'::JSONB ELSE e.value END)
        FROM jsonb_each(p_data) AS e
    ), '{}'::JSONB);
    -- S4: a transfer's report and decisions hold rows of other tables.
    IF p_table = 'transfer' THEN
        FOREACH k IN ARRAY ARRAY['report', 'decisions'] LOOP
            IF result ? k AND NOT k = ANY (hidden) THEN
                result := jsonb_set(result, ARRAY[k], private.mask_json_deep(result -> k, p_tenant, p_readable, p_sensitive));
            END IF;
        END LOOP;
    END IF;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION private.mask_json_keys (JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.mask_json_deep (JSONB, UUID, JSONB, JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION private.mask_audit_data (TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;

-- The api views call them by oid (as the field functions of 050).
GRANT EXECUTE ON FUNCTION private.mask_json_deep (JSONB, UUID, JSONB, JSONB) TO authenticated;

GRANT EXECUTE ON FUNCTION private.mask_audit_data (TEXT, UUID, JSONB, JSONB, JSONB) TO authenticated;

-- 2. The JSON-masked columns and the generator.

INSERT INTO
   private.api_json_masked (resource_name, field)
VALUES
   ('public.transfer', 'report'),
   ('public.transfer', 'decisions'),
   ('public.audit_log', 'old_data'),
   ('public.audit_log', 'new_data')
ON CONFLICT DO NOTHING;

-- 053's api_column_expr; a JSON-masked column is now generated as its mask call (it was refused).
CREATE OR REPLACE FUNCTION private.api_column_expr (p_table TEXT, p_column TEXT) RETURNS TEXT LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
DECLARE
    base REGCLASS := format('public.%I', p_table)::REGCLASS;
    resource TEXT := 'public.' || p_table;
    has_tenant BOOLEAN;
    cast_to TEXT;
    expr TEXT;
BEGIN
    has_tenant := EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = base AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
    );
    SELECT CASE WHEN ty.typtype = 'd' AND ty.typnotnull THEN NULL ELSE format_type(a.atttypid, a.atttypmod) END INTO cast_to
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_type ty ON ty.oid = a.atttypid
    WHERE a.attrelid = base AND a.attname = p_column AND a.attnum > 0 AND NOT a.attisdropped;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'no such column: ' || resource || '.' || p_column;
    END IF;

    IF private.api_is_sensitive(resource, p_column) THEN
        IF p_table = 'user' THEN
            expr := format('CASE WHEN t.id = auth.uid() OR t.id = ANY ((SELECT private.field_user_ids(%L, FALSE))::UUID[]) THEN t.%I END',
                           p_column, p_column);
        ELSIF has_tenant THEN
            expr := format(
                'CASE WHEN (SELECT private.field_read_all(%1$L, %2$L)) OR t.tenant_id = ANY ((SELECT private.field_read_tenants(%1$L, %2$L))::UUID[]) THEN t.%3$I END',
                resource, p_column, p_column
            );
        ELSE
            RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = resource || '.' || p_column;
        END IF;
        IF cast_to IS NOT NULL THEN
            expr := format('(%s)::%s', expr, cast_to);
        END IF;
        RETURN format('%s AS %I', expr, p_column);
    END IF;

    -- A JSON column whose keys are masked per row tenant (the maps as InitPlans): the audit snapshots
    -- by the row's own table, any other by every table's sensitive fields.
    IF EXISTS (SELECT 1 FROM private.api_json_masked j WHERE j.resource_name = resource AND j.field = p_column) THEN
        IF NOT has_tenant THEN
            RAISE EXCEPTION 'field_security_unsupported' USING DETAIL = 'JSON masking needs tenant_id: ' || resource || '.' || p_column;
        ELSIF p_table = 'audit_log' THEN
            RETURN format(
                'private.mask_audit_data(t.table_name, t.tenant_id, t.%1$I, (SELECT private.field_rights_map()), (SELECT private.sensitive_fields_map())) AS %1$I',
                p_column
            );
        END IF;
        RETURN format(
            'private.mask_json_deep(t.%1$I, t.tenant_id, (SELECT private.field_rights_map()), (SELECT private.sensitive_fields_map())) AS %1$I',
            p_column
        );
    END IF;
    RETURN format('t.%I', p_column);
END;
$$;

REVOKE ALL ON FUNCTION private.api_column_expr (TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 053's drift check; a JSON-masked column may carry mask_audit_data as well as mask_json_deep (the
-- whole expression is still compared with api_column_expr).
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
                EXECUTE format(
                    'CREATE TEMPORARY VIEW api_drift_expected AS SELECT %s FROM %s t',
                    (SELECT string_agg(private.api_column_expr(v.name, a.attname), ', ' ORDER BY a.attnum)
                     FROM pg_catalog.pg_attribute a WHERE a.attrelid = v.base AND a.attnum > 0 AND NOT a.attisdropped),
                    v.base::REGCLASS
                );
            EXCEPTION WHEN OTHERS THEN
                expected_ok := FALSE;
                problem := 'expected: ' || SQLERRM;
                RETURN NEXT;
            END;

            FOR c IN
                SELECT a.attname::TEXT AS name, s.expr, e.expr AS expected,
                       private.api_is_sensitive(resource, a.attname) AS sensitive,
                       EXISTS (SELECT 1 FROM private.api_json_masked j WHERE j.resource_name = resource AND j.field = a.attname) AS json_masked
                FROM pg_catalog.pg_attribute a
                JOIN private.api_view_select_list(v.view) s ON s.n = a.attnum
                LEFT JOIN private.api_view_select_list(CASE WHEN expected_ok THEN to_regclass('pg_temp.api_drift_expected') END) e ON e.n = a.attnum
                WHERE a.attrelid = v.view AND a.attnum > 0
                ORDER BY a.attnum
            LOOP
                IF c.sensitive THEN
                    IF (v.name = 'user' AND strpos(replace(c.expr, '::text', ''), format('field_user_ids(%L', c.name)) = 0)
                       OR (v.name <> 'user' AND strpos(replace(c.expr, '::text', ''), format('field_read_tenants(%L, %L)', resource, c.name)) = 0) THEN
                        problem := 'unmasked ' || c.name;
                        RETURN NEXT;
                    END IF;
                ELSIF c.expr <> format('t.%I', c.name) AND NOT (c.json_masked AND (strpos(c.expr, 'mask_json_deep(') > 0 OR strpos(c.expr, 'mask_audit_data(') > 0)) THEN
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

-- 3. The views.

-- S4: report and decisions masked; still read-only (api_owner keeps SELECT only on the base).
SELECT private.enable_field_security ('transfer', TRUE);

-- The audit trail: written by the audit triggers only, read through api. Giving a new view to api_owner
-- needs its CREATE on api for these statements only (as in 057).
GRANT CREATE ON SCHEMA api TO api_owner;

SELECT private.enable_field_security ('audit_transaction', TRUE);

SELECT private.enable_field_security ('audit_log', TRUE);

REVOKE CREATE ON SCHEMA api FROM api_owner;

-- The audit embeds on the api view (the app's actor(*), reverter(*)), SECURITY INVOKER over api.user.
CREATE OR REPLACE FUNCTION api.actor (api.audit_transaction) RETURNS SETOF api.user LANGUAGE sql STABLE ROWS 1
SET
   search_path = '' AS $$
    SELECT u.id, u.user_metadata, u.email, u.phone, u.created_at FROM api.user u WHERE u.id = $1.actor_id
$$;

CREATE OR REPLACE FUNCTION api.reverter (api.audit_transaction) RETURNS SETOF api.user LANGUAGE sql STABLE ROWS 1
SET
   search_path = '' AS $$
    SELECT u.id, u.user_metadata, u.email, u.phone, u.created_at FROM api.user u WHERE u.id = $1.reverted_by
$$;

REVOKE ALL ON FUNCTION api.actor (api.audit_transaction) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION api.reverter (api.audit_transaction) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION api.actor (api.audit_transaction) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION api.reverter (api.audit_transaction) TO authenticated, service_role;

-- The dashboard's latest changes (010) over the api views.
CREATE OR REPLACE VIEW api.dashboard_notification_feed WITH (security_invoker = true) AS
SELECT
   t.id,
   t.tenant_id,
   t.actor_id AS user_id,
   u.user_metadata ->> 'display_name' AS user_name,
   u.email AS user_email,
   t.operation,
   t.table_name,
   t.record_id AS resource_id,
   change.old_data,
   change.new_data,
   t.created_at,
   CASE
      WHEN now()::DATE = t.created_at::DATE THEN 'today'
      WHEN now()::DATE - 1 = t.created_at::DATE THEN 'yesterday'
      WHEN now()::DATE - t.created_at::DATE <= 7 THEN 'last_week'
      ELSE 'older'
   END AS since,
   CASE
      WHEN t.operation = 'INSERT' THEN 'created'
      WHEN t.operation = 'DELETE' THEN 'deleted'
      ELSE 'updated'
   END AS activity
FROM
   api.audit_transaction t
   LEFT JOIN api.user u ON u.id = t.actor_id
   LEFT JOIN LATERAL (
      SELECT
         l.old_data,
         l.new_data
      FROM
         api.audit_log l
      WHERE
         l.transaction_id = t.id
         AND l.created_at = t.created_at
         AND l.table_name = t.table_name
         AND l.record_id IS NOT DISTINCT FROM t.record_id
      ORDER BY
         l.id
      LIMIT
         1
   ) change ON TRUE;

REVOKE ALL ON api.dashboard_notification_feed FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON api.dashboard_notification_feed TO authenticated;

-- 4. The revert (040) as api_owner, with the C3 check before anything is written (see the header).
CREATE OR REPLACE FUNCTION public.revert_audit_transaction (transaction_id UUID) RETURNS TEXT[] LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target public.audit_transaction;
    change public.audit_log;
    pending BIGINT[];
    waiting BIGINT[];
    change_id BIGINT;
    relation REGCLASS;
    columns TEXT;
    row_columns TEXT;
    affected INT;
    blocked TEXT;
    forbidden TEXT;
BEGIN
    SELECT * INTO target FROM public.audit_transaction t WHERE t.id = revert_audit_transaction.transaction_id;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'audit transaction not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    IF target.reverted_at IS NOT NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'audit_already_reverted')::TEXT,
            DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
    END IF;

    -- A transfer is undone by transferring back, never from the log.
    IF public.audit_transfer_locked(target.id) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'audit_transfer_not_revertable')::TEXT,
            DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
    END IF;

    -- C3: every field the revert would write back must be writable by the caller in the row's
    -- tenant. The changed keys: UPDATE rows hold only those in old_data; an INSERT is undone by
    -- deleting its non-NULL values, a DELETE by inserting its non-NULL values again.
    IF NOT private.field_guard_bypassed() THEN
        SELECT l.table_name || '.' || k.key INTO forbidden
        FROM public.audit_log l
        CROSS JOIN LATERAL jsonb_each(CASE WHEN l.operation = 'INSERT' THEN l.new_data ELSE l.old_data END) AS k (key, value)
        WHERE l.transaction_id = target.id AND l.created_at = target.created_at
          AND (l.operation = 'UPDATE' OR k.value <> 'null'::JSONB)
          AND private.api_is_sensitive(l.table_schema || '.' || l.table_name, k.key)
          AND NOT coalesce(l.tenant_id = ANY (private.field_write_tenants(l.table_schema || '.' || l.table_name, k.key)), FALSE)
        ORDER BY l.id, k.key
        LIMIT 1;
        IF forbidden IS NOT NULL THEN
            RAISE EXCEPTION 'audit_revert_field_forbidden' USING ERRCODE = '42501', DETAIL = forbidden;
        END IF;
    END IF;

    -- Read by private.audit_begin when this transaction's first write is logged.
    PERFORM set_config('audit.reverts', target.id::TEXT, true);

    pending := ARRAY(
        SELECT l.id FROM public.audit_log l
        WHERE l.transaction_id = target.id AND l.created_at = target.created_at
        ORDER BY l.id DESC
    );

    WHILE cardinality(pending) > 0 LOOP
        waiting := '{}';

        FOREACH change_id IN ARRAY pending LOOP
            SELECT * INTO change FROM public.audit_log l WHERE l.id = change_id AND l.created_at = target.created_at;
            relation := format('%I.%I', change.table_schema, change.table_name)::REGCLASS;

            -- The columns to write back, without generated ones.
            SELECT string_agg(format('%I', a.attname), ', '), string_agg(format('r.%I', a.attname), ', ')
            INTO columns, row_columns
            FROM jsonb_object_keys(coalesce(change.old_data, '{}')) AS k (name)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = relation AND a.attname = k.name
            WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

            BEGIN
                CASE change.operation
                    WHEN 'INSERT' THEN
                        EXECUTE format('DELETE FROM %s t WHERE t.id = $1 AND to_jsonb(t) = $2', relation)
                        USING change.record_id, change.new_data;
                        GET DIAGNOSTICS affected = ROW_COUNT;

                        -- Already gone (a cascade of this revert, or deleted since) is what undoing
                        -- an insert asks for; only a row that was changed since is a conflict.
                        IF affected = 0 THEN
                            EXECUTE format('SELECT count(*) FROM %s t WHERE t.id = $1', relation)
                            INTO affected USING change.record_id;
                            affected := 1 - affected;
                        END IF;
                    WHEN 'UPDATE' THEN
                        EXECUTE format(
                            'UPDATE %s t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1) r) '
                            'WHERE t.id = $2 AND NOT EXISTS ('
                            '  SELECT 1 FROM jsonb_object_keys($1) k WHERE to_jsonb(t) -> k IS DISTINCT FROM $3 -> k)',
                            relation, columns, row_columns, relation
                        )
                        USING change.old_data, change.record_id, change.new_data;
                        GET DIAGNOSTICS affected = ROW_COUNT;
                    WHEN 'DELETE' THEN
                        EXECUTE format(
                            'INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1) r',
                            relation, columns, row_columns, relation
                        )
                        USING change.old_data;
                        GET DIAGNOSTICS affected = ROW_COUNT;
                END CASE;
            EXCEPTION
                WHEN foreign_key_violation THEN
                    waiting := waiting || change_id;
                    blocked := SQLERRM;
                    CONTINUE;
                -- A deleted row that was created again.
                WHEN unique_violation THEN
                    affected := 0;
            END;

            IF affected = 0 THEN
                RAISE SQLSTATE 'PGRST' USING
                    MESSAGE = json_build_object(
                        'code', 'P0001',
                        'message', 'audit_conflict',
                        'details', format('%s %s was changed after this change', change.table_name, change.record_id)
                    )::TEXT,
                    DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
            END IF;
        END LOOP;

        -- Nothing moved: the rows they refer to are gone for good.
        IF cardinality(waiting) = cardinality(pending) THEN
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0001', 'message', 'audit_conflict', 'details', blocked)::TEXT,
                DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
        END IF;
        pending := waiting;
    END LOOP;

    RETURN ARRAY(
        SELECT DISTINCT l.table_name FROM public.audit_log l
        WHERE l.transaction_id = target.id AND l.created_at = target.created_at
    );
END;
$$;

-- R8: owned by api_owner (NOLOGIN, not BYPASSRLS, a member of authenticated): the caller's RLS
-- policies and the base write guards still apply. Changing the owner needs api_owner's CREATE on
-- public for the statement only (as in 053 and 058).
GRANT CREATE ON SCHEMA public TO api_owner;

ALTER FUNCTION public.revert_audit_transaction (UUID) OWNER TO api_owner;

REVOKE CREATE ON SCHEMA public FROM api_owner;

REVOKE ALL ON FUNCTION public.revert_audit_transaction (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.revert_audit_transaction (UUID) TO authenticated, service_role;
