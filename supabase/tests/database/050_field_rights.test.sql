CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Field rights (050): which tenants' values of a sensitive field a user may read or write, the
-- per-tenant answer over a mixed scope, personal data of other users (S5), save_role as the only
-- writer of role_field_permission (S7) and the grant ceiling (C1).
BEGIN;

SELECT plan(37);

-- The fixtures also set test.<key> for each id.
SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

-- C1: MOESA LTD's coordinator may edit roles here, but still writes no supplier terms.
INSERT INTO public.role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM public.role r
JOIN public.permission p ON p.resource_name IN ('public.role', 'public.role_permission', 'public.role_field_permission')
   AND p.command IN ('insert', 'update', 'delete')
WHERE r.tenant_id = current_setting('test.moesa')::UUID AND r.display_name = 'coordinator'
ON CONFLICT DO NOTHING;

SELECT set_config(CASE t.display_name WHEN 'MOESA LTD' THEN 'test.moesa_management' ELSE 'test.europe_management' END, r.id::TEXT, TRUE)
FROM public.role r JOIN public.tenant t ON t.id = r.tenant_id
WHERE r.display_name = 'management' AND t.display_name IN ('MOESA LTD', 'MOESA Europe');

-- As koordinator in MOESA LTD.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is(private.field_read_tenants('public.supplier','deposit_rate'), ARRAY[current_setting('test.moesa')::UUID], 'coordinator reads supplier terms');
SELECT is(private.field_write_tenants('public.supplier','deposit_rate'), '{}'::UUID[], 'coordinator cannot write supplier terms');
SELECT is(private.field_read_tenants('public.product','sku'), ARRAY[current_setting('test.moesa')::UUID], 'open fields pass with the scope');

-- As portal in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'portal has no cost');
SELECT is(private.field_read_tenants('public.product','company_price_eur'), ARRAY[current_setting('test.moesa')::UUID], 'portal reads sell price');

-- As baris (owner) in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT is(private.field_write_tenants('public.product','purchase_price'), ARRAY[current_setting('test.moesa')::UUID], 'an owner holds every field');

-- As elif: t_restricted in MOESA LTD (no field rows), t_cost in Europe.
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
   ARRAY[current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID]);
SELECT is(private.field_read_tenants('public.product','purchase_price'), ARRAY[current_setting('test.europe')::UUID], 'per tenant: cost only in Europe');
SELECT ok(NOT private.field_read_all('public.product','purchase_price'), 'field_read_all is false when one scope tenant lacks the right');
SELECT ok(private.field_read_all('public.product','sku'), 'field_read_all is true for open fields');
SELECT ok((private.field_rights_map() -> current_setting('test.europe')) ? 'product.purchase_price'
   AND NOT ((private.field_rights_map() -> current_setting('test.moesa')) ? 'product.purchase_price'), 'rights map is per tenant');
SELECT is(private.field_group_read_tenants('cost'), ARRAY[current_setting('test.europe')::UUID], 'group right = every field of the group');

-- t_cost grants the e-mail of users in Europe only; Europe is the active tenant.
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.europe')::UUID,
   ARRAY[current_setting('test.europe')::UUID, current_setting('test.moesa')::UUID]);
SELECT ok(current_setting('test.akif')::UUID = ANY (private.field_user_ids('email', FALSE)), 'S5: a member of the tenant holding the right is readable');
SELECT ok(NOT (current_setting('test.koordinator')::UUID = ANY (private.field_user_ids('email', FALSE))), 'S5: a user only in another scope tenant stays masked, although the active tenant grants the right');
SELECT ok(NOT (current_setting('test.akif')::UUID = ANY (private.field_user_ids('email', TRUE))), 'S5: a read right is not a write right');

RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
   ARRAY[current_setting('test.moesa')::UUID, current_setting('test.nova')::UUID]);
SELECT ok(NOT (current_setting('test.nova')::UUID = ANY (private.field_read_tenants('public.product','sku'))), 'a tenant the user may not use is dropped from the scope');

-- Revoked as postgres without request claims (the S7 bypass), then read again.
RESET ROLE;
SELECT private.unimpersonate();
DELETE FROM public.role_field_permission WHERE role_id = current_setting('test.t_cost')::UUID;
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.europe')::UUID, ARRAY[current_setting('test.europe')::UUID]);
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'a revoked right applies to the next statement');

-- As akif (management) in MOESA LTD. save_role in a scalar subquery: called once, not per row.
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM public.role_field_permission WHERE role_id = (SELECT public.save_role(jsonb_build_object('display_name','t_new','tenant_id',current_setting('test.moesa')), '{}'::UUID[]))),
   0, 'a new role starts from sensitive denied');
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.product","field":"notes","can_read":true,"can_write":false}]'::JSONB) $$, 'save_role syncs field rights');
SELECT results_eq($$ SELECT field, can_read, can_write FROM public.role_field_permission WHERE role_id = current_setting('test.t_restricted')::UUID $$,
   $$ VALUES ('notes', TRUE, FALSE) $$, '... to exactly the given rows');
