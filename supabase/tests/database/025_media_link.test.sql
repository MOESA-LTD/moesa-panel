CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Media links (M19) on the MOESA demo company of seed.sql, as the coordinator: one primary image
-- per record (a new primary demotes the old one, set_primary_media swaps them), only an image is
-- primary, a customer's file goes only to that customer's records, the record must exist in the
-- tenant (and its table), a link never moves, linking needs the record's update right, the
-- library view and the product list read the links, and linked media is neither deleted nor
-- given another customer. What it writes is rolled back.
BEGIN;

SELECT plan(19);

SELECT set_config('test.moesa', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);
SELECT set_config('test.atlas', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);
SELECT set_config('test.koordinator', (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.akif', (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test')::TEXT, TRUE);
SELECT set_config('test.tho', (SELECT c.id FROM public.customer c
                               WHERE c.code = 'THO' AND c.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.mop40', (SELECT p.id FROM public.product p
                                 WHERE p.sku = 'THO-MOP40-2P' AND p.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.cones', (SELECT p.id FROM public.product p
                                 WHERE p.sku = 'THO-CONES-100' AND p.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.tr1', (SELECT s.id FROM public.supplier s
                               WHERE s.code = 'TR1' AND s.tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.m_png', '00000000-0000-4000-8000-000000000251', TRUE);
SELECT set_config('test.m_png2', '00000000-0000-4000-8000-000000000252', TRUE);
SELECT set_config('test.m_pdf', '00000000-0000-4000-8000-000000000253', TRUE);
SELECT set_config('test.m_shared', '00000000-0000-4000-8000-000000000254', TRUE);
SELECT set_config('test.atlas_customer', '00000000-0000-4000-8000-000000000255', TRUE);
SELECT set_config('test.atlas_product', '00000000-0000-4000-8000-000000000256', TRUE);

-- Another company's product, for the cross-tenant link.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES (current_setting('test.atlas_customer')::UUID, current_setting('test.atlas')::UUID, 'ATL', 'Atlas Customer',
        'trading_partner');

INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES (current_setting('test.atlas_product')::UUID, current_setting('test.atlas')::UUID,
        current_setting('test.atlas_customer')::UUID, 'ATL-001', 'Atlas product');

-- The uploaded files and their rows: three of THO's, one shared (no customer).
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_png') || '/a.png',
     '{"mimetype": "image/png", "size": 1000}'::JSONB),
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_png2') || '/b.png',
     '{"mimetype": "image/png", "size": 1000}'::JSONB),
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_pdf') || '/c.pdf',
     '{"mimetype": "application/pdf", "size": 1000}'::JSONB),
    ('media', current_setting('test.moesa') || '/' || current_setting('test.m_shared') || '/d.png',
     '{"mimetype": "image/png", "size": 1000}'::JSONB);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
SELECT f.id::UUID, current_setting('test.moesa')::UUID, f.customer::UUID,
       current_setting('test.moesa') || '/' || f.id || '/' || f.name, f.name, 'image/png', 1
FROM (VALUES (current_setting('test.m_png'), current_setting('test.tho'), 'a.png'),
             (current_setting('test.m_png2'), current_setting('test.tho'), 'b.png'),
             (current_setting('test.m_pdf'), current_setting('test.tho'), 'c.pdf'),
             (current_setting('test.m_shared'), NULL, 'd.png')) AS f (id, customer, name);

SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT has_table('public', 'media_link', 'media_link table');

SELECT lives_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id, role)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_png')::UUID, 'product',
                current_setting('test.mop40')::UUID, 'primary_image')
    $$,
    'a coordinator links a primary image to a product'
);

INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id, role)
VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_png2')::UUID, 'product',
        current_setting('test.mop40')::UUID, 'primary_image');

SELECT is(
    (SELECT string_agg(m.file_name || ':' || l.role, ',' ORDER BY m.file_name)
     FROM api.media_link l JOIN api.media m ON m.id = l.media_id
     WHERE l.entity_id = current_setting('test.mop40')::UUID),
    'a.png:gallery,b.png:primary_image',
    'a second primary demotes the first'
);

