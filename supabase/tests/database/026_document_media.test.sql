CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Documents pointing at media (M19) on the MOESA demo company of seed.sql, as the coordinator: a
-- document's file is a Drive link, a media file or both, never neither; a customer's file is only
-- that customer's document; the file must be in the document's tenant; and a file a document
-- cites keeps its customer, is counted by the library and is not deleted. What it writes is
-- rolled back.
BEGIN;

SELECT plan(9);

SELECT set_config('test.moesa', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);
SELECT set_config('test.atlas', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);
SELECT set_config('test.koordinator', (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.akif', (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.tho', (SELECT c.id FROM public.customer c
                               WHERE c.code = 'THO' AND c.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.mop40', (SELECT p.id FROM public.product p
                                 WHERE p.sku = 'THO-MOP40-2P' AND p.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.tr1', (SELECT s.id FROM public.supplier s
                               WHERE s.code = 'TR1' AND s.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.m_spec', '00000000-0000-4000-8000-000000000261', TRUE);
SELECT set_config('test.m_other', '00000000-0000-4000-8000-000000000262', TRUE);
SELECT set_config('test.m_atlas', '00000000-0000-4000-8000-000000000263', TRUE);

-- The uploaded files and their rows: THO's spec sheet, a shared file, and another company's file
-- (no customer, so only the tenant rule can refuse it).
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_spec') || '/spec.pdf',
     '{"mimetype": "application/pdf", "size": 1000}'::JSONB),
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_other') || '/other.pdf',
     '{"mimetype": "application/pdf", "size": 1000}'::JSONB),
    ('media', current_setting('test.atlas') || '/' || current_setting('test.m_atlas') || '/atlas.pdf',
     '{"mimetype": "application/pdf", "size": 1000}'::JSONB);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
SELECT f.id::UUID, f.tenant::UUID, f.customer::UUID, f.tenant || '/' || f.id || '/' || f.name, f.name, 'application/pdf', 1
FROM (VALUES (current_setting('test.m_spec'), current_setting('test.moesa'), current_setting('test.tho'), 'spec.pdf'),
             (current_setting('test.m_other'), current_setting('test.moesa'), NULL, 'other.pdf'),
             (current_setting('test.m_atlas'), current_setting('test.atlas'), NULL, 'atlas.pdf')) AS f (id, tenant, customer, name);

SELECT has_column('public', 'document', 'media_id', 'document.media_id');

SELECT hasnt_column('public', 'document', 'storage_path', 'storage_path is gone');

SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT lives_ok(
    $$
        INSERT INTO api.document (tenant_id, customer_id, entity_type, entity_id, type, version, url, media_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product',
                current_setting('test.mop40')::UUID, 'spec_sheet', 9, NULL, current_setting('test.m_spec')::UUID)
    $$,
    'a document can be just a file'
);

SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, customer_id, entity_type, entity_id, type, version, url, media_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product',
                current_setting('test.mop40')::UUID, 'spec_sheet', 10, NULL, NULL)
    $$,
    '23514',
    NULL,
    'a document needs a link or a file (document_has_file)'
);

SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, customer_id, entity_type, entity_id, type, version, media_id)
        VALUES (current_setting('test.moesa')::UUID, NULL, 'supplier', current_setting('test.tr1')::UUID,
                'certificate', 9, current_setting('test.m_spec')::UUID)
    $$,
    '23514',
    'media_customer_mismatch',
    'THO''s file is not another record''s document'
);

SELECT throws_ok(
    $$
        INSERT INTO api.document (tenant_id, customer_id, entity_type, entity_id, type, version, media_id)
        VALUES (current_setting('test.moesa')::UUID, NULL, 'supplier', current_setting('test.tr1')::UUID,
                'certificate', 9, current_setting('test.m_atlas')::UUID)
    $$,
    '23503',
    'media_missing',
    'not another tenant''s file'
);

SELECT is(
    (SELECT document_count || ':' || link_count FROM api.media_library WHERE id = current_setting('test.m_spec')::UUID),
    '1:0',
    'the library counts the documents citing a file'
);

RESET ROLE;

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok(
    $$ UPDATE api.media SET customer_id = NULL WHERE id = current_setting('test.m_spec')::UUID $$,
    '23514',
    'media_customer_locked',
    'a document''s file keeps its customer'
);

SELECT throws_ok(
    $$ DELETE FROM api.media WHERE id = current_setting('test.m_spec')::UUID $$,
    '23503',
    'media_in_use',
    'a document''s file is not deleted'
);

SELECT * FROM finish();

ROLLBACK;
