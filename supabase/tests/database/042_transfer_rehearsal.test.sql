CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The transfer rehearsal (042) on the MOESA demo company of seed.sql: a dry run collects the THO
-- package and writes nothing; the refusals come in their order (mode, same tenant, owner of both
-- companies, target read-only, permissions, source read-only); a missing customer and a product of
-- another customer are refused; a product-only run leaves the customer's contacts out but keeps
-- its contract document; the media, supplier contacts and supplier documents are collected with
-- their copy_only flags. The report: conflicts (customer, supplier, GTINs, a SKU under a mapped
-- customer, project code, document version), non-member users, settings gaps, a link left behind
-- and a stable hash that names the target; a shipment line on its order link is not left behind. A real run
-- is refused when stale, without a hash or decisions, with a decision that does not fit or a bad
-- code (lower case, taken, repeated, another supplier's), a map onto a wrong row, an unknown key,
-- or with a product in use; gates out of order or missing and a target plan without a business module
-- are refused. What it writes is rolled back.
BEGIN;

SELECT plan(53);

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

-- 19–51. The report and the checks of a real run, as akif. Every call names MOESA, Europe and THO.
CREATE FUNCTION pg_temp.rehearse (mode TEXT, decisions JSONB DEFAULT '{}', product_ids UUID[] DEFAULT NULL) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, mode,
        decisions => decisions, product_ids => product_ids
    );
$$;
CREATE FUNCTION pg_temp.run (mode TEXT, decisions JSONB DEFAULT '{}', report_hash TEXT DEFAULT NULL, product_ids UUID[] DEFAULT NULL) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, mode,
        decisions => decisions, dry_run => FALSE, report_hash => report_hash, product_ids => product_ids
    );
$$;

-- 19. Within one company, a whole move with no conflict takes the cheap path.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT is(pg_temp.rehearse('move') ->> 'path', 'cheap', 'a conflict-free move within one company is cheap');
RESET ROLE;

-- 20. A target plan without a business module: change_request is made a plan module for the case,
-- then core again (no savepoint: rolling one back would drop pgTAP's record of the case).
UPDATE public.module SET is_core = FALSE WHERE id = 'change_request';
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like($$ SELECT pg_temp.rehearse('copy') $$, '%transfer_target_plan%', 'the target''s plan has every business module');
RESET ROLE;
UPDATE public.module SET is_core = TRUE WHERE id = 'change_request';

-- 21–23. baris (owner of MOESA and of MOESA Trading) rehearses the same copy into Europe and into
-- Trading: the two reports are equal, the hashes are not, and one target's hash does not run the other.
-- akif (author of the media links) joins Trading for the case, so that the users match too.
INSERT INTO public.tenant_user (user_id, tenant_id) VALUES (current_setting('test.akif')::UUID, current_setting('test.trading')::UUID);
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.he', pg_temp.rehearse('copy')::TEXT, TRUE);
SELECT set_config('test.ht', public.transfer_customer(
    current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, current_setting('test.tho')::UUID, 'copy'
)::TEXT, TRUE);
SELECT is(current_setting('test.he')::JSONB - 'report_hash', current_setting('test.ht')::JSONB - 'report_hash',
          'Europe and Trading give the same report');
SELECT isnt(current_setting('test.he')::JSONB ->> 'report_hash', current_setting('test.ht')::JSONB ->> 'report_hash',
            'the hash names the target');
SELECT throws_like(
    $$ SELECT public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID,
           current_setting('test.tho')::UUID, 'copy', dry_run => FALSE,
           report_hash => current_setting('test.he')::JSONB ->> 'report_hash') $$,
    '%transfer_report_stale%',
    'a rehearsal into Europe does not run into Trading'
);
RESET ROLE;
DELETE FROM public.tenant_user WHERE user_id = current_setting('test.akif')::UUID AND tenant_id = current_setting('test.trading')::UUID;


-- In Europe: THO (…021), TR1 (…022) and THO's THO-TIPS-6-50 (…023). The company's spec sheets are
-- required from 2020 (Europe reads MOESA's setting).
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000042021', current_setting('test.europe')::UUID, 'THO', 'THO Europa', 'trading_partner');
INSERT INTO public.supplier (id, tenant_id, code, display_name, country)
VALUES ('00000000-0000-4000-8000-000000042022', current_setting('test.europe')::UUID, 'TR1', 'TR1 Europa', 'TR');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000042023', current_setting('test.europe')::UUID, '00000000-0000-4000-8000-000000042021',
        'THO-TIPS-6-50', 'Tips');
UPDATE public.setting SET value = '"2020-01-01"'
WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'spec_sheet_required_from';
SELECT set_config('moesa.rules_bypass', '', TRUE);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.r', pg_temp.rehearse('copy')::TEXT, TRUE);

