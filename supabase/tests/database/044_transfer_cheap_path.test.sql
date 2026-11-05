CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The cheap path (044) on the MOESA demo company of seed.sql: akif moves THO from MOESA LTD into
-- its branch MOESA Europe, which has no THO and no TR1, so the rehearsal finds no conflict and the
-- package is moved in place. The rows keep their ids (G1 stays passed), the suppliers are copied
-- (TR1 stays in MOESA), the THO file moves into Europe's folder, a shared file is copied and the
-- THO document citing it follows the copy, the source gets a "transferred out" entry and the
-- target's audit transaction is the transfer's. A Europe THO would send the same move down the
-- copy path. A shipment line on its order link moves too; a supplier mapped onto Europe's TR1
-- keeps the cheap path; a copied supplier takes its document; a file above the target's size cap
-- (lowered after the upload) is refused in place as in a copy. What it writes is rolled back.
BEGIN;

SELECT plan(18);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P'))
) AS x (k, v);
SELECT set_config('test.tr1', (SELECT id FROM public.supplier WHERE code = 'TR1' AND tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.g1', (
    SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'
)::TEXT, TRUE);

-- Fixtures in MOESA. G1 of the pilot passed by the coordinator with a gate approval (…001); a THO
-- file with a thumbnail (…011), the mop's primary image; a shared file without a customer (…012)
-- and a THO document citing it (…013); a document of TR1 (…014), which only the copy of TR1 takes;
-- an order of THO from TR1 (…021) with a line of 10 mops (…022), on a shipment (…023) through the
-- link row (no id) with a shipment line (…024).
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000044001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        current_setting('test.g1')::UUID, 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate(current_setting('test.g1')::UUID, 'brief ok', current_date, '00000000-0000-4000-8000-000000044001');
RESET ROLE;

INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'media', current_setting('test.moesa') || '/' || f.path, jsonb_build_object('mimetype', f.mime, 'size', 1000)
FROM (VALUES ('00000000-0000-4000-8000-000000044011/mop.png', 'image/png'),
             ('00000000-0000-4000-8000-000000044011/thumb/thumb.webp', 'image/webp'),
             ('00000000-0000-4000-8000-000000044012/shared.pdf', 'application/pdf')) AS f (path, mime);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, thumbnail_path, file_name, mime_type, size_bytes)
VALUES ('00000000-0000-4000-8000-000000044011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000044011/mop.png',
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000044011/thumb/thumb.webp', 'mop.png', 'image/png', 1000),
       ('00000000-0000-4000-8000-000000044012', current_setting('test.moesa')::UUID, NULL,
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000044012/shared.pdf', NULL, 'shared.pdf', 'application/pdf', 1000);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.media_link (tenant_id, media_id, entity_type, entity_id, role)
VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000044011', 'product', current_setting('test.mop')::UUID, 'primary_image');
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, media_id)
VALUES ('00000000-0000-4000-8000-000000044013', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'customer',
        current_setting('test.tho')::UUID, 'other', 'draft', '00000000-0000-4000-8000-000000044012');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency)
VALUES ('00000000-0000-4000-8000-000000044021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.tr1')::UUID, 'USD');
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000044022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000044021',
        current_setting('test.mop')::UUID, 10, 2);
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
SELECT '00000000-0000-4000-8000-000000044023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', w.id
FROM public.customer_warehouse w WHERE w.customer_id = current_setting('test.tho')::UUID AND w.display_name = 'Rosbach';

RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)
VALUES ('00000000-0000-4000-8000-000000044023', '00000000-0000-4000-8000-000000044021', current_setting('test.moesa')::UUID);
INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity)
VALUES ('00000000-0000-4000-8000-000000044024', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000044023',
        '00000000-0000-4000-8000-000000044021', '00000000-0000-4000-8000-000000044022', 10);
SELECT set_config('moesa.rules_bypass', '', TRUE);
INSERT INTO public.document (id, tenant_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000044014', current_setting('test.moesa')::UUID, 'supplier', current_setting('test.tr1')::UUID,
        'other', 'draft', 'https://example.test/tr1.pdf');

SELECT set_config('test.g1_passed_at', (SELECT passed_at::TEXT FROM public.project_gate WHERE id = current_setting('test.g1')::UUID), TRUE);

