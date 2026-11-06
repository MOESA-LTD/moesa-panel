-- The development story seed: a coherent story for MOESA LTD on top of seed.sql. Development
-- only, never in config.toml. Run by scripts/seed-story.mjs (pnpm dev:seed-story from app/),
-- which uploads the media files first, then pipes this file to psql as postgres with
-- --single-transaction; supabase/seed_story.check.sql then checks the result.
--
-- Each story step is one DO block and one audit transaction:
--   PERFORM private.story_begin('<actor e-mail>', '<tenant>');   -- actor, tenant, fresh audit
--   … the step's writes (private.story_bypass(TRUE) only for backdated PO/shipment moves) …
--   PERFORM private.story_end('<age>');                          -- backdates the step's feed
-- The whole run is one transaction, so set_config(…, TRUE) values last until its end;
-- story_begin resets them, so nothing a step sets reaches the next one.
--
-- Rows are found by fixed UUID 5eed00SS-0000-4000-8000-0000000000NN (SS = step, NN = row);
-- seed.sql rows by code, sku or name. Codes and dates are never hard-coded (they depend on the
-- year and on today).

-- Refuses a second run: the story is loaded on top of a fresh `supabase db reset` only.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.customer WHERE code = 'KRN') THEN
        RAISE EXCEPTION 'seed_story: already loaded (customer KRN exists)';
    END IF;
END;
$$;

-- Starts a step as that user in that tenant: claims and headers (local, no SET ROLE, so the
-- audit actor and auth.uid() are that user), a new audit transaction and the rules bypass off.
-- Returns the tenant id.
CREATE FUNCTION private.story_begin (p_actor_email TEXT, p_tenant_name TEXT) RETURNS UUID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_actor UUID := (SELECT u.id FROM public.user u WHERE u.email = p_actor_email);
    v_tenant UUID := (SELECT t.id FROM public.tenant t WHERE t.display_name = p_tenant_name);
BEGIN
    IF v_actor IS NULL OR v_tenant IS NULL THEN
        RAISE EXCEPTION 'story: unknown user/tenant %', p_actor_email || ' / ' || p_tenant_name;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM set_config('request.headers', json_build_object('x-tenant-id', v_tenant, 'x-tenant-ids', v_tenant)::TEXT, TRUE);
    PERFORM set_config('audit.transaction_id', '', TRUE);
    PERFORM set_config('audit.tenant_id', '', TRUE);
    PERFORM set_config('moesa.rules_bypass', '', TRUE);

    IF private.rules_bypassed() THEN
        RAISE EXCEPTION 'story: the rules bypass is still on';
    END IF;

    RETURN v_tenant;
END;
$$;

-- Switches the rules bypass (private.rules_bypassed, 030) on or off for the rest of the step;
-- only for backdated purchase order and shipment transitions.
CREATE FUNCTION private.story_bypass (p_enabled BOOLEAN) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    PERFORM set_config('moesa.rules_bypass', CASE WHEN p_enabled THEN '1' ELSE '' END, TRUE);

    IF private.rules_bypassed() IS DISTINCT FROM p_enabled THEN
        RAISE EXCEPTION 'story: the rules bypass could not be turned %', CASE WHEN p_enabled THEN 'on' ELSE 'off' END;
    END IF;
END;
$$;

-- Ends a step: its audit transaction and log rows move p_age into the past (both together, the
-- feed joins them on equal created_at). A step that wrote nothing is a bug in the story.
CREATE FUNCTION private.story_end (p_age INTERVAL) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_tx UUID := nullif(current_setting('audit.transaction_id', TRUE), '')::UUID;
BEGIN
    IF v_tx IS NULL THEN
        RAISE EXCEPTION 'story: step wrote nothing';
    END IF;

    UPDATE public.audit_log SET created_at = created_at - p_age WHERE transaction_id = v_tx;
    UPDATE public.audit_transaction SET created_at = created_at - p_age WHERE id = v_tx;

    PERFORM set_config('audit.transaction_id', '', TRUE);
END;
$$;

-- The story steps follow here.