-- 24–30. A copy into Europe.
SELECT ok(
    current_setting('test.r')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'customer:' || current_setting('test.tho'), 'kind', 'customer_code', 'actions', '["map", "new_code"]'::JSONB
    )),
    'THO is taken in Europe: map or new code'
);
SELECT ok(
    current_setting('test.r')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'supplier:' || current_setting('test.tr1'), 'kind', 'supplier_code',
        'existing_id', '00000000-0000-4000-8000-000000042022'
    )),
    'TR1 is taken in Europe'
);
SELECT is(
    (SELECT count(*) FROM jsonb_array_elements(current_setting('test.r')::JSONB -> 'conflicts') c WHERE c ->> 'kind' = 'gtin'),
    3::BIGINT,
    'a copy cannot keep the three active GTINs'
);
SELECT is((current_setting('test.r')::JSONB ->> 'unresolved')::INT, 5, 'five conflicts wait for a decision');
SELECT is(current_setting('test.r')::JSONB ->> 'path', 'copy', 'a copy takes the copy path');
SELECT is(current_setting('test.r')::JSONB -> 'customer' ->> 'code', 'THO', 'the report names the customer');
SELECT ok(
    pg_temp.rehearse('copy', jsonb_build_object(
        'customer:' || current_setting('test.tho'), '{"action": "map", "target_id": "00000000-0000-4000-8000-000000042021"}'::JSONB
    )) -> 'conflicts' @> '[{"kind": "sku", "label": "THO-TIPS-6-50", "existing_id": "00000000-0000-4000-8000-000000042023"}]',
    'mapped onto Europe''s THO, the tips meet Europe''s tips'
);

-- 31. The pilot's coordinator is not a member of Europe.
SELECT ok(
    current_setting('test.r')::JSONB -> 'users' @> jsonb_build_array(jsonb_build_object(
        'user_id', current_setting('test.koordinator')::UUID, 'columns', '["coordinator_id"]'::JSONB
    )),
    'the coordinator is reported as a non-member'
);

-- 32. The mop has a signed spec sheet in the package; the others would be held back.
SELECT is(
    ARRAY(SELECT g ->> 'label' FROM jsonb_array_elements(current_setting('test.r')::JSONB -> 'settings_gaps') g ORDER BY 1),
    ARRAY['THO-CONES-100', 'THO-TIPS-6-50'],
    'the products without a signed spec sheet are settings gaps'
);
RESET ROLE;

-- 33. A new contact after the rehearsal.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.h', pg_temp.rehearse('copy') ->> 'report_hash', TRUE);
RESET ROLE;
INSERT INTO public.customer_contact (tenant_id, customer_id, name)
VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Yeni kişi');
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT pg_temp.run('copy', report_hash => current_setting('test.h')) $$,
    '%transfer_report_stale%',
    'a new contact makes the report stale'
);

-- 34. No hash.
SELECT throws_like($$ SELECT pg_temp.run('copy') $$, '%transfer_report_required%', 'a real run needs the rehearsal''s hash');

-- 35. No decisions.
SELECT set_config('test.h', pg_temp.rehearse('copy') ->> 'report_hash', TRUE);
SELECT throws_like(
    $$ SELECT pg_temp.run('copy', report_hash => current_setting('test.h')) $$,
    '%transfer_decision_required%',
    'every conflict needs a decision'
);

-- 36. A move offers no skip.
SELECT set_config('test.d', jsonb_build_object(
    'customer:' || current_setting('test.tho'), '{"action": "skip"}'::JSONB,
    'supplier:' || current_setting('test.tr1'), '{"action": "map", "target_id": "00000000-0000-4000-8000-000000042022"}'::JSONB
)::TEXT, TRUE);
SELECT set_config('test.h', pg_temp.rehearse('move', current_setting('test.d')::JSONB) ->> 'report_hash', TRUE);
SELECT throws_like(
    $$ SELECT pg_temp.run('move', current_setting('test.d')::JSONB, current_setting('test.h')) $$,
    '%transfer_decision_invalid%',
    'a move cannot skip a code conflict'
);

-- 37. A typed customer code in lower case.
SELECT set_config('test.d', jsonb_build_object(
    'customer:' || current_setting('test.tho'), '{"action": "new_code", "code": "th1"}'::JSONB
)::TEXT, TRUE);
SELECT set_config('test.h', pg_temp.rehearse('copy', current_setting('test.d')::JSONB) ->> 'report_hash', TRUE);
SELECT throws_like(
    $$ SELECT pg_temp.run('copy', current_setting('test.d')::JSONB, current_setting('test.h')) $$,
    '%transfer_code_invalid%',
    'a new customer code is three capitals'
);

