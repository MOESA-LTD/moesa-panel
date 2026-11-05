CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The copy path (043) on the MOESA demo company of seed.sql: akif copies THO into its branch
-- MOESA Europe, with the three GTINs cleared. The customer is in both tenants, the codes are kept
-- (Europe's counters pass them), the suppliers are copied with their contact, the references follow
-- the new ids, the users who are not members of Europe are replaced or cleared, the generated line
-- total is computed again, the files to copy are listed (a shared file kept in the source), the
-- target's audit transaction is the transfer's, and a second identical run is stale. Then THO is
-- copied again onto that Europe THO: its platform account, market cell and primary image meet the
-- copy's (map, demote), the suppliers are mapped, the mop is skipped with what hangs from it, the
-- pilot and the order get new codes, and the mapped customer keeps its contract; its contact,
-- warehouse and brand meet Europe's and are mapped (the shipment follows the warehouse, one default
-- stays), the market cell's document and image are reported under the mapped cell, and the mop's
-- file, used only by the skipped mop, is not copied. What it writes is rolled back.
BEGIN;

SELECT plan(41);

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
    ('rosbach', (SELECT id FROM public.customer_warehouse WHERE display_name = 'Rosbach')),
    ('contact', (SELECT id FROM public.customer_contact WHERE name = 'Thometzki Einkauf')),
    ('spec_mop', (SELECT d.id FROM public.document d JOIN public.product p ON p.id = d.entity_id
                  WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet'))
) AS x (k, v);
SELECT set_config('test.tr1', (SELECT id FROM public.supplier WHERE code = 'TR1' AND tenant_id = current_setting('test.moesa')::UUID)::TEXT, TRUE);
SELECT set_config('test.task1', (
    SELECT id FROM public.project_task WHERE project_id = current_setting('test.pilot')::UUID ORDER BY phase, position LIMIT 1
)::TEXT, TRUE);

-- Fixtures in MOESA. A contact of TR1 (…001); a PO of THO from TR1 (…002) with one line for the
-- mop, 10 at 2 (…003); a THO document written by the coordinator (…004); task 1 of the pilot
-- assigned to the coordinator, also THO's contract; G1 of the pilot approved by the mop's spec sheet,
-- with the spec sheet and the contract as evidence; a THO file with a thumbnail (…011), the mop's
-- primary image; a shared file without a customer (…012), the cones' primary image; a market cell
-- of the cones (amazon DE).
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
UPDATE public.customer SET contract_document_id = '00000000-0000-4000-8000-000000043004' WHERE id = current_setting('test.tho')::UUID;
UPDATE public.project_gate
SET approval_document_id = current_setting('test.spec_mop')::UUID,
    evidence_document_ids = ARRAY[current_setting('test.spec_mop')::UUID, '00000000-0000-4000-8000-000000043004'::UUID]
WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1';
INSERT INTO public.market_cell (id, tenant_id, customer_id, product_id, platform_id, country)
VALUES ('00000000-0000-4000-8000-000000043006', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
        current_setting('test.cones')::UUID, 'amazon', 'DE');
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000043007', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'market_cell',
        '00000000-0000-4000-8000-000000043006', 'other', 'draft', 'https://example.test/listing.pdf');
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
       (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000043012', 'product', current_setting('test.cones')::UUID, 'primary_image'),
       (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000043012', 'market_cell', '00000000-0000-4000-8000-000000043006', 'primary_image');
-- A shipment of THO to Rosbach (…005).
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
VALUES ('00000000-0000-4000-8000-000000043005', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road',
        current_setting('test.rosbach')::UUID);

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
SELECT ok(
    (SELECT s.last_no >= split_part(p.code, '-', 3)::INT
     FROM public.project p
     JOIN public.code_sequence s ON s.tenant_id = current_setting('test.europe')::UUID AND s.kind = 'project'
      AND s.scope = 'THO' AND s.year = split_part(p.code, '-', 2)::INT
     WHERE p.id = current_setting('test.pilot')::UUID),
    'Europe''s THO project counter has passed the copied pilot'
);

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

-- 21. The next THO project made in Europe takes the next number.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.europe')::UUID);
INSERT INTO public.project (tenant_id, customer_id, display_name, type, path)
VALUES (current_setting('test.europe')::UUID, (current_setting('test.r')::JSONB ->> 'target_customer_id')::UUID,
        'Europa projesi', 'npi', 'a_sourcing');
RESET ROLE;
SELECT is(
    (SELECT code FROM public.project WHERE tenant_id = current_setting('test.europe')::UUID AND display_name = 'Europa projesi'),
    'THO-' || extract(year FROM now())::INT || '-002',
    'the next THO project in Europe does not take a copied code'
);

-- 22–34. THO copied again, onto the Europe THO. Every conflict is decided in rounds (a decision can
-- bring the next conflicts): the customer, suppliers, SKUs, contract version, platform account and
-- market cell are mapped onto what Europe has, the mop is skipped, the codes are new and the primary
-- image is demoted.
SELECT set_config('test.eu_tho', current_setting('test.r')::JSONB ->> 'target_customer_id', TRUE);
SELECT set_config('test.eu_contract', (SELECT contract_document_id::TEXT FROM public.customer WHERE id = current_setting('test.eu_tho')::UUID), TRUE);
SELECT set_config('test.cones_link', (SELECT id::TEXT FROM public.media_link WHERE entity_id = current_setting('test.cones')::UUID), TRUE);
SELECT set_config('test.cell_link', (SELECT id::TEXT FROM public.media_link WHERE entity_id = '00000000-0000-4000-8000-000000043006'), TRUE);
-- A second default warehouse of THO in MOESA, which Europe does not have.
INSERT INTO public.customer_warehouse (tenant_id, customer_id, display_name, type, is_default)
VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Lager Zwei', 'own', TRUE);
SELECT set_config('test.eu_amazon', (SELECT id::TEXT FROM public.customer_platform_account WHERE customer_id = current_setting('test.eu_tho')::UUID), TRUE);

CREATE FUNCTION pg_temp.decide_all (d JSONB) RETURNS JSONB LANGUAGE sql AS $$
    SELECT d || coalesce(jsonb_object_agg(c ->> 'key', CASE
        WHEN c ->> 'kind' = 'code' THEN '{"action": "new_code"}'::JSONB
        WHEN c ->> 'kind' = 'media_link' THEN '{"action": "demote"}'::JSONB
        WHEN c ->> 'kind' = 'gtin' THEN '{"action": "clear_gtin"}'::JSONB
        WHEN c ->> 'kind' = 'sku' AND c ->> 'source_id' = current_setting('test.mop') THEN '{"action": "skip"}'::JSONB
        ELSE jsonb_build_object('action', 'map', 'target_id', c -> 'existing_id')
    END), '{}')
    FROM jsonb_array_elements(pg_temp.rehearse(d) -> 'conflicts') c
    WHERE NOT (c -> 'actions') ? coalesce(d -> (c ->> 'key') ->> 'action', '');
$$;

SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT set_config('test.d2', pg_temp.decide_all(pg_temp.decide_all(pg_temp.decide_all(pg_temp.decide_all(jsonb_build_object(
    'customer:' || current_setting('test.tho'), jsonb_build_object('action', 'map', 'target_id', current_setting('test.eu_tho'))
)))))::TEXT, TRUE);
SELECT set_config('test.r2', pg_temp.rehearse(current_setting('test.d2')::JSONB)::TEXT, TRUE);

SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'kind', 'platform_account', 'label', 'amazon', 'actions', '["map", "skip"]'::JSONB,
        'existing_id', current_setting('test.eu_amazon')
    )),
    'the mapped THO has an amazon account already: map or skip'
);
SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> '[{"kind": "market_cell", "label": "amazon DE", "actions": ["map", "skip"]}]',
    'the mapped cones have an amazon DE cell already'
);
SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'media_link:' || current_setting('test.cones_link'), 'kind', 'media_link',
        'actions', '["map", "demote", "skip"]'::JSONB
    )),
    'the mapped cones have a primary image already: map, demote or skip'
);
SELECT is((current_setting('test.r2')::JSONB ->> 'unresolved')::INT, 0, 'every conflict is decided');

