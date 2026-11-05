-- Cross-tenant customer transfer (M21), its core: the transfer record, the table registry, the
-- transaction-local flag that lets a transfer pass the business rules, and the revert guard.
--
-- transfer              One transfer of a customer (or of some of its products) from a source
--                       tenant to a target tenant; tenant_id is the target. It keeps the rehearsal's
--                       report, the decisions taken, the map of source to target ids
--                       ({"<table>": {"<source_id>": "<target_id>"}}), the files to copy and their
--                       state, and the audit transactions it wrote. Only public.transfer_customer
--                       writes it (SECURITY DEFINER): users read it, they never insert, change or
--                       delete it. xact_id is the transaction that wrote it.
-- transfer_registry     The tables a transfer carries, in the order it writes them: the root they
--                       hang from, their parent (parent_column 'entity' when they are scoped by
--                       entity_type and entity_id), the key of the three tables without id, the
--                       document entity they are, the columns written after every row is in
--                       (late_columns) or that hold arrays of ids (array_columns), what happens to
--                       their user columns (actor: the caller; clear: NULL; keep: unchanged), how
--                       their code is made and whether they are only ever copied (suppliers).
--
-- Transfer flag  private.transferring() is TRUE when moesa.transfer_id names a transfer row
--                written by the current transaction (xact_id = pg_current_xact_id_if_assigned()).
--                A user cannot insert a transfer row, and a row of another transaction never
--                matches, so only public.transfer_customer can raise it. private.rules_bypassed()
--                honours it: the business-rule guards let the transfer write the rows as they
--                are. The code, default and immutability triggers honour it too, from 041 (see
--                its header for which checks a transfer skips and which stay on).
-- Ownership      private.owns_company(user, tenant): the user owns the company at the root of the
--                tenant's tree (tenant_owner on private.entitlements' company_id), not a branch.
-- Revert guard   public.revert_audit_transaction refuses (409 audit_transfer_not_revertable) a
--                transaction a transfer wrote (in transfer.audit_transaction_ids) or one that
--                wrote a transfer row: a transfer is undone by transferring back. The check is
--                public.audit_transfer_locked, SECURITY DEFINER because the caller does not read
--                every transfer row (the source side of a transfer lives in the target). It sits
--                in the function, not in a trigger: a revert that only UPDATEs inserts nothing a
--                trigger could see.
--
-- Module transfer (core); permissions select and insert on public.transfer, for the owner role
-- and every role that may change the settings (management), not for the coordinator.

