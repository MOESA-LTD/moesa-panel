CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer rehearsal (042) on the MOESA demo company of seed.sql: a dry run collects the THO
-- package and writes nothing; the refusals come in their order (mode, same tenant, owner of both
-- companies, target read-only, permissions, source read-only); a missing customer and a product of
-- another customer are refused; a product-only run leaves the customer's contacts out but keeps
-- its contract document; the media, supplier contacts and supplier documents are collected with
-- their copy_only flags. What it writes is rolled back.
BEGIN;

SELECT plan(18);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('trading', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Trading GmbH')),
    ('eski', (SELECT id FROM public.tenant WHERE display_name = 'Eski Ticaret')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('baris', (SELECT id FROM public.user WHERE email = 'baris@moesa-panel.test')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P'))
) AS x (k, v);

SELECT set_config('test.gates', (SELECT count(*)::TEXT FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID), TRUE);
SELECT set_config('test.tasks', (SELECT count(*)::TEXT FROM public.project_task WHERE project_id = current_setting('test.pilot')::UUID), TRUE);

-- baris owns Eski Ticaret too, so between MOESA and Eski the ownership check passes.
INSERT INTO public.tenant_owner (tenant_id, user_id) VALUES (current_setting('test.eski')::UUID, current_setting('test.baris')::UUID);

-- A second customer ZZZ in MOESA, with a product.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000042001', current_setting('test.moesa')::UUID, 'ZZZ', 'ZZZ Handel', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000042002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042001', 'ZZZ-1', 'ZZZ ürün');

-- 1–3. akif, a copy from MOESA to its branch Europe, rehearsed.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.r', public.transfer_customer(
    current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy'
)::TEXT, TRUE);
SELECT is(
    current_setting('test.r')::JSONB -> 'counts',
    jsonb_build_object(
        'customer', 1, 'customer_contact', 1, 'customer_warehouse', 1, 'customer_platform_account', 1,
        'customer_brand', 1, 'supplier', 3, 'product', 3, 'project', 1, 'project_product', 1,
        'project_gate', current_setting('test.gates')::INT, 'project_task', current_setting('test.tasks')::INT,
        'document', 1
    ),
    'the dry run counts the THO package'
);
RESET ROLE;

SELECT is((SELECT count(*) FROM public.transfer), 0::BIGINT, 'a dry run leaves no transfer row');
SELECT is((SELECT count(*) FROM public.customer WHERE tenant_id = current_setting('test.europe')::UUID), 0::BIGINT,
          'a dry run writes nothing to the target');

-- 4. akif does not own MOESA Trading.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_owner_required%',
    'between two companies only an owner of both transfers'
);
RESET ROLE;

-- 5. baris owns both.
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    'the owner of both companies rehearses'
);
RESET ROLE;

-- 6. The coordinator has no transfer right.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_forbidden%',
    'the coordinator may not transfer'
);
RESET ROLE;

SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);

-- 7. Into a read-only target.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.eski')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_target_read_only%',
    'nothing is transferred into a read-only target'
);

-- 8. A move out of a read-only source.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.eski')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'move') $$,
    '%transfer_source_read_only%',
    'a read-only source is not moved from'
);

-- 9. A copy out of it, of a customer that is not there.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.eski')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_customer_missing%',
    'the customer must be in the source'
);

-- 10. The same tenant.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'copy') $$,
    '%transfer_same_tenant%',
    'the target differs from the source'
);

-- 11. An unknown mode.
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'clone') $$,
    '%transfer_invalid_mode%',
    'the mode is copy or move'
);
RESET ROLE;

-- 12. A product of another customer.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
           product_ids => ARRAY['00000000-0000-4000-8000-000000042002'::UUID]) $$,
    '%transfer_products_invalid%',
    'the products are of the customer'
);

-- 13–14. The mop alone.
SELECT set_config('test.r', public.transfer_customer(
    current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
    product_ids => ARRAY[current_setting('test.mop')::UUID]
)::TEXT, TRUE);
SELECT is((current_setting('test.r')::JSONB -> 'counts' ->> 'product')::INT, 1, 'a product-only run takes the selected product');
SELECT ok(NOT (current_setting('test.r')::JSONB -> 'counts') ? 'customer_contact', 'and leaves the customer''s contacts out');
RESET ROLE;

