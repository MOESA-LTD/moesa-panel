-- Media permissions for the roles that exist (M19). 024 and 025 gave the media group to the
-- built-in owner role only, and private.seed_ops_roles gives it to the demo company's roles; the
-- roles a company made itself had none, so nobody but an owner could upload, link or read files.
--
-- A role that may change products (public.product update) works with their files: it gets every
-- permission of the media group (public.media and public.media_link). Deleting a file stays
-- management's (spec M19): public.media delete only goes to a role that may also change the
-- company and its branches (public.tenant update). Roles made later are given media in the role
-- editor like any other module.
--
-- private.grant_media_permissions does the grant; it only adds rows (ON CONFLICT DO NOTHING), so
-- running it again changes nothing.
--
-- Deleted branches and their files: delete_branch (012) removes the tenant, and with it the media
-- rows and links (ON DELETE CASCADE), but not the Storage objects under the branch's folder
-- (<branch id>/...). No user may remove them afterwards: the delete policy needs the media
-- delete right in the folder's tenant, which no longer exists. They need a service-role cleanup
-- (e.g. a job listing the media bucket's top-level folders that name no tenant).

CREATE OR REPLACE FUNCTION private.grant_media_permissions () RETURNS VOID LANGUAGE sql
SET
   search_path = '' AS $$
    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.role r
    JOIN public.permission p ON p.group_name = 'media'
    WHERE EXISTS (
            SELECT 1
            FROM public.role_permission rp
            JOIN public.permission held ON held.id = rp.permission_id
            WHERE rp.role_id = r.id AND held.resource_name = 'public.product' AND held.command = 'update'
        )
      AND (
            NOT (p.resource_name = 'public.media' AND p.command = 'delete')
            OR EXISTS (
                SELECT 1
                FROM public.role_permission rp
                JOIN public.permission held ON held.id = rp.permission_id
                WHERE rp.role_id = r.id AND held.resource_name = 'public.tenant' AND held.command = 'update'
            )
        )
    ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION private.grant_media_permissions () FROM PUBLIC, anon, authenticated;

SELECT
   private.grant_media_permissions ();