-- 26. demote fits a media link only.
SELECT throws_like(
    format(
        $$ SELECT pg_temp.run(%L::JSONB, pg_temp.rehearse(%L::JSONB) ->> 'report_hash') $$,
        (SELECT current_setting('test.d2')::JSONB || jsonb_build_object(c ->> 'key', '{"action": "demote"}'::JSONB)
         FROM jsonb_array_elements(current_setting('test.r2')::JSONB -> 'conflicts') c WHERE c ->> 'kind' = 'platform_account'),
        (SELECT current_setting('test.d2')::JSONB || jsonb_build_object(c ->> 'key', '{"action": "demote"}'::JSONB)
         FROM jsonb_array_elements(current_setting('test.r2')::JSONB -> 'conflicts') c WHERE c ->> 'kind' = 'platform_account')
    ),
    '%transfer_decision_invalid%',
    'a platform account is not demoted'
);

SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok(
    $$ SELECT set_config('test.r3', pg_temp.run(current_setting('test.d2')::JSONB, current_setting('test.r2')::JSONB ->> 'report_hash')::TEXT, TRUE) $$,
    'the copy onto the mapped THO runs'
);
RESET ROLE;

CREATE FUNCTION pg_temp.copy2_of (tbl TEXT, source_id TEXT) RETURNS UUID LANGUAGE sql AS $$
    SELECT (current_setting('test.r3')::JSONB -> 'id_map' -> tbl ->> source_id)::UUID;
