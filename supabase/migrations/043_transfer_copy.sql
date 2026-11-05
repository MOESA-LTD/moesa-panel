-- Cross-tenant customer transfer (M21), its copy path: a real run of public.transfer_customer (042)
-- writes the transfer row, raises the flag and calls private.transfer_apply, which writes the
-- package into the target with new ids.
--
-- private.transfer_media_paths  The Storage paths of a media row in the target, in the folder
--                            media_path_in_folder asks for: <target>/<media id>/<file name>, and
--                            <target>/<media id>/thumb/thumb.webp for a thumbnail. The caller sets
--                            tenant_id and both paths in one INSERT or UPDATE (the CHECK is per row).
-- private.transfer_build_map  Fills pg_temp.transfer_map (dropped at commit) with the target id of
--                            every package row with an id: a map decision's target_id (mapped: TRUE,
--                            the row is not written); a new id for a copy_only row, and for every
--                            other row in the copy path (keep_ids FALSE) or its own id in the cheap
--                            path. The rows private.transfer_omitted gives (042: a skip and what
--                            hangs from it, a mapped supplier's contacts and documents) have no
--                            entry, nor have the files private.transfer_unused_media gives.
-- private.transfer_write     Writes the package rows of one table into the target, each taken from
--                            pg_temp.transfer_rows.row and rewritten: id from the map, tenant_id the
--                            target; every reference (transfer_references) through the map of its
--                            table: a reference to an omitted package row drops the row when NOT
--                            NULL and is cleared otherwise, a nullable reference to a row outside the
--                            package (left_behind) is cleared; entity_id through the table whose
--                            entity is entity_type (a row whose entity is omitted is dropped, an
--                            incident's link is cleared); late columns NULL, array columns '{}'; the
--                            users rule (Call 7: a non-member author becomes the caller, a
--                            non-member assignee NULL, a decision record stays); codes kept, or a
--                            new_code decision's typed code (customer, supplier) or
--                            a numbered one later (transfer_number_codes); clear_gtin; demote (a
--                            media link copied as a gallery image);
--                            media paths from transfer_media_paths, each file and thumbnail returned
--                            as {media_id, from, to, keep_source = copy_only}. Products without a
--                            parent come first. The column list leaves out GENERATED columns
--                            (purchase_order_line.line_total is computed again). The rows are
--                            written as the owner of these functions, so the SECURITY INVOKER
--                            triggers run; the transfer flag lets the business rules pass, the
--                            integrity checks (tenant, entity, media customer, file type and size)
--                            still hold. A copied warehouse is not the default when the target
--                            customer has one already. only_copy writes the copy_only rows alone
--                            (cheap path).
-- private.transfer_suppliers  The package suppliers: a mapped one is not written, any other is
--                            copied with a new id together with its contacts. The suppliers'
--                            documents are written with the other documents (a document may cite a
--                            media row, which is written after the suppliers).
-- private.transfer_number_codes  After the rows are in: the target's code_sequence of every (kind,
--                            scope, year) of a project or prefixed code kept is raised to the
--                            highest number kept (greatest(last_no, ...); the source counter is not
--                            copied), so the next code numbered in the target is free; then each
--                            row with a new_code decision gets private.next_code_in(target, kind,
--                            <target customer code>), kind 'project' or the code's prefix.
-- private.transfer_apply_copy  The copy path: the map, (in a move, the source deletion: 043 part 2),
--                            the suppliers, every other registry table in position order, the
--                            codes (transfer_number_codes), then the
--                            late pass (late and array columns through the map, for the rows
--                            written), then the transfer row's id_map, files, files_status (pending
--                            while there are files to copy) and target_customer_id.
-- private.transfer_apply     The dispatcher, on public.transfer.path.

-- The target paths of a media row (see the header).
CREATE OR REPLACE FUNCTION private.transfer_media_paths (
   target UUID,
   media_id UUID,
   storage_path TEXT,
   thumbnail_path TEXT,
   OUT target_storage_path TEXT,
   OUT target_thumbnail_path TEXT
) LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    SELECT
        transfer_media_paths.target::TEXT || '/' || transfer_media_paths.media_id::TEXT || '/'
            || regexp_replace(transfer_media_paths.storage_path, '^.*/', ''),
        CASE WHEN transfer_media_paths.thumbnail_path IS NOT NULL THEN
            transfer_media_paths.target::TEXT || '/' || transfer_media_paths.media_id::TEXT || '/thumb/thumb.webp'
        END;
$$;