-- akif rehearses the move into Europe and runs it.
CREATE FUNCTION pg_temp.move (decisions JSONB DEFAULT '{}', report_hash TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'move',
        decisions => decisions, dry_run => report_hash IS NULL, report_hash => report_hash
    );
$$;

-- 14 (rehearsed before the move, checked last). In a savepoint (an exception block), a Europe
-- customer THO first: the same rehearsal then takes the copy path. Rolled back.
CREATE FUNCTION pg_temp.path_with_europe_tho () RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    taken TEXT;
BEGIN
    BEGIN
        INSERT INTO public.customer (tenant_id, code, display_name, commercial_model)
        SELECT current_setting('test.europe')::UUID, 'THO', 'Thometzki Europe', c.commercial_model
        FROM public.customer c WHERE c.id = current_setting('test.tho')::UUID;
        PERFORM private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
        taken := pg_temp.move() ->> 'path';
        RAISE EXCEPTION 'rolled back' USING ERRCODE = 'T0001';
    EXCEPTION WHEN SQLSTATE 'T0001' THEN
        NULL;
    END;
    RETURN taken;
END;
$$;
RESET ROLE;
SELECT set_config('test.path_with_tho', pg_temp.path_with_europe_tho(), TRUE);

-- 16 (run before the move, checked after 15). In an exception block, Europe has a TR1 of its own
-- and akif maps MOESA's TR1 onto it: the move still takes the cheap path, the mop's supplier is
-- Europe's TR1 and TR1's document is not copied (a mapped supplier's documents stay). Rolled back.
CREATE FUNCTION pg_temp.move_with_mapped_tr1 () RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    europe_tr1 UUID := gen_random_uuid();
    picks JSONB;
    r JSONB;
    seen JSONB;
BEGIN
    BEGIN
        INSERT INTO public.supplier
        SELECT (jsonb_populate_record(NULL::public.supplier, to_jsonb(s) || jsonb_build_object(
            'id', europe_tr1, 'tenant_id', current_setting('test.europe')))).*
        FROM public.supplier s WHERE s.id = current_setting('test.tr1')::UUID;

        PERFORM private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
        SELECT jsonb_object_agg(c ->> 'key', jsonb_build_object('action', 'map', 'target_id', c ->> 'existing_id')) INTO picks
        FROM jsonb_array_elements(pg_temp.move() -> 'conflicts') c
        WHERE c ->> 'kind' = 'supplier_code';
        PERFORM set_config('audit.transaction_id', '', TRUE);
        r := pg_temp.move(picks, pg_temp.move(picks) ->> 'report_hash');
        RESET ROLE;

        seen := jsonb_build_object(
            'path', r ->> 'path',
            'mop_supplier_is_europe_tr1',
            (SELECT p.supplier_id = europe_tr1 FROM public.product p WHERE p.id = current_setting('test.mop')::UUID),
            'tr1_documents_in_europe',
            (SELECT count(*) FROM public.document d
             WHERE d.tenant_id = current_setting('test.europe')::UUID AND d.entity_type = 'supplier' AND d.entity_id = europe_tr1)
        );
        RAISE EXCEPTION 'rolled back' USING ERRCODE = 'T0001';
    EXCEPTION WHEN SQLSTATE 'T0001' THEN
        NULL;
    END;
    RETURN seen;
END;
$$;
SELECT set_config('test.mapped_tr1', pg_temp.move_with_mapped_tr1()::TEXT, TRUE);

-- 18 (run before the move, checked last). In an exception block, the company's size cap lowered to
-- 1 MB below the THO file of 2 MB uploaded before: the in-place move refuses it, as a copy would.
CREATE FUNCTION pg_temp.move_over_cap () RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    failure TEXT;
BEGIN
    BEGIN
        ALTER TABLE public.media DISABLE TRIGGER media_check_file;
        UPDATE public.media SET size_bytes = 2097152 WHERE id = '00000000-0000-4000-8000-000000044011';
        ALTER TABLE public.media ENABLE TRIGGER media_check_file;
        DELETE FROM public.setting WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'media_max_mb';
        INSERT INTO public.setting (tenant_id, key, value) VALUES (current_setting('test.moesa')::UUID, 'media_max_mb', '1');
        PERFORM private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
        BEGIN
            PERFORM set_config('audit.transaction_id', '', TRUE);
            PERFORM pg_temp.move('{}', pg_temp.move() ->> 'report_hash');
            failure := 'moved';
        EXCEPTION WHEN check_violation THEN
            failure := SQLERRM;
        END;
        RAISE EXCEPTION 'rolled back' USING ERRCODE = 'T0001';
    EXCEPTION WHEN SQLSTATE 'T0001' THEN
        NULL;
    END;
    RETURN failure;
END;
$$;
RESET ROLE;
SELECT set_config('test.over_cap', pg_temp.move_over_cap(), TRUE);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.h', pg_temp.move() ->> 'report_hash', TRUE);
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT set_config('test.r', pg_temp.move('{}', current_setting('test.h'))::TEXT, TRUE);
RESET ROLE;

-- 1–4. THO is in Europe, G1 as it was; the mop's supplier is Europe's copy of TR1, which stays.
SELECT is((SELECT tenant_id FROM public.customer WHERE id = current_setting('test.tho')::UUID), current_setting('test.europe')::UUID,
          'THO is in Europe, under its own id');
SELECT is(
    (SELECT row(tenant_id, status::TEXT, passed_at::TEXT) FROM public.project_gate WHERE id = current_setting('test.g1')::UUID),
    row(current_setting('test.europe')::UUID, 'passed'::TEXT, current_setting('test.g1_passed_at')),
    'G1 is in Europe, still passed on the same date'
);
SELECT ok(
    (SELECT s.tenant_id = current_setting('test.europe')::UUID AND s.id <> current_setting('test.tr1')::UUID
     FROM public.product p JOIN public.supplier s ON s.id = p.supplier_id
     WHERE p.id = current_setting('test.mop')::UUID),
    'the mop''s supplier is a Europe supplier, not MOESA''s TR1'
);
SELECT ok(EXISTS (SELECT 1 FROM public.supplier WHERE id = current_setting('test.tr1')::UUID AND tenant_id = current_setting('test.moesa')::UUID),
          'MOESA''s TR1 still exists');

-- 5–6. The THO file keeps its id, in Europe's folder.
SELECT ok(
    (SELECT storage_path LIKE current_setting('test.europe') || '/' || id || '/%' AND tenant_id = current_setting('test.europe')::UUID
     FROM public.media WHERE id = '00000000-0000-4000-8000-000000044011'),
    'the THO file keeps its id and moves into Europe''s folder'
);
SELECT is((SELECT thumbnail_path FROM public.media WHERE id = '00000000-0000-4000-8000-000000044011'),
          current_setting('test.europe') || '/00000000-0000-4000-8000-000000044011/thumb/thumb.webp',
          'and its thumbnail too');

-- 7–9. The transfer row.
SELECT is(current_setting('test.r')::JSONB ->> 'files_status', 'pending', 'the files wait to be copied');
SELECT is(current_setting('test.r')::JSONB ->> 'path', 'cheap', 'the move took the cheap path');
SELECT is(
    row(current_setting('test.r')::JSONB -> 'id_map' -> 'customer' ->> current_setting('test.tho'),
        current_setting('test.r')::JSONB ->> 'target_customer_id'),
    row(current_setting('test.tho'), current_setting('test.tho')),
    'the customer keeps its id, in the map and as the target customer'
);

-- 10. Nothing of the package stays behind in MOESA.
CREATE FUNCTION pg_temp.package_ids () RETURNS SETOF UUID LANGUAGE sql AS $$
    SELECT k::UUID FROM jsonb_each(current_setting('test.r')::JSONB -> 'id_map') t, jsonb_object_keys(t.value) k
    WHERE t.key NOT IN ('supplier', 'supplier_contact', 'media');
$$;
SELECT is(
    (SELECT count(*) FROM public.document WHERE tenant_id = current_setting('test.moesa')::UUID
       AND (customer_id = current_setting('test.tho')::UUID OR entity_id IN (SELECT pg_temp.package_ids())))
    + (SELECT count(*) FROM public.media_link WHERE tenant_id = current_setting('test.moesa')::UUID
       AND entity_id IN (SELECT pg_temp.package_ids()))
    + (SELECT count(*) FROM public.project_product WHERE tenant_id = current_setting('test.moesa')::UUID
       AND (project_id IN (SELECT pg_temp.package_ids()) OR product_id IN (SELECT pg_temp.package_ids()))),
    0::BIGINT,
    'no MOESA document, media link or project product refers to THO''s package'
);

-- 11. A document of a shared file cites Europe's copy; the shared file stays in MOESA.
SELECT is(
    (SELECT row(d.tenant_id, d.media_id, s.tenant_id)
     FROM public.document d, public.media s
     WHERE d.id = '00000000-0000-4000-8000-000000044013' AND s.id = '00000000-0000-4000-8000-000000044012'),
    row(current_setting('test.europe')::UUID,
        (current_setting('test.r')::JSONB -> 'id_map' -> 'media' ->> '00000000-0000-4000-8000-000000044012')::UUID,
        current_setting('test.moesa')::UUID),
    'documents of shared media follow the copy'
);

-- 12–13. The audit entries: a transferred-out entry in the source, the transfer in the target.
SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_transaction t
        JOIN public.audit_log l ON l.transaction_id = t.id AND l.created_at = t.created_at
        WHERE t.tenant_id = current_setting('test.moesa')::UUID AND t.table_name = 'customer'
          AND t.record_id = current_setting('test.tho')::UUID AND t.operation = 'DELETE'
          AND l.table_schema = 'public' AND l.table_name = 'customer'
          AND l.new_data ->> 'transfer_id' = current_setting('test.r')::JSONB ->> 'id'
          AND t.id::TEXT IN (SELECT jsonb_array_elements_text(current_setting('test.r')::JSONB -> 'audit_transaction_ids'))
    ),
    'the source gets a transferred-out entry'
);
SELECT is(
    (SELECT row(table_name, tenant_id) FROM public.audit_transaction
     WHERE id = (current_setting('test.r')::JSONB -> 'audit_transaction_ids' ->> 0)::UUID),
    row('transfer'::TEXT, current_setting('test.europe')::UUID),
    'the first audit transaction is the transfer, in Europe'
);

