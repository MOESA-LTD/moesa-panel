CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Base-table write guard (051): a sensitive field is written only by a user holding the write right
-- in the row's tenant (R5), whatever path the write takes; a row never moves tenant (S8); system
-- paths without a user request bypass the guard (S2).
BEGIN;

SELECT plan(19);

-- The fixtures also set test.<key> for each id.
SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

-- R5: a SECURITY DEFINER function owned by postgres (bypasses RLS) writing supplier terms.
CREATE FUNCTION t.supplier_deposit_writer () RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    UPDATE public.supplier SET deposit_rate = 0.5 WHERE id = current_setting('test.tsp')::UUID;
END;
$$;
GRANT EXECUTE ON FUNCTION t.supplier_deposit_writer () TO authenticated;

-- As koordinator in MOESA LTD (coordinator: supplier terms and contract read-only).
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.5 WHERE id = current_setting('test.tsp')::UUID $$,
   '42501', 'field_write_forbidden', 'T4: coordinator cannot write supplier terms');
SELECT lives_ok($$ UPDATE public.supplier SET city = 'Ningbo' WHERE id = current_setting('test.tsp')::UUID $$,
   'T4c: open fields stay writable');
SELECT throws_ok($$ INSERT INTO public.customer (tenant_id, code, display_name, commercial_model, deposit_rate)
   VALUES (current_setting('test.moesa')::UUID, 'TS9', 'x', 'trading_partner', 0.3) $$,
   '42501', 'field_write_forbidden', 'T5: insert with a field the writer cannot write');
SELECT is(t.error_detail($$ UPDATE public.supplier SET deposit_rate = 0.42 WHERE id = current_setting('test.tsp')::UUID $$),
   'supplier.deposit_rate', 'the error names the field only');
SELECT throws_ok($$ SELECT t.supplier_deposit_writer() $$,
   '42501', 'field_write_forbidden', 'R5: a postgres-owned definer is guarded by the request identity');

-- As elif in MOESA LTD (t_restricted: no field rows).
RESET ROLE;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok($$ INSERT INTO public.incident (tenant_id, customer_id, family, severity, title, what_happened)
   VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'ol', 's3', 'guard test', 'x') $$,
   'a NOT NULL constant default (affected_parties {}) is not a write');
SELECT lives_ok($$ UPDATE public.purchase_order_line SET quantity = 11 WHERE id = current_setting('test.line_draft')::UUID $$,
   'a generated cost column (line_total) is not a write');

-- As akif in MOESA LTD (management: personal_data on user is read-only).
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE public.user SET phone = '+1' WHERE id = current_setting('test.koordinator')::UUID $$,
   '42501', 'field_write_forbidden', 'nobody else writes a user''s phone');
SELECT lives_ok($$ UPDATE public.user SET phone = '+90 1' WHERE id = current_setting('test.akif')::UUID $$,
   'a user writes their own phone (self)');

-- As elif over MOESA LTD and Europe (product and customer_brand update in both tenants).
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
   ARRAY[current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID]);
SELECT throws_ok($$ UPDATE public.product SET tenant_id = current_setting('test.europe')::UUID, customer_id = current_setting('test.euc')::UUID
   WHERE id = current_setting('test.secret')::UUID $$,
   '42501', 'tenant_move_forbidden', 'S8: a row cannot move tenant through the API');
SELECT throws_ok($$ UPDATE public.customer_brand SET tenant_id = current_setting('test.europe')::UUID WHERE id = current_setting('test.brand')::UUID $$,
   '42501', 'tenant_move_forbidden', 'S8: also on tables without sensitive fields');

-- S2, one test per path.
RESET ROLE;
SELECT private.unimpersonate();
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.31 WHERE id = current_setting('test.tsp')::UUID $$,
   'S2 RESET ROLE: postgres, role none, no claims bypasses (migrations, seed)');
SELECT lives_ok((SELECT command FROM cron.job WHERE jobname = 'audit-maintenance'),
   'S2 pg_cron: a job command runs under the bypass');
SELECT lives_ok($$ UPDATE auth.users SET phone = '+90 555 0000' WHERE id = current_setting('test.akif')::UUID $$,
   'S2 GoTrue: handle_update_user writes public.user without claims');
SELECT ok(pg_get_functiondef('private.field_guard_bypassed()'::REGPROCEDURE) LIKE '%session_user IN (''postgres'', ''supabase_admin'', ''supabase_auth_admin'')%',
   'S2: the no-request bypass is limited to those session users');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.32 WHERE id = current_setting('test.tsp')::UUID $$,
   'S2 service: DB role and JWT role service_role bypass');

-- As koordinator, with only the claim spoofed to service_role.
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.koordinator'), 'role', 'service_role')::TEXT, TRUE);
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.33 WHERE id = current_setting('test.tsp')::UUID $$,
   '42501', 'field_write_forbidden', 'S2: a service_role claim without the service DB role is refused');

-- As koordinator, the service DB role with the user's claims.
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SET LOCAL ROLE service_role;
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.34 WHERE id = current_setting('test.tsp')::UUID $$,
   '42501', 'field_write_forbidden', 'S2: the service DB role with a user claim is refused');

-- As koordinator, claims kept but no role switch (as the story seed does).
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('role', 'none', TRUE);
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.35 WHERE id = current_setting('test.tsp')::UUID $$,
   '42501', 'field_write_forbidden', 'S2: claims without a role switch still apply the guard');

SELECT * FROM finish();
ROLLBACK;