-- Inserts a document of the story (the fixed id p_id) in the request's tenant. Signed, approved
-- and superseded documents are also signed, stamped and sent from the official e-mail (the
-- document_signed_requires rule); the file name is <type>_v<version>. The url is a Drive example
-- unless a media row is given and no url. A supplier document passes p_customer_id NULL.
CREATE FUNCTION private.story_doc (
    p_id UUID,
    p_entity_type public.document_entity,
    p_entity_id UUID,
    p_customer_id UUID,
    p_type public.document_type,
    p_version INT,
    p_status public.document_status,
    p_issued_on DATE,
    p_url TEXT DEFAULT NULL,
    p_media_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_official BOOLEAN := p_status IN ('signed', 'approved', 'superseded');
BEGIN
    INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, version, status, issued_on, url,
                                 file_name, is_signed, is_stamped, sent_from_official_email, media_id)
    VALUES (p_id, private.requested_tenant(), p_customer_id, p_entity_type, p_entity_id, p_type, p_version, p_status,
            p_issued_on,
            CASE WHEN p_url IS NULL AND p_media_id IS NOT NULL THEN NULL
                 ELSE coalesce(p_url, 'https://drive.google.com/example/' || p_id) END,
            p_type || '_v' || p_version, v_official, v_official, v_official, p_media_id);

    RETURN p_id;
END;
$$;

-- Step 02 (40 days ago): customers, suppliers and settings, as baris in MOESA LTD. The customers
-- come first, so that the step's audit transaction is named after the customer table.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.tenant_id = v_tenant AND c.code = 'THO');
    v_krn UUID := '5eed0002-0000-4000-8000-000000000001';
    v_cn1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'CN1');
    v_tr1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'TR1');
    v_cn3 UUID := '5eed0002-0000-4000-8000-000000000005';
    v_tr3 UUID := '5eed0002-0000-4000-8000-000000000006';
    v_contract UUID;
