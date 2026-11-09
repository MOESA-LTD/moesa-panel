CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 058: the derived api views (masked through the api views they read), the write RPCs as api_owner
-- definers that check field write rights before writing (R8, S1), RPCs returning api row types (C2,
-- S6) and the catalog-driven transfer gate (S3).
BEGIN;

SELECT plan(21);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

-- t_no_notes (MOESA LTD and MOESA Europe): management's permissions and field defaults, without the
-- internal notes. can (seed: auditor of Atlas Danışmanlık) joins both tenants with it.
DO $$
DECLARE
    can UUID := (SELECT id FROM public.user WHERE email = 'can@moesa-panel.test');
    t RECORD;
    r UUID;
BEGIN
    PERFORM set_config('moesa.rules_bypass', '1', TRUE);
    FOR t IN SELECT id FROM public.tenant WHERE display_name IN ('MOESA LTD', 'MOESA Europe') LOOP
        INSERT INTO public.role (tenant_id, display_name) VALUES (t.id, 't_no_notes') RETURNING id INTO r;
        INSERT INTO public.role_permission (role_id, permission_id)
        SELECT r, rp.permission_id
        FROM public.role_permission rp JOIN public.role m ON m.id = rp.role_id
        WHERE m.tenant_id = t.id AND m.display_name = 'management'
        ON CONFLICT DO NOTHING;
        PERFORM private.apply_field_defaults(r, 'management');
        DELETE FROM public.role_field_permission rfp
        USING public.field_class f
        WHERE rfp.role_id = r AND f.resource_name = rfp.resource_name AND f.field = rfp.field AND f.group_name = 'internal_note';
        INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (t.id, can) ON CONFLICT DO NOTHING;
        INSERT INTO public.user_role (user_id, role_id) VALUES (can, r);
    END LOOP;
    PERFORM set_config('moesa.rules_bypass', '', TRUE);
    PERFORM set_config('test.can', can::TEXT, TRUE);
END;
$$;

SELECT is_empty($$ SELECT viewname FROM pg_views WHERE schemaname = 'api' AND definition ~ '\.\*' $$, 'no api view selects t.*');
SELECT is_empty($$ SELECT DISTINCT v.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class v ON v.oid = r.ev_class
   JOIN pg_class t ON t.oid = d.refobjid WHERE v.relnamespace = 'api'::regnamespace
   AND v.relname NOT IN (SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p'))
   AND t.relnamespace = 'public'::regnamespace AND t.relkind IN ('r','p') $$, 'derived api views read only api relations');

-- As elif in MOESA LTD (t_restricted: no field rows).
RESET ROLE;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT results_eq($$ SELECT purchase_price, notes FROM api.product_with_evidence WHERE id = current_setting('test.secret')::UUID $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T8b product_with_evidence is masked');
SELECT results_eq($$ SELECT system_total, supplier_code, pi_total FROM api.purchase_order_overview WHERE id = current_setting('test.po_approved')::UUID $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC) $$, 'PO overview totals follow cost');
SELECT is((SELECT count(*)::INT FROM api.dashboard_purchase_order WHERE system_total IS NOT NULL OR supplier_code IS NOT NULL), 0, 'dashboard PO masked');
SELECT is((SELECT count(*)::INT FROM api.market_cell_overview WHERE notes IS NOT NULL), 0, 'market cell overview masked');
SELECT is((SELECT count(*)::INT FROM api.incident_overview WHERE root_cause_note IS NOT NULL), 0, 'incident overview masked');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"IMP-1","customer_code":"THO","purchase_price":5}]'::JSONB) $$,
   '42501', 'field_write_forbidden', 'import refuses columns the writer cannot write');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"IMP-2","customer_code":"THO","supplier_code":"TS1"}]'::JSONB) $$,
   '42501', 'field_write_forbidden', 'import refuses a supplier link the writer cannot write');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"SPIKE-SECRET","customer_code":"THO","purchase_price":12.5}]'::JSONB) $$,
   '42501', 'field_write_forbidden', 'S1: import refuses a cost the writer cannot write, even a correct guess');
SELECT throws_ok($$ SELECT public.pass_gate(current_setting('test.gate')::UUID, 'gate secret') $$,
   '42501', 'field_write_forbidden', 'S1: pass_gate refuses a note the caller cannot write, even a correct guess');

-- As portal in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.shipment_overview WHERE cardinality(purchase_order_codes) > 0), 0, 'shipment overview reveals no PO to the portal');
SELECT is((SELECT count(*)::INT FROM api.tenant_member WHERE email IS NOT NULL AND id <> current_setting('test.portal')::UUID), 0,
   'tenant_member masks colleagues'' personal data for portal');

-- As postgres.
RESET ROLE;
SELECT private.unimpersonate();
SELECT is((SELECT count(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef AND pg_get_userbyid(proowner) = 'api_owner'
   AND proname IN ('import_products','save_role','set_user_roles','pass_gate','rollback_gate','save_plan','set_primary_media')), 7,
   'R8: the seven write RPCs are api_owner definers');
SELECT results_eq($$ SELECT p.proname::TEXT COLLATE "default", pg_get_function_result(p.oid) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('pass_gate','rollback_gate','set_primary_media','transfer_check_files') ORDER BY 1 $$,
   $$ VALUES ('pass_gate','api.project_gate'),('rollback_gate','api.project_gate'),('set_primary_media','api.media_link'),('transfer_check_files','api.transfer') $$,
   'C2: converted RPCs return api row types');
SELECT is_empty($$ SELECT p.proname FROM pg_proc p JOIN pg_type ty ON ty.oid = p.prorettype JOIN pg_class c ON c.oid = ty.typrelid
   WHERE p.pronamespace = 'public'::regnamespace AND c.relnamespace = 'public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
   AND EXISTS (SELECT 1 FROM public.field_class f WHERE f.resource_name = 'public.' || c.relname AND f.class = 'sensitive') $$,
   'no public function granted to authenticated returns a sensitive row type');
SELECT ok(NOT has_function_privilege('authenticated', 'public.listing_set_state(uuid, public.listing_state, jsonb, timestamptz, uuid)', 'EXECUTE'),
   'listing service RPCs stay service-only');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

-- As can in MOESA LTD (t_no_notes).
SELECT private.impersonate(current_setting('test.can')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ SELECT public.transfer_options(current_setting('test.moesa')::UUID) $$,
   '42501', 'transfer_field_rights_required', 'S3: transfer needs every field of every copied table, incl. internal notes');

-- As akif in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok($$ SELECT public.transfer_options(current_setting('test.moesa')::UUID) $$, 'the transfer gate passes with every field right');

-- save_role runs as api_owner: field rights save without authenticated's USAGE on schema private.
RESET ROLE;
REVOKE USAGE ON SCHEMA private FROM authenticated;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('display_name', 't_usage', 'tenant_id', current_setting('test.moesa')), '{}'::UUID[],
   '[{"resource_name":"public.product","field":"notes","can_read":true,"can_write":false}]'::JSONB) $$,
   'save_role with field rights works without USAGE on private');

SELECT * FROM finish();
ROLLBACK;
