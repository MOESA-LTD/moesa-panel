CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The copy path (043) on the MOESA demo company of seed.sql: akif copies THO into its branch
-- MOESA Europe, with the three GTINs cleared. The customer is in both tenants, the codes are kept
-- (no counter moves in Europe), the suppliers are copied with their contact, the references follow
-- the new ids, the users who are not members of Europe are replaced or cleared, the generated line
-- total is computed again, the files to copy are listed (a shared file kept in the source), the
-- target's audit transaction is the transfer's, and a second identical run is stale. What it writes
-- is rolled back.
BEGIN;

SELECT plan(20);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100')),
    ('spec_mop', (SELECT d.id FROM public.document d JOIN public.product p ON p.id = d.entity_id
                  WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet'))
) AS x (k, v);
SELECT set_config('test.tr1', (SELECT id FROM public.supplier WHERE code = 'TR1' AND tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.task1', (
    SELECT id FROM public.project_task WHERE project_id = current_setting('test.pilot')::UUID ORDER BY phase, position LIMIT 1
)::TEXT, TRUE);

-- Fixtures in MOESA. A contact of TR1 (…001); a PO of THO from TR1 (…002) with one line for the
-- mop, 10 at 2 (…003); a THO document written by the coordinator (…004); task 1 of the pilot
-- assigned to the coordinator; a THO file with a thumbnail (…011), the mop's primary image; a
-- shared file without a customer (…012), linked to the cones.
INSERT INTO public.supplier_contact (id, tenant_id, supplier_id, name)
VALUES ('00000000-0000-4000-8000-000000043001', current_setting('test.moesa')::UUID, current_setting('test.tr1')::UUID, 'Kutlu satış');

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency)
VALUES ('00000000-0000-4000-8000-000000043002', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.tr1')::UUID, 'USD');
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000043003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000043002',
        current_setting('test.mop')::UUID, 10, 2);
RESET ROLE;

SELECT set_config('moesa.rules_bypass', '1', TRUE);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url, created_by)
VALUES ('00000000-0000-4000-8000-000000043004', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'customer',
        current_setting('test.tho')::UUID, 'contract', 'draft', 'https://example.test/tho-contract.pdf',
        current_setting('test.koordinator')::UUID);
UPDATE public.project_task SET assignee_id = current_setting('test.koordinator')::UUID WHERE id = current_setting('test.task1')::UUID;
SELECT set_config('moesa.rules_bypass', '', TRUE);

INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'media', current_setting('test.moesa') || '/' || f.path, jsonb_build_object('mimetype', f.mime, 'size', 1000)
FROM (VALUES ('00000000-0000-4000-8000-000000043011/mop.png', 'image/png'),
             ('00000000-0000-4000-8000-000000043011/thumb/thumb.webp', 'image/webp'),
             ('00000000-0000-4000-8000-000000043012/shared.png', 'image/png')) AS f (path, mime);

