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
-- private.hidden_media_ids() reads document and media_link, which these very policies filter. A reader
-- subject to them would never see the rows to hide, so it is owned by file_rule_owner (NOLOGIN, not
-- BYPASSRLS, a member of authenticated, so the permission policies still apply to the caller's rows)
-- and the two policies on those tables let that one role through. It is not api_owner: api_owner owns
-- the api views, and exempting it would lift the rule for every api read. No definer here is postgres.
-- The function is STABLE and called as (SELECT ...), an InitPlan: once per query, never per row (R10).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'file_rule_owner') THEN
        CREATE ROLE file_rule_owner NOLOGIN NOBYPASSRLS;
    END IF;
END;
$$;

GRANT authenticated TO file_rule_owner;

GRANT file_rule_owner TO postgres;

GRANT USAGE ON SCHEMA private TO file_rule_owner;

GRANT SELECT ON public.document, public.media_link TO file_rule_owner;

CREATE OR REPLACE FUNCTION private.hidden_media_ids () RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT coalesce(array_agg(h.media_id), '{}'::UUID[])
    FROM (
        SELECT l.media_id
        FROM public.media_link l
        WHERE l.entity_type IN ('supplier', 'purchase_order')
          AND NOT (l.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[]))
        UNION
        SELECT d.media_id
        FROM public.document d
        WHERE d.media_id IS NOT NULL
          AND (
              (d.type IN ('pi', 'commercial_invoice', 'po') OR (d.type = 'contract' AND d.entity_type = 'supplier'))
                  AND NOT (d.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_terms'))::UUID[]))
              OR d.entity_type IN ('supplier', 'purchase_order')
                  AND NOT (d.tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[]))
          )
    ) h;
$$;

-- Owner file_rule_owner needs CREATE on the schema, as in 053/058; taken away at once.
GRANT CREATE ON SCHEMA private TO file_rule_owner;

ALTER FUNCTION private.hidden_media_ids () OWNER TO file_rule_owner;

REVOKE CREATE ON SCHEMA private FROM file_rule_owner;

REVOKE ALL ON FUNCTION private.hidden_media_ids () FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.hidden_media_ids () TO authenticated;

DROP POLICY IF EXISTS document_field_groups ON public.document;
CREATE POLICY document_field_groups ON public.document AS RESTRICTIVE FOR SELECT TO authenticated
USING (
    current_user = 'file_rule_owner'
    OR (
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
    current_user = 'file_rule_owner'
    OR entity_type NOT IN ('supplier', 'purchase_order')
    OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))::UUID[])
);

DROP POLICY IF EXISTS media_field_groups ON public.media;
CREATE POLICY media_field_groups ON public.media AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT (id = ANY ((SELECT private.hidden_media_ids())::UUID[])));

-- 024's helper restated, with the new condition: the folder names a media id that is not hidden.
CREATE OR REPLACE FUNCTION private.can_read_media_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenant UUID := private.storage_tenant(object_name);
    folder UUID := private.storage_folder_id(object_name);
BEGIN
    RETURN tenant IS NOT NULL
       AND folder IS NOT NULL
       AND tenant = ANY (private.tenants_permitting(auth.uid(), ARRAY[tenant], 'public.media', 'select'))
       AND NOT (folder = ANY (private.hidden_media_ids()));
END;
$$;
