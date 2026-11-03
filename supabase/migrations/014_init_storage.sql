-- Tenant logos: public (the app shows them without signing their URLs), one folder per tenant
-- (<tenant id>/<file>). Only users who may change the tenant (its `update` permission, where the
-- plan allows writing) put files in its folder, so a logo cannot be planted for another tenant.
INSERT INTO
   storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
   (
      'tenant-logo',
      'tenant-logo',
      TRUE,
      1048576,
      -- No SVG: it can carry scripts.
      ARRAY['image/png', 'image/jpeg', 'image/webp']
   )
ON CONFLICT (id) DO UPDATE
SET
   public = EXCLUDED.public,
   file_size_limit = EXCLUDED.file_size_limit,
   allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The tenant an object's folder names, or NULL when the folder is not a tenant id.
CREATE OR REPLACE FUNCTION private.storage_tenant (object_name TEXT) RETURNS UUID LANGUAGE plpgsql IMMUTABLE
SET
   search_path = '' AS $$
BEGIN
    RETURN split_part(object_name, '/', 1)::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

-- Whether the signed-in user may change the tenant whose folder holds `object_name`.
CREATE OR REPLACE FUNCTION private.can_write_tenant_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenant UUID := private.storage_tenant(object_name);
BEGIN
    RETURN tenant IS NOT NULL
       AND tenant = ANY (private.tenants_permitting(auth.uid(), ARRAY[tenant], 'public.tenant', 'update'));
END;
$$;

REVOKE ALL ON FUNCTION private.storage_tenant (TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_write_tenant_file (TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.storage_tenant (TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_write_tenant_file (TEXT) TO authenticated;

-- Reading goes through the public URL; listing, replacing and removing need the write right.
DROP POLICY IF EXISTS tenant_logo_select ON storage.objects;
CREATE POLICY tenant_logo_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'tenant-logo' AND private.can_write_tenant_file(name));

DROP POLICY IF EXISTS tenant_logo_insert ON storage.objects;
CREATE POLICY tenant_logo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tenant-logo' AND private.can_write_tenant_file(name));

DROP POLICY IF EXISTS tenant_logo_update ON storage.objects;
CREATE POLICY tenant_logo_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tenant-logo' AND private.can_write_tenant_file(name))
WITH CHECK (bucket_id = 'tenant-logo' AND private.can_write_tenant_file(name));

DROP POLICY IF EXISTS tenant_logo_delete ON storage.objects;
CREATE POLICY tenant_logo_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'tenant-logo' AND private.can_write_tenant_file(name));
