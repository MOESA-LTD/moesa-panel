-- Media library (M19): the photos, PDFs and videos a tenant keeps, each a row of public.media over
-- one file in the private `media` bucket. Later tasks link media to records (media_link) and to
-- documents.
--
-- media    One uploaded file and what describes it (title, alt text, tags, the customer it
--          concerns). Its file sits at <tenant_id>/<media id>/<file name>, and its thumbnail at
--          <tenant_id>/<media id>/thumb/thumb.webp (the thumb/ folder is reserved, so a user file is
--          never stored under it). The path is derived from (tenant_id, id) alone, so a copy into
--          another tenant (M21) is a new row with a new folder. No URL is kept: the files are
--          private and the app signs them. uploaded_by has no foreign key, like
--          document.created_by: the uploader need not be a member of the tenant (M21).
--
-- The bucket admits only PNG, JPEG, WebP, PDF and MP4 (no SVG: it can carry scripts), up to 50 MiB.
-- Each company sets its own, lower limit in the setting media_max_mb (default 25, clamped to
-- [1, 50] MB); a branch uses its company's (root tenant's) value, as private.management_gates does,
-- and public.media_max_bytes gives it to the app before an upload.
--
-- A file is uploaded first, then its row is written. private.media_check_file (SECURITY DEFINER,
-- so it filters on the row's tenant itself) requires the file in Storage and takes the type and
-- size from Storage's record, so the client cannot claim another; it then applies the type list
-- and the company's limit. A file is never replaced: its path, type, size and tenant are fixed,
-- and the thumbnail is only added once. A new file is a new row.
--
-- Storage policies, by the tenant the folder names: reading needs the media select right, uploading
-- the insert right and a media id folder. There is no update policy. A file is removed only when
-- no row of its folder's media remains (the row goes first; or the file is an orphan of a failed
-- upload).
--
-- Each rule is a violation whose message is the rule's code:
--   media_file_missing      (foreign_key_violation) the file or thumbnail is not in Storage
--   media_type_not_allowed  (check_violation) the file is not PNG, JPEG, WebP, PDF or MP4
--   media_too_large         (check_violation) the file is larger than the company's media_max_mb
--   media_file_immutable    (check_violation) the file, type, size, tenant or thumbnail changed

-- Settings: the upload limit, added to the defaults of new companies and given to the companies
-- that exist now.
CREATE OR REPLACE FUNCTION private.default_settings () RETURNS TABLE (key TEXT, value JSONB, description TEXT, source_question TEXT) LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    VALUES
        ('deposit_rate_default', '30'::JSONB, 'Default deposit rate on purchase orders (%)', NULL),
        ('safety_stock_days', '30'::JSONB, 'Safety stock added to the reorder point (days of sales)', NULL),
        ('document_request_days', '5'::JSONB, 'Time given to answer a document request (business days)', NULL),
        ('s1_customer_notify_hours', '4'::JSONB, 'Time to notify the customer of an S1 incident (hours)', NULL),
        ('spec_sheet_required_from', '"2026-12-31"'::JSONB, 'Date from which every purchase order needs an approved spec sheet', NULL),
        ('wip_limit_per_role', '5'::JSONB, 'Work in progress allowed per role', NULL),
        ('gate_evidence_blocking', 'true'::JSONB, 'Whether missing gate evidence blocks the gate (else a warning)', NULL),
        ('management_gates', '["G1"]'::JSONB, 'Gates that need management approval', NULL),
        ('media_max_mb', '25'::JSONB, 'Largest file a user may upload to the media library (MB)', NULL);
$$;

SELECT
   private.copy_default_settings (t.id)
FROM
   public.tenant t
WHERE
   t.parent_id IS NULL;

