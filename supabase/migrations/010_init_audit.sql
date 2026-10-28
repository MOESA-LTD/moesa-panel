-- Audit trail: every write to the audited tables, grouped by the transaction that made it.
--
-- audit_transaction  One row per transaction (so per request or RPC call): who, which tenant, when,
--                    and the change it was about. Lists and the dashboard read only this table.
-- audit_log          The changed rows, partitioned by month. INSERT keeps the new row, DELETE the
--                    old row, UPDATE the new row plus the old values of the changed columns only.
--                    Updates that change nothing are not logged.
--
-- Statement-level triggers write one INSERT … SELECT per statement, so bulk writes stay cheap.
-- Every role is recorded (service_role, postgres, …), not only signed-in users.
--
-- The current transaction's audit row is kept in transaction-local settings (audit.*), which roll
-- back with the transaction or savepoint that set them.

CREATE TABLE IF NOT EXISTS public.audit_transaction (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID REFERENCES public.tenant (id) ON DELETE CASCADE,
   -- No foreign keys to public.user: who did it stays known after the user is deleted.
   actor_id UUID,
   actor_role TEXT NOT NULL,
   -- The change the transaction was about: its outermost write.
   table_name TEXT NOT NULL,
   record_id UUID,
   -- INSERT, UPDATE or DELETE; a transaction that mixes them is an UPDATE.
   operation TEXT NOT NULL,
   -- Set on a revert (the transaction it undid) and on the transaction it undid.
   reverts_id UUID REFERENCES public.audit_transaction (id) ON DELETE SET NULL,
   reverted_at TIMESTAMPTZ,
   reverted_by UUID,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_transaction_tenant_created ON public.audit_transaction (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_transaction_created ON public.audit_transaction (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_transaction_reverts ON public.audit_transaction (reverts_id)
WHERE
   reverts_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.audit_log (
   id BIGSERIAL,
   transaction_id UUID NOT NULL REFERENCES public.audit_transaction (id) ON DELETE CASCADE,
   tenant_id UUID,
   table_schema TEXT NOT NULL,
   table_name TEXT NOT NULL,
   operation TEXT NOT NULL,
   record_id UUID,
   old_data JSONB,
   new_data JSONB,
   -- The transaction's start, as on audit_transaction: a transaction's rows share one partition.
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   PRIMARY KEY (id, created_at)
)
PARTITION BY
   RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_transaction ON public.audit_log (transaction_id);

-- A record's history.
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log (tenant_id, table_name, record_id);

-- Partitions live in the private schema, which the API cannot reach: they have no RLS of their own.
CREATE TABLE IF NOT EXISTS private.audit_log_default PARTITION OF public.audit_log DEFAULT;

-- Monthly partitions from this month on (UTC months).
CREATE OR REPLACE FUNCTION private.audit_create_partitions (months_ahead INT DEFAULT 2) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    month TIMESTAMP;
BEGIN
    FOR month IN
        SELECT generate_series(
            date_trunc('month', now() AT TIME ZONE 'UTC'),
            date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => months_ahead),
            INTERVAL '1 month'
        )
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS private.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
                'audit_log_' || to_char(month, 'YYYY_MM'),
                month AT TIME ZONE 'UTC',
                (month + INTERVAL '1 month') AT TIME ZONE 'UTC'
            );
        EXCEPTION
            -- The default partition already holds rows of that month (maintenance did not run);
            -- they stay there and the month keeps using it.
            WHEN check_violation THEN
                RAISE WARNING 'audit_log: month % stays in the default partition: %', month, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Drops whole months older than `keep` (instant, no row deletes) and the transactions of that time.
CREATE OR REPLACE FUNCTION private.audit_purge (keep INTERVAL DEFAULT INTERVAL '1 year') RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    cutoff TIMESTAMPTZ := (date_trunc('month', (now() - keep) AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC';
    partition_name TEXT;
BEGIN
    FOR partition_name IN
        SELECT c.relname
        FROM pg_catalog.pg_inherits i
        JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'public.audit_log'::REGCLASS
          AND c.relname ~ '^audit_log_\d{4}_\d{2}$'
          AND to_date(substr(c.relname, 11), 'YYYY_MM') + INTERVAL '1 month' <= cutoff AT TIME ZONE 'UTC'
    LOOP
        EXECUTE format('DROP TABLE private.%I', partition_name);
    END LOOP;

    DELETE FROM public.audit_transaction WHERE created_at < cutoff;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_maintain () RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.audit_create_partitions();
    PERFORM private.audit_purge();
END;
$$;

SELECT
   private.audit_create_partitions ();

-- The audit row of the current transaction: created on its first logged write, then kept up to
-- date. Returns its id and tenant for the rows to be logged.
CREATE OR REPLACE FUNCTION private.audit_begin (
   p_table_name TEXT,
   p_operation TEXT,
   p_row JSONB,
   OUT transaction_id UUID,
   OUT tenant_id UUID
) LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    -- Writes made by triggers (cascades, owner roles, …) are nested deeper than the write that
    -- caused them; a cascade is even logged before the delete that caused it.
    depth INT := pg_trigger_depth();
    actor UUID := auth.uid();
    reverts UUID := nullif(current_setting('audit.reverts', true), '')::UUID;
    undone UUID;
BEGIN
    transaction_id := nullif(current_setting('audit.transaction_id', true), '')::UUID;

    IF transaction_id IS NOT NULL THEN
        tenant_id := nullif(current_setting('audit.tenant_id', true), '')::UUID;

        IF depth < current_setting('audit.depth')::INT THEN
            PERFORM set_config('audit.depth', depth::TEXT, true);
            UPDATE public.audit_transaction t
            SET table_name = p_table_name,
                record_id = (p_row ->> 'id')::UUID,
                operation = CASE WHEN t.operation = p_operation THEN p_operation ELSE 'UPDATE' END
            WHERE t.id = transaction_id;
        ELSE
            UPDATE public.audit_transaction t
            SET operation = 'UPDATE'
            WHERE t.id = transaction_id AND t.operation <> p_operation;
        END IF;
        RETURN;
    END IF;

    -- The tenant of the row: with several tenants in a request, not necessarily the active one.
    tenant_id := coalesce(
        (p_row ->> 'tenant_id')::UUID,
        CASE WHEN p_table_name = 'tenant' THEN (p_row ->> 'id')::UUID END,
        private.tenant_id()
    );
    -- A tenant being deleted takes its trail with it; its own deletion is kept without a tenant.
    IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = tenant_id) THEN
        tenant_id := NULL;
    END IF;

    INSERT INTO public.audit_transaction (tenant_id, actor_id, actor_role, table_name, record_id, operation, reverts_id, created_at)
    VALUES (tenant_id, actor, coalesce(auth.role(), session_user::TEXT), p_table_name, (p_row ->> 'id')::UUID, p_operation, reverts, now())
    RETURNING id INTO transaction_id;

    PERFORM set_config('audit.transaction_id', transaction_id::TEXT, true);
    PERFORM set_config('audit.tenant_id', coalesce(tenant_id::TEXT, ''), true);
    PERFORM set_config('audit.depth', depth::TEXT, true);

    -- Set by public.revert_audit_transaction, after it checked the caller may see that transaction.
    IF reverts IS NOT NULL THEN
        -- Waits for a concurrent revert of the same transaction, then finds it reverted.
        UPDATE public.audit_transaction t
        SET reverted_at = now(), reverted_by = actor
        WHERE t.id = reverts AND t.reverted_at IS NULL
        RETURNING t.reverts_id INTO undone;

        IF NOT FOUND THEN
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0001', 'message', 'audit_already_reverted')::TEXT,
                DETAIL = json_build_object('status', 409, 'headers', json_build_object())::TEXT;
        END IF;

        -- Undoing a revert brings back the change it undid, which can then be reverted again.
        IF undone IS NOT NULL THEN
            UPDATE public.audit_transaction t SET reverted_at = NULL, reverted_by = NULL WHERE t.id = undone;
        END IF;
    END IF;
END;
$$;

-- Logs one statement's changed rows (transition tables old_rows / new_rows).
CREATE OR REPLACE FUNCTION private.audit_statement () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    first_row JSONB;
    audit RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT to_jsonb(n) INTO first_row FROM new_rows n LIMIT 1;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT to_jsonb(o) INTO first_row FROM old_rows o LIMIT 1;
    ELSE
        SELECT n.data INTO first_row
        FROM (SELECT o.id, to_jsonb(o) AS data FROM old_rows o) o
        JOIN (SELECT n.id, to_jsonb(n) AS data FROM new_rows n) n USING (id)
        WHERE n.data IS DISTINCT FROM o.data
        LIMIT 1;
    END IF;

    IF first_row IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT * INTO audit FROM private.audit_begin(TG_TABLE_NAME, TG_OP, first_row);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (transaction_id, tenant_id, table_schema, table_name, operation, record_id, new_data, created_at)
        SELECT audit.transaction_id, audit.tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, (to_jsonb(n) ->> 'id')::UUID, to_jsonb(n), now()
        FROM new_rows n;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (transaction_id, tenant_id, table_schema, table_name, operation, record_id, old_data, created_at)
        SELECT audit.transaction_id, audit.tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, (to_jsonb(o) ->> 'id')::UUID, to_jsonb(o), now()
        FROM old_rows o;
    ELSE
        INSERT INTO public.audit_log (transaction_id, tenant_id, table_schema, table_name, operation, record_id, old_data, new_data, created_at)
        SELECT audit.transaction_id, audit.tenant_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, n.id,
            (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(o.data) e WHERE n.data -> e.key IS DISTINCT FROM e.value),
            n.data, now()
        FROM (SELECT o.id, to_jsonb(o) AS data FROM old_rows o) o
        JOIN (SELECT n.id, to_jsonb(n) AS data FROM new_rows n) n USING (id)
        WHERE n.data IS DISTINCT FROM o.data;
    END IF;

    RETURN NULL;
END;
$$;

-- Starts or stops logging a table's changes.
CREATE OR REPLACE FUNCTION private.audit_enable (target REGCLASS) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    EXECUTE format('CREATE OR REPLACE TRIGGER audit_insert AFTER INSERT ON %s REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.audit_statement()', target);
    EXECUTE format('CREATE OR REPLACE TRIGGER audit_update AFTER UPDATE ON %s REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.audit_statement()', target);
    EXECUTE format('CREATE OR REPLACE TRIGGER audit_delete AFTER DELETE ON %s REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION private.audit_statement()', target);
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_disable (target REGCLASS) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS audit_insert ON %s', target);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_update ON %s', target);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_delete ON %s', target);
END;
$$;

SELECT
   private.audit_enable (target)
FROM
   unnest(
      ARRAY[
         'public.tenant',
         'public.tenant_user',
         'public.user',
         'public.user_role',
         'public.role',
         'public.role_permission'
      ]::REGCLASS[]
   ) AS target;

-- Undoes a transaction: each change only if the row is still as that transaction left it
-- (otherwise 409 audit_conflict). Runs as the caller, so the writes need the same permissions as
-- making them by hand. Returns the tables it changed.
--
-- Changes are undone newest first. A cascade is logged after the delete that caused it, so a row
-- whose parent is not back yet (foreign key violation) is tried again once the others are done.
CREATE OR REPLACE FUNCTION public.revert_audit_transaction (transaction_id UUID) RETURNS TEXT[] LANGUAGE plpgsql SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.revert_audit_transaction (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.revert_audit_transaction (UUID) TO authenticated;

-- Who made and who reverted a transaction, for embedding: `select=*,actor(*),reverter(*)`.
CREATE OR REPLACE FUNCTION public.actor (public.audit_transaction) RETURNS SETOF public.user ROWS 1 LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT * FROM public.user u WHERE u.id = $1.actor_id
$$;

CREATE OR REPLACE FUNCTION public.reverter (public.audit_transaction) RETURNS SETOF public.user ROWS 1 LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT * FROM public.user u WHERE u.id = $1.reverted_by
$$;

-- Read-only for the API: rows are written by the triggers above.
REVOKE ALL ON public.audit_transaction, public.audit_log FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_transaction, public.audit_log FROM authenticated;

ALTER TABLE public.audit_transaction ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- The trail of the request's tenants only. `= ANY` (not the shared `tenant_id IS NULL OR …` policy)
-- so the (tenant_id, created_at) index serves the lists.
DROP POLICY IF EXISTS restrict_to_current_tenant ON public.audit_transaction;

CREATE POLICY restrict_to_current_tenant ON public.audit_transaction AS RESTRICTIVE FOR
SELECT
   TO authenticated USING (
      tenant_id = ANY (
         (
            SELECT
               private.tenant_scope ()
         )::UUID[]
      )
   );

DROP POLICY IF EXISTS restrict_to_current_tenant ON public.audit_log;

CREATE POLICY restrict_to_current_tenant ON public.audit_log AS RESTRICTIVE FOR
SELECT
   TO authenticated USING (
      tenant_id = ANY (
         (
            SELECT
               private.tenant_scope ()
         )::UUID[]
      )
   );

-- Both tables are read with the audit_log permission, in the tenants where the user has it (its
-- policy on audit_log comes from the permission row below).
DROP POLICY IF EXISTS select_public_audit_transaction ON public.audit_transaction;

CREATE POLICY select_public_audit_transaction ON public.audit_transaction FOR
SELECT
   TO authenticated USING (
      tenant_id = ANY (
         (
            SELECT
               private.permitted_tenants ('public.audit_log', 'select')
         )::UUID[]
      )
   );

-- Updating an existing row recreates its policy (the old audit_log table took it along).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.audit_log', 'audit_log', 'select', 'read', FALSE, FALSE, 'tenant_id IS NOT NULL')
ON CONFLICT (resource_name, command) DO UPDATE
SET
   resource_condition = EXCLUDED.resource_condition;

INSERT INTO
   public.role_permission (role_id, permission_id)
SELECT
   r.id,
   p.id
FROM
   public.role r,
   public.permission p
WHERE
   r.display_name = 'owner'
   AND r.tenant_id IS NULL
   AND p.resource_name = 'public.audit_log'
ON CONFLICT DO NOTHING;

-- The dashboard's latest changes, with the row the change was about.
CREATE OR REPLACE VIEW public.dashboard_notification_feed
WITH
   (security_invoker = TRUE) AS
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
   public.audit_transaction t
   LEFT JOIN public.user u ON u.id = t.actor_id
   LEFT JOIN LATERAL (
      SELECT
         l.old_data,
         l.new_data
      FROM
         public.audit_log l
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

-- Daily: next months' partitions, and the trail older than a year removed.
CREATE EXTENSION IF NOT EXISTS pg_cron
WITH
   SCHEMA pg_catalog;

SELECT
   cron.schedule ('audit-maintenance', '30 3 * * *', 'SELECT private.audit_maintain()');
