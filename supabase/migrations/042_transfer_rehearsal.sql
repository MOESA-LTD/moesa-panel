-- Cross-tenant customer transfer (M21), its rehearsal: who may transfer, what a transfer carries,
-- and the entry point that reports it.
--
-- private.transfer_refusal   The first reason the caller may not transfer from the source to the
--                            target in this mode, or NULL. In order: the mode (copy | move); the same
--                            tenant; between two companies (two roots) only an owner of both, or a
--                            super admin; a read-only target; a target whose plan lacks a business
--                            module; the permissions (public.transfer insert in both tenants, select
--                            on every registry table in the source, insert on every registry table
--                            in the target that has an insert permission); a move out of a
--                            read-only source (a read-only source may still be copied from);
--                            given a customer, an earlier transfer into it whose files are not
--                            all copied yet (files_status pending or partial): its media rows
--                            name files that may not be there, so it is not transferred again
--                            until that transfer is done (transfer_files_pending).
-- private.transfer_collect   Fills pg_temp.transfer_rows and transfer_edges (dropped at commit) with the package: the
--                            rows of the source a transfer carries, walked in registry order.
--                            source_id is the row's id; the three tables without one keep their
--                            key_columns in key instead. copy_only rows are copied, never moved.
--                            - A row belongs when its parent_table row does; a document or media
--                              link when its (entity_type, entity_id) names a package row.
--                              incident.entity_* is only a link.
--                            - The suppliers of the package products and orders, their contacts and
--                              documents: copy_only.
--                            - The customer's media, and the media without a customer that a package
--                              row links or references (document.media_id): the latter copy_only.
--                            - Product-only (product_ids): the customer row copy_only, without its
--                              contacts, warehouses, accounts, brands, orders, projects, ... or
--                              documents, but with its contract document (contract_document_id) and
--                              that document's file, both copy_only; the selected products, their variants and the parent of a
--                              selected variant, with what hangs from them (market cells, documents,
--                              media links); the media they use, copy_only (another product left
--                              behind may use it too). A row of another table that refers to a
--                              package product stays behind as a link (left_behind below).
-- private.transfer_references  The columns of the registry tables that hold the id of a row of a
--                            registry table, found through the foreign keys between them: a column
--                            matched to a referenced id, or to a referenced column that is itself
--                            such a column (purchase_order_line.customer_id through the order,
--                            shipment_line.purchase_order_id through the shipment's order link).
--                            not_null is the column's NOT NULL. Tenant columns are not references.
-- private.transfer_omission_closure  The package rows (pg_temp.transfer_rows seq) that go with the
--                            seed rows, seeds included: a row whose NOT NULL reference (the parent
--                            columns are) names one of them, a document or media link whose entity
--                            is one of them, and so on. The rows a skip drops. It walks
--                            pg_temp.transfer_edges, which transfer_collect fills once from those
--                            references; transfer_omission_closures walks every seed on its own in
--                            the same single pass (the report's skip_drops: one walk, not one per
--                            conflict, so a copy of a large catalogue stays inside the timeout).
-- private.transfer_omitted   The closure of what the decisions leave out: the skipped rows, and the
--                            contacts, documents and media links of a mapped supplier (only the
--                            supplier's id is mapped). The run omits these rows (043).
-- private.transfer_unused_media  The media rows not copied: a file that package links or
--                            documents use, none of which is written (each omitted or mapped). A
--                            shared (copy_only) file always; the customer's own files in a copy
--                            only, since a move takes them along. The report's files and the run
--                            agree on it.
-- private.transfer_check_gates  For every package project: the gate codes, by position 1..n, are
--                            public.gates_for(type, path, packages), and no gate is passed while
--                            an earlier one is not. Otherwise transfer_gate_invalid (409), on the
--                            rehearsal and on the run: under the transfer flag the guard is off.
-- private.transfer_report    The rehearsal's report, {customer, path, mode, counts, conflicts,
--                            users, left_behind, settings_gaps, files, unresolved, report_hash}:
--                            - counts, {table: n}: the rows the run writes, after the decisions:
--                              no skipped row nor what the skip drops, no mapped row (nor the
--                              contacts, documents and links of a mapped supplier), no file left
--                              uncopied (transfer_unused_media). The confirm and the result show it.
--                            - conflicts, keyed <table>:<source_id>, ordered by registry position
--                              and label; a decided conflict stays listed. customer_code and
--                              supplier_code (map, new_code); code, a project or prefixed code taken
--                              in the target (new_code, and skip in a copy); sku, under the mapped
--                              customer (map, and skip in a copy); gtin, an active GTIN in a copy
--                              (clear_gtin, skip), not for a product with a sku conflict (it is
--                              mapped or skipped, so never written: one decision per key);
--                              customer_contact, customer_warehouse, customer_brand, a child the
--                              mapped customer already has on a natural key (lower e-mail, or lower
--                              name without one; lower name and type; lower name) (map only: a
--                              skipped child would drop the rows under it); platform_account, a
--                              platform the mapped customer already has an account on (map, skip
--                              in a copy); market_cell, a platform and
--                              country the mapped product already has a cell for (map, skip in a
--                              copy); document_version, under a mapped customer, product or market
--                              cell (map, skip in a copy); media_link, a primary image of a mapped
--                              customer, product or market cell that already has one (map, demote:
--                              copied as a gallery image, and skip in a copy). A map names the
--                              target row found (existing_id). A move never offers skip. A
--                              conflict that offers skip says what the skip drops with the row:
--                              skip_drops, {table: count}, from transfer_omission_closure seeded
--                              with that row alone.
--                            - users: the users of a registry user column who are neither in the
--                              target's tenant_user nor owners of its company (Call 7).
--                            - left_behind, {table, source_id, column, label, refers_to}, through
--                              every FK between registry tables (its first column; a table without
--                              id is matched on its key columns) and every array of ids: a row that stays (outside the package; in a move also a
--                              copy_only row) referring to a package row that is not copy_only;
--                              and a package row referring to a row outside the package (a
--                              nullable reference, cleared on the copy: market_cell.project_id, a
--                              document FK column naming a document outside the package, ...).
--                              source_id is NULL for the three tables without id.
--                            - settings_gaps: the source products the target company's
--                              spec_sheet_required_from would hold back, without a signed spec
--                              sheet in the package (Call 10).
--                            - files: the media rows and their thumbnails, copy_only ones included:
--                              the files to copy, not the files to move; without the files no
--                              written row uses (transfer_unused_media).
--                            - taken_code, on a customer or supplier code conflict whose typed
--                              new code another package row of the table keeps (neither mapped
--                              nor recoded): the run refuses it, so the conflict is unresolved.
--                            - unresolved: the conflicts without a valid decision, taken_code
--                              included.
--                            - path: cheap for a whole-customer move within one company out of a
--                              writable source with no conflict but suppliers; else copy.
--                            - report_hash: sha256 of {report (without the hash), target_tenant,
--                              product_ids (sorted)}, every array ordered. It covers what the
--                              report shows (counts, labels, conflicts, ...), not every column: a
--                              renamed product does not make a report stale.
-- private.transfer_decision_error  Why a decision does not settle its conflict, or NULL: the
--                            action is one the conflict offers; a map names a target customer or
--                            supplier, or the one SKU or document version found; a typed new code
--                            (customer ^[A-Z]{3}$, supplier ^[A-Z]{2}[0-9]{1,3}$) is free in the
--                            target (transfer_code_invalid).
-- private.transfer_check_decisions  Every decision first (400 transfer_decision_invalid or
--                            transfer_code_invalid; a key without a conflict is valid only as a
--                            map of a package supplier), then a typed code repeated across the
--                            decisions of a table or equal to the code of another package row of
--                            that table that keeps it (transfer_code_invalid), then 409
--                            transfer_decision_required
--                            while a conflict is unresolved.
-- public.transfer_customer   The entry point (SECURITY DEFINER: a transfer reads and writes past
--                            the caller's RLS once the checks above have passed). It refuses
--                            (transfer_files_pending 409, the other refusals 400/403), locks the
--                            customer, checks the products, collects, refuses a package file an
--                            earlier transfer into the source has not copied yet (pending, or
--                            missing in a partial one: transfer_files_pending), checks the gates
--                            and builds the report; a dry run returns it. A real run first locks
--                            every collected row with an id FOR UPDATE (private.transfer_lock_rows,
--                            held until commit), collects again and locks what that adds: an edit
--                            or a child row a concurrent writer committed before the lock is in
--                            the report and the write, and none can follow until commit. A real run refuses
--                            without a hash (transfer_report_required), with another hash
--                            (transfer_report_stale), a move leaving links behind
--                            (transfer_product_in_use) and the decisions above. Then it raises the
--                            transfer flag (moesa.transfer_id), starts a new audit transaction and
--                            writes the transfer row as its first write (so the target's audit
--                            transaction is about transfer: the "came by transfer" entry), records that audit transaction in
--                            audit_transaction_ids, calls private.transfer_apply (043), clears the
--                            flag and returns the transfer row.

-- The first refusal, or NULL (see the header).
CREATE OR REPLACE FUNCTION private.transfer_refusal (
   source_tenant UUID,
   target_tenant UUID,
   mode TEXT,
   customer_id UUID DEFAULT NULL
) RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    e RECORD;
    source_e RECORD;
    target_e RECORD;
BEGIN
    IF mode IS NULL OR mode NOT IN ('copy', 'move') THEN
        RETURN 'transfer_invalid_mode';
    END IF;

    IF source_tenant IS NOT DISTINCT FROM target_tenant THEN
        RETURN 'transfer_same_tenant';
    END IF;

    -- One read of both; an unknown tenant keeps NULLs.
    SELECT NULL::UUID AS tenant_id, NULL::UUID AS company_id, NULL::TEXT[] AS modules, NULL::BOOLEAN AS writable
    INTO source_e;
    target_e := source_e;

    FOR e IN SELECT x.tenant_id, x.company_id, x.modules, x.writable
             FROM private.entitlements(ARRAY[source_tenant, target_tenant]) x LOOP
        IF e.tenant_id = source_tenant THEN
            source_e := e;
        ELSE
            target_e := e;
        END IF;
    END LOOP;

    -- Two companies: an owner of both (an unknown tenant has no company and lands here too).
    IF source_e.company_id IS DISTINCT FROM target_e.company_id
       AND NOT private.check_super_admin()
       AND NOT (private.owns_company(caller, source_tenant) AND private.owns_company(caller, target_tenant)) THEN
        RETURN 'transfer_owner_required';
    END IF;

    IF NOT coalesce(target_e.writable, FALSE) THEN
        RETURN 'transfer_target_read_only';
    END IF;

    IF NOT (ARRAY['ops_setting', 'document', 'supplier', 'customer', 'product', 'project', 'media', 'purchase_order',
                  'shipment', 'market_matrix', 'incident', 'change_request'] <@ coalesce(target_e.modules, '{}')) THEN
        RETURN 'transfer_target_plan';
    END IF;

    IF NOT (ARRAY[source_tenant, target_tenant]
            <@ private.tenants_granting(caller, ARRAY[source_tenant, target_tenant], 'public.transfer', 'insert'))
       OR EXISTS (
           SELECT 1 FROM private.transfer_registry r
           WHERE NOT (source_tenant = ANY (private.tenants_granting(caller, ARRAY[source_tenant], 'public.' || r.table_name, 'select')))
       )
       OR EXISTS (
           SELECT 1 FROM private.transfer_registry r
           JOIN public.permission p ON p.resource_name = 'public.' || r.table_name AND p.command = 'insert'
           WHERE NOT (target_tenant = ANY (private.tenants_granting(caller, ARRAY[target_tenant], 'public.' || r.table_name, 'insert')))
       ) THEN
        RETURN 'transfer_forbidden';
    END IF;

    IF mode = 'move' AND NOT coalesce(source_e.writable, FALSE) THEN
        RETURN 'transfer_source_read_only';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.transfer t
        WHERE t.tenant_id = source_tenant AND t.target_customer_id = transfer_refusal.customer_id
          AND t.files_status <> 'done'
    ) THEN
        RETURN 'transfer_files_pending';
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_refusal (UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- The package into pg_temp.transfer_rows (see the header).
CREATE OR REPLACE FUNCTION private.transfer_collect (source_tenant UUID, customer_id UUID, product_ids UUID[]) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    only_products BOOLEAN := product_ids IS NOT NULL;
    products UUID[];
    suppliers UUID[];
    contract_document UUID;
    reg RECORD;
    source_expr TEXT;
    key_expr TEXT;
    from_sql TEXT;
    copy_expr TEXT;
    where_sql TEXT;
    -- A polymorphic row %1$s (entity_type, entity_id) naming a package row; the customer row of a
    -- product-only transfer names nothing (its documents and links stay behind).
    entity_match CONSTANT TEXT :=
        'SELECT p.copy_only FROM private.transfer_registry e '
        'JOIN pg_temp.transfer_rows p ON p.table_name = e.table_name AND p.source_id = %1$s.entity_id '
        'WHERE e.entity = %1$s.entity_type AND NOT (p.copy_only AND e.root = ''customer'') LIMIT 1';
BEGIN
    IF to_regclass('pg_temp.transfer_edges') IS NOT NULL THEN
        DROP TABLE pg_temp.transfer_edges;
    END IF;

    IF to_regclass('pg_temp.transfer_rows') IS NOT NULL THEN
        DROP TABLE pg_temp.transfer_rows;
    END IF;

    CREATE TEMP TABLE transfer_rows (
        seq BIGSERIAL PRIMARY KEY,
        table_name TEXT NOT NULL,
        source_id UUID,
        key JSONB,
        row JSONB NOT NULL,
        copy_only BOOLEAN NOT NULL,
        UNIQUE (table_name, source_id)
    ) ON COMMIT DROP;

    -- The products: all of the customer's, or the selected ones, their variants and the parent of
    -- each selected variant.
    IF only_products THEN
        products := ARRAY(
            SELECT p.id FROM public.product p
            WHERE p.tenant_id = source_tenant AND p.customer_id = transfer_collect.customer_id
              AND (
                  p.id = ANY (product_ids)
                  OR p.parent_id = ANY (product_ids)
                  OR p.id IN (SELECT s.parent_id FROM public.product s WHERE s.id = ANY (product_ids))
              )
        );
    ELSE
        products := ARRAY(
            SELECT p.id FROM public.product p
            WHERE p.tenant_id = source_tenant AND p.customer_id = transfer_collect.customer_id
        );
    END IF;

    -- The suppliers of those products and of the customer's orders.
    suppliers := ARRAY(
        SELECT p.supplier_id FROM public.product p
        WHERE p.tenant_id = source_tenant AND p.id = ANY (products) AND p.supplier_id IS NOT NULL
        UNION
        SELECT o.supplier_id FROM public.purchase_order o
        WHERE NOT only_products AND o.tenant_id = source_tenant AND o.customer_id = transfer_collect.customer_id
          AND o.supplier_id IS NOT NULL
    );

    -- A product-only transfer copies the customer row with its contract_document_id, so it carries
    -- that document (and its file) too, copy_only: no link is dropped.
    IF only_products THEN
        SELECT c.contract_document_id INTO contract_document
        FROM public.customer c WHERE c.id = transfer_collect.customer_id AND c.tenant_id = source_tenant;
    END IF;

    FOR reg IN SELECT * FROM private.transfer_registry r ORDER BY r.position LOOP
        IF reg.key_columns IS NULL THEN
            source_expr := 'x.id';
            key_expr := 'NULL::JSONB';
        ELSE
            source_expr := 'NULL::UUID';
            key_expr := format('(SELECT jsonb_object_agg(k, to_jsonb(x) -> k) FROM unnest(%L::TEXT[]) AS k)', reg.key_columns);
        END IF;
        from_sql := format('public.%I x', reg.table_name);
        where_sql := 'TRUE';

        IF reg.table_name = 'customer' THEN
            where_sql := 'x.id = $2';
            copy_expr := '$5';
        ELSIF reg.table_name = 'supplier' THEN
            where_sql := 'x.id = ANY ($4)';
            copy_expr := 'TRUE';
        ELSIF reg.table_name = 'product' THEN
            where_sql := 'x.id = ANY ($3)';
            copy_expr := 'FALSE';
        ELSIF reg.table_name = 'media' THEN
            -- The links and documents are collected later in the walk; they are matched here the
            -- same way, against the entity rows already in.
            where_sql := format(
                '(NOT $5 AND x.customer_id = $2) '
                'OR EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = $1 AND l.media_id = x.id AND EXISTS (%s)) '
                'OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = $1 AND d.media_id = x.id '
                'AND (d.id = $6 OR EXISTS (%s)))',
                format(entity_match, 'l'),
                format(entity_match, 'd')
            );
            copy_expr := '(x.customer_id IS NULL OR $5)';
        ELSIF reg.parent_column = 'entity' THEN
            from_sql := from_sql || format(' LEFT JOIN LATERAL (%s) p ON TRUE', format(entity_match, 'x'));
            IF reg.table_name = 'document' THEN
                where_sql := 'p.copy_only IS NOT NULL OR x.id = $6';
            ELSE
                where_sql := 'p.copy_only IS NOT NULL';
            END IF;
            copy_expr := 'coalesce(p.copy_only, TRUE)';
        ELSIF reg.parent_table IS NULL OR (only_products AND reg.parent_table = 'customer') THEN
            CONTINUE;
        ELSE
            from_sql := from_sql || format(
                ' JOIN pg_temp.transfer_rows p ON p.table_name = %L AND p.source_id = x.%I',
                reg.parent_table,
                reg.parent_column
            );
            copy_expr := 'p.copy_only';
        END IF;

        EXECUTE format(
            'INSERT INTO pg_temp.transfer_rows (table_name, source_id, key, row, copy_only) '
            'SELECT %L, %s, %s, to_jsonb(x), %s FROM %s WHERE x.tenant_id = $1 AND (%s)',
            reg.table_name, source_expr, key_expr, copy_expr, from_sql, where_sql
        )
        USING source_tenant, transfer_collect.customer_id, products, suppliers, only_products, contract_document;
    END LOOP;

    -- The edges of transfer_omission_closure, found once: a row (child) whose NOT NULL reference
    -- names a package row (parent), and a document or media link whose entity is one.
    CREATE TEMP TABLE transfer_edges (
        parent BIGINT NOT NULL,
        child BIGINT NOT NULL,
        PRIMARY KEY (parent, child)
    ) ON COMMIT DROP;

    INSERT INTO pg_temp.transfer_edges (parent, child)
    SELECT o.seq, r.seq
    FROM private.transfer_references() f
    JOIN pg_temp.transfer_rows r ON r.table_name = f.table_name
    JOIN pg_temp.transfer_rows o ON o.table_name = f.ref_table AND o.source_id IS NOT NULL
     AND o.source_id::TEXT = r.row ->> f.column_name
    WHERE f.not_null
    UNION
    SELECT o.seq, r.seq
    FROM pg_temp.transfer_rows r
    JOIN private.transfer_registry e ON e.entity IS NOT NULL AND e.entity::TEXT = r.row ->> 'entity_type'
    JOIN pg_temp.transfer_rows o ON o.table_name = e.table_name AND o.source_id IS NOT NULL
     AND o.source_id::TEXT = r.row ->> 'entity_id'
    WHERE r.table_name IN ('document', 'media_link');

    ANALYZE pg_temp.transfer_rows;
    ANALYZE pg_temp.transfer_edges;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_collect (UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;

-- The references between registry tables (see the header).
CREATE OR REPLACE FUNCTION private.transfer_references () RETURNS TABLE (
   table_name TEXT,
   column_name TEXT,
   ref_table TEXT,
   not_null BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    WITH RECURSIVE pairs AS (
        SELECT rel.relname::TEXT AS t, a.attname::TEXT AS col, frel.relname::TEXT AS ft, fa.attname::TEXT AS fcol,
               a.attnotnull AS nn
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
        JOIN pg_catalog.pg_class frel ON frel.oid = c.confrelid
        JOIN pg_catalog.pg_namespace fn ON fn.oid = frel.relnamespace AND fn.nspname = 'public'
        JOIN private.transfer_registry fr ON fr.table_name = rel.relname
        JOIN private.transfer_registry tr ON tr.table_name = frel.relname
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k (attnum, fattnum)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        JOIN pg_catalog.pg_attribute fa ON fa.attrelid = c.confrelid AND fa.attnum = k.fattnum
        WHERE c.contype = 'f' AND fa.attname <> 'tenant_id'
    ),
    resolved (t, col, rt, nn) AS (
        SELECT p.t, p.col, p.ft, p.nn FROM pairs p WHERE p.fcol = 'id'
        UNION
        SELECT p.t, p.col, r.rt, p.nn FROM pairs p JOIN resolved r ON r.t = p.ft AND r.col = p.fcol WHERE p.fcol <> 'id'
    )
    SELECT DISTINCT r.t, r.col, r.rt, r.nn FROM resolved r;
$$;

REVOKE ALL ON FUNCTION private.transfer_references () FROM PUBLIC, anon, authenticated;

-- The rows that go with the seed rows of pg_temp.transfer_rows (see the header), seeds included:
-- a walk down pg_temp.transfer_edges.
CREATE OR REPLACE FUNCTION private.transfer_omission_closure (seeds BIGINT[]) RETURNS TABLE (seq BIGINT) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE omitted (seq) AS (
        SELECT r.seq FROM pg_temp.transfer_rows r WHERE r.seq = ANY (transfer_omission_closure.seeds)
        UNION
        SELECT e.child FROM omitted o JOIN pg_temp.transfer_edges e ON e.parent = o.seq
    )
    SELECT o.seq FROM omitted o;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_omission_closure (BIGINT[]) FROM PUBLIC, anon, authenticated;

-- The closure of each seed on its own, in one walk: (seed, seq) for every row that goes with the
-- seed, the seed included.
CREATE OR REPLACE FUNCTION private.transfer_omission_closures (seeds BIGINT[]) RETURNS TABLE (seed BIGINT, seq BIGINT) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE omitted (seed, seq) AS (
        SELECT r.seq, r.seq FROM pg_temp.transfer_rows r WHERE r.seq = ANY (transfer_omission_closures.seeds)
        UNION
        SELECT o.seed, e.child FROM omitted o JOIN pg_temp.transfer_edges e ON e.parent = o.seq
    )
    SELECT o.seed, o.seq FROM omitted o;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_omission_closures (BIGINT[]) FROM PUBLIC, anon, authenticated;

-- The rows the decisions leave out (see the header).
CREATE OR REPLACE FUNCTION private.transfer_omitted (decisions JSONB) RETURNS TABLE (seq BIGINT) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    picks JSONB := CASE WHEN jsonb_typeof(decisions) = 'object' THEN decisions ELSE '{}'::JSONB END;
BEGIN
    RETURN QUERY
    SELECT c.seq FROM private.transfer_omission_closure(ARRAY(
        -- The skipped rows.
        SELECT r.seq FROM pg_temp.transfer_rows r
        WHERE r.source_id IS NOT NULL AND picks -> (r.table_name || ':' || r.source_id) ->> 'action' = 'skip'
        UNION
        -- The contacts, documents and media links of a mapped supplier.
        SELECT r.seq
        FROM pg_temp.transfer_rows r
        JOIN pg_temp.transfer_rows s ON s.table_name = 'supplier'
         AND picks -> ('supplier:' || s.source_id) ->> 'action' = 'map'
        WHERE (r.table_name = 'supplier_contact' AND r.row ->> 'supplier_id' = s.source_id::TEXT)
           OR (r.table_name IN ('document', 'media_link') AND r.row ->> 'entity_type' = 'supplier'
               AND r.row ->> 'entity_id' = s.source_id::TEXT)
    )) c;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_omitted (JSONB) FROM PUBLIC, anon, authenticated;

-- The media rows not copied (see the header).
CREATE OR REPLACE FUNCTION private.transfer_unused_media (decisions JSONB, mode TEXT) RETURNS TABLE (source_id UUID) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    picks JSONB := CASE WHEN jsonb_typeof(decisions) = 'object' THEN decisions ELSE '{}'::JSONB END;
    omitted BIGINT[] := ARRAY(SELECT o.seq FROM private.transfer_omitted(picks) o);
BEGIN
    RETURN QUERY
    SELECT f.source_id
    FROM pg_temp.transfer_rows f
    WHERE f.table_name = 'media'
      AND (f.copy_only OR transfer_unused_media.mode = 'copy')
      AND EXISTS (
          SELECT 1 FROM pg_temp.transfer_rows u
          WHERE u.table_name IN ('media_link', 'document') AND u.row ->> 'media_id' = f.source_id::TEXT
      )
      AND NOT EXISTS (
          SELECT 1 FROM pg_temp.transfer_rows u
          WHERE u.table_name IN ('media_link', 'document') AND u.row ->> 'media_id' = f.source_id::TEXT
            AND NOT u.seq = ANY (omitted)
            AND coalesce(picks -> (u.table_name || ':' || u.source_id) ->> 'action', '') <> 'map'
      );
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_unused_media (JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- A refusal in the next_code pattern.
CREATE OR REPLACE FUNCTION private.transfer_raise (code TEXT, status INT) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    RAISE SQLSTATE 'PGRST' USING
        MESSAGE = json_build_object('code', 'P0001', 'message', code)::TEXT,
        DETAIL = json_build_object('status', status, 'headers', json_build_object())::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_raise (TEXT, INT) FROM PUBLIC, anon, authenticated;

-- A UUID from text, or NULL when the text is not one (decisions are user input).
CREATE OR REPLACE FUNCTION private.transfer_uuid (value TEXT) RETURNS UUID LANGUAGE plpgsql IMMUTABLE
SET
   search_path = '' AS $$
BEGIN
    RETURN value::UUID;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_uuid (TEXT) FROM PUBLIC, anon, authenticated;

-- The gates of every package project (see the header).
CREATE OR REPLACE FUNCTION private.transfer_check_gates () RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    project RECORD;
    codes TEXT[];
    positions INT[];
    statuses TEXT[];
    expected TEXT[];
    first_open INT;
BEGIN
    FOR project IN SELECT r.source_id, r.row FROM pg_temp.transfer_rows r WHERE r.table_name = 'project' LOOP
        SELECT
            coalesce(array_agg(g.row ->> 'code' ORDER BY (g.row ->> 'position')::INT), '{}'),
            coalesce(array_agg((g.row ->> 'position')::INT ORDER BY (g.row ->> 'position')::INT), '{}'),
            coalesce(array_agg(g.row ->> 'status' ORDER BY (g.row ->> 'position')::INT), '{}')
        INTO codes, positions, statuses
        FROM pg_temp.transfer_rows g
        WHERE g.table_name = 'project_gate' AND g.row ->> 'project_id' = project.source_id::TEXT;

        expected := ARRAY(
            SELECT x.code::TEXT
            FROM unnest(public.gates_for(
                (project.row ->> 'type')::public.project_type,
                (project.row ->> 'path')::public.project_path,
                ARRAY(SELECT jsonb_array_elements_text(project.row -> 'packages'))
            )) WITH ORDINALITY AS x (code, n)
            ORDER BY x.n
        );

        -- The first gate that is not passed: no later gate may be passed.
        first_open := array_position(ARRAY(SELECT s = 'passed' FROM unnest(statuses) AS s), FALSE);

        IF codes IS DISTINCT FROM expected
           OR positions IS DISTINCT FROM ARRAY(SELECT generate_series(1, cardinality(positions)))
           OR (first_open IS NOT NULL AND 'passed' = ANY (statuses[first_open + 1:])) THEN
            PERFORM private.transfer_raise('transfer_gate_invalid', 409);
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_check_gates () FROM PUBLIC, anon, authenticated;

-- A short label of a row for the report: its code, SKU, file name, ...
CREATE OR REPLACE FUNCTION private.transfer_label (tbl TEXT, data JSONB) RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    label TEXT;
BEGIN
    label := CASE tbl
        WHEN 'product' THEN data ->> 'sku'
        WHEN 'document' THEN (data ->> 'type') || ' v' || (data ->> 'version')
        WHEN 'media' THEN data ->> 'file_name'
        WHEN 'market_cell' THEN (data ->> 'platform_id') || ' ' || (data ->> 'country')
        WHEN 'customer_platform_account' THEN data ->> 'platform_id'
        WHEN 'project_product' THEN (
            SELECT coalesce(p.code, p.display_name) FROM public.project p WHERE p.id = (data ->> 'project_id')::UUID
        )
        WHEN 'project_gate' THEN (
            SELECT coalesce(p.code, p.display_name) FROM public.project p WHERE p.id = (data ->> 'project_id')::UUID
        ) || ' ' || (data ->> 'code')
        WHEN 'change_request_product' THEN (
            SELECT coalesce(c.code, c.title) FROM public.change_request c WHERE c.id = (data ->> 'change_request_id')::UUID
        )
        WHEN 'shipment_purchase_order' THEN (
            SELECT s.code FROM public.shipment s WHERE s.id = (data ->> 'shipment_id')::UUID
        )
        WHEN 'purchase_order_line' THEN (
            SELECT o.code FROM public.purchase_order o WHERE o.id = (data ->> 'purchase_order_id')::UUID
        ) || ' #' || (data ->> 'position')
        ELSE NULL
    END;

    RETURN coalesce(label, data ->> 'code', data ->> 'display_name', data ->> 'title', data ->> 'name', data ->> 'id');
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_label (TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Why a decision does not settle its conflict, or NULL when it does (see the header).
CREATE OR REPLACE FUNCTION private.transfer_decision_error (conflict JSONB, decision JSONB, target_tenant UUID) RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    kind TEXT := conflict ->> 'kind';
    action TEXT;
    target UUID;
    typed TEXT;
BEGIN
    IF decision IS NULL THEN
        RETURN 'transfer_decision_required';
    END IF;

    IF jsonb_typeof(decision) <> 'object' THEN
        RETURN 'transfer_decision_invalid';
    END IF;

    action := decision ->> 'action';

    IF action IS NULL OR NOT (conflict -> 'actions') ? action THEN
        RETURN 'transfer_decision_invalid';
    END IF;

    IF action = 'map' THEN
        target := private.transfer_uuid(decision ->> 'target_id');
        IF target IS NULL OR NOT (CASE kind
            WHEN 'customer_code' THEN EXISTS (
                SELECT 1 FROM public.customer c WHERE c.id = target AND c.tenant_id = target_tenant
            )
            WHEN 'supplier_code' THEN EXISTS (
                SELECT 1 FROM public.supplier s WHERE s.id = target AND s.tenant_id = target_tenant
            )
            -- sku, document_version: the unique keys leave one row, the one found.
            ELSE target = private.transfer_uuid(conflict ->> 'existing_id')
        END) THEN
            RETURN 'transfer_decision_invalid';
        END IF;
    ELSIF action = 'new_code' AND kind IN ('customer_code', 'supplier_code') THEN
        typed := decision ->> 'code';
        IF typed IS NULL
           OR typed !~ (CASE kind WHEN 'customer_code' THEN '^[A-Z]{3}$' ELSE '^[A-Z]{2}[0-9]{1,3}$' END)
           OR (kind = 'customer_code' AND EXISTS (
               SELECT 1 FROM public.customer c WHERE c.tenant_id = target_tenant AND c.code::TEXT = typed
           ))
           OR (kind = 'supplier_code' AND EXISTS (
               SELECT 1 FROM public.supplier s WHERE s.tenant_id = target_tenant AND s.code = typed
           )) THEN
            RETURN 'transfer_code_invalid';
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_decision_error (JSONB, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- The report of the collected package (see the header).
CREATE OR REPLACE FUNCTION private.transfer_report (
   source_tenant UUID,
   target_tenant UUID,
   mode TEXT,
   decisions JSONB,
   product_ids UUID[]
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    picks JSONB := CASE WHEN jsonb_typeof(decisions) = 'object' THEN decisions ELSE '{}'::JSONB END;
    -- What a SKU or a document version conflict offers.
    map_or_skip JSONB := CASE mode WHEN 'copy' THEN '["map", "skip"]'::JSONB ELSE '["map"]'::JSONB END;
    source_customer UUID;
    customer_row JSONB;
    target_customer UUID;
    conflicts JSONB := '[]';
    sku_conflicts JSONB;
    mapped_products JSONB;
    cell_conflicts JSONB;
    mapped_cells JSONB;
    part JSONB;
    reg RECORD;
    ref RECORD;
    member_expr TEXT;
    target_expr TEXT;
    users JSONB;
    left_behind JSONB := '[]';
    required_from DATE;
    gaps JSONB;
    files BIGINT;
    unused_media UUID[];
    counts JSONB;
    unresolved BIGINT;
    path TEXT;
    source_company UUID;
    source_writable BOOLEAN;
    target_company UUID;
    report JSONB;
BEGIN
    SELECT r.source_id, r.row INTO source_customer, customer_row
    FROM pg_temp.transfer_rows r WHERE r.table_name = 'customer';

    -- The customer's code.
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'customer:' || source_customer, 'kind', 'customer_code', 'table', 'customer', 'source_id', source_customer,
            'label', customer_row ->> 'code', 'existing_id', c.id, 'actions', '["map", "new_code"]'::JSONB
        ))
        FROM public.customer c
        WHERE c.tenant_id = target_tenant AND c.code::TEXT = customer_row ->> 'code'
    ), '[]');

    -- The customer the products land under: the mapped one, or the copy (which has no products).
    IF picks -> ('customer:' || source_customer) ->> 'action' = 'map' THEN
        SELECT c.id INTO target_customer FROM public.customer c
        WHERE c.tenant_id = target_tenant
          AND c.id = private.transfer_uuid(picks -> ('customer:' || source_customer) ->> 'target_id');
    END IF;

    -- The suppliers' codes.
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'supplier:' || r.source_id, 'kind', 'supplier_code', 'table', 'supplier', 'source_id', r.source_id,
            'label', r.row ->> 'code', 'existing_id', s.id, 'actions', '["map", "new_code"]'::JSONB
        ))
        FROM pg_temp.transfer_rows r
        JOIN public.supplier s ON s.tenant_id = target_tenant AND s.code = r.row ->> 'code'
        WHERE r.table_name = 'supplier'
    ), '[]');

    -- The SKUs the target customer already has.
    sku_conflicts := coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'product:' || r.source_id, 'kind', 'sku', 'table', 'product', 'source_id', r.source_id,
            'label', r.row ->> 'sku', 'existing_id', p.id, 'actions', map_or_skip
        ))
        FROM pg_temp.transfer_rows r
        JOIN public.product p ON p.tenant_id = target_tenant AND p.customer_id = target_customer AND p.sku = r.row ->> 'sku'
        WHERE r.table_name = 'product'
    ), '[]');
    conflicts := conflicts || sku_conflicts;

    -- An active GTIN is unique across tenants, so a copy cannot keep it. A product with a SKU
    -- conflict is mapped or skipped, never written, so its GTIN does not conflict.
    IF mode = 'copy' THEN
        conflicts := conflicts || coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'key', 'product:' || r.source_id, 'kind', 'gtin', 'table', 'product', 'source_id', r.source_id,
                'label', r.row ->> 'gtin', 'existing_id', NULL, 'actions', '["clear_gtin", "skip"]'::JSONB
            ))
            FROM pg_temp.transfer_rows r
            WHERE r.table_name = 'product' AND r.row ->> 'gtin' IS NOT NULL AND r.row ->> 'status' <> 'archived'
              AND NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(sku_conflicts) k WHERE k ->> 'source_id' = r.source_id::TEXT
              )
        ), '[]');
    END IF;

    -- Project and prefixed codes taken in the target.
    FOR reg IN
        SELECT r.table_name FROM private.transfer_registry r
        WHERE r.code_kind IN ('project', 'prefixed') ORDER BY r.position
    LOOP
        EXECUTE format(
            'SELECT coalesce(jsonb_agg(jsonb_build_object('
            '''key'', %1$L || '':'' || r.source_id, ''kind'', ''code'', ''table'', %1$L, ''source_id'', r.source_id, '
            '''label'', r.row ->> ''code'', ''existing_id'', t.id, ''actions'', $2)), ''[]'') '
            'FROM pg_temp.transfer_rows r JOIN public.%1$I t ON t.tenant_id = $1 AND t.code = r.row ->> ''code'' '
            'WHERE r.table_name = %1$L',
            reg.table_name
        )
        INTO part
        USING target_tenant, CASE mode WHEN 'copy' THEN '["new_code", "skip"]'::JSONB ELSE '["new_code"]'::JSONB END;
        conflicts := conflicts || part;
    END LOOP;

    -- The products and market cells a valid map decision names (for the conflicts under them).
    mapped_products := coalesce((
        SELECT jsonb_object_agg(k ->> 'source_id', k ->> 'existing_id')
        FROM jsonb_array_elements(sku_conflicts) k
        WHERE picks -> (k ->> 'key') ->> 'action' = 'map'
          AND private.transfer_decision_error(k, picks -> (k ->> 'key'), target_tenant) IS NULL
    ), '{}');

    -- The contacts, warehouses and brands the mapped customer already has, on a natural key: the
    -- e-mail (the name without one), the name and type, the name.
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', r.table_name || ':' || r.source_id, 'kind', r.table_name, 'table', r.table_name, 'source_id', r.source_id,
            'label', coalesce(r.row ->> 'email', r.row ->> 'name', r.row ->> 'display_name'), 'existing_id', t.id,
            'actions', '["map"]'::JSONB
        ))
        FROM pg_temp.transfer_rows r
        CROSS JOIN LATERAL (
            SELECT x.id FROM public.customer_contact x
            WHERE r.table_name = 'customer_contact' AND x.tenant_id = target_tenant AND x.customer_id = target_customer
              AND CASE WHEN r.row ->> 'email' IS NOT NULL THEN lower(x.email) = lower(r.row ->> 'email')
                       ELSE lower(x.name) = lower(r.row ->> 'name') END
            UNION ALL
            SELECT x.id FROM public.customer_warehouse x
            WHERE r.table_name = 'customer_warehouse' AND x.tenant_id = target_tenant AND x.customer_id = target_customer
              AND lower(x.display_name) = lower(r.row ->> 'display_name') AND x.type::TEXT = r.row ->> 'type'
            UNION ALL
            SELECT x.id FROM public.customer_brand x
            WHERE r.table_name = 'customer_brand' AND x.tenant_id = target_tenant AND x.customer_id = target_customer
              AND lower(x.name) = lower(r.row ->> 'name')
            ORDER BY 1
            LIMIT 1
        ) t
        WHERE r.table_name IN ('customer_contact', 'customer_warehouse', 'customer_brand') AND target_customer IS NOT NULL
    ), '[]');

    -- A platform the mapped customer already has an account on (one account per platform).
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'customer_platform_account:' || r.source_id, 'kind', 'platform_account',
            'table', 'customer_platform_account', 'source_id', r.source_id,
            'label', r.row ->> 'platform_id', 'existing_id', a.id, 'actions', map_or_skip
        ))
        FROM pg_temp.transfer_rows r
        JOIN public.customer_platform_account a
          ON a.tenant_id = target_tenant AND a.customer_id = target_customer AND a.platform_id = r.row ->> 'platform_id'
        WHERE r.table_name = 'customer_platform_account'
    ), '[]');

    -- A platform and country the mapped product already has a cell for.
    cell_conflicts := coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'market_cell:' || r.source_id, 'kind', 'market_cell', 'table', 'market_cell', 'source_id', r.source_id,
            'label', (r.row ->> 'platform_id') || ' ' || (r.row ->> 'country'), 'existing_id', m.id, 'actions', map_or_skip
        ))
        FROM pg_temp.transfer_rows r
        JOIN public.market_cell m
          ON m.tenant_id = target_tenant AND m.product_id = (mapped_products ->> (r.row ->> 'product_id'))::UUID
         AND m.platform_id = r.row ->> 'platform_id' AND m.country = r.row ->> 'country'
        WHERE r.table_name = 'market_cell'
    ), '[]');
    conflicts := conflicts || cell_conflicts;

    mapped_cells := coalesce((
        SELECT jsonb_object_agg(k ->> 'source_id', k ->> 'existing_id')
        FROM jsonb_array_elements(cell_conflicts) k
        WHERE picks -> (k ->> 'key') ->> 'action' = 'map'
          AND private.transfer_decision_error(k, picks -> (k ->> 'key'), target_tenant) IS NULL
    ), '{}');

    -- Document versions under a mapped customer, product or market cell.
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'document:' || r.source_id, 'kind', 'document_version', 'table', 'document', 'source_id', r.source_id,
            'label', (r.row ->> 'type') || ' v' || (r.row ->> 'version'), 'existing_id', d.id, 'actions', map_or_skip
        ))
        FROM pg_temp.transfer_rows r
        CROSS JOIN LATERAL (
            SELECT CASE r.row ->> 'entity_type'
                WHEN 'customer' THEN CASE WHEN r.row ->> 'entity_id' = source_customer::TEXT THEN target_customer END
                WHEN 'product' THEN (mapped_products ->> (r.row ->> 'entity_id'))::UUID
                WHEN 'market_cell' THEN (mapped_cells ->> (r.row ->> 'entity_id'))::UUID
            END AS entity_id
        ) m
        JOIN public.document d
          ON d.tenant_id = target_tenant AND d.entity_type::TEXT = r.row ->> 'entity_type' AND d.entity_id = m.entity_id
         AND d.type::TEXT = r.row ->> 'type' AND d.version = (r.row ->> 'version')::INT
        WHERE r.table_name = 'document'
    ), '[]');

    -- A primary image of a mapped customer, product or market cell that already has one.
    conflicts := conflicts || coalesce((
        SELECT jsonb_agg(jsonb_build_object(
            'key', 'media_link:' || r.source_id, 'kind', 'media_link', 'table', 'media_link', 'source_id', r.source_id,
            'label', coalesce(f.row ->> 'file_name', r.row ->> 'media_id') || ' ' || (r.row ->> 'role'),
            'existing_id', l.id,
            'actions', CASE mode WHEN 'copy' THEN '["map", "demote", "skip"]'::JSONB ELSE '["map", "demote"]'::JSONB END
        ))
        FROM pg_temp.transfer_rows r
        CROSS JOIN LATERAL (
            SELECT CASE r.row ->> 'entity_type'
                WHEN 'customer' THEN CASE WHEN r.row ->> 'entity_id' = source_customer::TEXT THEN target_customer END
                WHEN 'product' THEN (mapped_products ->> (r.row ->> 'entity_id'))::UUID
                WHEN 'market_cell' THEN (mapped_cells ->> (r.row ->> 'entity_id'))::UUID
            END AS entity_id
        ) e
        JOIN public.media_link l
          ON l.tenant_id = target_tenant AND l.entity_type::TEXT = r.row ->> 'entity_type' AND l.entity_id = e.entity_id
         AND l.role = 'primary_image'
        LEFT JOIN pg_temp.transfer_rows f ON f.table_name = 'media' AND f.source_id::TEXT = r.row ->> 'media_id'
        WHERE r.table_name = 'media_link' AND r.row ->> 'role' = 'primary_image'
    ), '[]');

    -- What a skip drops with the row: the closures of every skippable conflict's row, in one walk.
    WITH seeded AS (
        SELECT c ->> 'key' AS key, s.seq
        FROM jsonb_array_elements(conflicts) c
        JOIN pg_temp.transfer_rows s ON s.table_name = c ->> 'table' AND s.source_id::TEXT = c ->> 'source_id'
        WHERE c -> 'actions' ? 'skip'
    ),
    drops AS (
        SELECT k.key, jsonb_object_agg(k.table_name, k.n) AS skip_drops
        FROM (
            SELECT d.key, r.table_name, count(*) AS n
            FROM seeded d
            JOIN private.transfer_omission_closures(ARRAY(SELECT x.seq FROM seeded x)) o ON o.seed = d.seq
            JOIN pg_temp.transfer_rows r ON r.seq = o.seq
            WHERE o.seq <> o.seed
            GROUP BY d.key, r.table_name
        ) k
        GROUP BY k.key
    )
    SELECT coalesce(jsonb_agg(CASE WHEN c -> 'actions' ? 'skip'
                                   THEN c || jsonb_build_object('skip_drops', coalesce(d.skip_drops, '{}'::JSONB))
                                   ELSE c END), '[]')
    INTO conflicts
    FROM jsonb_array_elements(conflicts) c
    LEFT JOIN drops d ON d.key = c ->> 'key';

    conflicts := coalesce((
        SELECT jsonb_agg(c ORDER BY g.position, c ->> 'label' COLLATE "C", c ->> 'source_id', c ->> 'kind')
        FROM jsonb_array_elements(conflicts) c
        JOIN private.transfer_registry g ON g.table_name = c ->> 'table'
    ), '[]');

    -- A typed code another package row of the table keeps (neither mapped nor recoded): the run
    -- refuses it (transfer_check_decisions), so the conflict names it and stays unresolved.
    conflicts := coalesce((
        SELECT jsonb_agg(CASE WHEN taken.code IS NOT NULL THEN c || jsonb_build_object('taken_code', taken.code) ELSE c END
                         ORDER BY c.n)
        FROM jsonb_array_elements(conflicts) WITH ORDINALITY AS c (c, n)
        LEFT JOIN LATERAL (
            SELECT picks -> (c.c ->> 'key') ->> 'code' AS code
            WHERE c.c ->> 'kind' IN ('customer_code', 'supplier_code')
              AND picks -> (c.c ->> 'key') ->> 'action' = 'new_code'
              AND EXISTS (
                  SELECT 1 FROM pg_temp.transfer_rows r
                  WHERE r.table_name = c.c ->> 'table' AND r.source_id::TEXT <> c.c ->> 'source_id'
                    AND r.row ->> 'code' = picks -> (c.c ->> 'key') ->> 'code'
                    AND coalesce(picks -> (r.table_name || ':' || r.source_id) ->> 'action', '') NOT IN ('map', 'new_code')
              )
        ) taken ON TRUE
    ), '[]');

    SELECT count(*) INTO unresolved
    FROM jsonb_array_elements(conflicts) c
    WHERE private.transfer_decision_error(c, picks -> (c ->> 'key'), target_tenant) IS NOT NULL
       OR c ? 'taken_code';

    -- The users named in a user column who are not members of the target (Call 7).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'display_name', u.display_name, 'columns', u.columns, 'rows', u.rows
    ) ORDER BY u.display_name COLLATE "C", u.user_id), '[]')
    INTO users
    FROM (
        SELECT x.user_id,
               coalesce(pu.user_metadata ->> 'display_name', pu.email) AS display_name,
               to_jsonb(array_agg(DISTINCT x.col ORDER BY x.col)) AS columns,
               count(DISTINCT x.seq) AS rows
        FROM (
            SELECT private.transfer_uuid(r.row ->> uc.col) AS user_id, uc.col, r.seq
            FROM pg_temp.transfer_rows r
            JOIN private.transfer_registry g ON g.table_name = r.table_name
            CROSS JOIN LATERAL jsonb_object_keys(g.user_columns) AS uc (col)
            WHERE r.row ->> uc.col IS NOT NULL
        ) x
        LEFT JOIN public.user pu ON pu.id = x.user_id
        WHERE x.user_id IS NOT NULL
        GROUP BY x.user_id, pu.user_metadata, pu.email
    ) u
    WHERE NOT EXISTS (SELECT 1 FROM public.tenant_user tu WHERE tu.user_id = u.user_id AND tu.tenant_id = target_tenant)
      AND NOT private.owns_company(u.user_id, target_tenant);

    -- The links left behind, through every FK between registry tables (its first column) and
    -- every array of ids: a row that stays (outside the package, or copied only in a move) and
    -- refers to a package row; a package row that refers to a row outside the package.
    FOR ref IN
        SELECT DISTINCT rel.relname::TEXT AS from_table, a.attname::TEXT AS col, frel.relname::TEXT AS to_table,
               FALSE AS is_array, fr.key_columns,
               -- A table without id is referred to by its key: the column pairs, tenant_id aside.
               CASE WHEN tr.key_columns IS NOT NULL THEN ARRAY(
                   SELECT fa.attname::TEXT FROM unnest(c.conkey, c.confkey) WITH ORDINALITY AS k (f, t, i)
                   JOIN pg_catalog.pg_attribute fa ON fa.attrelid = c.conrelid AND fa.attnum = k.f
                   WHERE fa.attname <> 'tenant_id' ORDER BY k.i
               ) END AS from_columns,
               CASE WHEN tr.key_columns IS NOT NULL THEN ARRAY(
                   SELECT ta.attname::TEXT FROM unnest(c.conkey, c.confkey) WITH ORDINALITY AS k (f, t, i)
                   JOIN pg_catalog.pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = k.t
                   WHERE ta.attname <> 'tenant_id' ORDER BY k.i
               ) END AS to_columns
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
        JOIN pg_catalog.pg_class frel ON frel.oid = c.confrelid
        JOIN pg_catalog.pg_namespace fn ON fn.oid = frel.relnamespace AND fn.nspname = 'public'
        JOIN private.transfer_registry fr ON fr.table_name = rel.relname
        JOIN private.transfer_registry tr ON tr.table_name = frel.relname
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
        UNION
        SELECT g.table_name, ac.key, ac.value, TRUE, g.key_columns, NULL::TEXT[], NULL::TEXT[]
        FROM private.transfer_registry g
        CROSS JOIN LATERAL jsonb_each_text(g.array_columns) AS ac
        ORDER BY 1, 2, 3
    LOOP
        IF ref.key_columns IS NULL THEN
            member_expr := 'p.source_id = x.id';
        ELSE
            member_expr := format(
                'p.key = (SELECT jsonb_object_agg(k, to_jsonb(x) -> k) FROM unnest(%L::TEXT[]) AS k)', ref.key_columns
            );
        END IF;

        -- The referred package row: by id, or by the key of a table without id.
        IF ref.to_columns IS NULL THEN
            target_expr := 't.source_id = v.id';
        ELSE
            SELECT string_agg(format('t.key ->> %L = to_jsonb(x) ->> %L', c.t, c.f), ' AND ') INTO target_expr
            FROM unnest(ref.from_columns, ref.to_columns) AS c (f, t);
        END IF;

        EXECUTE format(
            'SELECT coalesce(jsonb_agg(jsonb_build_object(''table'', %1$L, ''source_id'', %2$s, ''column'', %3$L, '
            '''label'', private.transfer_label(%1$L, to_jsonb(x)), ''refers_to'', %4$L || '':'' || v.id)), ''[]'') '
            'FROM public.%1$I x CROSS JOIN LATERAL %5$s AS v (id) '
            'JOIN pg_temp.transfer_rows t ON t.table_name = %4$L AND %7$s AND NOT t.copy_only '
            'LEFT JOIN pg_temp.transfer_rows p ON p.table_name = %1$L AND %6$s '
            'WHERE x.tenant_id = $1 AND (p.seq IS NULL OR (p.copy_only AND $2 = ''move''))',
            ref.from_table,
            CASE WHEN ref.key_columns IS NULL THEN 'x.id' ELSE 'NULL::UUID' END,
            ref.col,
            ref.to_table,
            CASE WHEN ref.is_array THEN format('unnest(x.%I)', ref.col) ELSE format('(VALUES (x.%I))', ref.col) END,
            member_expr,
            target_expr
        )
        INTO part
        USING source_tenant, mode;
        left_behind := left_behind || part;

        left_behind := left_behind || coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'table', p.table_name, 'source_id', p.source_id, 'column', ref.col,
                'label', private.transfer_label(p.table_name, p.row), 'refers_to', ref.to_table || ':' || v.id
            ))
            FROM pg_temp.transfer_rows p
            CROSS JOIN LATERAL (
                SELECT e.id FROM jsonb_array_elements_text(CASE WHEN ref.is_array THEN p.row -> ref.col END) AS e (id)
                UNION ALL
                SELECT p.row ->> ref.col WHERE NOT ref.is_array AND p.row ->> ref.col IS NOT NULL
            ) v (id)
            WHERE p.table_name = ref.from_table
              AND NOT EXISTS (
                  SELECT 1 FROM pg_temp.transfer_rows q
                  WHERE q.table_name = ref.to_table
                    AND CASE WHEN ref.to_columns IS NULL THEN q.source_id = v.id::UUID
                        ELSE NOT EXISTS (
                            SELECT 1 FROM unnest(ref.from_columns, ref.to_columns) AS c (f, t)
                            WHERE q.key ->> c.t IS DISTINCT FROM p.row ->> c.f
                        )
                    END
              )
        ), '[]');
    END LOOP;

    left_behind := coalesce((
        SELECT jsonb_agg(
            e ORDER BY g.position, e ->> 'label' COLLATE "C", e ->> 'source_id', e ->> 'column', e ->> 'refers_to'
        )
        FROM jsonb_array_elements(left_behind) e
        JOIN private.transfer_registry g ON g.table_name = e ->> 'table'
    ), '[]');

    -- The products the target's settings would hold back for a spec sheet (Call 10).
    BEGIN
        required_from := (private.company_setting(target_tenant, 'spec_sheet_required_from') #>> '{}')::DATE;
    EXCEPTION WHEN data_exception THEN
        required_from := NULL;
    END;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'rule', 'spec_sheet_required', 'table', 'product', 'source_id', r.source_id, 'label', r.row ->> 'sku'
    ) ORDER BY r.row ->> 'sku' COLLATE "C", r.source_id), '[]')
    INTO gaps
    FROM pg_temp.transfer_rows r
    WHERE r.table_name = 'product'
      AND (required_from IS NULL OR current_date >= required_from
           OR r.row ->> 'status' IN ('concept', 'development', 'approved'))
      AND NOT EXISTS (
          SELECT 1 FROM pg_temp.transfer_rows d
          WHERE d.table_name = 'document' AND d.row ->> 'entity_type' = 'product'
            AND d.row ->> 'entity_id' = r.source_id::TEXT
            AND d.row ->> 'type' = 'spec_sheet' AND d.row ->> 'status' = 'signed'
      );

    unused_media := ARRAY(SELECT u.source_id FROM private.transfer_unused_media(picks, mode) u);

    -- The files the run copies: not those only omitted or mapped rows use.
    SELECT count(*) + count(r.row ->> 'thumbnail_path') INTO files
    FROM pg_temp.transfer_rows r
    WHERE r.table_name = 'media' AND NOT r.source_id = ANY (unused_media);

    -- The rows the run writes, by table: not an omitted row (a skip and what it drops, what hangs
    -- from a mapped supplier), a mapped one, or a file not copied.
    SELECT coalesce(jsonb_object_agg(t.table_name, t.n), '{}') INTO counts
    FROM (
        SELECT r.table_name, count(*) AS n
        FROM pg_temp.transfer_rows r
        WHERE NOT r.seq IN (SELECT o.seq FROM private.transfer_omitted(picks) o)
          AND coalesce(picks -> (r.table_name || ':' || r.source_id) ->> 'action', '') <> 'map'
          AND NOT (r.table_name = 'media' AND r.source_id = ANY (unused_media))
        GROUP BY r.table_name
    ) t;

    -- One read of both tenants.
    SELECT (array_agg(e.company_id) FILTER (WHERE e.tenant_id = source_tenant))[1],
           (array_agg(e.writable) FILTER (WHERE e.tenant_id = source_tenant))[1],
           (array_agg(e.company_id) FILTER (WHERE e.tenant_id = target_tenant))[1]
    INTO source_company, source_writable, target_company
    FROM private.entitlements(ARRAY[source_tenant, target_tenant]) e;

    path := CASE
        WHEN mode = 'move'
         AND product_ids IS NULL
         AND source_company = target_company
         AND coalesce(source_writable, FALSE)
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(conflicts) c WHERE c ->> 'table' <> 'supplier')
        THEN 'cheap'
        ELSE 'copy'
    END;

    report := jsonb_build_object(
        'customer', jsonb_build_object(
            'id', source_customer, 'code', customer_row ->> 'code', 'display_name', customer_row ->> 'display_name'
        ),
        'path', path,
        'mode', mode,
        'counts', counts,
        'conflicts', conflicts,
        'users', users,
        'left_behind', left_behind,
        'settings_gaps', gaps,
        'files', files,
        'unresolved', unresolved
    );

    -- The hash also covers the target and the product selection, which the report does not show.
    RETURN report || jsonb_build_object('report_hash', encode(sha256(convert_to(jsonb_build_object(
        'report', report,
        'target_tenant', target_tenant,
        'product_ids', (SELECT to_jsonb(array_agg(DISTINCT p ORDER BY p)) FROM unnest(product_ids) AS p)
    )::TEXT, 'UTF8')), 'hex'));
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_report (UUID, UUID, TEXT, JSONB, UUID[]) FROM PUBLIC, anon, authenticated;

-- The decisions of a real run against its report (see the header).
CREATE OR REPLACE FUNCTION private.transfer_check_decisions (report JSONB, decisions JSONB, target_tenant UUID, mode TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    pick RECORD;
    conflict JSONB;
    failure TEXT;
BEGIN
    IF decisions IS NOT NULL AND jsonb_typeof(decisions) <> 'object' THEN
        PERFORM private.transfer_raise('transfer_decision_invalid', 400);
    END IF;

    FOR pick IN SELECT d.key, d.value FROM jsonb_each(coalesce(decisions, '{}'::JSONB)) d ORDER BY d.key LOOP
        SELECT c INTO conflict FROM jsonb_array_elements(report -> 'conflicts') c WHERE c ->> 'key' = pick.key;

        IF conflict IS NULL THEN
            -- A package supplier may be mapped without a conflict.
            IF pick.key LIKE 'supplier:%'
               AND jsonb_typeof(pick.value) = 'object'
               AND pick.value ->> 'action' = 'map'
               AND EXISTS (
                   SELECT 1 FROM pg_temp.transfer_rows r
                   WHERE r.table_name = 'supplier' AND r.source_id = private.transfer_uuid(substr(pick.key, 10))
               )
               AND EXISTS (
                   SELECT 1 FROM public.supplier s
                   WHERE s.tenant_id = target_tenant AND s.id = private.transfer_uuid(pick.value ->> 'target_id')
               ) THEN
                failure := NULL;
            ELSE
                failure := 'transfer_decision_invalid';
            END IF;
        -- Defence in depth: a move's conflicts never offer skip, so transfer_decision_error refuses it too.
        ELSIF mode = 'move' AND jsonb_typeof(pick.value) = 'object' AND pick.value ->> 'action' = 'skip' THEN
            failure := 'transfer_decision_invalid';
        ELSE
            -- A JSON null is a decision that does not fit, not a missing one.
            failure := coalesce(
                nullif(private.transfer_decision_error(conflict, pick.value, target_tenant), 'transfer_decision_required'),
                CASE WHEN jsonb_typeof(pick.value) = 'null' THEN 'transfer_decision_invalid' END
            );
        END IF;

        IF failure IS NOT NULL THEN
            PERFORM private.transfer_raise(failure, 400);
        END IF;
    END LOOP;

    -- A typed code repeated across the decisions of one table, or equal to the code of another
    -- package row of that table that is written with its code (neither mapped nor recoded).
    IF EXISTS (
        WITH typed AS (
            SELECT c ->> 'table' AS tbl, c ->> 'source_id' AS source_id, d.value ->> 'code' AS code
            FROM jsonb_array_elements(report -> 'conflicts') c
            JOIN jsonb_each(coalesce(decisions, '{}'::JSONB)) d ON d.key = c ->> 'key'
            WHERE c ->> 'kind' IN ('customer_code', 'supplier_code') AND d.value ->> 'action' = 'new_code'
        )
        SELECT 1 FROM typed t GROUP BY t.tbl, t.code HAVING count(*) > 1
        UNION ALL
        SELECT 1
        FROM typed t
        JOIN pg_temp.transfer_rows r
          ON r.table_name = t.tbl AND r.source_id::TEXT <> t.source_id AND r.row ->> 'code' = t.code
        WHERE coalesce(decisions -> (t.tbl || ':' || r.source_id) ->> 'action', '') NOT IN ('map', 'new_code')
    ) THEN
        PERFORM private.transfer_raise('transfer_code_invalid', 400);
    END IF;

    IF (report ->> 'unresolved')::INT > 0 THEN
        PERFORM private.transfer_raise('transfer_decision_required', 409);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_check_decisions (JSONB, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- A real run's lock on the package (see the header): every collected row with an id, FOR UPDATE,
-- table by table in registry order and by id, held until commit.
CREATE OR REPLACE FUNCTION private.transfer_lock_rows () RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    reg RECORD;
BEGIN
    FOR reg IN SELECT r.table_name FROM private.transfer_registry r WHERE r.key_columns IS NULL ORDER BY r.position LOOP
        EXECUTE format(
            'SELECT count(*) FROM (SELECT 1 FROM public.%1$I x WHERE x.id IN ('
            'SELECT r.source_id FROM pg_temp.transfer_rows r WHERE r.table_name = %1$L) ORDER BY x.id FOR UPDATE) l',
            reg.table_name
        );
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_lock_rows () FROM PUBLIC, anon, authenticated;

-- The entry point (see the header).
CREATE OR REPLACE FUNCTION public.transfer_customer (
   source_tenant UUID,
   target_tenant UUID,
   customer_id UUID,
   mode TEXT,
   decisions JSONB DEFAULT '{}',
   dry_run BOOLEAN DEFAULT TRUE,
   report_hash TEXT DEFAULT NULL,
   product_ids UUID[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    refusal TEXT := private.transfer_refusal(source_tenant, target_tenant, transfer_customer.mode, transfer_customer.customer_id);
    report JSONB;
    new_id UUID;
    result JSONB;
BEGIN
    IF refusal IS NOT NULL THEN
        PERFORM private.transfer_raise(
            refusal, CASE WHEN refusal IN ('transfer_invalid_mode', 'transfer_same_tenant') THEN 400
                          WHEN refusal = 'transfer_files_pending' THEN 409
                          ELSE 403 END
        );
    END IF;

    PERFORM 1 FROM public.customer c
    WHERE c.id = transfer_customer.customer_id AND c.tenant_id = source_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
        PERFORM private.transfer_raise('transfer_customer_missing', 404);
    END IF;

    IF transfer_customer.product_ids IS NOT NULL AND (
        cardinality(transfer_customer.product_ids) = 0
        OR EXISTS (
            SELECT 1 FROM unnest(transfer_customer.product_ids) AS s (id)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.product p
                WHERE p.id = s.id AND p.tenant_id = source_tenant AND p.customer_id = transfer_customer.customer_id
            )
        )
    ) THEN
        PERFORM private.transfer_raise('transfer_products_invalid', 400);
    END IF;

    PERFORM private.transfer_collect(source_tenant, transfer_customer.customer_id, transfer_customer.product_ids);

    -- A real run locks the package, then reads it again: what a concurrent writer committed before
    -- the lock is in it, and nothing below a locked row changes until commit.
    IF NOT coalesce(transfer_customer.dry_run, TRUE) THEN
        PERFORM private.transfer_lock_rows();
        PERFORM private.transfer_collect(source_tenant, transfer_customer.customer_id, transfer_customer.product_ids);
        PERFORM private.transfer_lock_rows();
    END IF;

    -- A package file that an earlier transfer into the source has not copied yet (one moved in
    -- with another customer, or shared): transfer_files_pending, as for the customer above.
    IF EXISTS (
        SELECT 1
        FROM public.transfer t
        CROSS JOIN LATERAL jsonb_array_elements(t.files) f
        JOIN pg_temp.transfer_rows r ON r.table_name = 'media' AND r.source_id::TEXT = f ->> 'media_id'
        WHERE t.tenant_id = source_tenant AND t.files_status <> 'done'
          AND (t.files_status = 'pending' OR f ->> 'to' = ANY (t.missing_files))
    ) THEN
        PERFORM private.transfer_raise('transfer_files_pending', 409);
    END IF;

    PERFORM private.transfer_check_gates();

    report := private.transfer_report(
        source_tenant, target_tenant, transfer_customer.mode, transfer_customer.decisions, transfer_customer.product_ids
    );

    IF coalesce(transfer_customer.dry_run, TRUE) THEN
        RETURN report;
    END IF;

    IF transfer_customer.report_hash IS NULL THEN
        PERFORM private.transfer_raise('transfer_report_required', 400);
    END IF;

    IF transfer_customer.report_hash IS DISTINCT FROM report ->> 'report_hash' THEN
        PERFORM private.transfer_raise('transfer_report_stale', 409);
    END IF;

    IF transfer_customer.mode = 'move' AND jsonb_array_length(report -> 'left_behind') > 0 THEN
        PERFORM private.transfer_raise('transfer_product_in_use', 409);
    END IF;

    PERFORM private.transfer_check_decisions(report, transfer_customer.decisions, target_tenant, transfer_customer.mode);

    -- The run: the flag, a new audit transaction, then the transfer row as the first write (the target's audit transaction
    -- is about it), its audit transaction, the package (043), and the flag cleared.
    new_id := gen_random_uuid();
    PERFORM set_config('moesa.transfer_id', new_id::TEXT, TRUE);
    -- Its own audit transaction, even after an earlier write of the caller's transaction.
    PERFORM set_config('audit.transaction_id', '', TRUE);

    INSERT INTO public.transfer (
        id, tenant_id, source_tenant_id, customer_id, product_ids, mode, path, started_by, report, decisions
    )
    VALUES (
        new_id, target_tenant, source_tenant, transfer_customer.customer_id, transfer_customer.product_ids,
        transfer_customer.mode, report ->> 'path', auth.uid(), report, coalesce(transfer_customer.decisions, '{}')
    );

    UPDATE public.transfer t
    SET audit_transaction_ids = array_remove(ARRAY[nullif(current_setting('audit.transaction_id', TRUE), '')::UUID], NULL)
    WHERE t.id = new_id;

    PERFORM private.transfer_apply(new_id);

    PERFORM set_config('moesa.transfer_id', '', TRUE);

    SELECT to_jsonb(t) INTO result FROM public.transfer t WHERE t.id = new_id;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_customer (UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, TEXT, UUID[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_customer (UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, TEXT, UUID[]) TO authenticated;