-- 14. (Rehearsed above, before the move.)
SELECT is(current_setting('test.path_with_tho'), 'copy', 'with a Europe THO the same move takes the copy path');

-- 15. The shipment line, on the link row without id, is in Europe with its link; none stays in MOESA.
SELECT is(
    (SELECT row(
        (SELECT l.tenant_id FROM public.shipment_line l WHERE l.id = '00000000-0000-4000-8000-000000044024'),
        (SELECT count(*) FROM public.shipment_purchase_order k
         WHERE k.shipment_id = '00000000-0000-4000-8000-000000044023' AND k.tenant_id = current_setting('test.europe')::UUID),
        (SELECT count(*) FROM public.shipment_purchase_order k
         WHERE k.shipment_id = '00000000-0000-4000-8000-000000044023' AND k.tenant_id = current_setting('test.moesa')::UUID))),
    row(current_setting('test.europe')::UUID, 1::BIGINT, 0::BIGINT),
    'a shipment line and its order link move in place'
);

-- 16. (Run above, before the move.)
SELECT is(
    current_setting('test.mapped_tr1')::JSONB,
    '{"path": "cheap", "mop_supplier_is_europe_tr1": true, "tr1_documents_in_europe": 0}'::JSONB,
    'a supplier mapped onto Europe''s TR1 keeps the cheap path, and its document stays'
);

-- 17. A copied supplier takes its document: Europe's copy of TR1 has a copy of it, MOESA keeps it.
SELECT is(
    (SELECT row(
        (SELECT d.tenant_id FROM public.document d WHERE d.id = '00000000-0000-4000-8000-000000044014'),
        (SELECT d.tenant_id FROM public.document d
         WHERE d.id = (current_setting('test.r')::JSONB -> 'id_map' -> 'document' ->> '00000000-0000-4000-8000-000000044014')::UUID),
        (SELECT d.entity_id FROM public.document d
         WHERE d.id = (current_setting('test.r')::JSONB -> 'id_map' -> 'document' ->> '00000000-0000-4000-8000-000000044014')::UUID))),
    row(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
        (current_setting('test.r')::JSONB -> 'id_map' -> 'supplier' ->> current_setting('test.tr1'))::UUID),
    'a copied supplier''s document is copied with it, the original stays'
);

-- 18. (Run above, before the move.)
SELECT is(current_setting('test.over_cap'), 'media_too_large', 'a file above the target''s size cap is not moved in place');

SELECT * FROM finish();

ROLLBACK;
