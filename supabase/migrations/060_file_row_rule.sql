-- 060: the files row rule (R3). Field masking hides a column, but a whole file can show the same data:
-- a PI or invoice PDF shows prices, supplier media shows who the supplier is. So a user without the
-- supplier_terms group in a tenant cannot see its price documents, and one without supplier_identity
-- cannot see its supplier / purchase-order documents, links, media or Storage objects.
--
-- The enum has no "price list" or "supplier invoice" value; pi, commercial_invoice, po and a supplier
-- contract stand for them.
--
-- document_field_groups, media_link_field_groups and media_field_groups are RESTRICTIVE SELECT policies
-- written by hand. The permission generator (private.enable_tenant_level_security) drops only the
-- policies it names (restrict_*, select_public_<table>, ...), so a re-run keeps these; 060's test runs it.
--
-- DEVIATION from R8: hidden_media_ids, media_restriction and field_group_readable are SECURITY DEFINER
-- owned by postgres, like private.parent_gone (Task 3). Each only answers a yes/no or id question for a
-- policy or the Storage check, and must not depend on the caller's session scope or on the caller's
-- other table rights (a role with media select but no document or media_link select, or an active
-- tenant outside the object's), so they read the base tables directly. EXECUTE is revoked from public
-- and anon; the policy path (authenticated) keeps it, and authenticated has no USAGE on private.
-- hidden_media_ids is STABLE and called as (SELECT ...), an InitPlan: once per query (R10).
-- The Storage check (can_read_media_file) takes the tenant from the path and no scope, so it asks
-- field_group_readable for that tenant explicitly.

CREATE OR REPLACE FUNCTION private.field_group_readable (p_tenant UUID, p_group TEXT) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    f RECORD;
    seen BOOLEAN := FALSE;
BEGIN
    IF p_tenant IS NULL THEN
        RETURN FALSE;
    END IF;
    FOR f IN SELECT c.resource_name, c.field FROM public.field_class c WHERE c.class = 'sensitive' AND c.group_name = p_group LOOP
        seen := TRUE;
        IF NOT (p_tenant = ANY (private.field_tenants(auth.uid(), ARRAY[p_tenant], f.resource_name, f.field, FALSE))) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN seen;
END;
$$;

-- The field groups that guard a media file: supplier_identity when it is linked to a supplier or purchase
-- order, or is the file of a document on one; supplier_terms when it is the file of a price document.
CREATE OR REPLACE FUNCTION private.media_restriction (p_media UUID) RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT coalesce(array_agg(DISTINCT g.grp), '{}'::TEXT[])
    FROM (
        SELECT 'supplier_identity' AS grp
        WHERE EXISTS (SELECT 1 FROM public.media_link l WHERE l.media_id = p_media AND l.entity_type IN ('supplier', 'purchase_order'))
           OR EXISTS (SELECT 1 FROM public.document d WHERE d.media_id = p_media AND d.entity_type IN ('supplier', 'purchase_order'))
        UNION ALL
        SELECT 'supplier_terms'
        WHERE EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.media_id = p_media
              AND (d.type IN ('pi', 'commercial_invoice', 'po') OR (d.type = 'contract' AND d.entity_type = 'supplier'))
        )
    ) g;
$$;

CREATE OR REPLACE FUNCTION private.hidden_media_ids () RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT coalesce(array_agg(h.media_id), '{}'::UUID[])
    FROM (
        SELECT l.media_id
        FROM public.media_link l
        WHERE l.tenant_id = ANY (private.tenant_scope())
          AND l.entity_type IN ('supplier', 'purchase_order')
          AND NOT (l.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[]))
        UNION
        SELECT d.media_id
        FROM public.document d
        WHERE d.tenant_id = ANY (private.tenant_scope())
          AND d.media_id IS NOT NULL
          AND (
              (d.type IN ('pi', 'commercial_invoice', 'po') OR (d.type = 'contract' AND d.entity_type = 'supplier'))
                  AND NOT (d.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_terms'))::UUID[]))
              OR d.entity_type IN ('supplier', 'purchase_order')
                  AND NOT (d.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[]))
          )
    ) h;
$$;

REVOKE ALL ON FUNCTION private.hidden_media_ids () FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.field_group_readable (UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.media_restriction (UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.hidden_media_ids () TO authenticated;

DROP POLICY IF EXISTS document_field_groups ON public.document;
CREATE POLICY document_field_groups ON public.document AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    (
        (
            (type NOT IN ('pi', 'commercial_invoice', 'po') AND NOT (type = 'contract' AND entity_type = 'supplier'))
            OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_terms'))::UUID[])
        )
        AND (
            entity_type NOT IN ('supplier', 'purchase_order')
            OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[])
        )
    )
);

DROP POLICY IF EXISTS media_link_field_groups ON public.media_link;
CREATE POLICY media_link_field_groups ON public.media_link AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    entity_type NOT IN ('supplier', 'purchase_order')
    OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[])
);

DROP POLICY IF EXISTS media_field_groups ON public.media;
CREATE POLICY media_field_groups ON public.media AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT (id = ANY ((SELECT private.hidden_media_ids())::UUID[])));

-- 024's helper restated, with the new condition: the folder names a media id; its row (when there is
-- one) is in the path's tenant; and the caller reads, in that tenant, every field group that guards it.
-- It uses no session scope, so another active tenant or none gives no way round.
CREATE OR REPLACE FUNCTION private.can_read_media_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenant UUID := private.storage_tenant(object_name);
    folder UUID := private.storage_folder_id(object_name);
    row_tenant UUID;
    grp TEXT;
BEGIN
    IF tenant IS NULL OR folder IS NULL
       OR NOT (tenant = ANY (private.tenants_permitting(auth.uid(), ARRAY[tenant], 'public.media', 'select'))) THEN
        RETURN FALSE;
    END IF;
    SELECT m.tenant_id INTO row_tenant FROM public.media m WHERE m.id = folder;
    IF row_tenant IS NOT NULL AND row_tenant <> tenant THEN
        RETURN FALSE;
    END IF;
    FOREACH grp IN ARRAY private.media_restriction(folder) LOOP
        IF NOT private.field_group_readable(tenant, grp) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$;
