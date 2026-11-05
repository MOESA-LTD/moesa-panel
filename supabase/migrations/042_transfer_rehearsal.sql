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
--                            read-only source (a read-only source may still be copied from).
-- private.transfer_collect   Fills pg_temp.transfer_rows (dropped at commit) with the package: the
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
--                              documents; the selected products, their variants and the parent of a
--                              selected variant, with what hangs from them (market cells, documents,
--                              media links); the media they use, copy_only (another product left
--                              behind may use it too). A row of another table that refers to a
--                              package product stays behind as a link (later tasks).
-- public.transfer_customer   The entry point (SECURITY DEFINER: a transfer reads and writes past
--                            the caller's RLS once the checks above have passed). Here it refuses,
--                            locks the customer, checks the products and returns the dry run's
--                            counts per table; the later migrations of M21 add the report, the
--                            decisions and the writes.

-- The first refusal, or NULL (see the header).
CREATE OR REPLACE FUNCTION private.transfer_refusal (source_tenant UUID, target_tenant UUID, mode TEXT) RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    source_e RECORD;
    target_e RECORD;
BEGIN
    IF mode IS NULL OR mode NOT IN ('copy', 'move') THEN
        RETURN 'transfer_invalid_mode';
    END IF;

    IF source_tenant IS NOT DISTINCT FROM target_tenant THEN
        RETURN 'transfer_same_tenant';
    END IF;

    SELECT e.company_id, e.modules, e.writable INTO source_e
    FROM private.entitlements(ARRAY[source_tenant, target_tenant]) e WHERE e.tenant_id = source_tenant;
    SELECT e.company_id, e.modules, e.writable INTO target_e
    FROM private.entitlements(ARRAY[source_tenant, target_tenant]) e WHERE e.tenant_id = target_tenant;

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

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_refusal (UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- The package into pg_temp.transfer_rows (see the header).
CREATE OR REPLACE FUNCTION private.transfer_collect (source_tenant UUID, customer_id UUID, product_ids UUID[]) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    only_products BOOLEAN := product_ids IS NOT NULL;
    products UUID[];
    suppliers UUID[];
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
                'OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = $1 AND d.media_id = x.id AND EXISTS (%s))',
                format(entity_match, 'l'),
                format(entity_match, 'd')
            );
            copy_expr := '(x.customer_id IS NULL OR $5)';
        ELSIF reg.parent_column = 'entity' THEN
            from_sql := from_sql || format(' JOIN LATERAL (%s) p ON TRUE', format(entity_match, 'x'));
            copy_expr := 'p.copy_only';
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
        USING source_tenant, transfer_collect.customer_id, products, suppliers, only_products;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_collect (UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;

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
    refusal TEXT := private.transfer_refusal(source_tenant, target_tenant, transfer_customer.mode);
    counts JSONB;
BEGIN
    IF refusal IS NOT NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', refusal)::TEXT,
            DETAIL = json_build_object(
                'status', CASE WHEN refusal IN ('transfer_invalid_mode', 'transfer_same_tenant') THEN 400 ELSE 403 END,
                'headers', json_build_object()
            )::TEXT;
    END IF;

    PERFORM 1 FROM public.customer c
    WHERE c.id = transfer_customer.customer_id AND c.tenant_id = source_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'transfer_customer_missing')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
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
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'transfer_products_invalid')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    PERFORM private.transfer_collect(source_tenant, transfer_customer.customer_id, transfer_customer.product_ids);

    SELECT coalesce(jsonb_object_agg(t.table_name, t.n), '{}') INTO counts
    FROM (SELECT r.table_name, count(*) AS n FROM pg_temp.transfer_rows r GROUP BY r.table_name) t;

    RETURN jsonb_build_object('mode', transfer_customer.mode, 'counts', counts);
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_customer (UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, TEXT, UUID[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_customer (UUID, UUID, UUID, TEXT, JSONB, BOOLEAN, TEXT, UUID[]) TO authenticated;