BEGIN
    IF v_tho IS NULL OR v_cn1 IS NULL OR v_tr1 IS NULL THEN
        RAISE EXCEPTION 'story 02: THO, CN1 or TR1 is missing';
    END IF;

    -- Four more customers: one per lifecycle state and commercial model. No contract yet.
    INSERT INTO public.customer (id, tenant_id, code, display_name, country, commercial_model, packages, status, start_on)
    VALUES (v_krn, v_tenant, 'KRN', 'Kernhaus Living GmbH', 'Austria', 'commercial_representative',
            ARRAY['A0', 'A2', 'C'], 'onboarding', current_date + 14),
           ('5eed0002-0000-4000-8000-000000000002', v_tenant, 'LEA', 'Leafline Garten GmbH', 'Germany',
            'trading_partner', ARRAY['A1'], 'lead', NULL),
           ('5eed0002-0000-4000-8000-000000000003', v_tenant, 'PAU', 'Paxton Haushalt GmbH', 'Germany',
            'operations_partner', ARRAY['D'], 'paused', current_date - 200),
           -- Closed in step 04, after its project.
           ('5eed0002-0000-4000-8000-000000000004', v_tenant, 'CLS', 'Clearstar Handel GmbH', 'Germany',
            'trading_partner', ARRAY['A1', 'B'], 'active', current_date - 250);

    INSERT INTO public.customer_contact (tenant_id, customer_id, name, role, email, can_approve)
    VALUES (v_tenant, v_krn, 'Kernhaus Einkauf', 'Einkauf', 'einkauf@kernhaus.test', TRUE);

    INSERT INTO public.customer_warehouse (tenant_id, customer_id, display_name, type, country, city, is_default)
    VALUES (v_tenant, v_krn, 'Wien', 'own', 'Austria', 'Wien', TRUE);

    INSERT INTO public.customer_platform_account (tenant_id, customer_id, platform_id, countries, access)
    VALUES (v_tenant, v_krn, 'bol', ARRAY['NL'], 'authorized_user'),
           (v_tenant, v_krn, 'kaufland', ARRAY['AT'], 'authorized_user');

    -- THOMETZKI: the signed contract (C-G1), the restricted fields, and the rest of the demo set.
    v_contract := private.story_doc('5eed0002-0000-4000-8000-000000000007', 'customer', v_tho, v_tho, 'contract', 1,
                                    'signed', current_date - 300);

    UPDATE public.customer
    SET contract_accepted_on = current_date - 300,
        contract_document_id = v_contract,
        eu_responsible_person = 'MOESA Europe, EU responsible person',
        restricted_drive_url = 'https://drive.google.com/example/restricted-THO'
    WHERE id = v_tho;

    INSERT INTO public.customer_contact (tenant_id, customer_id, name, role, email, can_approve)
    VALUES (v_tenant, v_tho, 'Thometzki Operations', 'Operations', 'operations@thometzki.test', FALSE),
           (v_tenant, v_tho, 'Thometzki Lager', 'Lager', 'lager@thometzki.test', FALSE),
           (v_tenant, v_tho, 'Thometzki Buchhaltung', 'Buchhaltung', 'buchhaltung@thometzki.test', FALSE);

    INSERT INTO public.customer_warehouse (tenant_id, customer_id, display_name, type, country, city, is_default)
    VALUES (v_tenant, v_tho, 'Rhenus 3PL', 'third_party', 'Germany', 'Hamburg', FALSE),
           (v_tenant, v_tho, 'FBA DE', 'fba', 'Germany', NULL, FALSE);

    INSERT INTO public.customer_platform_account (tenant_id, customer_id, platform_id, countries, access)
    VALUES (v_tenant, v_tho, 'kaufland', ARRAY['DE'], 'none');

    INSERT INTO public.customer_brand (tenant_id, customer_id, name, registration_status)
    VALUES (v_tenant, v_tho, 'OKAEI Pro', 'pending');

    -- Suppliers: a candidate and a suspended one (an archived product keeps it in step 03).
    INSERT INTO public.supplier (id, tenant_id, code, display_name, country, default_incoterm, deposit_rate, status)
    VALUES (v_cn3, v_tenant, 'CN3', 'Ningbo Clean', 'China', 'FOB', 30, 'candidate'),
           (v_tr3, v_tenant, 'TR3', 'Demir Tekstil', 'Türkiye', 'EXW', 30, 'suspended');

    INSERT INTO public.supplier_contact (tenant_id, supplier_id, name, role, email, is_primary)
    VALUES (v_tenant, v_tr1, 'Kutlu Satis', 'Satis', 'satis@kutlu.test', TRUE),
           (v_tenant, v_cn1, 'BTE Sales', 'Sales', 'sales@bte.test', TRUE),
           (v_tenant, v_cn1, 'BTE Quality', 'Quality', 'quality@bte.test', FALSE);

    UPDATE public.supplier
    SET rating = 4,
        last_audit_on = current_date - 90,
        storage_fee_rule = 'Free for 30 days, then 0.50 EUR per pallet and day',
        late_payment_penalty = '1 percent of the open amount per week of delay'
    WHERE id = v_tr1;

    UPDATE public.supplier SET rating = 2, last_audit_on = current_date - 200 WHERE id = v_cn1;

    PERFORM private.story_doc('5eed0002-0000-4000-8000-000000000008', 'supplier', v_cn1, NULL, 'certificate', 1,
                              'signed', current_date - 400);
    PERFORM private.story_doc('5eed0002-0000-4000-8000-000000000009', 'supplier', v_tr1, NULL, 'contract', 1,
                              'signed', current_date - 120);

    PERFORM private.story_end('40 days');
END;
$$;

-- Step 02, second part: MOESA Trading GmbH lowers its media cap (for the oversized-upload edge).
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA Trading GmbH');
    v_rows INT;
BEGIN
    UPDATE public.setting SET value = '5' WHERE tenant_id = v_tenant AND key = 'media_max_mb';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'story 02: media_max_mb of MOESA Trading GmbH changed % rows', v_rows;
    END IF;

    PERFORM private.story_end('40 days');
END;
$$;

-- Step 03 (35 days ago): products, their specs and product documents, as baris in MOESA LTD. The
-- products come first, so that the step's audit transaction is named after the product table.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.tenant_id = v_tenant AND c.code = 'THO');
    v_krn UUID := '5eed0002-0000-4000-8000-000000000001';
    v_tr1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'TR1');
    v_cn1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'CN1');
    v_cn2 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'CN2');
    v_id1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'ID1');
    v_tr3 UUID := '5eed0002-0000-4000-8000-000000000006';
    v_mop UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-MOP40-2P');
    v_tips50 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-TIPS-6-50');
    v_cones100 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-CONES-100');
    v_p01 UUID := '5eed0003-0000-4000-8000-000000000001';
    v_p03 UUID := '5eed0003-0000-4000-8000-000000000003';
    v_p04 UUID := '5eed0003-0000-4000-8000-000000000004';
    v_p08 UUID := '5eed0003-0000-4000-8000-000000000008';
    gtin TEXT;
