CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The cheap path (044) on the MOESA demo company of seed.sql: akif moves THO from MOESA LTD into
-- its branch MOESA Europe, which has no THO and no TR1, so the rehearsal finds no conflict and the
-- package is moved in place. The rows keep their ids (G1 stays passed), the suppliers are copied
-- (TR1 stays in MOESA), the THO file moves into Europe's folder, a shared file is copied and the
-- THO document citing it follows the copy, the source gets a "transferred out" entry and the
-- target's audit transaction is the transfer's. A Europe THO would send the same move down the
-- copy path. What it writes is rolled back.
BEGIN;

SELECT plan(14);

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
-- and a THO document citing it (…013); a document of TR1 (…014), which only the copy of TR1 takes.
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

RESET ROLE;
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

SELECT * FROM finish();

ROLLBACK;
