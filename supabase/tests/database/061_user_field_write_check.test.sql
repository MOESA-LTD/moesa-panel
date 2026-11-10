CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 061: public.can_write_user_field, the check the `user` Edge Function makes before it writes another
-- user's personal data with the service role. The caller's own fields are always writable; another
-- user's only with the field's write right in a tenant the user belongs to; an account not yet created
-- (p_user NULL) only where the right covers the whole request scope.
BEGIN;

SELECT plan(14);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

-- t_cost (Europe, held by elif) reads users' personal data; it gains the write right on e-mail only.
UPDATE public.role_field_permission SET can_write = TRUE
WHERE role_id = current_setting('test.t_cost')::UUID AND resource_name = 'public.user' AND field = 'email';

SELECT ok(NOT has_function_privilege('anon', 'public.can_write_user_field(uuid, text)', 'EXECUTE'), 'anon cannot call it');
SELECT ok(has_function_privilege('authenticated', 'public.can_write_user_field(uuid, text)', 'EXECUTE'), 'authenticated can');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.can_write_user_field(uuid, text)'::REGPROCEDURE),
   'api_owner', 'a definer owned by api_owner');

-- As elif in Europe.
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.europe')::UUID,
   ARRAY[current_setting('test.europe')::UUID]);
SELECT ok(public.can_write_user_field(current_setting('test.akif')::UUID, 'email'), 'a member of the tenant holding the write right');
SELECT ok(NOT public.can_write_user_field(current_setting('test.akif')::UUID, 'phone'), 'a read right is not a write right');
SELECT ok(NOT public.can_write_user_field(current_setting('test.koordinator')::UUID, 'email'), 'a user outside that tenant stays refused');
SELECT ok(public.can_write_user_field(current_setting('test.elif')::UUID, 'phone'), 'one always writes their own fields');
SELECT ok(public.can_write_user_field(NULL, 'email'), 'an invitation: the scope grants the right');
SELECT ok(NOT public.can_write_user_field(NULL, 'user_metadata'), 'an invitation: the scope does not grant the other field');
SELECT ok(NOT public.can_write_user_field(current_setting('test.akif')::UUID, 'no_such_field'), 'an unknown field is writable nowhere');

-- As koordinator in MOESA LTD (personal data of users is read-only for everyone).
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT ok(NOT public.can_write_user_field(current_setting('test.akif')::UUID, 'email'), 'a coordinator writes nobody else''s e-mail');
SELECT ok(NOT public.can_write_user_field(NULL, 'email'), 'nor invites with one');
SELECT ok(public.can_write_user_field(current_setting('test.koordinator')::UUID, 'email'), 'but their own');

-- Without a signed-in caller nothing is writable.
RESET ROLE;
SELECT private.unimpersonate();
SELECT ok(NOT public.can_write_user_field(current_setting('test.akif')::UUID, 'email'), 'no caller, no right');

SELECT * FROM finish();
ROLLBACK;