BEGIN
    IF v_tho IS NULL OR v_tr1 IS NULL OR v_cn1 IS NULL OR v_cn2 IS NULL OR v_id1 IS NULL OR v_mop IS NULL
       OR v_tips50 IS NULL OR v_cones100 IS NULL THEN
        RAISE EXCEPTION 'story 03: a customer, supplier or product of seed.sql is missing';
    END IF;

    -- A typo in a GTIN fails the story here, loudly. 4260696025930 is the one left over: no
    -- product needs it.
    FOREACH gtin IN ARRAY ARRAY['4260696025855', '4260696025862', '4260696025879', '4260696025886', '4260696025893',
                                '4260696025909', '4260696025916', '4260696025923', '4260696025930'] LOOP
        IF NOT private.gtin_valid(gtin) THEN
            RAISE EXCEPTION 'story: invalid GTIN %', gtin;
        END IF;
    END LOOP;

    -- Nine products: every status and compliance level. The parent of the variants is the
    -- on-sale mop. The old mop is inserted as archived (the unique GTIN index ignores archived
    -- rows), so it reuses the GTIN of the live one; its supplier TR3 is suspended.
    INSERT INTO public.product (id, tenant_id, customer_id, parent_id, sku, display_name, variant_label, brand, gtin,
                                supplier_id, status, compliance_status)
    VALUES (v_p01, v_tenant, v_tho, v_mop, 'THO-MOP40-3P', 'Pamuk mop bezi 40 cm, 3''lü', '3''lü', 'OKAEI',
            '4260696025855', v_tr1, 'development', 'partial'),
           ('5eed0003-0000-4000-8000-000000000002', v_tenant, v_tho, v_mop, 'THO-MOP40-4P',
            'Pamuk mop bezi 40 cm, 4''lü', '4''lü', 'OKAEI', '4260696025862', v_tr1, 'development', 'none'),
           (v_p03, v_tenant, v_tho, NULL, 'THO-MOP60-2P', 'Pamuk mop bezi 60 cm, 2''li', NULL, 'OKAEI',
            '4260696025879', v_tr1, 'concept', 'none'),
           (v_p04, v_tenant, v_tho, NULL, 'THO-TIPS-6-100', 'Aktif karbon filtre 6 mm, 100''lü', NULL, 'OKAEI',
            '4260696025886', v_cn1, 'approved', 'none'),
           ('5eed0003-0000-4000-8000-000000000005', v_tenant, v_tho, NULL, 'THO-CONES-200', 'Cones 200''lü', NULL,
            'OKAEI', '4260696025893', v_id1, 'ordering', 'partial'),
           ('5eed0003-0000-4000-8000-000000000006', v_tenant, v_tho, NULL, 'THO-BRUSH-1', 'Temizlik fırçası', NULL,
            'OKAEI Pro', '4260696025909', v_cn2, 'paused', 'partial'),
           ('5eed0003-0000-4000-8000-000000000007', v_tenant, v_tho, NULL, 'THO-MOP40-2P-OLD',
            'Pamuk mop bezi 40 cm, 2''li (eski)', NULL, 'OKAEI', '4260696025800', v_tr3, 'archived', 'none'),
           (v_p08, v_tenant, v_krn, NULL, 'KRN-VASE-01', 'Seramik vazo, 24 cm', NULL, 'Kernhaus', '4260696025916',
            v_tr1, 'on_sale', 'complete'),
           ('5eed0003-0000-4000-8000-000000000009', v_tenant, v_krn, NULL, 'KRN-VASE-02', 'Seramik vazo, 32 cm', NULL,
            'Kernhaus', '4260696025923', v_tr1, 'concept', 'none');

    -- The mop: full dimensions, weights and pallet data. The activated carbon filter: hazmat.
    UPDATE public.product
    SET unit_dims_mm = '400x300x15', unit_net_g = 180, pack_dims_mm = '410x310x30', pack_gross_g = 400,
        carton_pack_qty = 20, carton_dims_mm = '620x420x330', carton_net_kg = 7.2, carton_gross_kg = 8.4,
        pallet_carton_qty = 48, pallet_type = 'EUR'
    WHERE id = v_mop;

    UPDATE public.product SET is_hazmat = TRUE, hs_code = '8421.39', origin_country = 'China' WHERE id = v_tips50;

    -- Spec sheets and other product documents. v1 of the mop spec is superseded by the v2 of
    -- seed.sql (inserted directly, so document_supersede has nothing to do).
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000021', 'product', v_mop, v_tho, 'spec_sheet', 1,
                              'superseded', current_date - 150);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000022', 'product', v_p01, v_tho, 'spec_sheet', 1,
                              'signed', current_date - 20);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000023', 'product', v_tips50, v_tho, 'spec_sheet', 1,
                              'draft', NULL);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000024', 'product', v_p04, v_tho, 'spec_sheet', 1,
                              'approved', current_date - 25);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000025', 'product', v_cones100, v_tho, 'spec_sheet', 1,
                              'signed', current_date - 100);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000026', 'product', v_cones100, v_tho, 'certificate', 1,
                              'signed', current_date - 400);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000027', 'product', v_tips50, v_tho, 'sds', 1,
                              'approved', current_date - 90);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000028', 'product', v_tips50, v_tho, 'doc_of_conformity',
                              1, 'approved', current_date - 90);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000029', 'product', v_tips50, v_tho, 'test_report', 1,
                              'approved', current_date - 90);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000030', 'product', v_cones100, v_tho, 'label_artwork',
                              1, 'approved', current_date - 60);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000031', 'product', v_p03, v_tho, 'spec_sheet', 1,
                              'draft', NULL);
    PERFORM private.story_doc('5eed0003-0000-4000-8000-000000000032', 'product', v_p08, v_krn, 'spec_sheet', 1,
                              'signed', current_date - 30);

    PERFORM private.story_end('35 days');
