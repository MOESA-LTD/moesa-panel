-- The account area: each user's profile photo and the list of their memberships.
--
-- avatar          A public bucket of profile photos, one folder per user (<user id>/avatar.<ext>,
--                 ext png, jpg or webp). The app shows them through the public bucket URL, as it
--                 does tenant logos (014). Only the user writes their own folder: the policies
--                 compare the folder with auth.uid(), so a photo cannot be planted for another
--                 user. The SELECT policy is for the owner alone (Storage needs it for upsert and
--                 remove), so no one lists another user's folder; there is no anon policy. The
--                 types and size are those of tenant logos (PNG, JPEG, WebP, no SVG: it can carry
--                 scripts; up to 1 MiB), enforced by the Storage API.
--
-- my_memberships  The caller's tenant roles by name, one row per tenant. my_access gives the
--                 tenants, ownership (owned) and permissions, but no role names, and public.role is
--                 readable only with the `role` read permission (008), which a member's role may
--                 lack. This SECURITY DEFINER function returns only the caller's own rows. The
--                 built-in owner role (tenant_id NULL) is left out: ownership comes from my_access.
INSERT INTO
   storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
   (
      'avatar',
      'avatar',
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

-- Reading goes through the public URL; listing, replacing and removing are the owner's alone.
DROP POLICY IF EXISTS avatar_select ON storage.objects;
CREATE POLICY avatar_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

DROP POLICY IF EXISTS avatar_insert ON storage.objects;
CREATE POLICY avatar_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

DROP POLICY IF EXISTS avatar_update ON storage.objects;
CREATE POLICY avatar_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT)
WITH CHECK (bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

DROP POLICY IF EXISTS avatar_delete ON storage.objects;
CREATE POLICY avatar_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT);

-- The caller's roles in each tenant where they hold one, by display name.
CREATE OR REPLACE FUNCTION public.my_memberships () RETURNS TABLE (tenant_id UUID, roles TEXT[]) LANGUAGE sql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
    SELECT r.tenant_id, array_agg(r.display_name ORDER BY r.display_name)
    FROM public.user_role ur
    JOIN public.role r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.tenant_id IS NOT NULL
    GROUP BY r.tenant_id;
$$;

REVOKE ALL ON FUNCTION public.my_memberships () FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_memberships () TO authenticated;
