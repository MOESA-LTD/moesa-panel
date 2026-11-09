CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 059: masked audit history (OD4, R9), masked transfer reports (S4), the actor/reverter embeds over
-- api.user and the revert refused when a changed field is not writable (C3, R8).
BEGIN;

SELECT plan(27);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
-- Test support only, revoked from everyone; this transaction lets the impersonated user call it.
GRANT EXECUTE ON FUNCTION private.field_calls_only_in_initplans (TEXT) TO authenticated;

-- Three product changes by akif, each its own audit transaction: cost and notes in MOESA LTD, the
-- name in MOESA LTD, cost in MOESA Europe.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('audit.transaction_id', '', TRUE);
UPDATE api.product SET purchase_price = 13, notes = 'secret note 2' WHERE id = current_setting('test.secret')::UUID;
SELECT set_config('audit.transaction_id', '', TRUE);
UPDATE api.product SET display_name = 'Renamed' WHERE id = current_setting('test.secret')::UUID;
-- A field right granted in MOESA LTD as save_role writes it (its helper runs as postgres with akif's
-- claims, sets its flag, and grants a right akif holds): its revert must be refused by the S7 trigger,
-- never applied in part.
RESET ROLE;
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT set_config('moesa.save_role', '1', TRUE);
INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
VALUES (current_setting('test.t_restricted')::UUID, 'public.supplier', 'notes', TRUE, FALSE);
SELECT set_config('moesa.save_role', '', TRUE);
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID, ARRAY[current_setting('test.europe')::UUID]);
SELECT set_config('audit.transaction_id', '', TRUE);
UPDATE api.product SET purchase_price = 78 WHERE id = current_setting('test.spike_eu')::UUID;
RESET ROLE;
SELECT private.unimpersonate();
SELECT set_config('audit.transaction_id', '', TRUE);
-- Writes authenticated is not granted through api, made by postgres (no request): a setting's key, a
-- gate's position, and a listing submission created then deleted.
UPDATE public.setting SET key = 'renamed_key' WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'deposit_rate_default';
SELECT set_config('audit.transaction_id', '', TRUE);
UPDATE public.project_gate SET position = position + 100 WHERE id = current_setting('test.gate')::UUID;
SELECT set_config('audit.transaction_id', '', TRUE);
INSERT INTO public.listing_submission (tenant_id, cell_id, kind, sku, marketplace_id, payload)
VALUES (current_setting('test.moesa')::UUID, current_setting('test.live_cell')::UUID, 'create', 'LS-T12', 'A1PA6795UKMFR9', '{}');
SELECT set_config('audit.transaction_id', '', TRUE);
DELETE FROM public.listing_submission WHERE sku = 'LS-T12';
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT set_config('test.akif_name', (SELECT user_metadata ->> 'display_name' FROM public.user WHERE id = current_setting('test.akif')::UUID), TRUE);
SELECT set_config('test.tx_setting', (SELECT l.transaction_id FROM public.audit_log l WHERE l.table_name = 'setting' AND l.old_data ? 'key' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);
SELECT set_config('test.tx_gate', (SELECT l.transaction_id FROM public.audit_log l WHERE l.table_name = 'project_gate' AND l.old_data ? 'position' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);
SELECT set_config('test.tx_ls', (SELECT l.transaction_id FROM public.audit_log l WHERE l.table_name = 'listing_submission' AND l.operation = 'DELETE' AND l.old_data ->> 'sku' = 'LS-T12' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);

SELECT set_config('test.tx_cost', (SELECT l.transaction_id FROM public.audit_log l WHERE l.record_id = current_setting('test.secret')::UUID AND l.old_data ? 'purchase_price' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);
SELECT set_config('test.tx_name', (SELECT l.transaction_id FROM public.audit_log l WHERE l.record_id = current_setting('test.secret')::UUID AND l.old_data ? 'display_name' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);
SELECT set_config('test.tx_eu', (SELECT l.transaction_id FROM public.audit_log l WHERE l.record_id = current_setting('test.spike_eu')::UUID AND l.old_data ? 'purchase_price' ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);
SELECT set_config('test.tx_rfp', (SELECT l.transaction_id FROM public.audit_log l WHERE l.table_name = 'role_field_permission' AND l.new_data ->> 'role_id' = current_setting('test.t_restricted') ORDER BY l.id DESC LIMIT 1)::TEXT, TRUE);

-- MOESA LTD's customer_viewer reads the audit trail; t_restricted reads users (for the actor tests).
DO $$
BEGIN
    PERFORM set_config('moesa.rules_bypass', '1', TRUE);
    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT r.id, p.id FROM public.role r, public.permission p
    WHERE r.tenant_id = current_setting('test.moesa')::UUID AND r.display_name = 'customer_viewer' AND p.resource_name = 'public.audit_log'
    ON CONFLICT DO NOTHING;
    -- t_restricted sees its colleagues (no personal data of users: no field rows).
    INSERT INTO public.role_permission (role_id, permission_id)
    SELECT current_setting('test.t_restricted')::UUID, p.id FROM public.permission p WHERE p.resource_name = 'public.user' AND p.command = 'select'
    ON CONFLICT DO NOTHING;
    PERFORM set_config('moesa.rules_bypass', '', TRUE);
END;
$$;

-- As elif in MOESA LTD (t_restricted: audit read, no field rows).
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT new_data -> 'purchase_price' FROM api.audit_log WHERE transaction_id = current_setting('test.tx_cost')::UUID), '{"masked": true}'::JSONB,
   'OD4: a hidden field shows as changed, without the value');
SELECT is((SELECT old_data -> 'notes' FROM api.audit_log WHERE transaction_id = current_setting('test.tx_cost')::UUID), '{"masked": true}'::JSONB,
   'OD4: the old value is masked too');
SELECT is((SELECT new_data ->> 'sku' FROM api.audit_log WHERE transaction_id = current_setting('test.tx_name')::UUID), 'SPIKE-SECRET', 'open keys pass');
SELECT is((SELECT count(*)::INT FROM api.audit_log WHERE (new_data ->> 'purchase_price') LIKE '13%'), 0, 'T10 audit filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.dashboard_notification_feed WHERE new_data ->> 'notes' LIKE 'secret%'), 0, 'notification feed masked');
SELECT results_eq($$ SELECT a.id, a.email FROM api.audit_transaction t, api.actor(t) a WHERE t.id = current_setting('test.tx_cost')::UUID $$,
   $$ VALUES (current_setting('test.akif')::UUID, NULL::TEXT) $$, 'R9: the actor is embedded, with the e-mail masked');
SELECT results_eq($$ SELECT api.display_name(a), a.email, a.user_metadata FROM api.audit_transaction t, api.actor(t) a WHERE t.id = current_setting('test.tx_cost')::UUID $$,
   $$ VALUES (current_setting('test.akif_name'), NULL::TEXT, NULL::JSONB) $$, 'R9: the actor''s display name, without the e-mail or the rest of user_metadata');
SELECT is((SELECT user_name FROM api.dashboard_notification_feed WHERE id = current_setting('test.tx_cost')::UUID), current_setting('test.akif_name'),
   'R9: the feed shows the actor''s display name');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_name')::UUID) $$, 'C3: reverting an open-field change works for a restricted user');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_cost')::UUID) $$, '42501', 'audit_revert_field_forbidden',
   'revert refused when a changed field is not writable');

-- As elif across MOESA LTD and MOESA Europe (t_cost reads cost in Europe only).
RESET ROLE;
SELECT private.impersonate_scope(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID,
   ARRAY[current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID]);
SELECT ok((SELECT new_data -> 'purchase_price' <> '{"masked": true}'::JSONB FROM api.audit_log WHERE transaction_id = current_setting('test.tx_eu')::UUID)
   AND (SELECT new_data -> 'purchase_price' = '{"masked": true}'::JSONB FROM api.audit_log WHERE transaction_id = current_setting('test.tx_cost')::UUID),
   'audit keys masked per row tenant');

-- As portal in MOESA LTD (customer_viewer: no personal data of users).
RESET ROLE;
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT a.email FROM api.audit_transaction t, api.actor(t) a WHERE t.id = current_setting('test.tx_cost')::UUID), NULL,
   'R9: actor e-mail masked for a reader without personal_data');