-- The largest upload in bytes for a tenant: its company's (root tenant's) media_max_mb, 25 when the
-- setting is missing or not a number, clamped to [1, 50] MB (the bucket's ceiling). SECURITY
-- DEFINER: the limit applies whether or not the caller may read the settings, and branches have no
-- setting rows of their own.
CREATE OR REPLACE FUNCTION private.media_max_bytes (tenant_id UUID) RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    WITH RECURSIVE chain AS (
        SELECT t.id, t.parent_id, 0 AS depth FROM public.tenant t WHERE t.id = media_max_bytes.tenant_id
        UNION ALL
        SELECT t.id, t.parent_id, c.depth + 1
        FROM public.tenant t
        JOIN chain c ON t.id = c.parent_id
        WHERE c.depth < 32
    )
    SELECT (least(greatest(coalesce(
        (SELECT (s.value #>> '{}')::NUMERIC
         FROM chain c
         JOIN public.setting s ON s.tenant_id = c.id AND s.key = 'media_max_mb'
         WHERE c.parent_id IS NULL AND jsonb_typeof(s.value) = 'number'),
        25), 1), 50) * 1048576)::BIGINT;
$$;

-- The same for the caller's active tenant, for the app to check a file before uploading it.
CREATE OR REPLACE FUNCTION public.media_max_bytes () RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT private.media_max_bytes(private.tenant_id());
$$;

-- The bucket: private (the app signs the URLs), the five types, and the 50 MiB ceiling of
-- config.toml's file_size_limit.
INSERT INTO
   storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
   (
      'media',
      'media',
      FALSE,
      52428800,
      -- No SVG: it can carry scripts.
      ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4']
   )
ON CONFLICT (id) DO UPDATE
SET
   public = EXCLUDED.public,
   file_size_limit = EXCLUDED.file_size_limit,
   allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The media an object's folder names (<tenant>/<media>/…), or NULL when it is not a media id.
CREATE OR REPLACE FUNCTION private.storage_folder_id (object_name TEXT) RETURNS UUID LANGUAGE plpgsql IMMUTABLE
SET
   search_path = '' AS $$
BEGIN
    RETURN nullif(split_part(object_name, '/', 2), '')::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;

-- Whether the signed-in user may read the media of the tenant whose folder holds `object_name`.
CREATE OR REPLACE FUNCTION private.can_read_media_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenant UUID := private.storage_tenant(object_name);
BEGIN
    RETURN tenant IS NOT NULL
       AND tenant = ANY (private.tenants_permitting(auth.uid(), ARRAY[tenant], 'public.media', 'select'));
END;
$$;

-- Whether the signed-in user may upload `object_name`: a media folder of a tenant where they may add
-- media.
CREATE OR REPLACE FUNCTION private.can_write_media_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
DECLARE
    tenant UUID := private.storage_tenant(object_name);
BEGIN
    RETURN tenant IS NOT NULL
       AND private.storage_folder_id(object_name) IS NOT NULL
       AND tenant = ANY (private.tenants_permitting(auth.uid(), ARRAY[tenant], 'public.media', 'insert'));
END;
$$;

-- Whether the signed-in user may remove `object_name`: they may upload there, and no media row of
-- that folder remains.
CREATE OR REPLACE FUNCTION private.can_delete_media_file (object_name TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET
   search_path = '' AS $$
BEGIN
    RETURN private.can_write_media_file(object_name)
       AND NOT EXISTS (
           SELECT 1 FROM public.media m
           WHERE m.id = private.storage_folder_id(object_name)
             AND m.tenant_id = private.storage_tenant(object_name)
       );
END;
$$;

CREATE TABLE IF NOT EXISTS public.media (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE,
   customer_id UUID,
   storage_path TEXT NOT NULL,
   thumbnail_path TEXT,
   file_name TEXT NOT NULL,
   mime_type TEXT NOT NULL,
   size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
   width INT CHECK (width > 0),
   height INT CHECK (height > 0),
   title TEXT,
   alt_text TEXT,
   tags TEXT[] NOT NULL DEFAULT '{}',
   uploaded_by UUID DEFAULT auth.uid (),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   -- Target of the tenant-scoped foreign keys of media_link and document.
   CONSTRAINT media_id_tenant_id_key UNIQUE (id, tenant_id),
   CONSTRAINT unique_media_path UNIQUE (tenant_id, storage_path),
   -- The file directly in the media's own folder (not under thumb/), the thumbnail at its fixed
   -- place. UUIDs hold no pattern characters.
   CONSTRAINT media_path_in_folder CHECK (
      storage_path ~ ('^' || tenant_id::TEXT || '/' || id::TEXT || '/[^/]+$')
      AND (thumbnail_path IS NULL OR thumbnail_path = tenant_id::TEXT || '/' || id::TEXT || '/thumb/thumb.webp')
   ),
   CONSTRAINT media_customer_fkey FOREIGN KEY (customer_id, tenant_id) REFERENCES public.customer (id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_media_customer ON public.media (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_media_created_at ON public.media (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_tags ON public.media USING GIN (tags);

CREATE OR REPLACE TRIGGER set_updated_at BEFORE
UPDATE ON public.media FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at ();

-- The file must be in Storage, under the media's tenant, and Storage's type and size are the
-- row's; a type outside the five, or a file over the company's limit, is refused. Once written,
-- the file stays: only a missing thumbnail may be added.
CREATE OR REPLACE FUNCTION private.media_check_file () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    meta JSONB;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
           OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
           OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR (OLD.thumbnail_path IS NOT NULL AND NEW.thumbnail_path IS DISTINCT FROM OLD.thumbnail_path) THEN
            RAISE EXCEPTION 'media_file_immutable' USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT o.metadata INTO meta
        FROM storage.objects o
        WHERE o.bucket_id = 'media'
          AND o.name = NEW.storage_path
          AND private.storage_tenant(o.name) = NEW.tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'media_file_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;

        NEW.mime_type := meta ->> 'mimetype';
        NEW.size_bytes := (meta ->> 'size')::BIGINT;

        IF NEW.mime_type IS NULL
           OR NEW.mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4') THEN
            RAISE EXCEPTION 'media_type_not_allowed' USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.size_bytes > private.media_max_bytes(NEW.tenant_id) THEN
            RAISE EXCEPTION 'media_too_large' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.thumbnail_path IS NOT NULL
       AND NEW.thumbnail_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.thumbnail_path END)
       AND NOT EXISTS (
           SELECT 1 FROM storage.objects o
           WHERE o.bucket_id = 'media'
             AND o.name = NEW.thumbnail_path
             AND private.storage_tenant(o.name) = NEW.tenant_id
       ) THEN
        RAISE EXCEPTION 'media_file_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER media_check_file BEFORE INSERT
OR
UPDATE ON public.media FOR EACH ROW
EXECUTE FUNCTION private.media_check_file ();

-- Storage policies of the bucket. No update policy: a file is never replaced.
DROP POLICY IF EXISTS media_select ON storage.objects;
CREATE POLICY media_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'media' AND private.can_read_media_file(name));

DROP POLICY IF EXISTS media_insert ON storage.objects;
CREATE POLICY media_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND private.can_write_media_file(name));

DROP POLICY IF EXISTS media_delete ON storage.objects;
CREATE POLICY media_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND private.can_delete_media_file(name));

REVOKE ALL ON FUNCTION private.media_max_bytes (UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.storage_folder_id (TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.can_read_media_file (TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.can_write_media_file (TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.can_delete_media_file (TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.media_check_file () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.media_max_bytes () FROM PUBLIC, anon;

-- The storage policies' helpers run as the caller (014_init_storage.sql).
GRANT EXECUTE ON FUNCTION private.storage_folder_id (TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION private.can_read_media_file (TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION private.can_write_media_file (TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION private.can_delete_media_file (TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.media_max_bytes () TO authenticated;

SELECT
   private.enable_tenant_level_security ('media');

SELECT
   private.audit_enable ('public.media'::REGCLASS);

-- Module row (as 015_ops_core.sql adds the others).
INSERT INTO
   public.module (id, is_core, position)
VALUES
   ('media', TRUE, 160)
ON CONFLICT (id) DO NOTHING;

-- Permissions. Inserting a permission creates its RLS policies (see private.manage_policies).
INSERT INTO
   public.permission (resource_name, group_name, command, kind, bypass, throws_error, resource_condition)
VALUES
   ('public.media', 'media', 'select', 'read', FALSE, FALSE, NULL),
   ('public.media', 'media', 'insert', 'create', FALSE, TRUE, NULL),
   ('public.media', 'media', 'update', 'modify', FALSE, TRUE, NULL),
   ('public.media', 'media', 'delete', 'modify', FALSE, TRUE, NULL)
ON CONFLICT ON CONSTRAINT unique_permission_resource_command DO NOTHING;

-- The built-in owner role has every permission (see 008_init_reference_data.sql).
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
   AND p.resource_name = 'public.media'
ON CONFLICT DO NOTHING;