SELECT public.set_primary_media(
    (SELECT l.id FROM api.media_link l WHERE l.media_id = current_setting('test.m_png')::UUID)
);

SELECT is(
    (SELECT string_agg(m.file_name || ':' || l.role, ',' ORDER BY m.file_name)
     FROM api.media_link l JOIN api.media m ON m.id = l.media_id
     WHERE l.entity_id = current_setting('test.mop40')::UUID),
    'a.png:primary_image,b.png:gallery',
    'set_primary_media swaps the primary'
);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id, role)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_pdf')::UUID, 'product',
                current_setting('test.cones')::UUID, 'primary_image')
    $$,
    '23514',
    'media_primary_not_image',
    'a PDF cannot be primary'
);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_png')::UUID, 'supplier',
                current_setting('test.tr1')::UUID)
    $$,
    '23514',
    'media_customer_mismatch',
    'THO''s file cannot go to a supplier'
);

SELECT lives_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_shared')::UUID, 'supplier',
                current_setting('test.tr1')::UUID)
    $$,
    'shared media links to any record'
);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_shared')::UUID, 'product', gen_random_uuid())
    $$,
    '23503',
    'media_link_entity_missing',
    'the record must exist'
);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_shared')::UUID, 'product',
                current_setting('test.atlas_product')::UUID)
    $$,
    '23503',
    'media_link_entity_missing',
    'not to another tenant''s record'
);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_shared')::UUID, 'shipment', gen_random_uuid())
    $$,
    '23503',
    'media_link_entity_missing',
    'not to a table that does not exist yet'
);

SELECT throws_ok(
    $$ UPDATE api.media_link SET entity_id = current_setting('test.cones')::UUID WHERE media_id = current_setting('test.m_png')::UUID $$,
    '23514',
    'media_link_identity_immutable',
    'a link does not move'
);

SELECT throws_ok(
    $$ UPDATE api.media SET customer_id = NULL WHERE id = current_setting('test.m_png')::UUID $$,
    '23514',
    'media_customer_locked',
    'a linked file keeps its customer'
);

SELECT throws_ok(
    $$ DELETE FROM api.media WHERE id = current_setting('test.m_pdf')::UUID $$,
    '42501',
    NULL,
    'a coordinator does not delete media'
);

-- The coordinator loses the right to change products.
RESET ROLE;

DELETE FROM public.role_permission rp
USING public.role r, public.permission p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.tenant_id = current_setting('test.moesa')::UUID AND r.display_name = 'coordinator'
  AND p.resource_name = 'public.product' AND p.command = 'update';

SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok(
    $$
        INSERT INTO api.media_link (tenant_id, media_id, entity_type, entity_id)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.m_shared')::UUID, 'product',
                current_setting('test.cones')::UUID)
    $$,
    '42501',
    'media_link_forbidden',
    'linking needs the record''s update right'
);

SELECT throws_ok(
    $$ DELETE FROM api.media_link WHERE media_id = current_setting('test.m_png2')::UUID $$,
    '42501',
    'media_link_forbidden',
    'so does unlinking'
);

SELECT is(
    (SELECT link_count || ':' || (linked_entities @> ARRAY['product:' || current_setting('test.mop40')])
     FROM api.media_library WHERE id = current_setting('test.m_png')::UUID),
    '1:true',
    'the library counts links'
);

SELECT is(
    (SELECT primary_image_path FROM api.product_with_evidence WHERE id = current_setting('test.mop40')::UUID),
    current_setting('test.moesa') || '/' || current_setting('test.m_png') || '/a.png',
    'the product list gets the primary image'
);

RESET ROLE;

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok(
    $$ DELETE FROM api.media WHERE id = current_setting('test.m_png')::UUID $$,
    '23503',
    'media_in_use',
    'linked media is not deleted'
);

SELECT lives_ok(
    $$ DELETE FROM api.media WHERE id = current_setting('test.m_pdf')::UUID $$,
    'management deletes unlinked media'
);

SELECT * FROM finish();

ROLLBACK;