END;
$$;

-- Passes a gate of a story project at p_passed_at, by the real rules (project_gate_guard ignores
-- the bypass): first the blocking tasks the guard counts against this gate (blocks_gate, phase up
-- to the one the gate closes) go from todo to done (a blocking task the story set to doing or
-- blocked is refused, not completed); then, when the gate needs the customer's approval, a signed
-- gate_approval document of that gate with the fixed id p_id, issued and approved on the pass
-- date (p_id is NULL exactly for a gate without customer approval, G4); then one UPDATE of the
-- gate, so the guard and project_gate_advance run as for pass_gate. p_evidence becomes the gate's
-- evidence_document_ids (G3: the PI of a pi_approved order of the project).
CREATE FUNCTION private.story_pass_gate (
    p_id UUID,
    p_project_id UUID,
    p_gate public.gate_code,
    p_passed_at TIMESTAMPTZ,
    p_evidence UUID[] DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_gate public.project_gate;
    v_customer UUID := (SELECT p.customer_id FROM public.project p WHERE p.id = p_project_id);
BEGIN
    SELECT * INTO v_gate FROM public.project_gate g WHERE g.project_id = p_project_id AND g.code = p_gate;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'story: project % has no gate %', p_project_id, p_gate;
    END IF;

    IF v_gate.needs_customer_approval IS DISTINCT FROM (p_id IS NOT NULL) THEN
        RAISE EXCEPTION 'story: gate % of % takes an approval document id exactly when it needs the customer''s approval',
            p_gate, p_project_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.project_task t
        WHERE t.project_id = p_project_id AND t.blocks_gate AND t.status IN ('doing', 'blocked')
          AND t.phase <= public.phase_before(p_gate)
    ) THEN
        RAISE EXCEPTION 'story: a blocking task before gate % of % is doing or blocked', p_gate, p_project_id;
    END IF;

    UPDATE public.project_task t
    SET status = 'done'
    WHERE t.project_id = p_project_id AND t.blocks_gate AND t.status = 'todo'
      AND t.phase <= public.phase_before(p_gate);

    IF v_gate.needs_customer_approval THEN
        PERFORM private.story_doc(p_id, 'project_gate', v_gate.id, v_customer, 'gate_approval', 1, 'signed',
                                  p_passed_at::DATE);
    END IF;

    UPDATE public.project_gate g
    SET status = 'passed',
        passed_at = p_passed_at,
        customer_approved_on = CASE WHEN v_gate.needs_customer_approval THEN p_passed_at::DATE END,
        approval_document_id = p_id,
        evidence_document_ids = coalesce(p_evidence, '{}')
    WHERE g.id = v_gate.id;

    IF NOT EXISTS (SELECT 1 FROM public.project_gate g WHERE g.id = v_gate.id AND g.status = 'passed') THEN
        RAISE EXCEPTION 'story: % not passed', p_gate;
    END IF;
