CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 056: projects, markets, incidents and change requests behind the masked api views, as portal and elif.
BEGIN;

SELECT plan(12);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');

RESET ROLE;
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT notes FROM api.project WHERE id = current_setting('test.project')::UUID), NULL, 'project notes masked');
SELECT is((SELECT note FROM api.project_gate WHERE id = current_setting('test.gate')::UUID), NULL, 'gate notes masked');
SELECT results_eq($$ SELECT root_cause_note, impact_note, lessons, affected_parties FROM api.incident WHERE id = current_setting('test.inc')::UUID $$,
   $$ VALUES (NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::public.incident_party[]) $$, 'incident internals and parties masked');
SELECT is((SELECT what_happened FROM api.incident WHERE id = current_setting('test.inc')::UUID), 'visible', 'CL 3.9: incident notice fields stay readable');
SELECT is((SELECT count(*)::INT FROM api.incident_log), 0, 'portal has no incident_log table access');
SELECT results_eq($$ SELECT cost_impact, decision_note FROM api.change_request WHERE id = current_setting('test.cr')::UUID $$,
   $$ VALUES ('99'::TEXT, NULL::TEXT) $$, 'CL 3.8: CR cost impact readable, decision note masked');
SELECT is((SELECT notes FROM api.market_cell WHERE id = current_setting('test.cell')::UUID), NULL, 'market cell notes masked');

RESET ROLE;
SELECT private.impersonate(current_setting('test.elif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE api.market_cell SET listing_state = 'live' WHERE id = current_setting('test.cell')::UUID $$, '23514', 'market_cell_listing_server_only', 'R6 through api');
SELECT is(t.error_of($$ DELETE FROM api.market_cell WHERE id = current_setting('test.live_cell')::UUID $$), '23514:market_cell_delete_candidate_only', 'R7 through api');
SELECT throws_ok($$ INSERT INTO api.incident_log (tenant_id, incident_id, note, cost_amount) VALUES (current_setting('test.moesa')::UUID, current_setting('test.inc')::UUID, 'x', 10) $$, '42501', 'field_write_forbidden', 'internal note and finance write refused');
SELECT throws_ok($$ UPDATE api.project_gate SET note = 'gate secret' WHERE id = current_setting('test.gate')::UUID $$, '42501', 'field_write_forbidden', 'S1: a correct gate note guess is refused');

SELECT * FROM finish();
ROLLBACK;