-- 38–39. The mop alone, moved: the pilot's product list keeps it.
SELECT set_config('test.r', pg_temp.rehearse('move', product_ids => ARRAY[current_setting('test.mop')::UUID])::TEXT, TRUE);
SELECT throws_like(
    $$ SELECT pg_temp.run('move', report_hash => current_setting('test.r')::JSONB ->> 'report_hash',
                          product_ids => ARRAY[current_setting('test.mop')::UUID]) $$,
    '%transfer_product_in_use%',
    'a product in a project that stays is not moved'
);
SELECT ok(
    current_setting('test.r')::JSONB -> 'left_behind' @> jsonb_build_array(jsonb_build_object(
        'table', 'project_product', 'column', 'product_id',
        'refers_to', 'product', 'refers_to_id', current_setting('test.mop'), 'refers_to_label', 'THO-MOP40-2P'
    )),
    'the rehearsal lists the project link left behind, naming the table, id and label it refers to'
);

-- 40. The hash is stable.
SELECT is(pg_temp.rehearse('copy') ->> 'report_hash', pg_temp.rehearse('copy') ->> 'report_hash', 'two identical rehearsals give one hash');
RESET ROLE;

-- 41–50. More conflicts and decisions. In Europe: a project of THO, which takes the pilot's code
-- (Europe's first THO project of the year), THO's contract v1 (…024) and a supplier CN1 (…025).
SELECT set_config('test.cn1', (SELECT id FROM public.supplier WHERE code = 'CN1' AND tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000042024', current_setting('test.europe')::UUID, '00000000-0000-4000-8000-000000042021',
        'customer', '00000000-0000-4000-8000-000000042021', 'contract', 'draft', 'https://example.test/eu-contract.pdf');
INSERT INTO public.supplier (id, tenant_id, code, display_name, country)
VALUES ('00000000-0000-4000-8000-000000042025', current_setting('test.europe')::UUID, 'CN1', 'CN1 Europa', 'CN');
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID);
INSERT INTO public.project (tenant_id, customer_id, display_name, type, path)
VALUES (current_setting('test.europe')::UUID, '00000000-0000-4000-8000-000000042021', 'Europa projesi', 'npi', 'a_sourcing');
RESET ROLE;

-- A rehearsal, then a real run with its hash and the same decisions.
CREATE FUNCTION pg_temp.decide (mode TEXT, decisions JSONB) RETURNS JSONB LANGUAGE sql AS $$
    SELECT pg_temp.run(mode, decisions, pg_temp.rehearse(mode, decisions) ->> 'report_hash');
$$;
SELECT set_config('test.map_tho', jsonb_build_object(
    'customer:' || current_setting('test.tho'), '{"action": "map", "target_id": "00000000-0000-4000-8000-000000042021"}'::JSONB
)::TEXT, TRUE);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

-- 41. A project code taken in the target.
SELECT ok(
    pg_temp.rehearse('copy') -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'project:' || current_setting('test.pilot'), 'kind', 'code',
        'label', (SELECT code FROM public.project WHERE id = current_setting('test.pilot')::UUID),
        'actions', '["new_code", "skip"]'::JSONB
    )),
    'the pilot''s code is taken in Europe: new code or skip'
);

-- 42. Under the mapped THO, Europe already has contract v1.
SELECT ok(
    pg_temp.rehearse('copy', current_setting('test.map_tho')::JSONB) -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'document:00000000-0000-4000-8000-000000042014', 'kind', 'document_version', 'label', 'contract v1',
        'existing_id', '00000000-0000-4000-8000-000000042024'
    )),
    'the contract meets Europe''s contract v1 under the mapped customer'
);

-- 43. A map onto another tenant's customer (ZZZ, in MOESA).
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', jsonb_build_object('customer:' || current_setting('test.tho'),
           '{"action": "map", "target_id": "00000000-0000-4000-8000-000000042001"}'::JSONB)) $$,
    '%transfer_decision_invalid%',
    'a customer is mapped onto a customer of the target'
);

-- 44. A map of the contract onto another row than the version found.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', current_setting('test.map_tho')::JSONB || jsonb_build_object(
           'document:00000000-0000-4000-8000-000000042014',
           '{"action": "map", "target_id": "00000000-0000-4000-8000-000000042021"}'::JSONB)) $$,
    '%transfer_decision_invalid%',
    'a document is mapped onto the version found'
);

-- 45. A key that names no conflict.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', '{"project:00000000-0000-4000-8000-000000042099": {"action": "skip"}}'::JSONB) $$,
    '%transfer_decision_invalid%',
    'a decision names a conflict'
);

-- 46. clear_gtin on a customer code.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', jsonb_build_object('customer:' || current_setting('test.tho'), '{"action": "clear_gtin"}'::JSONB)) $$,
    '%transfer_decision_invalid%',
    'clear_gtin fits a GTIN conflict only'
);