-- 15–18. The satellites, collected as postgres straight into pg_temp.transfer_rows. Media: a
-- shared file (no customer) linked to the mop (…011), a THO file linked to the cones (…012), and
-- THO's file of the contract (…013). The contract document (…014), a document (…015) and a
-- contact (…016) of TR1 (the mop's supplier), the two links (…017, …018).
SELECT set_config('test.cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100')::TEXT, TRUE);
SELECT set_config('test.tr1', (SELECT id FROM public.supplier WHERE code = 'TR1' AND tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);

INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'media', current_setting('test.moesa') || '/' || f.id || '/' || f.name, jsonb_build_object('mimetype', f.mime, 'size', 1000)
FROM (VALUES ('00000000-0000-4000-8000-000000042011', 'shared.png', 'image/png'),
             ('00000000-0000-4000-8000-000000042012', 'cones.png', 'image/png'),
             ('00000000-0000-4000-8000-000000042013', 'contract.pdf', 'application/pdf')) AS f (id, name, mime);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, file_name, mime_type, size_bytes)
SELECT f.id::UUID, current_setting('test.moesa')::UUID, f.customer::UUID,
       current_setting('test.moesa') || '/' || f.id || '/' || f.name, f.name, f.mime, 1000
FROM (VALUES ('00000000-0000-4000-8000-000000042011', NULL, 'shared.png', 'image/png'),
             ('00000000-0000-4000-8000-000000042012', current_setting('test.tho'), 'cones.png', 'image/png'),
             ('00000000-0000-4000-8000-000000042013', current_setting('test.tho'), 'contract.pdf', 'application/pdf')) AS f (id, customer, name, mime);

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url, media_id)
VALUES ('00000000-0000-4000-8000-000000042014', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'customer',
        current_setting('test.tho')::UUID, 'contract', 'draft', NULL, '00000000-0000-4000-8000-000000042013'),
       ('00000000-0000-4000-8000-000000042015', current_setting('test.moesa')::UUID, NULL, 'supplier',
        current_setting('test.tr1')::UUID, 'certificate', 'approved', 'https://example.test/tr1.pdf', NULL);

UPDATE public.customer SET contract_document_id = '00000000-0000-4000-8000-000000042014' WHERE id = current_setting('test.tho')::UUID;

INSERT INTO public.supplier_contact (id, tenant_id, supplier_id, name)
VALUES ('00000000-0000-4000-8000-000000042016', current_setting('test.moesa')::UUID, current_setting('test.tr1')::UUID, 'Kutlu satış');

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.media_link (id, tenant_id, media_id, entity_type, entity_id, role)
VALUES ('00000000-0000-4000-8000-000000042017', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042011', 'product',
        current_setting('test.mop')::UUID, 'gallery'),
       ('00000000-0000-4000-8000-000000042018', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042012', 'product',
        current_setting('test.cones')::UUID, 'gallery');
RESET ROLE;

CREATE FUNCTION pg_temp.satellite_counts () RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_object_agg(c.table_name, c.n) FROM (
        SELECT r.table_name, count(*) AS n FROM pg_temp.transfer_rows r
        WHERE r.table_name IN ('supplier_contact', 'media', 'media_link', 'document') GROUP BY r.table_name
    ) c;
$$;
CREATE FUNCTION pg_temp.fixture_flags () RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_object_agg(right(r.source_id::TEXT, 3), r.copy_only) FROM pg_temp.transfer_rows r
    WHERE r.source_id::TEXT LIKE '00000000-0000-4000-8000-00000004201_';
$$;

SELECT private.transfer_collect(current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, NULL);
SELECT is(pg_temp.satellite_counts(), '{"supplier_contact": 1, "media": 3, "media_link": 2, "document": 3}'::JSONB,
          'a full run takes the supplier contact, the three files, both links and the three documents');
SELECT is(
    pg_temp.fixture_flags(),
    '{"011": true, "012": false, "013": false, "014": false, "015": true, "016": true, "017": false, "018": false}'::JSONB,
    'in a full run only the shared file and the supplier''s rows are copy_only'
);

SELECT private.transfer_collect(current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, ARRAY[current_setting('test.mop')::UUID]);
SELECT is(pg_temp.satellite_counts(), '{"supplier_contact": 1, "media": 2, "media_link": 1, "document": 3}'::JSONB,
          'a product-only run takes the mop''s file and link, the contract and its file, the supplier''s rows');
SELECT is(
    pg_temp.fixture_flags(),
    '{"011": true, "013": true, "014": true, "015": true, "016": true, "017": false}'::JSONB,
    'in a product-only run the contract, the files and the supplier''s rows are copy_only; the cones'' file stays out'
);

SELECT * FROM finish();

ROLLBACK;