CREATE TABLE IF NOT EXISTS public.transfer (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   source_tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID NOT NULL,
   target_customer_id UUID,
   product_ids UUID[],
   mode TEXT NOT NULL CHECK (mode IN ('copy', 'move')),
   path TEXT NOT NULL CHECK (path IN ('cheap', 'copy')),
   started_by UUID NOT NULL,
   report JSONB NOT NULL,
   decisions JSONB NOT NULL DEFAULT '{}',
   id_map JSONB NOT NULL DEFAULT '{}',
   files JSONB NOT NULL DEFAULT '[]',
   files_status TEXT NOT NULL DEFAULT 'done' CHECK (files_status IN ('pending', 'done', 'partial')),
   missing_files TEXT[] NOT NULL DEFAULT '{}',
   audit_transaction_ids UUID[] NOT NULL DEFAULT '{}',
   xact_id XID8 NOT NULL DEFAULT pg_current_xact_id(),
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The transfers whose files are still being copied.
CREATE INDEX IF NOT EXISTS idx_transfer_files_open ON public.transfer (tenant_id, target_customer_id)
WHERE
   files_status <> 'done';

-- Written by public.transfer_customer only (service_role keeps its rights).
REVOKE INSERT, UPDATE, DELETE ON public.transfer FROM anon, authenticated;

GRANT SELECT ON public.transfer TO authenticated;

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.transfer FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

SELECT
   private.enable_tenant_level_security ('transfer');

SELECT
   private.audit_enable ('public.transfer'::REGCLASS);

-- The tables a transfer carries (see the header).
CREATE TABLE IF NOT EXISTS private.transfer_registry (
   table_name TEXT PRIMARY KEY,
   position INT UNIQUE NOT NULL,
   root TEXT NOT NULL CHECK (root IN ('customer', 'product', 'project', 'supplier')),
   parent_table TEXT,
   parent_column TEXT,
   key_columns TEXT[],
   entity public.document_entity,
   late_columns TEXT[] NOT NULL DEFAULT '{}',
   array_columns JSONB NOT NULL DEFAULT '{}',
   user_columns JSONB NOT NULL DEFAULT '{}',
   code_kind TEXT CHECK (code_kind IN ('typed', 'project', 'prefixed')),
   copy_only BOOLEAN NOT NULL DEFAULT FALSE
);

REVOKE ALL ON private.transfer_registry FROM PUBLIC, anon, authenticated;

INSERT INTO
   private.transfer_registry (
      table_name,
      position,
      root,
      parent_table,
      parent_column,
      key_columns,
      entity,
      late_columns,
      array_columns,
      user_columns,
      code_kind,
      copy_only
   )
VALUES
   ('customer', 10, 'customer', NULL, NULL, NULL, 'customer', '{contract_document_id}', '{}', '{}', 'typed', FALSE),
   ('customer_contact', 20, 'customer', 'customer', 'customer_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   ('customer_warehouse', 30, 'customer', 'customer', 'customer_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   ('customer_platform_account', 40, 'customer', 'customer', 'customer_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   ('customer_brand', 50, 'customer', 'customer', 'customer_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   ('supplier', 60, 'supplier', NULL, NULL, NULL, 'supplier', '{}', '{}', '{}', 'typed', TRUE),
   ('supplier_contact', 70, 'supplier', 'supplier', 'supplier_id', NULL, NULL, '{}', '{}', '{}', NULL, TRUE),
   ('product', 80, 'product', 'customer', 'customer_id', NULL, 'product', '{}', '{}', '{}', NULL, FALSE),
   (
      'project',
      90,
      'project',
      'customer',
      'customer_id',
      NULL,
      'project',
      '{}',
      '{}',
      '{"coordinator_id": "clear"}',
      'project',
      FALSE
   ),
   (
      'project_product',
      100,
      'project',
      'project',
      'project_id',
      '{project_id,product_id}',
      NULL,
      '{}',
      '{}',
      '{}',
      NULL,
      FALSE
   ),
   (
      'project_gate',
      110,
      'project',
      'project',
      'project_id',
      NULL,
      'project_gate',
      '{approval_document_id,rolled_back_incident_id}',
      '{"evidence_document_ids": "document"}',
      '{}',
      NULL,
      FALSE
   ),
   (
      'project_task',
      120,
      'project',
      'project',
      'project_id',
      NULL,
      NULL,
      '{}',
      '{}',
      '{"assignee_id": "clear"}',
      NULL,
      FALSE
   ),
   (
      'purchase_order',
      130,
      'customer',
      'customer',
      'customer_id',
      NULL,
      'purchase_order',
      '{pi_document_id,packing_instruction_document_id}',
      '{}',
      '{"pi_checked_by": "keep"}',
      'prefixed',
      FALSE
   ),
   (
      'purchase_order_line',
      140,
      'customer',
      'purchase_order',
      'purchase_order_id',
      NULL,
      NULL,
      '{spec_document_id}',
      '{}',
      '{}',
      NULL,
      FALSE
   ),
   (
      'purchase_order_payment',
      150,
      'customer',
      'purchase_order',
      'purchase_order_id',
      NULL,
      NULL,
      '{}',
      '{}',
      '{}',
      NULL,
      FALSE
   ),
   (
      'purchase_order_update',
      160,
      'customer',
      'purchase_order',
      'purchase_order_id',
      NULL,
      NULL,
      '{}',
      '{}',
      '{"created_by": "actor"}',
      NULL,
      FALSE
   ),
   ('shipment', 170, 'customer', 'customer', 'customer_id', NULL, 'shipment', '{}', '{}', '{}', 'prefixed', FALSE),
   (
      'shipment_purchase_order',
      180,
      'customer',
      'shipment',
      'shipment_id',
      '{shipment_id,purchase_order_id}',
      NULL,
      '{}',
      '{}',
      '{}',
      NULL,
      FALSE
   ),
   ('shipment_line', 190, 'customer', 'shipment', 'shipment_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   (
      'shipment_event',
      200,
      'customer',
      'shipment',
      'shipment_id',
      NULL,
      NULL,
      '{}',
      '{}',
      '{"created_by": "actor"}',
      NULL,
      FALSE
   ),
   ('market_cell', 210, 'product', 'product', 'product_id', NULL, 'market_cell', '{}', '{}', '{}', NULL, FALSE),
   (
      'incident',
      220,
      'customer',
      'customer',
      'customer_id',
      NULL,
      'incident',
      '{}',
      '{}',
      '{"owner_id": "clear", "closed_by": "keep"}',
      'prefixed',
      FALSE
   ),
   (
      'incident_log',
      230,
      'customer',
      'incident',
      'incident_id',
      NULL,
      NULL,
      '{}',
      '{}',
      '{"author_id": "actor"}',
      NULL,
      FALSE
   ),
   ('incident_deadline', 240, 'customer', 'incident', 'incident_id', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   (
      'change_request',
      250,
      'customer',
      'customer',
      'customer_id',
      NULL,
      'change_request',
      '{affected_document_id,customer_approval_document_id,result_document_id}',
      '{}',
      '{"company_approved_by": "keep"}',
      'prefixed',
      FALSE
   ),
   (
      'change_request_product',
      260,
      'customer',
      'change_request',
      'change_request_id',
      '{change_request_id,product_id}',
      NULL,
      '{}',
      '{}',
      '{}',
      NULL,
      FALSE
   ),
   ('media', 270, 'customer', 'customer', 'customer_id', NULL, NULL, '{}', '{}', '{"uploaded_by": "actor"}', NULL, FALSE),
   ('media_link', 280, 'customer', NULL, 'entity', NULL, NULL, '{}', '{}', '{}', NULL, FALSE),
   ('document', 290, 'customer', NULL, 'entity', NULL, NULL, '{}', '{}', '{"created_by": "actor"}', NULL, FALSE)
ON CONFLICT (table_name) DO NOTHING;

-- Whether the user owns the company at the root of the tenant's tree (see the header). A super
-- admin is not an owner here; the callers check that apart.
CREATE OR REPLACE FUNCTION private.owns_company (user_id UUID, tenant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1
        FROM private.entitlements(ARRAY[owns_company.tenant_id]) e
        JOIN public.tenant_owner o ON o.tenant_id = e.company_id
        WHERE o.user_id = owns_company.user_id
    );
$$;

REVOKE ALL ON FUNCTION private.owns_company (UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The transfer flag (see the header).
CREATE OR REPLACE FUNCTION private.transferring () RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    setting TEXT := nullif(current_setting('moesa.transfer_id', TRUE), '');
    v UUID;
BEGIN
    IF setting IS NULL THEN
        RETURN FALSE;
    END IF;

    BEGIN
        v := setting::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN FALSE;
    END;

    RETURN EXISTS (
        SELECT 1 FROM public.transfer t
        WHERE t.id = v AND t.xact_id = pg_current_xact_id_if_assigned()
    );
END;
$$;

REVOKE ALL ON FUNCTION private.transferring () FROM PUBLIC, anon, authenticated;

-- The 030 test fixture bypass, or a running transfer.
CREATE OR REPLACE FUNCTION private.rules_bypassed () RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT coalesce(
        current_setting('moesa.rules_bypass', TRUE) = '1'
        AND current_setting('role') = 'none'
        AND session_user IN ('postgres', 'supabase_admin'),
        FALSE
    ) OR private.transferring();
$$;

REVOKE ALL ON FUNCTION private.rules_bypassed () FROM PUBLIC, anon, authenticated;

-- Whether a transfer wrote this audit transaction, or the transaction wrote a transfer row.
-- SECURITY DEFINER: every transfer row, whatever the caller may read. In public, not private:
-- revert_audit_transaction runs as the caller, and calling a function by name from its body needs
-- USAGE on the function's schema, which authenticated has on public and not on private.
CREATE OR REPLACE FUNCTION public.audit_transfer_locked (transaction_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT EXISTS (
            SELECT 1 FROM public.transfer t WHERE audit_transfer_locked.transaction_id = ANY (t.audit_transaction_ids)
        )
        OR EXISTS (
            SELECT 1
            FROM public.audit_transaction a
            JOIN public.audit_log l ON l.transaction_id = a.id AND l.created_at = a.created_at
            WHERE a.id = audit_transfer_locked.transaction_id
              AND l.table_schema = 'public'
              AND l.table_name = 'transfer'
        );
$$;

REVOKE ALL ON FUNCTION public.audit_transfer_locked (UUID) FROM PUBLIC, anon;

-- revert_audit_transaction calls it as the reverting user.
GRANT EXECUTE ON FUNCTION public.audit_transfer_locked (UUID) TO authenticated;

-- 010's revert, with the transfer check before anything is written.
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

    -- A transfer is undone by transferring back, never from the log.
    IF public.audit_transfer_locked(target.id) THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'audit_transfer_not_revertable')::TEXT,
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

INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('transfer', TRUE, 220)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies). The
-- record is written by public.transfer_customer only: insert is the right to start a transfer.
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.transfer', 'transfer', 'select', 'read', FALSE, FALSE, NULL),
   ('public.transfer', 'transfer', 'insert', 'create', FALSE, TRUE, NULL)
ON CONFLICT ON CONSTRAINT unique_permission_resource_command DO NOTHING;

-- The built-in owner role (see 008_init_reference_data.sql) and every role that may change the
-- settings (management).
INSERT INTO
   public.role_permission (role_id, permission_id)
SELECT
   r.id,
   p.id
FROM
   public.role r,
   public.permission p
WHERE
   p.resource_name = 'public.transfer'
   AND (
      r.display_name = 'owner'
      AND r.tenant_id IS NULL
      OR EXISTS (
         SELECT
            1
         FROM
            public.role_permission rp
            JOIN public.permission held ON held.id = rp.permission_id
         WHERE
            rp.role_id = r.id
            AND held.resource_name = 'public.setting'
            AND held.command = 'update'
      )
   )
ON CONFLICT DO NOTHING;