END;
$$;

-- Step 04 (25 days ago): projects, their gates without a PI rule, and tasks, as koordinator in
-- MOESA LTD. The projects come first, so that the step's audit transaction is named after the
-- project table. created_at is set in the past, before each project's first pass, so the
-- dashboard's waiting days follow a real timeline. G3 and later (they need a PI) pass in step 05;
-- the pilot of seed.sql is not touched (it waits on G1 with its blocking task todo).
DO $$
DECLARE
    v_tenant UUID := private.story_begin('koordinator@moesa-panel.test', 'MOESA LTD');
    v_coordinator UUID := (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.tenant_id = v_tenant AND c.code = 'THO');
    v_krn UUID := '5eed0002-0000-4000-8000-000000000001';
    v_cls UUID := '5eed0002-0000-4000-8000-000000000004';
    v_tips50 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-TIPS-6-50');
    v_cones100 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-CONES-100');
    v_pl UUID := '5eed0004-0000-4000-8000-000000000001';
    v_variant UUID := '5eed0004-0000-4000-8000-000000000002';
    v_reorder UUID := '5eed0004-0000-4000-8000-000000000003';
    v_revision UUID := '5eed0004-0000-4000-8000-000000000004';
    v_cones UUID := '5eed0004-0000-4000-8000-000000000005';
    v_cancelled UUID := '5eed0004-0000-4000-8000-000000000006';
    v_closed UUID := '5eed0004-0000-4000-8000-000000000009';
    v_rows INT;