SELECT throws_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
   VALUES (current_setting('test.t_restricted')::UUID, 'public.product', 'purchase_price', TRUE, TRUE) $$,
   '42501', 'role_field_permission_save_role_only', 'S7: no direct insert');
SELECT throws_ok($$ UPDATE public.role_field_permission SET can_write = TRUE WHERE role_id = current_setting('test.t_restricted')::UUID $$,
   '42501', 'role_field_permission_save_role_only', 'S7: no direct update');
SELECT throws_ok($$ DELETE FROM public.role_field_permission WHERE role_id = current_setting('test.t_restricted')::UUID $$,
   '42501', 'role_field_permission_save_role_only', 'S7: no direct delete');
SELECT lives_ok($$ DELETE FROM public.role WHERE display_name = 't_new' AND tenant_id = current_setting('test.moesa')::UUID $$,
   'deleting a role cascades its field rows (S7 lets the cascade through)');

-- As koordinator in MOESA LTD: may edit roles (granted above), holds no write on supplier terms.
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB) $$,
   '42501', 'field_grant_exceeds_own', 'C1: a grant beyond the caller''s own answers field_grant_exceeds_own');
SELECT ok(public.my_access(current_setting('test.moesa')::UUID) -> 'fields'
   @> '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'::JSONB, 'my_access lists field rights');

-- S7 with a hand-set flag: a right written directly must still be the caller's own (C1).
SELECT set_config('moesa.save_role', '1', TRUE);
SELECT throws_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
   VALUES (current_setting('test.t_restricted')::UUID, 'public.supplier', 'deposit_rate', TRUE, TRUE) $$,
   '42501', 'field_grant_exceeds_own', 'S7: a hand-set save_role flag grants nothing beyond the caller''s own');
SELECT lives_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
   VALUES (current_setting('test.t_restricted')::UUID, 'public.supplier', 'deposit_rate', TRUE, FALSE) $$,
   '... while a right the caller holds passes, as through save_role');
SELECT set_config('moesa.save_role', '', TRUE);

-- Only the rights a save adds are checked: the role holds a write the coordinator lacks (set by the
-- owner), and the coordinator renames it, keeps it, tries to add another, then removes it.
RESET ROLE;
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB);
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_renamed'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB) $$,
   'C1: a role carrying a right the editor lacks can still be saved unchanged');
SELECT results_eq($$ SELECT can_read, can_write FROM public.role_field_permission WHERE role_id = current_setting('test.t_restricted')::UUID AND field = 'deposit_rate' $$,
   $$ VALUES (TRUE, TRUE) $$, '... and the right is kept');
SELECT throws_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_renamed'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true},
     {"resource_name":"public.supplier","field":"payment_terms","can_read":true,"can_write":true}]'::JSONB) $$,
   '42501', 'field_grant_exceeds_own', 'C1: adding a right the editor lacks is still refused');
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', current_setting('test.t_restricted'), 'display_name', 't_renamed'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = current_setting('test.t_restricted')::UUID),
   '[]'::JSONB) $$, 'C1: removing a right the editor lacks succeeds');

-- Reading role_field_permission: only the rows of roles the caller can see.
SELECT is((SELECT count(*)::INT FROM public.role_field_permission WHERE role_id = current_setting('test.europe_management')::UUID),
   0, 'a user sees no field rights of a role in a tenant outside their scope');
SELECT ok((SELECT count(*) FROM public.role_field_permission WHERE role_id = current_setting('test.moesa_management')::UUID) > 0,
   '... and sees those of their own tenant''s roles');

-- As baris (owner) in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.tenant_id = (public.create_branch(current_setting('test.moesa')::UUID, '{"display_name":"t_branch"}'::JSONB)).id),
   0, 'a new branch seeds no field rows (its owner holds every field)');

-- user_role outlives a membership: a member who left keeps their roles' rows, which grant nothing.
RESET ROLE;
SELECT private.unimpersonate();
DELETE FROM public.tenant_user WHERE user_id = current_setting('test.koordinator')::UUID AND tenant_id = current_setting('test.moesa')::UUID;
SELECT is(private.field_tenants(current_setting('test.koordinator')::UUID, ARRAY[current_setting('test.moesa')::UUID], 'public.supplier', 'deposit_rate', FALSE),
   '{}'::UUID[], 'a role in a tenant the user has left grants no field right');

-- A change of a role's field rights is broadcast to its members, as one of its permissions.
SELECT is((SELECT array_agg(tgname::TEXT ORDER BY tgname) FROM pg_trigger
   WHERE tgrelid = 'public.role_field_permission'::REGCLASS AND tgfoid = 'private.notify_access_changed'::REGPROC),
   ARRAY['notify_access_delete', 'notify_access_insert', 'notify_access_update'], 'role_field_permission changes notify access');
SELECT ok(pg_get_functiondef('private.notify_access_changed'::REGPROC) LIKE '%IN (''role_permission'', ''role_field_permission'')%',
   'the members of a role are notified of a change of its field rights');

SELECT * FROM finish();
ROLLBACK;