$$;

-- 28. The mapped customer is not written again and keeps its contract.
SELECT is(
    (SELECT row(count(*), min(contract_document_id::TEXT)) FROM public.customer
     WHERE tenant_id = current_setting('test.europe')::UUID AND code = 'THO'),
    row(1::BIGINT, current_setting('test.eu_contract')),
    'Europe has one THO, with its own contract'
);

-- 29. The mapped TR1 is not copied, nor its contact.
SELECT is(
    (SELECT row(
        (SELECT count(*) FROM public.supplier WHERE tenant_id = current_setting('test.europe')::UUID AND code = 'TR1'),
        (SELECT count(*) FROM public.supplier_contact WHERE tenant_id = current_setting('test.europe')::UUID))),
    row(1::BIGINT, 1::BIGINT),
    'a mapped supplier is only an id'
);

-- 30–31. New codes from Europe's counters, past the codes kept.
SELECT is((SELECT code FROM public.project WHERE id = pg_temp.copy2_of('project', current_setting('test.pilot'))),
          'THO-' || extract(year FROM now())::INT || '-003',
          'the recoded pilot takes Europe''s next THO number');
SELECT is((SELECT code FROM public.purchase_order WHERE id = pg_temp.copy2_of('purchase_order', '00000000-0000-4000-8000-000000043002')),
          'PO-THO-' || extract(year FROM now())::INT || '-002',
          'the recoded order takes Europe''s next PO number');

-- 32. The skipped mop: no product, spec sheet, order line or project link.
SELECT ok(
    NOT (current_setting('test.r3')::JSONB -> 'id_map' -> 'product') ? current_setting('test.mop')
    AND NOT (current_setting('test.r3')::JSONB -> 'id_map' -> 'document') ? current_setting('test.spec_mop')
    AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_line
        WHERE purchase_order_id = pg_temp.copy2_of('purchase_order', '00000000-0000-4000-8000-000000043002')
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.project_product WHERE project_id = pg_temp.copy2_of('project', current_setting('test.pilot'))
    ),
    'the skipped mop takes its spec sheet, order line and project link with it'
);