-- 47. A new customer code that Europe already has.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', jsonb_build_object('customer:' || current_setting('test.tho'),
           '{"action": "new_code", "code": "THO"}'::JSONB)) $$,
    '%transfer_code_invalid%',
    'a new code is free in the target'
);

-- 48. TR1 and CN1 both recoded XY1.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', jsonb_build_object(
           'supplier:' || current_setting('test.tr1'), '{"action": "new_code", "code": "XY1"}'::JSONB,
           'supplier:' || current_setting('test.cn1'), '{"action": "new_code", "code": "XY1"}'::JSONB)) $$,
    '%transfer_code_invalid%',
    'two suppliers are not recoded alike'
);

-- 49. TR1 recoded ID1, the code of another package supplier that is copied as it is.
SELECT throws_like(
    $$ SELECT pg_temp.decide('copy', jsonb_build_object(
           'supplier:' || current_setting('test.tr1'), '{"action": "new_code", "code": "ID1"}'::JSONB)) $$,
    '%transfer_code_invalid%',
    'a new code is not the code of another supplier copied along'
);

-- 49b. The rehearsal says so already: TR1's conflict names the code taken and stays unresolved.
SELECT ok(
    (SELECT c ->> 'taken_code' = 'ID1'
     FROM jsonb_array_elements(pg_temp.rehearse('copy', jsonb_build_object(
         'supplier:' || current_setting('test.tr1'), '{"action": "new_code", "code": "ID1"}'::JSONB)) -> 'conflicts') c
     WHERE c ->> 'key' = 'supplier:' || current_setting('test.tr1'))
    AND (pg_temp.rehearse('copy', jsonb_build_object(
         'supplier:' || current_setting('test.tr1'), '{"action": "new_code", "code": "ID1"}'::JSONB)) ->> 'unresolved')::INT
      = (pg_temp.rehearse('copy', jsonb_build_object(
         'supplier:' || current_setting('test.tr1'), '{"action": "new_code", "code": "XY9"}'::JSONB)) ->> 'unresolved')::INT + 1,
    'the rehearsal leaves a code another package supplier keeps unresolved'
);
RESET ROLE;

-- 50. ZZZ with an order (…003, a line …004 of ZZZ-1), a warehouse (…007), a shipment (…005)
-- carrying the order (the link row has no id) and a shipment line (…006): a move to Trading leaves
-- nothing behind.
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency)
SELECT '00000000-0000-4000-8000-000000042003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042001', s.id, 'USD'
FROM public.supplier s WHERE s.tenant_id = current_setting('test.moesa')::UUID AND s.code = 'TR1';
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000042004', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042003',
        '00000000-0000-4000-8000-000000042002', 5, 1);
INSERT INTO public.customer_warehouse (id, tenant_id, customer_id, display_name)
VALUES ('00000000-0000-4000-8000-000000042007', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042001', 'ZZZ Lager');
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
VALUES ('00000000-0000-4000-8000-000000042005', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042001', 'road',
        '00000000-0000-4000-8000-000000042007');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)
VALUES ('00000000-0000-4000-8000-000000042005', '00000000-0000-4000-8000-000000042003', current_setting('test.moesa')::UUID);
INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity)
VALUES ('00000000-0000-4000-8000-000000042006', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000042005',
        '00000000-0000-4000-8000-000000042003', '00000000-0000-4000-8000-000000042004', 5);
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.baris')::UUID, current_setting('test.moesa')::UUID);
SELECT is(
    public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.trading')::UUID, '00000000-0000-4000-8000-000000042001', 'move'
    ) -> 'left_behind',
    '[]'::JSONB,
    'a shipment line on its order link is not left behind'
);
RESET ROLE;

-- 51. The pilot without its last gate (L_G2), which gates_for still gives; put back afterwards.
CREATE TEMP TABLE saved_gate AS
SELECT * FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'L_G2';
DELETE FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'L_G2';
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like($$ SELECT pg_temp.rehearse('copy') $$, '%transfer_gate_invalid%', 'the gate set matches the project');
RESET ROLE;
INSERT INTO public.project_gate SELECT * FROM pg_temp.saved_gate;

-- 52. G2 passed while G1 is pending, past the guard. The last case: the final ROLLBACK undoes it (a
-- savepoint rolled back after the assertion would drop pgTAP's record of it).
ALTER TABLE public.project_gate DISABLE TRIGGER project_gate_guard;
UPDATE public.project_gate SET status = 'passed', passed_at = now()
WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G2';
ALTER TABLE public.project_gate ENABLE TRIGGER project_gate_guard;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like($$ SELECT pg_temp.rehearse('copy') $$, '%transfer_gate_invalid%', 'the function validates gate order itself');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
