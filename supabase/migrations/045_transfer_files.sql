-- Cross-tenant customer transfer (M21), the target picker and the file check.
--
-- public.transfer_options      The caller's candidate targets for a transfer out of source_tenant:
--                              {source_writable, targets: [{id, display_name, same_company,
--                              refusal}]}. The targets are the tenants the caller belongs to
--                              (tenant_user) or owns (private.owned_tenants), without the source,
--                              ordered by display_name. refusal is private.transfer_refusal(source,
--                              target, 'copy') (042: owner of both companies, then target
--                              read-only, then plan, then permissions), NULL when the copy is
--                              allowed; a move is refused on top of it when source_writable is
--                              FALSE. A source the caller neither belongs to nor owns gives
--                              {source_writable: FALSE, targets: []}: nothing about a tenant the
--                              caller cannot see. SECURITY DEFINER: it reads every candidate's
--                              entitlements.
-- public.transfer_check_files  The files of a transfer against Storage: missing_files is the
--                              files[].to paths with no object in bucket media (in the target's
--                              folder, as private.media_check_file reads it), files_status 'done'
--                              when none is missing, else 'partial'. 404 transfer_not_found when
--                              the row is missing or the caller neither started it nor holds
--                              public.transfer insert in its tenant. SECURITY DEFINER: users never
--                              write public.transfer, and storage.objects is read past its
--                              policies. The UPDATE runs under an audit transaction of its own
--                              (audit.transaction_id cleared first, so the audit trigger opens a
--                              fresh one), whose id is appended to audit_transaction_ids in the
--                              same transaction: the revert guard (040) refuses it. A caller's
--                              audit transaction already open is restored afterwards (with its
--                              tenant and depth); with none open, the check's stays current, as
--                              after any other write.

-- The candidate targets (see the header).
CREATE OR REPLACE FUNCTION public.transfer_options (source_tenant UUID) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    mine UUID[];
    source_e RECORD;
BEGIN
    mine := ARRAY(
        SELECT tu.tenant_id FROM public.tenant_user tu WHERE tu.user_id = caller
        UNION
        SELECT o.id FROM unnest(private.owned_tenants(caller)) AS o (id)
    );

    IF caller IS NULL OR source_tenant IS NULL OR NOT (source_tenant = ANY (mine)) THEN
        RETURN jsonb_build_object('source_writable', FALSE, 'targets', '[]'::JSONB);
    END IF;

    SELECT e.company_id, e.writable INTO source_e FROM private.entitlements(ARRAY[source_tenant]) e;

    RETURN jsonb_build_object(
        'source_writable', coalesce(source_e.writable, FALSE),
        'targets', coalesce((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'display_name', t.display_name,
                    'same_company', e.company_id IS NOT DISTINCT FROM source_e.company_id,
                    'refusal', private.transfer_refusal(source_tenant, t.id, 'copy')
                )
                ORDER BY t.display_name, t.id
            )
            FROM public.tenant t
            JOIN private.entitlements(mine) e ON e.tenant_id = t.id
            WHERE t.id = ANY (mine) AND t.id <> source_tenant
        ), '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_options (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_options (UUID) TO authenticated;

-- The file check (see the header).
CREATE OR REPLACE FUNCTION public.transfer_check_files (transfer_id UUID) RETURNS public.transfer LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    run public.transfer;
    missing TEXT[];
    saved_transaction TEXT := current_setting('audit.transaction_id', TRUE);
    saved_tenant TEXT := current_setting('audit.tenant_id', TRUE);
    saved_depth TEXT := current_setting('audit.depth', TRUE);
    check_transaction UUID;
BEGIN
    SELECT * INTO run FROM public.transfer t WHERE t.id = transfer_check_files.transfer_id FOR UPDATE;

    IF NOT FOUND
       OR NOT (
           coalesce(run.started_by = caller, FALSE)
           OR run.tenant_id = ANY (private.tenants_granting(caller, ARRAY[run.tenant_id], 'public.transfer', 'insert'))
       ) THEN
        PERFORM private.transfer_raise('transfer_not_found', 404);
    END IF;

    -- The listed target paths with no object in the target's folder, in list order.
    missing := ARRAY(
        SELECT f.value ->> 'to'
        FROM jsonb_array_elements(run.files) WITH ORDINALITY AS f (value, n)
        WHERE f.value ->> 'to' IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM storage.objects o
              WHERE o.bucket_id = 'media'
                AND o.name = f.value ->> 'to'
                AND private.storage_tenant(o.name) = run.tenant_id
          )
        ORDER BY f.n
    );

    -- The check's own audit transaction.
    PERFORM set_config('audit.transaction_id', '', TRUE);

    UPDATE public.transfer t
    SET missing_files = missing,
        files_status = CASE WHEN cardinality(missing) = 0 THEN 'done' ELSE 'partial' END
    WHERE t.id = run.id;

    check_transaction := nullif(current_setting('audit.transaction_id', TRUE), '')::UUID;

    IF check_transaction IS NOT NULL THEN
        UPDATE public.transfer t
        SET audit_transaction_ids = t.audit_transaction_ids || check_transaction
        WHERE t.id = run.id AND NOT (check_transaction = ANY (t.audit_transaction_ids));
    END IF;

    -- The caller's open audit transaction back, if there was one.
    IF nullif(saved_transaction, '') IS NOT NULL THEN
        PERFORM set_config('audit.transaction_id', saved_transaction, TRUE);
        PERFORM set_config('audit.tenant_id', coalesce(saved_tenant, ''), TRUE);
        PERFORM set_config('audit.depth', coalesce(saved_depth, ''), TRUE);
    END IF;

    SELECT * INTO run FROM public.transfer t WHERE t.id = run.id;

    RETURN run;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_check_files (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_check_files (UUID) TO authenticated;