-- As koordinator in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT a.email FROM api.audit_transaction t, api.actor(t) a WHERE t.id = current_setting('test.tx_cost')::UUID), 'akif@moesa-panel.test',
   'R9: internal readers see the actor');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.audit_log ORDER BY id DESC LIMIT 50'), 'R9: the rights map is an InitPlan');

-- As akif in MOESA LTD: a revert of a field-right change is refused by the S7 trigger, not applied in part.
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_rfp')::UUID) $$, '42501', 'audit_revert_field_forbidden',
   'a revert touching role_field_permission (read-only api view; S7 behind it) is refused whole, never partial');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_setting')::UUID) $$, '42501', 'audit_revert_field_forbidden',
   'revert refused: setting.key has no UPDATE grant on api.setting');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_gate')::UUID) $$, '42501', 'audit_revert_field_forbidden',
   'revert refused: project_gate.position has no UPDATE grant on api.project_gate');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(current_setting('test.tx_ls')::UUID) $$, '42501', 'audit_revert_field_forbidden',
   'revert of a listing_submission DELETE refused: no INSERT grant on api.listing_submission');
SELECT is(t.peek('setting', 'key', (SELECT id FROM api.setting WHERE key = 'renamed_key' AND tenant_id = current_setting('test.moesa')::UUID)), 'renamed_key',
   'nothing was written back');

