-- Cross-tenant customer transfer (M21), its cheap path: a whole-customer move within one company
-- tree that the rehearsal found free of conflicts (042: path 'cheap'; a supplier conflict is
-- allowed, its decision is honoured by private.transfer_suppliers) moves the package in place. The
-- rows keep their ids; only what may not move is copied.
--
-- private.transfer_apply_cheap  The cheap path:
--                            1. SET CONSTRAINTS ALL DEFERRED (the composite foreign keys of 041),
--                               then private.transfer_build_map(transfer_id, TRUE): a moved row
--                               maps to itself, a copy_only row (supplier, its contacts and
--                               documents, a shared file) to a new id.
--                            2. private.transfer_suppliers: the suppliers copied (or mapped).
--                            3. The shared files (media, customer NULL) first, one INSERT per row
--                               (private.transfer_write, only_copy) under their mapped ids and the
--                               target paths of private.transfer_media_paths, each file listed
--                               with keep_source = true; the moved documents and links that cite
--                               them find the copy in the target.
--                            4. Every other registry table, in position order: one
--                               UPDATE public.<t> SET tenant_id = target, ... of its package rows
--                               (not copy_only). The three tables without id are deleted and
--                               written again from the snapshot (private.transfer_write) instead,
--                               after the walk: private.audit_statement pairs the rows of an
--                               UPDATE by id, and shipment_line's RESTRICT key to the link row is
--                               checked at once, so the lines must have left the source first.
--                               The same statement rewrites every reference between registry
--                               tables (private.transfer_references) and every array column
--                               through the map: a moved row maps to itself, so this turns
--                               product.supplier_id and purchase_order.supplier_id to the target's
--                               supplier, and document.media_id and media_link.media_id to the
--                               copy of a shared file (document_check_media and media_link_check
--                               see a file of the target); a reference to an omitted package row
--                               (a mapped supplier's documents) is cleared. It applies the users
--                               rule (Call 7: a non-member 'actor' column becomes the caller, a
--                               'clear' one NULL, 'keep' stays) and, for media, sets storage_path
--                               and thumbnail_path to the target's folder in the statement that
--                               changes tenant_id (the CHECK media_path_in_folder is per row),
--                               each file listed with keep_source = false. Then the copy_only rows
--                               of that table (a supplier's documents) are written into the target
--                               as in the copy path (private.transfer_write, only_copy).
--                            5. private.transfer_number_codes: the target's counters past the
--                               codes kept. SET CONSTRAINTS ALL IMMEDIATE: a violation raises in
--                               the call.
--                            6. The source's "transferred out" entry (ruling 4): the in-place
--                               UPDATEs are logged in the target's transfer transaction, so the
--                               source gets an audit transaction of its own, (source, caller,
--                               role, 'customer', customer_id, 'DELETE', now()), with one audit_log
--                               row: the customer as collected in old_data, {transferred_to,
--                               transfer_id} in new_data, the transaction's created_at (its
--                               partition). Written directly; the audit.* settings are untouched.
--                               Its id is appended to the transfer's audit_transaction_ids.
--                            7. The transfer row: id_map (the map: identity entries for the moved
--                               rows, the supplier and shared-file copies), files, files_status
--                               (pending while there are files to copy), target_customer_id (the
--                               customer's own id).
-- private.transfer_apply     The dispatcher, on public.transfer.path: copy (043) or cheap.

-- The cheap path (see the header).
CREATE OR REPLACE FUNCTION private.transfer_apply_cheap (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    run public.transfer;
    reg private.transfer_registry;
    f RECORD;
    sets TEXT[];
    keys TEXT;
    picked TEXT;
    listed JSONB;
    customer_row JSONB;
    source_transaction UUID;
    source_created TIMESTAMPTZ;
    -- A reference through the map: the target of a package row, NULL for an omitted one, the
    -- value itself for a row outside the package.
    mapped_ref CONSTANT TEXT :=
        '%1$I = CASE WHEN x.%1$I IS NULL THEN NULL ELSE coalesce('
        '(SELECT m.target_id FROM pg_temp.transfer_map m WHERE m.table_name = %2$L AND m.source_id = x.%1$I), '
        'CASE WHEN EXISTS (SELECT 1 FROM pg_temp.transfer_rows p WHERE p.table_name = %2$L AND p.source_id = x.%1$I) '
        'THEN NULL ELSE x.%1$I END) END';
    mapped_array CONSTANT TEXT :=
        '%1$I = ARRAY(SELECT coalesce(m.target_id, e.id) FROM unnest(x.%1$I) WITH ORDINALITY AS e (id, i) '
        'LEFT JOIN pg_temp.transfer_map m ON m.table_name = %2$L AND m.source_id = e.id '
        'WHERE m.source_id IS NOT NULL OR NOT EXISTS ('
        'SELECT 1 FROM pg_temp.transfer_rows p WHERE p.table_name = %2$L AND p.source_id = e.id) ORDER BY e.i)';
BEGIN
    SELECT * INTO run FROM public.transfer t WHERE t.id = transfer_apply_cheap.transfer_id;

    -- 1. Deferred keys, then the map (moved rows keep their ids).
    SET CONSTRAINTS ALL DEFERRED;
    PERFORM private.transfer_build_map(run.id, TRUE);

    -- 2. The suppliers.
    PERFORM private.transfer_suppliers(run.id);

    -- 3. The shared files, copied first.
    listed := private.transfer_write(run.id, 'media', TRUE);

    -- 4. Every other table in place, in registry order.
    FOR reg IN SELECT * FROM private.transfer_registry g WHERE g.root <> 'supplier' ORDER BY g.position LOOP
        CONTINUE WHEN reg.key_columns IS NOT NULL;

        sets := ARRAY['tenant_id = $1'];

        FOR f IN SELECT r.column_name, r.ref_table FROM private.transfer_references() r WHERE r.table_name = reg.table_name LOOP
            sets := sets || format(mapped_ref, f.column_name, f.ref_table);
        END LOOP;

        FOR f IN SELECT a.key AS column_name, a.value AS ref_table FROM jsonb_each_text(reg.array_columns) a LOOP
            sets := sets || format(mapped_array, f.column_name, f.ref_table);
        END LOOP;

        -- The users rule (Call 7).
        FOR f IN
            SELECT u.key AS column_name, u.value #>> '{}' AS action FROM jsonb_each(reg.user_columns) u
            WHERE u.value #>> '{}' <> 'keep'
        LOOP
            sets := sets || format(
                '%1$I = CASE WHEN x.%1$I IS NULL '
                'OR EXISTS (SELECT 1 FROM public.tenant_user tu WHERE tu.user_id = x.%1$I AND tu.tenant_id = $1) '
                'OR private.owns_company(x.%1$I, $1) THEN x.%1$I ELSE %2$s END',
                f.column_name, CASE f.action WHEN 'actor' THEN 'auth.uid()' ELSE 'NULL' END
            );
        END LOOP;

        IF reg.table_name = 'media' THEN
            sets := sets
                || 'storage_path = (private.transfer_media_paths($1, x.id, x.storage_path, x.thumbnail_path)).target_storage_path'::TEXT
                || 'thumbnail_path = (private.transfer_media_paths($1, x.id, x.storage_path, x.thumbnail_path)).target_thumbnail_path'::TEXT;

            -- The files that move, from the snapshot (the paths before the UPDATE).
            listed := listed || coalesce((
                SELECT jsonb_agg(e.file ORDER BY r.seq, e.n)
                FROM pg_temp.transfer_rows r
                JOIN pg_temp.transfer_map m ON m.table_name = 'media' AND m.source_id = r.source_id AND NOT m.mapped
                CROSS JOIN LATERAL private.transfer_media_paths(
                    run.tenant_id, r.source_id, r.row ->> 'storage_path', r.row ->> 'thumbnail_path'
                ) p
                CROSS JOIN LATERAL (
                    VALUES (1, jsonb_build_object('media_id', r.source_id, 'from', r.row ->> 'storage_path',
                                                  'to', p.target_storage_path, 'keep_source', FALSE)),
                           (2, CASE WHEN p.target_thumbnail_path IS NOT NULL THEN
                                   jsonb_build_object('media_id', r.source_id, 'from', r.row ->> 'thumbnail_path',
                                                      'to', p.target_thumbnail_path, 'keep_source', FALSE)
                               END)
                ) AS e (n, file)
                WHERE r.table_name = 'media' AND NOT r.copy_only AND e.file IS NOT NULL
            ), '[]');
        END IF;

        EXECUTE format(
            'UPDATE public.%I x SET %s WHERE x.tenant_id = $2 AND x.id IN ('
            'SELECT r.source_id FROM pg_temp.transfer_rows r '
            'JOIN pg_temp.transfer_map m ON m.table_name = r.table_name AND m.source_id = r.source_id AND NOT m.mapped '
            'WHERE r.table_name = %L AND NOT r.copy_only)',
            reg.table_name, array_to_string(sets, ', '), reg.table_name
        )
        USING run.tenant_id, run.source_tenant_id;

        -- The rows that are only copied (a supplier's documents), as in the copy path.
        IF reg.table_name <> 'media' AND EXISTS (
            SELECT 1 FROM pg_temp.transfer_rows r WHERE r.table_name = reg.table_name AND r.copy_only
        ) THEN
            listed := listed || private.transfer_write(run.id, reg.table_name, TRUE);
        END IF;
    END LOOP;

    -- The three tables without id: the audit trigger pairs the old and new rows of an UPDATE by
    -- id, so their rows are deleted and written again from the snapshot, unchanged but for the
    -- tenant. After the walk: a source shipment_line would hold the link row (RESTRICT, checked
    -- at once), and by now every line is in the target.
    FOR reg IN SELECT * FROM private.transfer_registry g WHERE g.key_columns IS NOT NULL ORDER BY g.position LOOP
        SELECT string_agg(format('x.%I', k), ', '), string_agg(format('(r.key ->> %L)::UUID', k), ', ')
        INTO picked, keys
        FROM unnest(reg.key_columns) AS k;

        EXECUTE format(
            'DELETE FROM public.%1$I x WHERE x.tenant_id = $1 AND (%2$s) IN ('
            'SELECT %3$s FROM pg_temp.transfer_rows r WHERE r.table_name = %1$L AND NOT r.copy_only)',
            reg.table_name, picked, keys
        )
        USING run.source_tenant_id;

        PERFORM private.transfer_write(run.id, reg.table_name);
    END LOOP;

    -- 5. The target's counters past the codes kept, then every key checked.
    PERFORM private.transfer_number_codes(run.id);
    -- (Also ends a deferral of the caller's own; no constraint is INITIALLY DEFERRED.)
    SET CONSTRAINTS ALL IMMEDIATE;

    -- 6. The source's "transferred out" entry.
    SELECT r.row INTO customer_row FROM pg_temp.transfer_rows r WHERE r.table_name = 'customer';

    INSERT INTO public.audit_transaction (tenant_id, actor_id, actor_role, table_name, record_id, operation, created_at)
    VALUES (run.source_tenant_id, auth.uid(), coalesce(auth.role(), session_user::TEXT), 'customer', run.customer_id, 'DELETE', now())
    RETURNING id, created_at INTO source_transaction, source_created;

    INSERT INTO public.audit_log (transaction_id, tenant_id, table_schema, table_name, operation, record_id, old_data, new_data, created_at)
    VALUES (
        source_transaction, run.source_tenant_id, 'public', 'customer', 'DELETE', run.customer_id, customer_row,
        jsonb_build_object('transferred_to', run.tenant_id, 'transfer_id', run.id), source_created
    );

    -- 7. The transfer row.
    UPDATE public.transfer t
    SET id_map = coalesce((
            SELECT jsonb_object_agg(g.table_name, g.ids)
            FROM (
                SELECT m.table_name, jsonb_object_agg(m.source_id::TEXT, m.target_id) AS ids
                FROM pg_temp.transfer_map m GROUP BY m.table_name
            ) g
        ), '{}'),
        files = listed,
        files_status = CASE WHEN jsonb_array_length(listed) > 0 THEN 'pending' ELSE 'done' END,
        target_customer_id = run.customer_id,
        audit_transaction_ids = t.audit_transaction_ids || source_transaction
    WHERE t.id = run.id;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_apply_cheap (UUID) FROM PUBLIC, anon, authenticated;

-- The dispatcher (see the header).
CREATE OR REPLACE FUNCTION private.transfer_apply (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    transfer_path TEXT;
BEGIN
    SELECT t.path INTO transfer_path FROM public.transfer t WHERE t.id = transfer_apply.transfer_id;

    IF transfer_path = 'cheap' THEN
        PERFORM private.transfer_apply_cheap(transfer_apply.transfer_id);
    ELSE
        PERFORM private.transfer_apply_copy(transfer_apply.transfer_id);
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_apply (UUID) FROM PUBLIC, anon, authenticated;
