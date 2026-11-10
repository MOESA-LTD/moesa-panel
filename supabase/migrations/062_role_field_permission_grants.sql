-- 062: who may read the field rights of a role. Reading public.role_field_permission needs its own
-- permission (049 granted the four only to the owner role), so the roles that edit roles could not
-- see the field rights they edit. Every role holding a public.role_permission permission now holds the
-- matching one of public.role_field_permission (same command). A one-off backfill; seed.sql's
-- seed_roles/seed_ops_roles already grant it by the permission's `role` group.
INSERT INTO
   public.role_permission (role_id, permission_id)
SELECT DISTINCT
   rp.role_id,
   fp.id
FROM
   public.role_permission rp
   JOIN public.permission p ON p.id = rp.permission_id
   AND p.resource_name = 'public.role_permission'
   JOIN public.permission fp ON fp.resource_name = 'public.role_field_permission'
   AND fp.command = p.command
ON CONFLICT DO NOTHING;