BEGIN
    IF v_coordinator IS NULL OR v_tho IS NULL OR v_tips50 IS NULL OR v_cones100 IS NULL THEN
        RAISE EXCEPTION 'story 04: koordinator, THO, THO-TIPS-6-50 or THO-CONES-100 is missing';
    END IF;

    -- Nine projects: every type, path, package edge and status. Codes, starting phases, gates
    -- and the first checklists come from the triggers.
    INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages, coordinator_id,
                                created_at)
    VALUES (v_pl, v_tenant, v_tho, 'OKAEI fırça private label', 'npi', 'b_private_label', ARRAY['A2', 'C'],
            v_coordinator, now() - interval '30 days'),
           (v_variant, v_tenant, v_tho, 'MOP40 3''lü varyant', 'variant', NULL, ARRAY['A1'], v_coordinator,
            now() - interval '25 days'),
           (v_reorder, v_tenant, v_tho, 'Karbon filtre tekrar siparişi', 'reorder', NULL, ARRAY['A1'], v_coordinator,
            now() - interval '20 days'),
           (v_revision, v_tenant, v_tho, 'CONES-100 ambalaj revizyonu', 'revision', NULL, ARRAY['A1'], v_coordinator,
            now() - interval '18 days'),
           (v_cones, v_tenant, v_tho, 'Cones ilk sipariş', 'npi', 'a_sourcing', ARRAY['A1'], v_coordinator,
            now() - interval '130 days'),
           (v_cancelled, v_tenant, v_tho, 'Mop 60 iptal', 'npi', 'a_sourcing', ARRAY['A1'], v_coordinator,
            now() - interval '60 days'),
           ('5eed0004-0000-4000-8000-000000000007', v_tenant, v_tho, 'THO lojistik Q1', 'npi', 'a_sourcing', ARRAY['B'],
            v_coordinator, now() - interval '10 days'),
           ('5eed0004-0000-4000-8000-000000000008', v_tenant, v_krn, 'Konsept vazo', 'npi', 'b_private_label',
            ARRAY['A0'], v_coordinator, now() - interval '14 days'),
           (v_closed, v_tenant, v_cls, 'CLS eski proje', 'npi', 'a_sourcing', ARRAY['A1'], v_coordinator,
            now() - interval '200 days');

    INSERT INTO public.project_product (project_id, product_id, tenant_id)
    VALUES (v_pl, '5eed0003-0000-4000-8000-000000000006', v_tenant),
           (v_variant, '5eed0003-0000-4000-8000-000000000001', v_tenant),
           (v_reorder, v_tips50, v_tenant),
           (v_revision, v_cones100, v_tenant),
           (v_cones, v_cones100, v_tenant),
           (v_cancelled, '5eed0003-0000-4000-8000-000000000003', v_tenant),
           ('5eed0004-0000-4000-8000-000000000008', '5eed0003-0000-4000-8000-000000000009', v_tenant);

    -- The passes, oldest first; each approval document is 5eed0004-…-2N. G2 needs signed specs:
    -- THO-CONES-100 and THO-MOP40-3P have them since step 03.
    PERFORM private.story_pass_gate('5eed0004-0000-4000-8000-000000000021', v_cones, 'G1', now() - interval '120 days');
    PERFORM private.story_pass_gate('5eed0004-0000-4000-8000-000000000022', v_cones, 'G2', now() - interval '100 days');
    PERFORM private.story_pass_gate('5eed0004-0000-4000-8000-000000000023', v_pl, 'G1', now() - interval '20 days');
    PERFORM private.story_pass_gate('5eed0004-0000-4000-8000-000000000024', v_variant, 'G2', now() - interval '15 days');
    PERFORM private.story_pass_gate('5eed0004-0000-4000-8000-000000000025', v_pl, 'PL_G1', now() - interval '9 days');

    -- The dashboard's task states, on non-blocking P3 tasks of the variant and the reorder, so
    -- the G3 passes of step 05 leave them as they are: overdue, due in two days, blocked, doing
    -- without an assignee, done.
    UPDATE public.project_task t
    SET due_on = x.due_on, status = x.status::public.task_status,
        assignee_id = CASE WHEN x.assigned THEN v_coordinator END
    FROM (VALUES (v_variant, 10, current_date - 3, 'todo', TRUE),
                 (v_variant, 30, current_date + 2, 'todo', TRUE),
                 (v_reorder, 40, NULL::DATE, 'blocked', TRUE),
                 (v_reorder, 30, NULL::DATE, 'doing', FALSE),
                 (v_reorder, 10, NULL::DATE, 'done', TRUE)) x (project_id, position, due_on, status, assigned)
    WHERE t.project_id = x.project_id AND t.phase = 'P3' AND t.position = x.position AND NOT t.blocks_gate;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> 5 THEN
        RAISE EXCEPTION 'story 04: the task states changed % rows, not 5', v_rows;
    END IF;

    -- Status changes come after the passes (a pass needs an active project).
    UPDATE public.project SET status = 'on_hold' WHERE id = v_revision;
    UPDATE public.project SET status = 'cancelled' WHERE id = v_cancelled;
    UPDATE public.project SET status = 'closed' WHERE id = v_closed;

    PERFORM private.story_end('25 days');
END;
$$;

-- Step 04, second part: baris closes CLS, now that its only project is closed.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA LTD');
    v_rows INT;
BEGIN
    UPDATE public.customer SET status = 'closed'
    WHERE id = '5eed0002-0000-4000-8000-000000000004' AND tenant_id = v_tenant;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'story 04: closing CLS changed % rows', v_rows;
    END IF;

    PERFORM private.story_end('25 days');
END;
$$;

DROP FUNCTION private.story_begin (TEXT, TEXT),
private.story_bypass (BOOLEAN),
private.story_end (INTERVAL),
private.story_doc (UUID, public.document_entity, UUID, UUID, public.document_type, INT, public.document_status, DATE, TEXT, UUID),
private.story_pass_gate (UUID, UUID, public.gate_code, TIMESTAMPTZ, UUID[]);

-- The last block: no step may leave the rules bypass on, and no claims outlive the story.
DO $$
BEGIN
    IF coalesce(current_setting('moesa.rules_bypass', TRUE), '') = '1' THEN
        RAISE EXCEPTION 'seed_story: the rules bypass is still on at the end';
    END IF;

    PERFORM set_config('request.jwt.claims', '', TRUE);
    PERFORM set_config('request.headers', '', TRUE);
END;
$$;