INSERT INTO public.media (id, tenant_id, customer_id, storage_path, thumbnail_path, file_name, mime_type, size_bytes)
VALUES ('00000000-0000-4000-8000-000000043011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000043011/mop.png',
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000043011/thumb/thumb.webp', 'mop.png', 'image/png', 1000),
       ('00000000-0000-4000-8000-000000043012', current_setting('test.moesa')::UUID, NULL,
        current_setting('test.moesa') || '/00000000-0000-4000-8000-000000043012/shared.png', NULL, 'shared.png', 'image/png', 1000);

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.media_link (tenant_id, media_id, entity_type, entity_id, role)
VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000043011', 'product', current_setting('test.mop')::UUID, 'primary_image'),
       (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000043012', 'product', current_setting('test.cones')::UUID, 'gallery');

-- akif rehearses a copy into Europe, clears the three GTINs, rehearses again and runs it.
CREATE FUNCTION pg_temp.rehearse (decisions JSONB DEFAULT '{}') RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
        decisions => decisions
    );
$$;
CREATE FUNCTION pg_temp.run (decisions JSONB, report_hash TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT public.transfer_customer(
        current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID, current_setting('test.tho')::UUID, 'copy',
        decisions => decisions, dry_run => FALSE, report_hash => report_hash
    );
$$;

SELECT set_config('test.d', (
    SELECT jsonb_object_agg(c ->> 'key', '{"action": "clear_gtin"}'::JSONB)
    FROM jsonb_array_elements(pg_temp.rehearse() -> 'conflicts') c
    WHERE c ->> 'kind' = 'gtin'
)::TEXT, TRUE);
SELECT set_config('test.h', pg_temp.rehearse(current_setting('test.d')::JSONB) ->> 'report_hash', TRUE);
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT set_config('test.r', pg_temp.run(current_setting('test.d')::JSONB, current_setting('test.h'))::TEXT, TRUE);
RESET ROLE;

-- The target id of a source row.
CREATE FUNCTION pg_temp.copy_of (tbl TEXT, source_id TEXT) RETURNS UUID LANGUAGE sql AS $$
    SELECT (current_setting('test.r')::JSONB -> 'id_map' -> tbl ->> source_id)::UUID;
$$;

-- 1–2. THO is in both tenants.
SELECT is((SELECT count(*) FROM public.customer WHERE tenant_id = current_setting('test.europe')::UUID AND code = 'THO'), 1::BIGINT,
          'Europe has a THO');
SELECT is((SELECT count(*) FROM public.customer WHERE tenant_id = current_setting('test.moesa')::UUID AND code = 'THO'), 1::BIGINT,
          'and MOESA keeps its THO');

-- 3–5. The pilot keeps its code and its gates; no counter moves in Europe.
SELECT is((SELECT code FROM public.project WHERE id = pg_temp.copy_of('project', current_setting('test.pilot'))),
          (SELECT code FROM public.project WHERE id = current_setting('test.pilot')::UUID),
          'the pilot keeps its code');
SELECT is((SELECT count(*) FROM public.project_gate WHERE project_id = pg_temp.copy_of('project', current_setting('test.pilot'))),
          (SELECT count(*) FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID),
          'with as many gates');
SELECT is((SELECT count(*) FROM public.code_sequence WHERE tenant_id = current_setting('test.europe')::UUID), 0::BIGINT,
          'no code is numbered in Europe');

-- 6–7. The suppliers are copied, with TR1's contact.
SELECT ok(
    (SELECT s.tenant_id = current_setting('test.europe')::UUID AND s.code = 'TR1' AND s.id <> current_setting('test.tr1')::UUID
     FROM public.product p JOIN public.supplier s ON s.id = p.supplier_id
     WHERE p.id = pg_temp.copy_of('product', current_setting('test.mop'))),
    'the Europe mop comes from a Europe TR1'
);
SELECT is((SELECT count(*) FROM public.supplier_contact WHERE tenant_id = current_setting('test.europe')::UUID), 1::BIGINT,
          'TR1''s contact is copied');

-- 8. A document follows its entity.
SELECT is((SELECT entity_id FROM public.document WHERE id = pg_temp.copy_of('document', current_setting('test.spec_mop'))),
          pg_temp.copy_of('product', current_setting('test.mop')),
          'the spec sheet names the Europe mop');

-- 9–11. The coordinator is not a member of Europe.
SELECT is((SELECT created_by FROM public.document WHERE id = pg_temp.copy_of('document', '00000000-0000-4000-8000-000000043004')),
          current_setting('test.akif')::UUID,
          'a document written by a non-member is written by the caller');
SELECT ok((SELECT coordinator_id IS NULL FROM public.project WHERE id = pg_temp.copy_of('project', current_setting('test.pilot'))),
          'a non-member coordinator is cleared');
SELECT ok((SELECT assignee_id IS NULL FROM public.project_task WHERE id = pg_temp.copy_of('project_task', current_setting('test.task1'))),
          'a non-member assignee is cleared');

-- 12. The generated line total.
SELECT is((SELECT line_total FROM public.purchase_order_line
           WHERE id = pg_temp.copy_of('purchase_order_line', '00000000-0000-4000-8000-000000043003')),
          20::NUMERIC,
          'the line total is computed again');

-- 13–16. The files to copy.
SELECT is(current_setting('test.r')::JSONB ->> 'files_status', 'pending', 'the files wait to be copied');
SELECT is(jsonb_array_length(current_setting('test.r')::JSONB -> 'files'), 3, 'THO''s file, its thumbnail and the shared file');
SELECT is(
    (SELECT thumbnail_path FROM public.media WHERE id = pg_temp.copy_of('media', '00000000-0000-4000-8000-000000043011')),
    current_setting('test.europe') || '/' || pg_temp.copy_of('media', '00000000-0000-4000-8000-000000043011') || '/thumb/thumb.webp',
    'the thumbnail lands in the target''s thumb folder'
);
SELECT ok(
    EXISTS (SELECT 1 FROM public.media WHERE id = '00000000-0000-4000-8000-000000043012' AND tenant_id = current_setting('test.moesa')::UUID)
    AND EXISTS (
        SELECT 1 FROM public.media
        WHERE id = pg_temp.copy_of('media', '00000000-0000-4000-8000-000000043012')
          AND tenant_id = current_setting('test.europe')::UUID AND customer_id IS NULL
    )
    AND current_setting('test.r')::JSONB -> 'files' @> jsonb_build_array(jsonb_build_object(
        'media_id', pg_temp.copy_of('media', '00000000-0000-4000-8000-000000043012'), 'keep_source', TRUE
    )),
    'the shared file stays in MOESA, is copied without a customer and its source is kept'
);

-- 17. The id map.
SELECT is(current_setting('test.r')::JSONB -> 'id_map' -> 'customer' ->> current_setting('test.tho'),
          (SELECT id::TEXT FROM public.customer WHERE tenant_id = current_setting('test.europe')::UUID AND code = 'THO'),
          'the id map names the Europe THO');

-- 18–19. The target's audit transaction is the transfer's.
SELECT is(
    (SELECT row(table_name, tenant_id) FROM public.audit_transaction
     WHERE id = (current_setting('test.r')::JSONB -> 'audit_transaction_ids' ->> 0)::UUID),
    row('transfer'::TEXT, current_setting('test.europe')::UUID),
    'the target''s audit transaction is about the transfer'
);
SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_log l
        WHERE l.transaction_id = (current_setting('test.r')::JSONB -> 'audit_transaction_ids' ->> 0)::UUID
          AND l.table_name = 'customer' AND l.operation = 'INSERT' AND l.new_data ->> 'code' = 'THO'
    ),
    'and holds the customer''s insert'
);

-- 20. A double submit.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_like(
    $$ SELECT pg_temp.run(current_setting('test.d')::JSONB, current_setting('test.h')) $$,
    '%transfer_report_stale%',
    'a second identical run is stale'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