-- 33. The gate's references: the skipped spec sheet is cleared, the mapped contract is Europe's.
SELECT is(
    (SELECT row(approval_document_id, evidence_document_ids) FROM public.project_gate
     WHERE project_id = pg_temp.copy2_of('project', current_setting('test.pilot')) AND code = 'G1'),
    row(NULL::UUID, ARRAY[pg_temp.copy_of('document', '00000000-0000-4000-8000-000000043004')]),
    'G1 loses the skipped approval and cites Europe''s contract'
);

-- 34. The primary image is demoted; the platform account and the market cell are not copied.
SELECT is(
    (SELECT row(
        (SELECT role::TEXT FROM public.media_link WHERE id = pg_temp.copy2_of('media_link', current_setting('test.cones_link'))),
        (SELECT count(*) FROM public.customer_platform_account WHERE customer_id = current_setting('test.eu_tho')::UUID),
        (SELECT count(*) FROM public.market_cell WHERE tenant_id = current_setting('test.europe')::UUID))),
    row('gallery'::TEXT, 1::BIGINT, 1::BIGINT),
    'a demoted primary image, one account and one market cell'
);

-- 35–38. THO's contact, warehouse and brand meet Europe's.
SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> jsonb_build_array(
        jsonb_build_object('kind', 'customer_contact', 'label', 'einkauf@thometzki.test', 'actions', '["map", "skip"]'::JSONB,
                           'existing_id', pg_temp.copy_of('customer_contact', current_setting('test.contact'))),
        jsonb_build_object('kind', 'customer_warehouse', 'label', 'Rosbach',
                           'existing_id', pg_temp.copy_of('customer_warehouse', current_setting('test.rosbach'))),
        jsonb_build_object('kind', 'customer_brand', 'label', 'OKAEI')
    ),
    'the mapped THO has the contact, the warehouse and the brand already'
);
SELECT is(
    (SELECT row(
        (SELECT count(*) FROM public.customer_contact WHERE customer_id = current_setting('test.eu_tho')::UUID),
        (SELECT count(*) FROM public.customer_warehouse WHERE customer_id = current_setting('test.eu_tho')::UUID),
        (SELECT count(*) FROM public.customer_brand WHERE customer_id = current_setting('test.eu_tho')::UUID))),
    row(1::BIGINT, 2::BIGINT, 1::BIGINT),
    'mapped children are not written twice; the new warehouse is copied'
);
SELECT is(
    (SELECT delivery_warehouse_id FROM public.shipment WHERE id = pg_temp.copy2_of('shipment', '00000000-0000-4000-8000-000000043005')),
    pg_temp.copy_of('customer_warehouse', current_setting('test.rosbach')),
    'the shipment goes to Europe''s Rosbach'
);
SELECT is(
    (SELECT count(*) FROM public.customer_warehouse WHERE customer_id = current_setting('test.eu_tho')::UUID AND is_default),
    1::BIGINT,
    'the mapped THO keeps one default warehouse'
);

-- 39–40. The market cell's document and primary image, under the mapped cell.
SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'document:00000000-0000-4000-8000-000000043007', 'kind', 'document_version', 'label', 'other v1',
        'existing_id', pg_temp.copy_of('document', '00000000-0000-4000-8000-000000043007')
    )),
    'the mapped cell has the listing document already'
);
SELECT ok(
    current_setting('test.r2')::JSONB -> 'conflicts' @> jsonb_build_array(jsonb_build_object(
        'key', 'media_link:' || current_setting('test.cell_link'), 'kind', 'media_link'
    )),
    'the mapped cell has a primary image already'
);

-- 41. Files: the mop's file (used only by the skipped mop) is not copied, the shared file is.
SELECT ok(
    NOT (current_setting('test.r3')::JSONB -> 'id_map' -> 'media') ? '00000000-0000-4000-8000-000000043011'
    AND (current_setting('test.r3')::JSONB -> 'id_map' -> 'media') ? '00000000-0000-4000-8000-000000043012'
    AND jsonb_array_length(current_setting('test.r3')::JSONB -> 'files') = 1,
    'a file only skipped or mapped rows use is not copied'
);

SELECT * FROM finish();

ROLLBACK;
