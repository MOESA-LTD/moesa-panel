CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- 060: the files row rule (R3). Price documents and supplier/PO files are hidden, with their media rows
-- and Storage objects, from users without the supplier_terms or supplier_identity groups. The fixtures
-- of 050 hold every row used here (pi_doc, pi_media with its Storage object, po_doc, spec_doc and
-- supplier_media with a supplier link), so none is created in this test.
BEGIN;

SELECT plan(16);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();
GRANT EXECUTE ON FUNCTION private.field_calls_only_in_initplans (TEXT) TO authenticated;

-- As portal (customer_viewer: neither supplier_terms nor supplier_identity).
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = current_setting('test.pi_doc')::UUID), 0, 'portal user cannot read a PI document');
SELECT is((SELECT count(*)::INT FROM api.media WHERE id = current_setting('test.pi_media')::UUID), 0, '... its media');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name = current_setting('test.pi_object')), 0, '... or its Storage object');
SELECT ok(NOT private.can_read_media_file(current_setting('test.pi_object')), 'the Storage helper refuses it');
SELECT is((SELECT count(*)::INT FROM api.media_link WHERE entity_type IN ('supplier', 'purchase_order')), 0, 'supplier/PO media links hidden');
SELECT is((SELECT count(*)::INT FROM api.media_library WHERE id = current_setting('test.supplier_media')::UUID), 0, 'media_library hides supplier media');
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = current_setting('test.po_doc')::UUID), 0, 'a po-type price document on any entity is hidden');
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = current_setting('test.spec_doc')::UUID), 1, 'other documents stay visible');
SELECT ok(NOT private.can_read_media_file(current_setting('test.moesa') || '/not-a-uuid/x.pdf'), 'a non-UUID folder is refused');
RESET ROLE;
SELECT private.unimpersonate();

-- As koordinator (supplier_terms R, supplier_identity RW).
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.document WHERE id IN (current_setting('test.pi_doc')::UUID, current_setting('test.po_doc')::UUID)), 2, 'coordinator reads PI and PO documents');
SELECT ok(private.can_read_media_file(current_setting('test.pi_object')), 'coordinator reads the PI file');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.media ORDER BY created_at DESC LIMIT 50'), 'hidden_media_ids is an InitPlan');
RESET ROLE;
SELECT private.unimpersonate();

-- The policies and the function.
SELECT is((SELECT count(*)::INT FROM pg_policies WHERE policyname IN ('document_field_groups', 'media_link_field_groups', 'media_field_groups') AND permissive = 'RESTRICTIVE' AND cmd = 'SELECT'), 3, 'the three restrictive policies exist');
SELECT is((SELECT pg_get_userbyid(proowner)::TEXT FROM pg_proc WHERE oid = 'private.hidden_media_ids()'::REGPROCEDURE), 'file_rule_owner', 'R8: hidden_media_ids is owned by file_rule_owner, not postgres');
-- The generator drops only its own named policies, so a re-run keeps ours.
SELECT private.disable_tenant_level_security(t) FROM unnest(ARRAY['document', 'media_link', 'media']) AS t;
SELECT private.enable_tenant_level_security(t) FROM unnest(ARRAY['document', 'media_link', 'media']) AS t;
SELECT is((SELECT count(*)::INT FROM pg_policies WHERE policyname IN ('document_field_groups', 'media_link_field_groups', 'media_field_groups')), 3, 'the policies survive a generator re-run');
SELECT private.impersonate(current_setting('test.portal')::UUID, current_setting('test.moesa')::UUID);
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = current_setting('test.pi_doc')::UUID), 0, 'still hidden after the re-run');
RESET ROLE;
SELECT private.unimpersonate();

SELECT * FROM finish();
ROLLBACK;