-- As postgres: the pure functions and the catalog.
RESET ROLE;
SELECT private.unimpersonate();
SELECT is(private.mask_audit_data('product', NULL, '{"sku":"A","purchase_price":1}'::JSONB, '{}'::JSONB, private.sensitive_fields_map()),
   '{"sku":"A","purchase_price":{"masked":true}}'::JSONB, 'a NULL tenant masks every sensitive key (fail closed)');
SELECT is(private.mask_json_deep('{"rows":[{"table":"product","row":{"sku":"A","purchase_price":5}}]}'::JSONB, current_setting('test.moesa')::UUID, '{}'::JSONB, private.sensitive_fields_map()),
   '{"rows":[{"table":"product","row":{"sku":"A","purchase_price":{"masked":true}}}]}'::JSONB, 'S4: nested sensitive keys in a JSON report are masked');
SELECT is(private.mask_audit_data('transfer', current_setting('test.moesa')::UUID, '{"report":{"row":{"purchase_price":5}}}'::JSONB, '{}'::JSONB, private.sensitive_fields_map()),
   '{"report":{"row":{"purchase_price":{"masked":true}}}}'::JSONB, 'S4: audit snapshots of transfer rows mask the report');
SELECT ok(pg_get_viewdef('api.transfer'::REGCLASS) LIKE '%mask_json_deep(t.report%' AND pg_get_viewdef('api.transfer'::REGCLASS) LIKE '%mask_json_deep(t.decisions%',
   'S4: api.transfer masks report and decisions');
SELECT is((SELECT pg_get_userbyid(proowner)::TEXT FROM pg_proc WHERE oid = 'public.revert_audit_transaction(uuid)'::REGPROCEDURE), 'api_owner', 'R8: revert runs as api_owner');
SELECT is_empty($$ SELECT p.oid::REGPROCEDURE FROM pg_proc p WHERE p.oid IN ('private.mask_json_keys(jsonb,text[])'::REGPROCEDURE,
   'private.mask_json_deep(jsonb,uuid,jsonb,jsonb)'::REGPROCEDURE, 'private.mask_audit_data(text,uuid,jsonb,jsonb,jsonb)'::REGPROCEDURE,
   'api.display_name(api.user)'::REGPROCEDURE) AND pg_get_userbyid(p.proowner) <> 'api_owner' $$, 'R8: the masking definers and display_name are owned by api_owner');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

-- Tamper: api.transfer with the report unmasked is reported by drift.
DO $$
BEGIN
    EXECUTE format('CREATE OR REPLACE VIEW api.transfer WITH (security_invoker = false) AS SELECT %s FROM %s',
        (SELECT string_agg(CASE WHEN a.attname = 'report' THEN 't.report' ELSE private.api_column_expr('transfer', a.attname) END, ', ' ORDER BY a.attnum)
         FROM pg_attribute a WHERE a.attrelid = 'public.transfer'::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped),
        private.api_view_from('transfer'));
END;
$$;
SELECT results_eq($$ SELECT problem FROM private.api_view_drift() WHERE relation = 'transfer' AND problem LIKE '% report' $$,
   $$ VALUES ('expression report') $$, 'drift reports an unmasked transfer report');

SELECT * FROM finish();
ROLLBACK;