REVOKE ALL ON FUNCTION private.transfer_media_paths (UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- The id map (see the header).
CREATE OR REPLACE FUNCTION private.transfer_build_map (transfer_id UUID, keep_ids BOOLEAN) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    picks JSONB;
    transfer_mode TEXT;
BEGIN
    SELECT coalesce(t.decisions, '{}'), t.mode INTO picks, transfer_mode
    FROM public.transfer t WHERE t.id = transfer_build_map.transfer_id;

    IF to_regclass('pg_temp.transfer_map') IS NOT NULL THEN
        DROP TABLE pg_temp.transfer_map;
    END IF;

    CREATE TEMP TABLE transfer_map (
        table_name TEXT NOT NULL,
        source_id UUID NOT NULL,
        target_id UUID NOT NULL,
        mapped BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (table_name, source_id)
    ) ON COMMIT DROP;

    INSERT INTO pg_temp.transfer_map (table_name, source_id, target_id, mapped)
    SELECT r.table_name,
           r.source_id,
           CASE
               WHEN d.action = 'map' THEN private.transfer_uuid(d.target)
               WHEN r.copy_only OR NOT transfer_build_map.keep_ids THEN gen_random_uuid()
               ELSE r.source_id
           END,
           coalesce(d.action = 'map', FALSE)
    FROM pg_temp.transfer_rows r
    CROSS JOIN LATERAL (
        SELECT picks -> (r.table_name || ':' || r.source_id) ->> 'action' AS action,
               picks -> (r.table_name || ':' || r.source_id) ->> 'target_id' AS target
    ) d
    WHERE r.source_id IS NOT NULL
      AND NOT r.seq IN (SELECT o.seq FROM private.transfer_omitted(picks) o);

    -- A file used only by links and documents that are not written is not copied.
    DELETE FROM pg_temp.transfer_map f
    WHERE f.table_name = 'media'
      AND f.source_id IN (SELECT u.source_id FROM private.transfer_unused_media(picks, transfer_mode) u);
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_build_map (UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- The package rows of one table into the target (see the header). Returns the files to copy.
CREATE OR REPLACE FUNCTION private.transfer_write (transfer_id UUID, tbl TEXT, only_copy BOOLEAN DEFAULT FALSE) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target UUID;
    picks JSONB;
    reg private.transfer_registry;
    columns TEXT;
    insert_sql TEXT;
    refs JSONB;
    ref RECORD;
    uc RECORD;
    r RECORD;
    data JSONB;
    v TEXT;
    found_id UUID;
    omit BOOLEAN;
    pick JSONB;
    col TEXT;
    members JSONB := '{}';
    paths RECORD;
    files JSONB := '[]';
BEGIN
    SELECT t.tenant_id, coalesce(t.decisions, '{}') INTO target, picks
    FROM public.transfer t WHERE t.id = transfer_write.transfer_id;

    SELECT * INTO reg FROM private.transfer_registry g WHERE g.table_name = transfer_write.tbl;

    -- Every column but the generated ones, introspected once.
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO columns
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = format('public.%I', transfer_write.tbl)::REGCLASS
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

    insert_sql := format(
        'INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1)',
        transfer_write.tbl, columns
    );

    SELECT coalesce(jsonb_agg(jsonb_build_object('col', f.column_name, 'table', f.ref_table, 'not_null', f.not_null)), '[]')
    INTO refs
    FROM private.transfer_references() f
    WHERE f.table_name = transfer_write.tbl;

    FOR r IN
        SELECT x.source_id, x.row, x.copy_only, m.target_id
        FROM pg_temp.transfer_rows x
        LEFT JOIN pg_temp.transfer_map m ON m.table_name = x.table_name AND m.source_id = x.source_id
        WHERE x.table_name = transfer_write.tbl
          AND (NOT transfer_write.only_copy OR x.copy_only)
          AND (x.source_id IS NULL OR (m.source_id IS NOT NULL AND NOT m.mapped))
        ORDER BY (x.row ->> 'parent_id') IS NOT NULL, x.seq
    LOOP
        data := r.row || jsonb_build_object('tenant_id', target);
        IF r.source_id IS NOT NULL THEN
            data := data || jsonb_build_object('id', r.target_id);
        END IF;
        omit := FALSE;

        -- References through the map; late columns wait for the late pass.
        FOR ref IN
            SELECT e ->> 'col' AS col, e ->> 'table' AS rt, (e ->> 'not_null')::BOOLEAN AS nn
            FROM jsonb_array_elements(refs) e
        LOOP
            v := r.row ->> ref.col;
            CONTINUE WHEN v IS NULL OR ref.col = ANY (reg.late_columns);

            SELECT m.target_id INTO found_id
            FROM pg_temp.transfer_map m WHERE m.table_name = ref.rt AND m.source_id = v::UUID;

            IF FOUND THEN
                data := data || jsonb_build_object(ref.col, found_id);
            ELSIF EXISTS (SELECT 1 FROM pg_temp.transfer_rows p WHERE p.table_name = ref.rt AND p.source_id = v::UUID) THEN
                -- An omitted package row.
                IF ref.nn THEN
                    omit := TRUE;
                    EXIT;
                END IF;
                data := data || jsonb_build_object(ref.col, NULL);
            ELSIF NOT ref.nn THEN
                -- A row outside the package (left_behind): the link is cleared.
                data := data || jsonb_build_object(ref.col, NULL);
            END IF;
        END LOOP;

        CONTINUE WHEN omit;

        -- The polymorphic entity.
        IF r.row ->> 'entity_type' IS NOT NULL AND r.row ->> 'entity_id' IS NOT NULL THEN
            SELECT m.target_id INTO found_id
            FROM private.transfer_registry e
            JOIN pg_temp.transfer_map m ON m.table_name = e.table_name AND m.source_id = (r.row ->> 'entity_id')::UUID
            WHERE e.entity::TEXT = r.row ->> 'entity_type';

            IF FOUND THEN
                data := data || jsonb_build_object('entity_id', found_id);
            ELSIF transfer_write.tbl = 'incident' THEN
                data := data || '{"entity_type": null, "entity_id": null}'::JSONB;
            ELSIF EXISTS (
                SELECT 1 FROM private.transfer_registry e
                JOIN pg_temp.transfer_rows p ON p.table_name = e.table_name AND p.source_id = (r.row ->> 'entity_id')::UUID
                WHERE e.entity::TEXT = r.row ->> 'entity_type'
            ) THEN
                -- An omitted entity: the row goes with it.
                CONTINUE;
            ELSE
                -- The collection only takes a document or link of a package row.
                RAISE EXCEPTION 'transfer: % % names an entity outside the package', transfer_write.tbl, r.source_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        END IF;

        FOREACH col IN ARRAY reg.late_columns LOOP
            data := data || jsonb_build_object(col, NULL);
        END LOOP;
        FOR col IN SELECT jsonb_object_keys(reg.array_columns) LOOP
            data := data || jsonb_build_object(col, '[]'::JSONB);
        END LOOP;

        -- The users rule (Call 7).
        FOR uc IN SELECT u.key AS col, u.value #>> '{}' AS action FROM jsonb_each(reg.user_columns) u LOOP
            v := r.row ->> uc.col;
            CONTINUE WHEN v IS NULL OR uc.action = 'keep';

            IF NOT members ? v THEN
                members := members || jsonb_build_object(v,
                    EXISTS (SELECT 1 FROM public.tenant_user tu WHERE tu.user_id = v::UUID AND tu.tenant_id = target)
                    OR private.owns_company(v::UUID, target));
            END IF;

            IF NOT (members ->> v)::BOOLEAN THEN
                data := data || jsonb_build_object(uc.col, CASE uc.action WHEN 'actor' THEN auth.uid() END);
            END IF;
        END LOOP;

        pick := CASE WHEN r.source_id IS NOT NULL THEN picks -> (transfer_write.tbl || ':' || r.source_id) END;

        IF pick ->> 'action' = 'new_code' THEN
            -- A typed code now; a numbered one by private.transfer_number_codes, once the counters
            -- have passed the codes kept.
            data := data || jsonb_build_object('code', CASE WHEN reg.code_kind = 'typed' THEN pick ->> 'code' END);
        ELSIF pick ->> 'action' = 'clear_gtin' THEN
            data := data || '{"gtin": null}'::JSONB;
        ELSIF pick ->> 'action' = 'demote' THEN
            data := data || '{"role": "gallery"}'::JSONB;
        END IF;

        -- One default warehouse per customer.
        IF transfer_write.tbl = 'customer_warehouse' AND coalesce((data ->> 'is_default')::BOOLEAN, FALSE)
           AND EXISTS (
               SELECT 1 FROM public.customer_warehouse w
               WHERE w.tenant_id = target AND w.customer_id = (data ->> 'customer_id')::UUID AND w.is_default
           ) THEN
            data := data || '{"is_default": false}'::JSONB;
        END IF;

        IF transfer_write.tbl = 'media' THEN
            SELECT * INTO paths
            FROM private.transfer_media_paths(target, r.target_id, r.row ->> 'storage_path', r.row ->> 'thumbnail_path');
            data := data || jsonb_build_object(
                'storage_path', paths.target_storage_path, 'thumbnail_path', paths.target_thumbnail_path
            );
            files := files || jsonb_build_array(jsonb_build_object(
                'media_id', r.target_id, 'from', r.row ->> 'storage_path', 'to', paths.target_storage_path,
                'keep_source', r.copy_only
            ));
            IF paths.target_thumbnail_path IS NOT NULL THEN
                files := files || jsonb_build_array(jsonb_build_object(
                    'media_id', r.target_id, 'from', r.row ->> 'thumbnail_path', 'to', paths.target_thumbnail_path,
                    'keep_source', r.copy_only
                ));
            END IF;
        END IF;

        EXECUTE insert_sql USING data;
    END LOOP;

    RETURN files;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_write (UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- The package suppliers (see the header).
CREATE OR REPLACE FUNCTION private.transfer_suppliers (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.transfer_write(transfer_suppliers.transfer_id, 'supplier', TRUE);
    PERFORM private.transfer_write(transfer_suppliers.transfer_id, 'supplier_contact', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_suppliers (UUID) FROM PUBLIC, anon, authenticated;

-- The counters and the new numbered codes (see the header).
CREATE OR REPLACE FUNCTION private.transfer_number_codes (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target UUID;
    picks JSONB;
    customer_code TEXT;
    r RECORD;
BEGIN
    SELECT t.tenant_id, coalesce(t.decisions, '{}') INTO target, picks
    FROM public.transfer t WHERE t.id = transfer_number_codes.transfer_id;

    -- The codes kept by the rows written: <SCOPE>-<year>-<n> (project), <KIND>-<SCOPE>-<year>-<n>.
    INSERT INTO public.code_sequence AS cs (tenant_id, kind, scope, year, last_no)
    SELECT target, c.kind, c.scope, c.year, max(c.n)
    FROM (
        SELECT CASE g.code_kind WHEN 'project' THEN 'project' ELSE lower(x[1]) END AS kind,
               x[2] AS scope, x[3]::INT AS year, x[4]::INT AS n
        FROM pg_temp.transfer_rows w
        JOIN private.transfer_registry g ON g.table_name = w.table_name AND g.code_kind IN ('project', 'prefixed')
        JOIN pg_temp.transfer_map m ON m.table_name = w.table_name AND m.source_id = w.source_id AND NOT m.mapped
        CROSS JOIN LATERAL regexp_match(
            CASE g.code_kind WHEN 'project' THEN '-' || (w.row ->> 'code') ELSE w.row ->> 'code' END,
            '^([A-Za-z]*)-([A-Z0-9]+)-([0-9]{4})-([0-9]+)$'
        ) AS x
        WHERE coalesce(picks -> (w.table_name || ':' || w.source_id) ->> 'action', '') <> 'new_code'
    ) c
    WHERE c.kind IN ('project', 'po', 'shp', 'cr', 'ol', 'oa', 'ou', 'ot', 'om')
    GROUP BY c.kind, c.scope, c.year
    ON CONFLICT ON CONSTRAINT code_sequence_pkey DO UPDATE SET last_no = greatest(cs.last_no, excluded.last_no);

    SELECT c.code::TEXT INTO customer_code
    FROM pg_temp.transfer_map m
    JOIN public.customer c ON c.id = m.target_id AND c.tenant_id = target
    WHERE m.table_name = 'customer';

    FOR r IN
        SELECT g.table_name, g.code_kind, m.target_id, x.row ->> 'code' AS code
        FROM pg_temp.transfer_rows x
        JOIN private.transfer_registry g ON g.table_name = x.table_name AND g.code_kind IN ('project', 'prefixed')
        JOIN pg_temp.transfer_map m ON m.table_name = x.table_name AND m.source_id = x.source_id AND NOT m.mapped
        WHERE picks -> (x.table_name || ':' || x.source_id) ->> 'action' = 'new_code'
        ORDER BY g.position, x.seq
    LOOP
        EXECUTE format('UPDATE public.%I SET code = $1 WHERE id = $2 AND tenant_id = $3', r.table_name)
        USING private.next_code_in(
                  target,
                  CASE r.code_kind WHEN 'project' THEN 'project' ELSE lower(split_part(r.code, '-', 1)) END,
                  customer_code
              ),
              r.target_id, target;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_number_codes (UUID) FROM PUBLIC, anon, authenticated;

-- The copy path (see the header).
CREATE OR REPLACE FUNCTION private.transfer_apply_copy (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    run public.transfer;
    reg RECORD;
    col TEXT;
    ref_table TEXT;
    refs JSONB;
    listed JSONB := '[]';
BEGIN
    SELECT * INTO run FROM public.transfer t WHERE t.id = transfer_apply_copy.transfer_id;

    SELECT jsonb_object_agg(f.table_name || '.' || f.column_name, f.ref_table) INTO refs
    FROM private.transfer_references() f;

    -- 1. The id map.
    PERFORM private.transfer_build_map(run.id, FALSE);

    -- 2. A move deletes the source package first (043 part 2); until then it writes nothing.
    IF run.mode = 'move' THEN
        RAISE EXCEPTION 'A move through the copy path is not available yet.' USING ERRCODE = 'feature_not_supported';
    END IF;

    -- 3. The suppliers.
    PERFORM private.transfer_suppliers(run.id);

    -- 4. Every other table, in registry order.
    FOR reg IN SELECT g.table_name FROM private.transfer_registry g WHERE g.root <> 'supplier' ORDER BY g.position LOOP
        listed := listed || private.transfer_write(run.id, reg.table_name);
    END LOOP;

    -- The target's counters past the codes kept, then the new codes.
    PERFORM private.transfer_number_codes(run.id);

    -- 5. The late pass, for the rows written (not the mapped ones).
    FOR reg IN
        SELECT g.table_name, g.late_columns, g.array_columns FROM private.transfer_registry g
        WHERE cardinality(g.late_columns) > 0 OR g.array_columns <> '{}'
        ORDER BY g.position
    LOOP
        FOREACH col IN ARRAY reg.late_columns LOOP
            ref_table := refs ->> (reg.table_name || '.' || col);

            EXECUTE format(
                'UPDATE public.%1$I x SET %2$I = n.target_id '
                'FROM pg_temp.transfer_rows r '
                'JOIN pg_temp.transfer_map m ON m.table_name = r.table_name AND m.source_id = r.source_id AND NOT m.mapped '
                'JOIN pg_temp.transfer_map n ON n.table_name = %3$L AND n.source_id = (r.row ->> %2$L)::UUID '
                'WHERE r.table_name = %1$L AND x.id = m.target_id AND x.tenant_id = $1',
                reg.table_name, col, ref_table
            )
            USING run.tenant_id;
        END LOOP;

        FOR col, ref_table IN SELECT a.key, a.value FROM jsonb_each_text(reg.array_columns) a LOOP
            EXECUTE format(
                'UPDATE public.%1$I x SET %2$I = ARRAY('
                '    SELECT n.target_id FROM jsonb_array_elements_text(r.row -> %2$L) WITH ORDINALITY AS e (id, i) '
                '    JOIN pg_temp.transfer_map n ON n.table_name = %3$L AND n.source_id = e.id::UUID ORDER BY e.i) '
                'FROM pg_temp.transfer_rows r '
                'JOIN pg_temp.transfer_map m ON m.table_name = r.table_name AND m.source_id = r.source_id AND NOT m.mapped '
                'WHERE r.table_name = %1$L AND x.id = m.target_id AND x.tenant_id = $1 '
                '  AND jsonb_array_length(coalesce(r.row -> %2$L, ''[]'')) > 0',
                reg.table_name, col, ref_table
            )
            USING run.tenant_id;
        END LOOP;
    END LOOP;

    -- 6. The transfer row.
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
        target_customer_id = (SELECT m.target_id FROM pg_temp.transfer_map m WHERE m.table_name = 'customer')
    WHERE t.id = run.id;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_apply_copy (UUID) FROM PUBLIC, anon, authenticated;

-- The dispatcher (see the header).
CREATE OR REPLACE FUNCTION private.transfer_apply (transfer_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    transfer_path TEXT;
BEGIN
    SELECT t.path INTO transfer_path FROM public.transfer t WHERE t.id = transfer_apply.transfer_id;

    IF transfer_path = 'copy' THEN
        PERFORM private.transfer_apply_copy(transfer_apply.transfer_id);
    ELSE
        -- The cheap path (private.transfer_apply_cheap) comes with 044.
        RAISE EXCEPTION 'The cheap transfer path is not available before migration 044.' USING ERRCODE = 'feature_not_supported';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.transfer_apply (UUID) FROM PUBLIC, anon, authenticated;
