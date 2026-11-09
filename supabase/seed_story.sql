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
--
-- Field permissions: THO's portal user, portal@moesa-panel.test (customer_viewer in MOESA LTD,
-- seed.sql), reads the story through the masked api views. It must see THO's products with their
-- sell price (company_price_eur) and THO's contract terms (deposit_rate, contract dates). It must
-- not see the purchase price (cost), the restricted drive URL, any supplier, or PO-011's PI (a
-- document of type 'pi'). THO's mop and 6 mm filter carry cost and sell prices (seed.sql and
-- step 03), TR1 its payment terms (step 02), and THO's contract (step 02) and PO-011's PI (step 05)
-- exist; seed_story.check.sql checks it (fp.portal_*), and koordinator's read-only payment terms
-- (fp.coordinator_*).

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
        late_payment_penalty = '1 percent of the open amount per week of delay',
        payment_terms = '30 percent deposit, balance 30 days after the bill of lading'
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
        pallet_carton_qty = 48, pallet_type = 'EUR', company_price_eur = 9.40
    WHERE id = v_mop;

    -- Sell prices next to the cost the mop carries since seed.sql (field permissions: the portal
    -- reads these, never the cost).
    UPDATE public.product SET purchase_price = 0.85, purchase_currency = 'USD', company_price_eur = 6.20
    WHERE id = v_tips50;

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

-- Moves a story order one status at a time to p_to, the way purchase_order_guard (030) would let
-- it: the next status (pi_approved goes straight to in_production at a deposit rate of 0), or
-- cancelled. Before each step it checks what the guard checks on entering that status (lines;
-- the PI document and total; 30 "ok" items and the PI figures equal to
-- private.purchase_order_figures; a paid deposit or balance), then makes the step in one UPDATE
-- under the rules bypass, so the PI check is dated p_checked_at instead of now(); the bypass also
-- keeps the story loadable once spec_sheet_required_from has passed (the spec sheets of the lines
-- are the m7 checks' business). The checker is the step's actor, as the guard would set it.
CREATE FUNCTION private.story_po_walk (
    p_id UUID,
    p_to public.purchase_order_status,
    p_checked_at TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_statuses public.purchase_order_status[] := enum_range(NULL::public.purchase_order_status);
    v_po public.purchase_order;
    v_next public.purchase_order_status;
    v_figures RECORD;
BEGIN
    LOOP
        SELECT * INTO v_po FROM public.purchase_order po WHERE po.id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'story: no purchase order %', p_id;
        END IF;

        EXIT WHEN v_po.status = p_to;

        IF v_po.status IN ('closed', 'cancelled') OR (p_to <> 'cancelled' AND v_po.status > p_to) THEN
            RAISE EXCEPTION 'story: order % cannot go from % to %', p_id, v_po.status, p_to;
        END IF;

        v_next := CASE WHEN p_to = 'cancelled' THEN 'cancelled'
                       WHEN v_po.status = 'pi_approved' AND v_po.deposit_rate = 0 THEN 'in_production'
                       ELSE v_statuses[array_position(v_statuses, v_po.status) + 1] END;

        IF v_next = 'sent' AND NOT EXISTS (SELECT 1 FROM public.purchase_order_line l WHERE l.purchase_order_id = p_id) THEN
            RAISE EXCEPTION 'story: order % has no lines', p_id;
        ELSIF v_next = 'pi_received' AND (v_po.pi_document_id IS NULL OR v_po.pi_total IS NULL) THEN
            RAISE EXCEPTION 'story: order % has no PI document or total', p_id;
        ELSIF v_next = 'pi_approved' THEN
            SELECT f.subtotal, f.total, f.deposit, f.balance INTO v_figures
            FROM private.purchase_order_figures(p_id, v_po.tenant_id) f;

            IF p_checked_at IS NULL
               OR (SELECT count(*) FROM jsonb_each(v_po.pi_check) e WHERE e.value = '"ok"'::JSONB) < 30
               OR ROW(v_po.pi_subtotal, v_po.pi_total, v_po.pi_deposit_amount, v_po.pi_balance_amount)
                  IS DISTINCT FROM ROW(v_figures.subtotal, v_figures.total, v_figures.deposit, v_figures.balance) THEN
                RAISE EXCEPTION 'story: the PI of order % is not checked, or its figures differ', p_id;
            END IF;
        ELSIF v_next IN ('deposit_paid', 'balance_paid') AND NOT EXISTS (
            SELECT 1 FROM public.purchase_order_payment p
            WHERE p.purchase_order_id = p_id AND p.paid_on IS NOT NULL
              AND p.kind = CASE WHEN v_next = 'deposit_paid' THEN 'deposit' ELSE 'balance' END::public.payment_kind
        ) THEN
            RAISE EXCEPTION 'story: order % has no paid payment for %', p_id, v_next;
        END IF;

        PERFORM private.story_bypass(TRUE);

        UPDATE public.purchase_order po
        SET status = v_next,
            pi_checked_by = CASE WHEN v_next = 'pi_approved' THEN auth.uid() ELSE po.pi_checked_by END,
            pi_checked_at = CASE WHEN v_next = 'pi_approved' THEN p_checked_at ELSE po.pi_checked_at END
        WHERE po.id = p_id;

        PERFORM private.story_bypass(FALSE);
    END LOOP;
END;
$$;

-- The supplier's PI of a story order (a sent order; no bypass needed): the pi document with the
-- fixed id p_id, its number, and the order's figures from private.purchase_order_figures. An
-- approved PI also carries the 30 "ok" checklist items and every amount; any other PI only its
-- total, p_total_offset off the recalculated one.
CREATE FUNCTION private.story_po_pi (
    p_id UUID,
    p_po_id UUID,
    p_status public.document_status,
    p_issued_on DATE,
    p_total_offset NUMERIC DEFAULT 0
) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_po public.purchase_order;
    v_approved BOOLEAN := p_status = 'approved';
BEGIN
    SELECT * INTO v_po FROM public.purchase_order po WHERE po.id = p_po_id;

    IF NOT FOUND OR v_po.status <> 'sent' THEN
        RAISE EXCEPTION 'story: the PI of % needs a sent order', p_po_id;
    END IF;

    PERFORM private.story_doc(p_id, 'purchase_order', p_po_id, v_po.customer_id, 'pi', 1, p_status, p_issued_on);

    UPDATE public.purchase_order po
    SET pi_document_id = p_id,
        pi_number = 'PI-' || to_char(p_issued_on, 'YYMMDD') || '-' || right(p_po_id::TEXT, 2),
        pi_subtotal = CASE WHEN v_approved THEN f.subtotal END,
        pi_total = f.total + p_total_offset,
        pi_deposit_amount = CASE WHEN v_approved THEN f.deposit END,
        pi_balance_amount = CASE WHEN v_approved THEN f.balance END,
        pi_check = CASE WHEN v_approved
                        THEN (SELECT jsonb_object_agg(g::TEXT, to_jsonb('ok'::TEXT)) FROM generate_series(1, 30) g)
                        ELSE '{}'::JSONB END
    FROM private.purchase_order_figures(p_po_id, v_po.tenant_id) f
    WHERE po.id = p_po_id;
END;
$$;

-- Step 05 (5 days ago): purchase orders in every status and the gates that need a PI, as baris in
-- MOESA LTD. The orders come first, so that the step's audit transaction is named after the
-- purchase_order table. Each order is inserted as a draft (the code trigger forces it), walked by
-- story_po_walk, its PI from story_po_pi; codes follow the insert order (THO 001-011, KRN 001).
-- Order ids 5eed0005-…-NN, lines …-1NN, PI documents …-2NN, PSI reports …-3NN, gate approvals
-- …-4NN. Every line whose product has a signed or approved spec sheet cites it; THO-MOP40-4P (no
-- spec: the draft's "missing spec"), THO-TIPS-6-50 (a draft spec only) and THO-CONES-200 have
-- none, which needs none before spec_sheet_required_from (they are on sale or ordering).
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.tenant_id = v_tenant AND c.code = 'THO');
    v_krn UUID := '5eed0002-0000-4000-8000-000000000001';
    v_tr1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'TR1');
    v_cn1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'CN1');
    v_id1 UUID := (SELECT s.id FROM public.supplier s WHERE s.tenant_id = v_tenant AND s.code = 'ID1');
    v_mop UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-MOP40-2P');
    v_tips50 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-TIPS-6-50');
    v_cones100 UUID := (SELECT p.id FROM public.product p WHERE p.tenant_id = v_tenant AND p.sku = 'THO-CONES-100');
    v_mop_spec UUID := (SELECT d.id FROM public.document d
                        WHERE d.tenant_id = v_tenant AND d.entity_type = 'product' AND d.entity_id = v_mop
                          AND d.type = 'spec_sheet' AND d.version = 2 AND d.status = 'signed');
    v_variant UUID := '5eed0004-0000-4000-8000-000000000002';
    v_reorder UUID := '5eed0004-0000-4000-8000-000000000003';
    v_cones UUID := '5eed0004-0000-4000-8000-000000000005';
    v_pi RECORD;
BEGIN
    IF v_tho IS NULL OR v_tr1 IS NULL OR v_cn1 IS NULL OR v_id1 IS NULL OR v_mop IS NULL OR v_tips50 IS NULL
       OR v_cones100 IS NULL OR v_mop_spec IS NULL THEN
        RAISE EXCEPTION 'story 05: a customer, supplier, product or the mop spec of seed.sql is missing';
    END IF;

    -- Twelve orders, created over the last months. Incoterm and deposit rate come from the
    -- supplier (30 %), except the order without a deposit.
    INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, project_id, currency, deposit_rate,
                                       ready_on, tolerance_pct, created_at)
    SELECT ('5eed0005-0000-4000-8000-0000000000' || x.nn)::UUID, v_tenant, coalesce(x.customer, v_tho), x.supplier,
           x.project, x.currency, x.deposit_rate, current_date + x.ready_in, x.tolerance,
           now() - make_interval(days => x.age)
    FROM (VALUES ('01', NULL::UUID, v_tr1, NULL::UUID, 'USD', NULL::NUMERIC, NULL::INT, NULL::NUMERIC, 3),
                 ('02', NULL, v_cn1, NULL, 'USD', NULL, 60, NULL, 9),
                 ('03', NULL, v_tr1, NULL, 'USD', NULL, 50, NULL, 16),
                 ('04', NULL, v_cn1, v_reorder, 'USD', NULL, 45, NULL, 22),
                 ('05', NULL, v_tr1, v_variant, 'USD', NULL, 30, NULL, 24),
                 ('06', NULL, v_cn1, NULL, 'USD', NULL, 12, NULL, 45),
                 ('07', NULL, v_id1, NULL, 'USD', NULL, -5, NULL, 60),
                 ('08', NULL, v_tr1, NULL, 'USD', NULL, -20, 2, 75),
                 ('09', NULL, v_id1, v_cones, 'USD', NULL, -68, NULL, 110),
                 ('10', NULL, v_id1, NULL, 'USD', NULL, NULL, NULL, 30),
                 ('11', NULL, v_tr1, NULL, 'USD', 0, 20, NULL, 40),
                 ('12', v_krn, v_tr1, NULL, 'EUR', NULL, 40, NULL, 7))
         x (nn, customer, supplier, project, currency, deposit_rate, ready_in, tolerance, age)
    ORDER BY x.nn;

    -- One line each.
    INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, customer_id, position, product_id,
                                            quantity, unit_price, spec_document_id)
    SELECT ('5eed0005-0000-4000-8000-0000000001' || x.nn)::UUID, v_tenant,
           ('5eed0005-0000-4000-8000-0000000000' || x.nn)::UUID, coalesce(x.customer, v_tho), 1, x.product, x.quantity,
           x.unit_price, x.spec
    FROM (VALUES ('01', NULL::UUID, '5eed0003-0000-4000-8000-000000000002'::UUID, 500, 3.50, NULL::UUID),
                 ('02', NULL, '5eed0003-0000-4000-8000-000000000004', 1000, 0.85, '5eed0003-0000-4000-8000-000000000024'),
                 ('03', NULL, v_mop, 2000, 1.90, v_mop_spec),
                 ('04', NULL, v_tips50, 5000, 0.48, NULL),
                 ('05', NULL, '5eed0003-0000-4000-8000-000000000001', 800, 2.70, '5eed0003-0000-4000-8000-000000000022'),
                 ('06', NULL, v_tips50, 3000, 0.48, NULL),
                 ('07', NULL, v_cones100, 4000, 0.62, '5eed0003-0000-4000-8000-000000000025'),
                 ('08', NULL, v_mop, 1000, 1.90, v_mop_spec),
                 ('09', NULL, v_cones100, 2000, 0.62, '5eed0003-0000-4000-8000-000000000025'),
                 ('10', NULL, '5eed0003-0000-4000-8000-000000000005', 1000, 1.15, NULL),
                 ('11', NULL, v_mop, 1500, 1.90, v_mop_spec),
                 ('12', v_krn, '5eed0003-0000-4000-8000-000000000008', 300, 6.40, '5eed0003-0000-4000-8000-000000000032'))
         x (nn, customer, product, quantity, unit_price, spec);

    -- Everything but the draft is sent; the cancelled order is cancelled once sent.
    PERFORM private.story_po_walk(('5eed0005-0000-4000-8000-0000000000' || nn)::UUID, 'sent')
    FROM unnest(ARRAY['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) nn;

    PERFORM private.story_po_walk('5eed0005-0000-4000-8000-000000000010', 'cancelled');

    -- The PIs: 03's is in but 12.40 off and unchecked; the others are approved, checked on the
    -- given day (04: thirteen days ago, the day before the reorder's G3).
    PERFORM private.story_po_pi('5eed0005-0000-4000-8000-000000000203', '5eed0005-0000-4000-8000-000000000003', 'draft',
                                current_date - 4, 12.40);
    PERFORM private.story_po_walk('5eed0005-0000-4000-8000-000000000003', 'pi_received');

    FOR v_pi IN
        SELECT * FROM (VALUES ('04', 15, 13), ('05', 14, 10), ('06', 40, 38), ('07', 55, 52), ('08', 70, 68),
                              ('09', 90, 85), ('11', 35, 32)) x (nn, issued_ago, checked_ago)
    LOOP
        PERFORM private.story_po_pi(('5eed0005-0000-4000-8000-0000000002' || v_pi.nn)::UUID,
                                    ('5eed0005-0000-4000-8000-0000000000' || v_pi.nn)::UUID, 'approved',
                                    current_date - v_pi.issued_ago);
        PERFORM private.story_po_walk(('5eed0005-0000-4000-8000-0000000000' || v_pi.nn)::UUID, 'pi_approved',
                                      now() - make_interval(days => v_pi.checked_ago));
    END LOOP;

    -- Payments: the deposit and balance amounts are the approved PI's. 04's deposit is due in
    -- three days; 07's balance was due ten days ago and is unpaid (the overdue payment); the
    -- customer paid 08's balance, the company its freight; 09 is paid in full; 11 has no deposit.
    INSERT INTO public.purchase_order_payment (tenant_id, purchase_order_id, kind, amount, currency, planned_on, paid_on,
                                               paid_by, notes)
    SELECT v_tenant, po.id, x.kind::public.payment_kind,
           CASE x.kind WHEN 'deposit' THEN po.pi_deposit_amount WHEN 'balance' THEN po.pi_balance_amount ELSE x.amount END,
           po.currency, current_date + x.planned_in, current_date + x.paid_in, x.paid_by::public.payment_payer, x.notes
    FROM (VALUES ('04', 'deposit', NULL::NUMERIC, 3, NULL::INT, 'company', NULL::TEXT),
                 ('05', 'deposit', NULL, -9, -8, 'company', NULL),
                 ('05', 'balance', NULL, 35, NULL, 'company', NULL),
                 ('06', 'deposit', NULL, -36, -35, 'company', NULL),
                 ('06', 'balance', NULL, 15, NULL, 'company', NULL),
                 ('07', 'deposit', NULL, -51, -50, 'company', NULL),
                 ('07', 'balance', NULL, -10, NULL, 'company', NULL),
                 ('08', 'deposit', NULL, -67, -66, 'company', NULL),
                 ('08', 'balance', NULL, -13, -12, 'customer', NULL),
                 ('08', 'other', 850.00, -14, -12, 'company', 'Navlun (freight)'),
                 ('09', 'deposit', NULL, -84, -83, 'company', NULL),
                 ('09', 'balance', NULL, -66, -65, 'company', NULL),
                 ('11', 'balance', NULL, 25, NULL, 'company', NULL))
         x (nn, kind, amount, planned_in, paid_in, paid_by, notes)
    JOIN public.purchase_order po ON po.id = ('5eed0005-0000-4000-8000-0000000000' || x.nn)::UUID;

    -- Production updates of the order in production, before it is anywhere else.
    INSERT INTO public.purchase_order_update (tenant_id, purchase_order_id, happened_on, note)
    VALUES (v_tenant, '5eed0005-0000-4000-8000-000000000006', current_date - 6, 'Aktif karbon dolumu başladı, ilk 800 adet hazır'),
           (v_tenant, '5eed0005-0000-4000-8000-000000000006', current_date - 2, 'Dolum %70, ambalaj malzemesi depoda');

    -- The walks to the final statuses (11 has no deposit step).
    PERFORM private.story_po_walk(('5eed0005-0000-4000-8000-0000000000' || x.nn)::UUID, x.st::public.purchase_order_status)
    FROM (VALUES ('05', 'deposit_paid'), ('06', 'in_production'), ('07', 'ready'), ('08', 'balance_paid'),
                 ('09', 'closed'), ('11', 'in_production')) x (nn, st);

    -- PSI reports: approved on the order in production, only a draft on the ready one (the PSI
    -- warning before its balance).
    PERFORM private.story_doc('5eed0005-0000-4000-8000-000000000306', 'purchase_order',
                              '5eed0005-0000-4000-8000-000000000006', v_tho, 'psi_report', 1, 'approved', current_date - 3);
    PERFORM private.story_doc('5eed0005-0000-4000-8000-000000000307', 'purchase_order',
                              '5eed0005-0000-4000-8000-000000000007', v_tho, 'psi_report', 1, 'draft', NULL);

    -- The gates that need a PI, by the real rules (the bypass is off again), oldest first. The
    -- cones project's G5 (on its shipment's delivery receipt) and its close are in step 06.
    PERFORM private.story_pass_gate('5eed0005-0000-4000-8000-000000000403', v_cones, 'G3', now() - interval '80 days',
                                    ARRAY['5eed0005-0000-4000-8000-000000000209'::UUID]);
    PERFORM private.story_pass_gate(NULL, v_cones, 'G4', now() - interval '70 days');
    PERFORM private.story_pass_gate('5eed0005-0000-4000-8000-000000000402', v_reorder, 'G3', now() - interval '12 days',
                                    ARRAY['5eed0005-0000-4000-8000-000000000204'::UUID]);
    PERFORM private.story_pass_gate('5eed0005-0000-4000-8000-000000000401', v_variant, 'G3', now() - interval '6 days',
                                    ARRAY['5eed0005-0000-4000-8000-000000000205'::UUID]);

    PERFORM private.story_end('5 days');
END;
$$;

-- Moves a story shipment one status at a time to p_to, the way shipment_guard (031, 041) would let
-- it: planned, booked, loaded, in_transit, at_customs (only when it is the target), delivered, then
-- accepted or disputed (a disputed one may go on to accepted); cancelled straight from planned or
-- booked. Before each step it checks what the guard checks on entering that status (an order; the
-- booking date; a line; ETD and ETA; the delivery time; a signed or approved delivery receipt and,
-- straight from delivered, matching quantities without damage), then makes the step in one UPDATE
-- under the rules bypass, so the shipment's dates may lie in the past. It sets what the guard would
-- set: the dispute deadline on delivered (p_dispute_deadline_at, else the suppliers' shortest
-- damage-notice time after the delivery, NULL when no supplier has one) and the acceptance date on
-- accepted (p_accepted_on, else today).
CREATE FUNCTION private.story_shipment_walk (
    p_id UUID,
    p_to public.shipment_status,
    p_dispute_deadline_at TIMESTAMPTZ DEFAULT NULL,
    p_accepted_on DATE DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_ship public.shipment;
    v_next public.shipment_status;
    v_hours INT;
BEGIN
    LOOP
        SELECT * INTO v_ship FROM public.shipment s WHERE s.id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'story: no shipment %', p_id;
        END IF;

        EXIT WHEN v_ship.status = p_to;

        v_next := CASE
            WHEN v_ship.status IN ('accepted', 'cancelled') THEN NULL
            WHEN p_to = 'cancelled' THEN CASE WHEN v_ship.status IN ('planned', 'booked') THEN 'cancelled' END
            WHEN v_ship.status = 'disputed' THEN CASE WHEN p_to = 'accepted' THEN 'accepted' END
            WHEN v_ship.status = 'delivered' THEN CASE WHEN p_to IN ('accepted', 'disputed') THEN p_to::TEXT END
            WHEN v_ship.status > p_to THEN NULL
            WHEN v_ship.status = 'planned' THEN 'booked'
            WHEN v_ship.status = 'booked' THEN 'loaded'
            WHEN v_ship.status = 'loaded' THEN 'in_transit'
            WHEN v_ship.status = 'in_transit' THEN CASE WHEN p_to = 'at_customs' THEN 'at_customs' ELSE 'delivered' END
            WHEN v_ship.status = 'at_customs' THEN 'delivered'
        END;

        IF v_next IS NULL THEN
            RAISE EXCEPTION 'story: shipment % cannot go from % to %', p_id, v_ship.status, p_to;
        END IF;

        IF v_next = 'booked' AND (v_ship.booking_confirmed_on IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.shipment_purchase_order sp WHERE sp.shipment_id = p_id
        )) THEN
            RAISE EXCEPTION 'story: shipment % has no order or no booking date', p_id;
        ELSIF v_next = 'loaded' AND NOT EXISTS (SELECT 1 FROM public.shipment_line sl WHERE sl.shipment_id = p_id) THEN
            RAISE EXCEPTION 'story: shipment % has no lines', p_id;
        ELSIF v_next = 'in_transit' AND (v_ship.etd IS NULL OR v_ship.eta IS NULL) THEN
            RAISE EXCEPTION 'story: shipment % has no ETD or ETA', p_id;
        ELSIF v_next = 'delivered' AND v_ship.delivered_at IS NULL THEN
            RAISE EXCEPTION 'story: shipment % has no delivery time', p_id;
        ELSIF v_next = 'accepted' AND (NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.entity_type = 'shipment' AND d.entity_id = p_id AND d.type = 'delivery_receipt'
              AND d.status IN ('signed', 'approved')
        ) OR (v_ship.status = 'delivered' AND (v_ship.quantity_matches IS NOT TRUE OR v_ship.has_damage IS NOT FALSE))) THEN
            RAISE EXCEPTION 'story: shipment % has no delivery receipt, or a reservation', p_id;
        END IF;

        SELECT min(s.damage_notice_hours) INTO v_hours
        FROM public.shipment_purchase_order sp
        JOIN public.purchase_order po ON po.id = sp.purchase_order_id
        JOIN public.supplier s ON s.id = po.supplier_id
        WHERE sp.shipment_id = p_id;

        PERFORM private.story_bypass(TRUE);

        UPDATE public.shipment s
        SET status = v_next,
            dispute_deadline_at = CASE WHEN v_next = 'delivered'
                                       THEN coalesce(p_dispute_deadline_at, s.dispute_deadline_at,
                                                     s.delivered_at + v_hours * INTERVAL '1 hour')
                                       ELSE s.dispute_deadline_at END,
            accepted_on = CASE WHEN v_next = 'accepted' THEN coalesce(p_accepted_on, s.accepted_on, current_date)
                               ELSE s.accepted_on END
        WHERE s.id = p_id;

        PERFORM private.story_bypass(FALSE);
    END LOOP;
END;
$$;

-- Step 06 (yesterday): shipments in every status, as koordinator in MOESA LTD, all to THO's
-- Rosbach warehouse. Each shipment is inserted (the code trigger forces planned; codes follow the
-- insert order, SHP-THO-<year>-001..011), gets its order and lines while it is planned (the line
-- cap is the order line's quantity plus the order's tolerance, over all shipments), its dates, then
-- story_shipment_walk takes it to its status. Shipment ids 5eed0006-…-NN, lines …-1NN, shipment
-- documents …-2NN, the G5 approval …-301, events …-4NN.
--   PO-008 is partially received: 08 accepted 600 of its 1000, 01 (planned) carries the other 400.
--   PO-009 (closed in step 05) went out in two shipments: 11, accepted a month ago, is the cones
--   project's G5 evidence (its signed delivery receipt), and the project closes here; 09, the rest,
--   arrived damaged four days ago and is disputed. The order closed before 09 was linked, so its
--   links are made under the bypass (Ruling P1: shipment_po_not_open; the order closed after the
--   dispute in the story's time).
-- The incidents on 06 (OL-08) and 09 (OL-05) come with step 08, the damage photo of 09 with the
-- media step.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('koordinator@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.tenant_id = v_tenant AND c.code = 'THO');
    v_rosbach UUID := (SELECT w.id FROM public.customer_warehouse w
                       JOIN public.customer c ON c.id = w.customer_id AND c.tenant_id = w.tenant_id AND c.code = 'THO'
                       WHERE w.tenant_id = v_tenant AND w.display_name = 'Rosbach');
    v_acceptor TEXT := (SELECT u.user_metadata ->> 'display_name' FROM public.user u WHERE u.email = 'baris@moesa-panel.test');
    v_cones UUID := '5eed0004-0000-4000-8000-000000000005';
    v_rows INT;
BEGIN
    IF v_tho IS NULL OR v_rosbach IS NULL OR v_acceptor IS NULL THEN
        RAISE EXCEPTION 'story 06: THO, its Rosbach warehouse or baris of seed.sql is missing';
    END IF;

    -- Eleven shipments, in code order.
    INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id, created_at)
    SELECT ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID, v_tenant, v_tho, x.mode::public.shipment_mode, v_rosbach,
           now() - make_interval(days => x.age)
    FROM (VALUES ('01', 'road', 3), ('02', 'fcl20', 6), ('03', 'lcl', 12), ('04', 'fcl40', 15), ('05', 'fcl40', 40),
                 ('06', 'fcl20', 35), ('07', 'road', 20), ('08', 'courier', 12), ('09', 'air', 12), ('10', 'lcl', 8),
                 ('11', 'fcl20', 72)) x (nn, mode, age)
    ORDER BY x.nn;

    -- The orders, while every shipment is planned: by the real link rules (the order's PI is
    -- approved and it is not closed), except PO-009's two links (see above).
    INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)
    SELECT ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID, ('5eed0005-0000-4000-8000-0000000000' || x.po)::UUID, v_tenant
    FROM (VALUES ('01', '08'), ('02', '11'), ('03', '06'), ('04', '07'), ('05', '05'), ('06', '06'), ('07', '06'),
                 ('08', '08')) x (nn, po);

    PERFORM private.story_bypass(TRUE);

    INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)
    VALUES ('5eed0006-0000-4000-8000-000000000009', '5eed0005-0000-4000-8000-000000000009', v_tenant),
           ('5eed0006-0000-4000-8000-000000000011', '5eed0005-0000-4000-8000-000000000009', v_tenant);

    PERFORM private.story_bypass(FALSE);

    -- The lines, by the real cap: PO-006's 3000 over 03, 06 and 07; PO-008's 1000 over 08 (600)
    -- and 01 (400); PO-009's 2000 over 11 (1500) and 09 (500). 02 is booked before its goods
    -- (PO-011 is still in production).
    INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity)
    SELECT ('5eed0006-0000-4000-8000-0000000001' || x.nn)::UUID, v_tenant, ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID,
           ('5eed0005-0000-4000-8000-0000000000' || x.po)::UUID, ('5eed0005-0000-4000-8000-0000000001' || x.po)::UUID, x.qty
    FROM (VALUES ('01', '08', 400), ('03', '06', 1000), ('04', '07', 4000), ('05', '05', 800), ('06', '06', 1000),
                 ('07', '06', 1000), ('08', '08', 600), ('09', '09', 500), ('11', '09', 1500)) x (nn, po, qty);

    -- The dates and the acceptance record, still on planned shipments (no bypass needed).
    UPDATE public.shipment s
    SET booking_confirmed_on = current_date + x.booked_in,
        etd = current_date + x.etd_in,
        eta = current_date + x.eta_in,
        delivered_at = now() - x.delivered_ago,
        accepted_by = CASE WHEN x.accepted THEN v_acceptor END,
        quantity_matches = CASE WHEN x.accepted THEN TRUE END,
        has_damage = CASE WHEN x.accepted THEN FALSE WHEN x.nn = '09' THEN TRUE END
    FROM (VALUES ('02', -2, 5, 30, NULL::INTERVAL, FALSE),
                 ('03', -3, 1, 28, NULL, FALSE),
                 ('04', -10, -5, 9, NULL, FALSE),
                 ('05', -35, -30, -4, NULL, FALSE),
                 ('06', -33, -28, -2, NULL, FALSE),
                 ('07', -18, -16, -2, INTERVAL '1 day', FALSE),
                 ('08', -9, -8, -6, INTERVAL '5 days', TRUE),
                 ('09', -10, -7, -5, INTERVAL '4 days', FALSE),
                 ('11', -70, -66, -36, INTERVAL '34 days', TRUE)) x (nn, booked_in, etd_in, eta_in, delivered_ago, accepted)
    WHERE s.id = ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID;

    -- The documents of the shipments, the delivery receipts before the acceptances they allow.
    PERFORM private.story_doc(('5eed0006-0000-4000-8000-000000000' || x.nn)::UUID, 'shipment',
                              ('5eed0006-0000-4000-8000-0000000000' || x.ship)::UUID, v_tho, x.type::public.document_type, 1,
                              x.st::public.document_status, current_date + x.issued_in)
    FROM (VALUES ('201', '04', 'packing_list', 'draft', NULL::INT), ('202', '04', 'commercial_invoice', 'signed', -6),
                 ('203', '05', 'bill_of_lading', 'signed', -30), ('204', '06', 'customs', 'draft', NULL),
                 ('205', '08', 'delivery_receipt', 'signed', -4), ('206', '11', 'delivery_receipt', 'signed', -33)) x (nn, ship, type, st, issued_in);

    -- The walks (01 stays planned). 07's dispute is still running with three days left (a margin
    -- of at least two days, whatever the hour); ID1 has no notice time, so 09's deadline is set:
    -- 48 hours after its delivery, already past.
    PERFORM private.story_shipment_walk(('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID, x.st::public.shipment_status)
    FROM (VALUES ('02', 'booked'), ('03', 'loaded'), ('04', 'in_transit'), ('05', 'in_transit'), ('06', 'at_customs'),
                 ('10', 'cancelled')) x (nn, st);
    PERFORM private.story_shipment_walk('5eed0006-0000-4000-8000-000000000007', 'delivered', now() + INTERVAL '3 days');
    PERFORM private.story_shipment_walk('5eed0006-0000-4000-8000-000000000008', 'accepted', NULL, current_date - 3);
    PERFORM private.story_shipment_walk('5eed0006-0000-4000-8000-000000000009', 'disputed',
                                        now() - INTERVAL '4 days' + INTERVAL '48 hours');
    PERFORM private.story_shipment_walk('5eed0006-0000-4000-8000-000000000011', 'accepted', NULL, current_date - 33);
    -- The damage photo of 09 attaches here in the media step (an evidence_photo media link).

    -- The late shipment's log (S15 §B, steps 1-4).
    INSERT INTO public.shipment_event (id, tenant_id, shipment_id, happened_at, step, from_party, to_party, channel, note)
    VALUES ('5eed0006-0000-4000-8000-000000000401', v_tenant, '5eed0006-0000-4000-8000-000000000005', now() - INTERVAL '30 days', 1,
            'Forwarder', 'MOESA', 'e-mail', 'Booking teyidi ve yükleme tarihi alındı'),
           ('5eed0006-0000-4000-8000-000000000402', v_tenant, '5eed0006-0000-4000-8000-000000000005', now() - INTERVAL '20 days', 2,
            'MOESA', 'Müşteri', 'e-mail', 'Konşimento ve ETA müşteriye iletildi'),
           ('5eed0006-0000-4000-8000-000000000403', v_tenant, '5eed0006-0000-4000-8000-000000000005', now() - INTERVAL '10 days', 3,
            'Forwarder', 'MOESA', 'telefon', 'Aktarma limanında gecikme bildirildi'),
           ('5eed0006-0000-4000-8000-000000000404', v_tenant, '5eed0006-0000-4000-8000-000000000005', now() - INTERVAL '5 days', 4,
            'MOESA', 'Müşteri', 'e-mail', 'Yeni ETA belirsiz, müşteri bilgilendirildi');

    -- The cones project's G5 on 11's delivery receipt, three days after the delivery, by the real
    -- rules; then the project closes, its last gate passed.
    PERFORM private.story_pass_gate('5eed0006-0000-4000-8000-000000000301', v_cones, 'G5', now() - INTERVAL '30 days',
                                    ARRAY['5eed0006-0000-4000-8000-000000000206'::UUID]);

    UPDATE public.project SET status = 'closed' WHERE id = v_cones AND current_phase = 'closed';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'story 06: the cones project did not reach its closed phase';
    END IF;

    PERFORM private.story_end('1 day');
END;
$$;

-- The helper of step 07: one market cell. The cell is inserted (the guard forces candidate) with
-- p_fields applied through jsonb_populate_record: the listing data (platform_product_id,
-- platform_sku, price, currency, stock_source, content_status, launched_on), the reasons
-- (open_issue, notes, compliance_note), compliance, target_launch_on and last_checked_on. Then one
-- UPDATE per status of p_path, in order and under the real guard (no bypass: every walk below is
-- an allowed transition). Entering live dates the launch with p_fields.launched_on. The product
-- is found by SKU in the step's tenant (the x-tenant-id header story_begin set).
CREATE FUNCTION private.story_cell (p_id UUID, p_sku TEXT, p_platform TEXT, p_country TEXT, p_path public.market_cell_status[],
                                    p_fields JSONB DEFAULT '{}') RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_tenant UUID := (current_setting('request.headers')::JSONB ->> 'x-tenant-id')::UUID;
    v_product public.product;
    v_rec public.market_cell := jsonb_populate_record(NULL::public.market_cell, p_fields);
    v_status public.market_cell_status;
BEGIN
    SELECT p.* INTO v_product FROM public.product p WHERE p.sku = p_sku AND p.tenant_id = v_tenant;
    IF v_product.id IS NULL THEN
        RAISE EXCEPTION 'story 07: no product %', p_sku;
    END IF;

    INSERT INTO public.market_cell (id, tenant_id, customer_id, product_id, platform_id, country, compliance, compliance_note,
                                    platform_product_id, platform_sku, price, currency, stock_source, content_status,
                                    target_launch_on, last_checked_on, open_issue, notes)
    VALUES (p_id, v_tenant, v_product.customer_id, v_product.id, p_platform, p_country, coalesce(v_rec.compliance, 'pending'),
            v_rec.compliance_note, v_rec.platform_product_id, v_rec.platform_sku, v_rec.price, v_rec.currency, v_rec.stock_source,
            coalesce(v_rec.content_status, 'none'), v_rec.target_launch_on, v_rec.last_checked_on, v_rec.open_issue, v_rec.notes);

    FOREACH v_status IN ARRAY p_path LOOP
        UPDATE public.market_cell SET status = v_status, launched_on = CASE WHEN v_status = 'live' THEN v_rec.launched_on ELSE launched_on END
        WHERE id = p_id;
    END LOOP;
END;
$$;

-- Step 07 (3 days ago): market cells in every status, as koordinator in MOESA LTD. THO's mop in
-- DE and FR is live (FR with a yellow compliance note), IT is being prepared, ES uploaded and NL
-- suppressed by the platform; the tips are planned (ES), stopped (IT) and live on Kaufland; the
-- cones sit as a red candidate (PL), paused (eBay DE) and removed (Otto). KRN's vase is live on
-- bol and planned on Kaufland AT. Cell ids 5eed0007-…-NN.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('koordinator@moesa-panel.test', 'MOESA LTD');
BEGIN
    -- THO: the mop
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000001', 'THO-MOP40-2P', 'amazon', 'DE',
        ARRAY['planned', 'preparing', 'uploaded', 'live']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'platform_product_id', 'B0STORY001', 'platform_sku', 'THO-MOP40-2P-DE', 'price', 24.90,
                           'currency', 'EUR', 'stock_source', 'customer_warehouse', 'content_status', 'approved',
                           'launched_on', current_date - 12, 'last_checked_on', current_date - 1));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000002', 'THO-MOP40-2P', 'amazon', 'FR',
        ARRAY['planned', 'preparing', 'uploaded', 'live']::public.market_cell_status[],
        jsonb_build_object('compliance', 'yellow', 'compliance_note', 'Fransa için ambalaj geri dönüşüm işareti doğrulanacak',
                           'platform_product_id', 'B0STORY002', 'platform_sku', 'THO-MOP40-2P-FR', 'price', 25.90, 'currency', 'EUR',
                           'stock_source', 'pan_eu', 'content_status', 'approved', 'launched_on', current_date - 8,
                           'last_checked_on', current_date - 2));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000003', 'THO-MOP40-2P', 'amazon', 'IT',
        ARRAY['planned', 'preparing']::public.market_cell_status[],
        jsonb_build_object('compliance', 'pending', 'content_status', 'translated', 'target_launch_on', current_date + 21));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000004', 'THO-MOP40-2P', 'amazon', 'ES',
        ARRAY['planned', 'preparing', 'uploaded']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'target_launch_on', current_date + 10));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000005', 'THO-MOP40-2P', 'amazon', 'NL',
        ARRAY['planned', 'preparing', 'uploaded', 'live', 'suppressed']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'platform_product_id', 'B0STORY005', 'platform_sku', 'THO-MOP40-2P-NL', 'price', 26.50,
                           'currency', 'EUR', 'stock_source', 'customer_warehouse', 'content_status', 'approved',
                           'launched_on', current_date - 6, 'last_checked_on', current_date - 1,
                           'open_issue', 'OA-06: ilan platform tarafından askıya alındı, eksik ürün bilgisi bekleniyor'));

    -- THO: the tips
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000006', 'THO-TIPS-6-50', 'amazon', 'ES',
        ARRAY['planned']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'content_status', 'en_master', 'target_launch_on', current_date + 45));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000007', 'THO-TIPS-6-50', 'amazon', 'IT',
        ARRAY['planned', 'preparing', 'uploaded', 'live', 'stopped']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'platform_product_id', 'B0STORY007', 'platform_sku', 'THO-TIPS-6-50-IT', 'price', 12.90,
                           'currency', 'EUR', 'stock_source', 'customer_warehouse', 'content_status', 'approved',
                           'launched_on', current_date - 30, 'last_checked_on', current_date - 4,
                           'notes', 'Düşük satış nedeniyle bu pazarda durduruldu'));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000008', 'THO-TIPS-6-50', 'kaufland', 'DE',
        ARRAY['planned', 'preparing', 'uploaded', 'live']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'platform_product_id', 'KL-STORY-008', 'platform_sku', 'THO-TIPS-6-50-KL', 'price', 11.90,
                           'currency', 'EUR', 'stock_source', '3pl', 'content_status', 'approved',
                           'launched_on', current_date - 20, 'last_checked_on', current_date - 3));

    -- THO: the cones
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000009', 'THO-CONES-100', 'amazon', 'PL',
        ARRAY[]::public.market_cell_status[],
        jsonb_build_object('compliance', 'red', 'compliance_note', 'Polonya için gerekli uygunluk belgesi yok, pazar kapalı',
                           'content_status', 'none'));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000010', 'THO-CONES-100', 'ebay', 'DE',
        ARRAY['paused']::public.market_cell_status[], jsonb_build_object('compliance', 'green'));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000011', 'THO-CONES-100', 'otto', 'DE',
        ARRAY['removed']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'notes', 'Otto satış koşulları uygun değil, hedeften çıkarıldı'));

    -- KRN: the vase
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000012', 'KRN-VASE-01', 'bol', 'NL',
        ARRAY['planned', 'preparing', 'uploaded', 'live']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'platform_product_id', 'BOL-STORY-012', 'platform_sku', 'KRN-VASE-01-NL', 'price', 39.90,
                           'currency', 'EUR', 'stock_source', 'platform', 'content_status', 'approved',
                           'launched_on', current_date - 10, 'last_checked_on', current_date - 2));
    PERFORM private.story_cell('5eed0007-0000-4000-8000-000000000013', 'KRN-VASE-01', 'kaufland', 'AT',
        ARRAY['planned']::public.market_cell_status[],
        jsonb_build_object('compliance', 'green', 'target_launch_on', current_date + 30));

    PERFORM private.story_end('3 days');
END;
$$;

-- Opens an incident of the story (the fixed id p_id) in the request's tenant, for the customer of
-- the linked record, by the real rules: the code trigger forces open and the code, the notice
-- trigger sets customer_notice_due_at from p_opened_at. p_fields carries the optional opening
-- columns (reported_by, current_state, immediate_action, affected_parties).
CREATE FUNCTION private.story_incident (p_id UUID, p_family public.incident_family, p_type TEXT, p_severity public.incident_severity,
                                        p_opened_at TIMESTAMPTZ, p_entity_type public.document_entity, p_entity_id UUID,
                                        p_title TEXT, p_what_happened TEXT, p_fields JSONB DEFAULT '{}') RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_tenant UUID := private.requested_tenant();
    v_customer UUID := private.entity_customer(p_entity_type, p_entity_id, v_tenant);
    v_rec public.incident := jsonb_populate_record(NULL::public.incident, p_fields);
BEGIN
    IF v_customer IS NULL THEN
        RAISE EXCEPTION 'story 08: no % %', p_entity_type, p_entity_id;
    END IF;

    INSERT INTO public.incident (id, tenant_id, customer_id, family, incident_type, severity, title, what_happened, reported_by,
                                 current_state, immediate_action, entity_type, entity_id, opened_at, affected_parties)
    VALUES (p_id, v_tenant, v_customer, p_family, p_type, p_severity, p_title, p_what_happened, v_rec.reported_by,
            v_rec.current_state, v_rec.immediate_action, p_entity_type, p_entity_id, p_opened_at,
            coalesce(v_rec.affected_parties, '{}'));
END;
$$;

-- Opens a change request of the story (the fixed id p_id) for THO in the request's tenant, by the
-- real rules: the code trigger forces open, the due trigger sets created_at to now and
-- decision_due_on from it. p_fields carries the optional columns (project_id, affected_gate_code,
-- affected_document_id, other_documents, cost_impact, cost_payer, delay_days, quality_impact,
-- listing_impact); p_skus the products it touches.
CREATE FUNCTION private.story_cr (p_id UUID, p_source public.change_request_source, p_urgency public.change_request_urgency,
                                  p_kinds public.change_kind[], p_title TEXT, p_current_value TEXT, p_requested_value TEXT,
                                  p_reason TEXT, p_fields JSONB DEFAULT '{}', p_skus TEXT[] DEFAULT '{}') RETURNS VOID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_tenant UUID := private.requested_tenant();
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.code = 'THO' AND c.tenant_id = private.requested_tenant());
    v_rec public.change_request := jsonb_populate_record(NULL::public.change_request, p_fields);
    v_rows INT;
BEGIN
    INSERT INTO public.change_request (id, tenant_id, customer_id, project_id, title, source, urgency, change_kinds, current_value,
                                       requested_value, reason, affected_gate_code, affected_document_id, other_documents,
                                       cost_impact, cost_payer, delay_days, quality_impact, listing_impact)
    VALUES (p_id, v_tenant, v_tho, v_rec.project_id, p_title, p_source, p_urgency, p_kinds, p_current_value, p_requested_value,
            p_reason, v_rec.affected_gate_code, v_rec.affected_document_id, v_rec.other_documents, v_rec.cost_impact,
            v_rec.cost_payer, v_rec.delay_days, v_rec.quality_impact, v_rec.listing_impact);

    INSERT INTO public.change_request_product (change_request_id, product_id, tenant_id, customer_id)
    SELECT p_id, p.id, v_tenant, v_tho
    FROM public.product p
    WHERE p.tenant_id = v_tenant AND p.sku = ANY (p_skus);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> cardinality(p_skus) THEN
        RAISE EXCEPTION 'story 08: change request % found % of the products %', p_id, v_rows, p_skus;
    END IF;
END;
$$;

-- Step 08 (today): incidents of every family, severity and status, the variant's G3 rolled back
-- through the OT-04 incident, and change requests in every status, as akif (management) in MOESA
-- LTD. Everything meets the real rules, with the rules bypass off: incidents are opened at their
-- past opened_at and walked open → contained → closed one UPDATE at a time (management told before
-- an s1/s2 leaves open; the guard sets closed_on and closed_by on closing); the rollback goes
-- through public.rollback_gate while its incident is contained; requests go open → approved |
-- rejected, approved → applied. The incidents come first, so that the step's audit transaction is
-- named after the incident table. The one sanctioned trigger bypass: the urgent request's past
-- decision date, with change_request_due off for that UPDATE only (as test 038 does). Incident ids
-- 5eed0008-…-0N, change request ids …-1N, documents …-2N; codes come from the triggers.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('akif@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.code = 'THO' AND c.tenant_id = private.requested_tenant());
    v_tips50 UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-TIPS-6-50' AND p.tenant_id = private.requested_tenant());
    v_cones100 UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-CONES-100' AND p.tenant_id = private.requested_tenant());
    v_pilot UUID := (SELECT p.id FROM public.project p WHERE p.display_name = 'Mop ailesi çok ülke pilotu' AND p.tenant_id = private.requested_tenant());
    v_variant_g3 UUID := (SELECT g.id FROM public.project_gate g WHERE g.project_id = '5eed0004-0000-4000-8000-000000000002' AND g.code = 'G3');
    v_gate public.project_gate;
    v_rows INT;
BEGIN
    IF v_tho IS NULL OR v_tips50 IS NULL OR v_cones100 IS NULL OR v_pilot IS NULL OR v_variant_g3 IS NULL THEN
        RAISE EXCEPTION 'story 08: a seed or story row is missing';
    END IF;

    -- 01 OL-02 s1, open five hours: management not told yet, the customer's 4-hour notice is late.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000001', 'ol', 'OL-02', 's1', now() - INTERVAL '5 hours', 'shipment',
        '5eed0006-0000-4000-8000-000000000002', 'Tır depoda kabul edilmedi',
        'Rosbach deposu randevusuz gelen aracı geri çevirdi; yük araçta bekliyor.',
        jsonb_build_object('reported_by', 'Forwarder operasyon (telefon)', 'current_state', 'Araç depo önünde bekliyor',
                           'affected_parties', ARRAY['customer', 'forwarder', 'warehouse']));

    -- 02 OL-05 s2, contained: hasarlı teslimat; the 48-hour supplier damage notice ran out two days ago.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000002', 'ol', 'OL-05', 's2', now() - INTERVAL '4 days', 'shipment',
        '5eed0006-0000-4000-8000-000000000009', 'Teslimatta hasarlı koliler',
        'Hava kargo teslimatında koliler ezik geldi; teslim tutanağına hasar notu düşüldü.',
        jsonb_build_object('reported_by', 'Müşteri deposu (e-posta)', 'immediate_action', 'Hasarlı koliler ayrıldı, fotoğraflandı',
                           'affected_parties', ARRAY['customer', 'supplier', 'forwarder']));
    INSERT INTO public.incident_deadline (tenant_id, incident_id, kind, label)
    VALUES (v_tenant, '5eed0008-0000-4000-8000-000000000002', 'supplier_damage', 'Tedarikçiye hasar bildirimi');
    INSERT INTO public.incident_log (tenant_id, incident_id, logged_at, note, counterparty, decision, cost_amount, cost_currency, cost_payer,
                                     customer_approved)
    VALUES (v_tenant, '5eed0008-0000-4000-8000-000000000002', now() - INTERVAL '3 days', 'Taşıyıcı sigortasına hasar dosyası açıldı.',
            'Taşıyıcı sigorta birimi (e-posta)', 'Hasar bedeli sigortadan karşılanacak', 350, 'EUR', 'carrier_insurance', TRUE);
    -- The customer is told within the s2 notice time (due at the end of the opening business day,
    -- UTC), whatever time of day the story runs.
    UPDATE public.incident
    SET management_notified_at = opened_at + INTERVAL '1 hour', customer_notified_at = least(opened_at + INTERVAL '2 hours', customer_notice_due_at)
    WHERE id = '5eed0008-0000-4000-8000-000000000002';
    UPDATE public.incident SET status = 'contained', current_state = 'Hasarlı koliler ayrıldı, sigorta süreci sürüyor'
    WHERE id = '5eed0008-0000-4000-8000-000000000002';

    -- 03 OL-09 s3, closed: eksik koli, fully recovered.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000003', 'ol', 'OL-09', 's3', now() - INTERVAL '60 days', 'shipment',
        '5eed0006-0000-4000-8000-000000000006', 'Eksik koli',
        'Gümrük sayımında iki koli eksik çıktı.', jsonb_build_object('reported_by', 'Gümrük müşaviri (e-posta)'));
    UPDATE public.incident SET status = 'contained' WHERE id = '5eed0008-0000-4000-8000-000000000003';
    UPDATE public.incident
    SET status = 'closed', outcome = 'full_recovery', root_cause = 'carrier',
        root_cause_note = 'Koliler aktarma limanında başka bir konşimentoya yüklenmiş',
        preventive_action = 'Aktarmalı sevkiyatlarda koli sayısı her aktarmada teyit edilecek'
    WHERE id = '5eed0008-0000-4000-8000-000000000003';

    -- 04 OL-09 s3, open: the same card again within 90 days (a repeat).
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000004', 'ol', 'OL-09', 's3', now() - INTERVAL '10 days', 'shipment',
        '5eed0006-0000-4000-8000-000000000007', 'Eksik koli (tekrar)',
        'Kara yolu teslimatında bir koli eksik sayıldı.', jsonb_build_object('reported_by', 'Müşteri deposu (e-posta)'));

    -- 05 OT-04 s2, contained: the supplier's PI does not match the order; it rolls back the variant's G3.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000005', 'ot', 'OT-04', 's2', now() - INTERVAL '3 days', 'purchase_order',
        '5eed0005-0000-4000-8000-000000000003', 'PI tutarsızlığı',
        'Tedarikçinin PI toplamı sipariş tutarından farklı; onaylı varyant fiyatları da etkileniyor.',
        jsonb_build_object('reported_by', 'Satın alma (e-posta)', 'affected_parties', ARRAY['customer', 'supplier']));
    UPDATE public.incident
    SET management_notified_at = opened_at + INTERVAL '30 minutes', customer_notified_at = least(opened_at + INTERVAL '2 hours', customer_notice_due_at)
    WHERE id = '5eed0008-0000-4000-8000-000000000005';
    UPDATE public.incident SET status = 'contained', immediate_action = 'Siparişler PI düzeltilene kadar bekletiliyor'
    WHERE id = '5eed0008-0000-4000-8000-000000000005';
    v_gate := public.rollback_gate(v_variant_g3, 'PI tutarsızlığı (OT-04)', '5eed0008-0000-4000-8000-000000000005');
    IF v_gate.status IS DISTINCT FROM 'rolled_back' THEN
        RAISE EXCEPTION 'story 08: the variant''s G3 was not rolled back';
    END IF;

    -- 06 OA-02 s3, open: the platform asks for a document within five business days.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000006', 'oa', 'OA-02', 's3', now() - INTERVAL '1 day', 'market_cell',
        '5eed0007-0000-4000-8000-000000000005', 'Platform belge talebi',
        'Platform, askıdaki ilan için ürün uygunluk belgesi istedi.', jsonb_build_object('reported_by', 'Satıcı paneli bildirimi'));
    INSERT INTO public.incident_deadline (tenant_id, incident_id, kind, label)
    VALUES (v_tenant, '5eed0008-0000-4000-8000-000000000006', 'document_request', 'Platforma belge yükleme');

    -- 07 OU-01 s1, closed by management: PSI sapması, partly recovered.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000007', 'ou', 'OU-01', 's1', now() - INTERVAL '20 days', 'product',
        v_tips50, 'PSI sapması',
        'Sevkiyat öncesi denetimde filtre ölçüleri toleransın dışında çıktı.',
        jsonb_build_object('reported_by', 'Denetim firması (rapor)', 'affected_parties', ARRAY['customer', 'supplier']));
    UPDATE public.incident
    SET management_notified_at = opened_at + INTERVAL '1 hour', customer_notified_at = opened_at + INTERVAL '3 hours'
    WHERE id = '5eed0008-0000-4000-8000-000000000007';
    UPDATE public.incident SET status = 'contained', immediate_action = 'Sapmalı parti ayrıldı, yeniden üretim istendi'
    WHERE id = '5eed0008-0000-4000-8000-000000000007';
    UPDATE public.incident
    SET status = 'closed', outcome = 'partial_recovery', root_cause = 'supplier',
        root_cause_note = 'Kalıp aşınması fark edilmemiş', impact_note = 'Partinin bir kısmı indirimli satıldı',
        preventive_action = 'Her üretimde ilk numune ölçü raporu istenecek', customer_closure_notified_on = current_date - 1
    WHERE id = '5eed0008-0000-4000-8000-000000000007';

    -- 08 OM s3, open and not yet classified, on the pilot project.
    PERFORM private.story_incident('5eed0008-0000-4000-8000-000000000008', 'om', NULL, 's3', now() - INTERVAL '2 days', 'project',
        v_pilot, 'Müşteri talebi netleşmedi',
        'Müşteri pilot kapsamını toplantıda değiştirmek istedi; konu henüz sınıflandırılmadı.',
        jsonb_build_object('reported_by', 'Koordinatör (toplantı)'));

    -- 11 open, normal: carton print and design, two products, decided in five business days.
    PERFORM private.story_cr('5eed0008-0000-4000-8000-000000000011', 'customer', 'normal', ARRAY['packaging', 'design']::public.change_kind[],
        'Koli baskısı ve etiket tasarımı', 'Tek renk koli baskısı', 'İki renk baskı, yeni logo', 'Müşteri marka yenilemesi',
        jsonb_build_object('cost_impact', 'Baskı kalıbı ek maliyeti', 'cost_payer', 'customer', 'delay_days', 5),
        ARRAY['THO-MOP40-2P', 'THO-MOP40-3P']);

    -- 12 open, urgent, its decision date passed (the sanctioned trigger bypass, as test 038).
    PERFORM private.story_cr('5eed0008-0000-4000-8000-000000000012', 'company', 'urgent', ARRAY['deadline']::public.change_kind[],
        'Teslim tarihinin öne alınması', 'Mevcut teslim planı', 'Teslimin bir hafta öne alınması', 'Sezon başlangıcı öne çekildi');
    ALTER TABLE public.change_request DISABLE TRIGGER change_request_due;
    UPDATE public.change_request SET decision_due_on = current_date - 2 WHERE id = '5eed0008-0000-4000-8000-000000000012';
    ALTER TABLE public.change_request ENABLE TRIGGER change_request_due;

    -- 13 approved after the private label project's PL_G1 (passed, customer approval), with the
    -- customer's signed approval document of this request.
    PERFORM private.story_cr('5eed0008-0000-4000-8000-000000000013', 'customer', 'normal', ARRAY['spec', 'content']::public.change_kind[],
        'Fırça kıl sertliği ve ürün metni', 'Orta sertlik', 'Sert kıl, ürün metninde belirtilecek', 'Müşteri geri bildirimi',
        jsonb_build_object('project_id', '5eed0004-0000-4000-8000-000000000001', 'affected_gate_code', 'PL_G1',
                           'quality_impact', 'Numune yeniden onaylanacak', 'listing_impact', 'Ürün metni güncellenecek'));
    PERFORM private.story_doc('5eed0008-0000-4000-8000-000000000021', 'change_request', '5eed0008-0000-4000-8000-000000000013', v_tho,
                              'change_request', 1, 'signed', current_date - 3);
    UPDATE public.change_request
    SET customer_approved_on = current_date - 3, customer_approval_document_id = '5eed0008-0000-4000-8000-000000000021'
    WHERE id = '5eed0008-0000-4000-8000-000000000013';
    UPDATE public.change_request SET status = 'approved', decision_note = 'Müşteri yazılı onayı ile kabul edildi'
    WHERE id = '5eed0008-0000-4000-8000-000000000013';

    -- 14 rejected: the supplier's price rise.
    PERFORM private.story_cr('5eed0008-0000-4000-8000-000000000014', 'supplier', 'normal', ARRAY['price', 'supplier']::public.change_kind[],
        'Tedarikçi fiyat artışı', 'Birim fiyat 1,90 USD', 'Birim fiyat 2,10 USD', 'Hammadde maliyeti arttı',
        jsonb_build_object('cost_impact', 'Birim başına 0,20 USD', 'cost_payer', 'company'));
    UPDATE public.change_request SET status = 'rejected', decision_note = 'Sözleşme fiyatı yıl sonuna kadar geçerli; artış kabul edilmedi'
    WHERE id = '5eed0008-0000-4000-8000-000000000014';

    -- 15 applied: the cones' label artwork v1 → v2 (signed) on the revision project of step 04.
    PERFORM private.story_cr('5eed0008-0000-4000-8000-000000000015', 'regulation', 'normal', ARRAY['packaging']::public.change_kind[],
        'Etikette geri dönüşüm işareti', 'Etiket v1', 'Etiket v2, geri dönüşüm işaretli', 'Ambalaj mevzuatı',
        jsonb_build_object('project_id', '5eed0004-0000-4000-8000-000000000004',
                           'affected_document_id', '5eed0003-0000-4000-8000-000000000030'));
    UPDATE public.change_request SET status = 'approved' WHERE id = '5eed0008-0000-4000-8000-000000000015';
    PERFORM private.story_doc('5eed0008-0000-4000-8000-000000000022', 'product', v_cones100, v_tho, 'label_artwork', 2, 'signed',
                              current_date);
    UPDATE public.change_request SET status = 'applied', result_document_id = '5eed0008-0000-4000-8000-000000000022'
    WHERE id = '5eed0008-0000-4000-8000-000000000015';

    SELECT count(*) INTO v_rows FROM public.change_request
    WHERE id::TEXT LIKE '5eed0008-%' AND status = CASE id::TEXT
        WHEN '5eed0008-0000-4000-8000-000000000013' THEN 'approved'::public.change_request_status
        WHEN '5eed0008-0000-4000-8000-000000000014' THEN 'rejected'
        WHEN '5eed0008-0000-4000-8000-000000000015' THEN 'applied'
        ELSE 'open' END;
    IF v_rows <> 5 THEN
        RAISE EXCEPTION 'story 08: % of 5 change requests reached their status', v_rows;
    END IF;

    PERFORM private.story_end('0');
END;
$$;

-- The media row of a file scripts/seed-story.mjs uploaded (the fixed id p_id, from its MEDIA list)
-- in the request's tenant: the file <tenant>/<id>/<p_file_name>, and the thumbnail
-- <tenant>/<id>/thumb/thumb.webp when it was uploaded too. media_check_file takes the type and
-- size from Storage's record, so they are left to it. p_customer_id NULL is a shared file.
CREATE FUNCTION private.story_media (p_id UUID, p_customer_id UUID, p_title TEXT, p_file_name TEXT) RETURNS UUID LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    v_folder TEXT := private.requested_tenant() || '/' || p_id || '/';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = v_folder || p_file_name) THEN
        RAISE EXCEPTION 'story: media % not uploaded', p_id;
    END IF;

    INSERT INTO public.media (id, tenant_id, customer_id, storage_path, thumbnail_path, file_name, title)
    VALUES (p_id, private.requested_tenant(), p_customer_id, v_folder || p_file_name,
            (SELECT o.name FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = v_folder || 'thumb/thumb.webp'),
            p_file_name, p_title);

    RETURN p_id;
END;
$$;

-- Step 09 (30 days ago): the media library and the documents of the kinds the earlier steps left
-- out, as baris in MOESA LTD. The media rows come first, so that the step's audit transaction is
-- named after the media table; every file was uploaded by the script before this file ran (media
-- ids 5eed0009-…-NN, documents …-2NN). THO's files go only to THO's records and documents; the
-- catalogue photo (09) and the certificate PDF (12) have no customer, so the photo shows on THO's
-- and KRN's products and the PDF backs a supplier's certificate (a supplier's document has no
-- customer, so it may cite no customer's file). The 12 MB catalogue (11) fits MOESA LTD's 25 MB
-- cap and not MOESA Trading GmbH's 5 MB: the transfer's media_too_large edge.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('baris@moesa-panel.test', 'MOESA LTD');
    v_tho UUID := (SELECT c.id FROM public.customer c WHERE c.code = 'THO' AND c.tenant_id = private.requested_tenant());
    v_krn UUID := (SELECT c.id FROM public.customer c WHERE c.code = 'KRN' AND c.tenant_id = private.requested_tenant());
    v_cn1 UUID := (SELECT s.id FROM public.supplier s WHERE s.code = 'CN1' AND s.tenant_id = private.requested_tenant());
    v_mop40_2p UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-MOP40-2P' AND p.tenant_id = private.requested_tenant());
    v_mop40_3p UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-MOP40-3P' AND p.tenant_id = private.requested_tenant());
    v_mop60_2p UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-MOP60-2P' AND p.tenant_id = private.requested_tenant());
    v_tips50 UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-TIPS-6-50' AND p.tenant_id = private.requested_tenant());
    v_cones100 UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-CONES-100' AND p.tenant_id = private.requested_tenant());
    v_cones200 UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'THO-CONES-200' AND p.tenant_id = private.requested_tenant());
    v_vase UUID := (SELECT p.id FROM public.product p WHERE p.sku = 'KRN-VASE-01' AND p.tenant_id = private.requested_tenant());
    v_rows INT;
BEGIN
    IF v_tho IS NULL OR v_krn IS NULL OR v_cn1 IS NULL OR v_mop40_2p IS NULL OR v_mop40_3p IS NULL OR v_mop60_2p IS NULL
       OR v_tips50 IS NULL OR v_cones100 IS NULL OR v_cones200 IS NULL OR v_vase IS NULL THEN
        RAISE EXCEPTION 'story 09: a seed or story row is missing';
    END IF;

    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000001', v_tho, 'Mop 40 cm, 2''li paket: ana görsel', 'mop-primary.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000002', v_tho, 'Mop 40 cm, 2''li paket: detay', 'mop-gallery.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000003', v_tho, 'Üretim hattı fotoğrafı', 'production.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000004', v_tho, 'Teslimatta hasarlı koliler', 'damage.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000005', v_tho, 'Proforma fatura (PDF)', 'pi.pdf');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000006', v_tho, 'Ambalaj baskı dosyası', 'artwork.pdf');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000007', v_tho, 'Uç seti kullanım videosu', 'demo.mp4');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000008', v_tho, 'Kullanılmayan çekim', 'orphan.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000009', NULL, 'Ortak katalog fotoğrafı', 'catalogue.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000010', v_krn, 'Vazo: ana görsel', 'vase.png');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000011', v_tho, 'Ürün kataloğu (yüksek çözünürlük)', 'big-catalogue.pdf');
    PERFORM private.story_media('5eed0009-0000-4000-8000-000000000012', NULL, 'Tedarikçi sertifikası (PDF)', 'certificate.pdf');

    -- The links; 08 (the orphan) and the PDFs that only documents cite (05, 12) stay unlinked.
    INSERT INTO public.media_link (tenant_id, media_id, entity_type, entity_id, role, position)
    VALUES (v_tenant, '5eed0009-0000-4000-8000-000000000001', 'product', v_mop40_2p, 'primary_image', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000002', 'product', v_mop40_2p, 'gallery', 1),
           (v_tenant, '5eed0009-0000-4000-8000-000000000003', 'purchase_order', '5eed0005-0000-4000-8000-000000000006', 'evidence_photo', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000004', 'shipment', '5eed0006-0000-4000-8000-000000000009', 'evidence_photo', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000006', 'change_request', '5eed0008-0000-4000-8000-000000000015', 'attachment', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000007', 'product', v_tips50, 'gallery', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000009', 'product', v_cones100, 'gallery', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000010', 'product', v_vase, 'primary_image', 0),
           (v_tenant, '5eed0009-0000-4000-8000-000000000009', 'product', v_vase, 'gallery', 1),
           (v_tenant, '5eed0009-0000-4000-8000-000000000011', 'product', v_mop60_2p, 'attachment', 0);

    -- PO-011's approved PI (step 05, the order's pi_document_id, v1) gains the PDF next to its Drive
    -- link: the "both" kind, and the file a document cites. A v2 would supersede the order's own PI.
    UPDATE public.document SET media_id = '5eed0009-0000-4000-8000-000000000005'
    WHERE id = (SELECT o.pi_document_id FROM public.purchase_order o WHERE o.id = '5eed0005-0000-4000-8000-000000000011');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'story 09: PO-011 has no PI document';
    END IF;

    -- The document types, records and file kinds the earlier steps left out.
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000201', 'product', v_mop40_3p, v_tho, 'tech_pack', 1, 'draft',
                              current_date - 31, 'https://drive.google.com/example/5eed0009-0000-4000-8000-000000000201',
                              '5eed0009-0000-4000-8000-000000000006');
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000202', 'product', v_cones200, v_tho, 'sample_report', 1, 'approved',
                              current_date - 45);
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000203', 'purchase_order', '5eed0005-0000-4000-8000-000000000002', v_tho,
                              'po', 1, 'signed', current_date - 6);
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000204', 'product', v_tips50, v_tho, 'technical_file', 1, 'approved',
                              current_date - 60);
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000205', 'incident', '5eed0008-0000-4000-8000-000000000002', v_tho,
                              'other', 1, 'draft', current_date - 3);
    -- CN1's renewed certificate supersedes the one of step 02; a supplier's, so the shared PDF.
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000206', 'supplier', v_cn1, NULL, 'certificate', 2, 'signed',
                              current_date - 30, 'https://drive.google.com/example/5eed0009-0000-4000-8000-000000000206',
                              '5eed0009-0000-4000-8000-000000000012');
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000207', 'market_cell', '5eed0007-0000-4000-8000-000000000005', v_tho,
                              'other', 1, 'draft', current_date - 2);
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000208', 'project', '5eed0004-0000-4000-8000-000000000003', v_tho,
                              'other', 1, 'signed', current_date - 20);
    -- The packing list of SHP-008, a scan in the library only: the "media only" kind.
    PERFORM private.story_doc('5eed0009-0000-4000-8000-000000000209', 'shipment', '5eed0006-0000-4000-8000-000000000008', v_tho,
                              'packing_list', 1, 'approved', current_date - 12, NULL, '5eed0009-0000-4000-8000-000000000006');

    PERFORM private.story_end('30 days');
END;
$$;

-- Step 10 (today): akif (management in MOESA LTD and MOESA Europe) copies KRN into MOESA Europe
-- through the real public.transfer_customer, as the panel does: rehearsals until every conflict
-- has a decision, then the run on the last rehearsal's report_hash. The decision of each conflict
-- the rehearsal lists without one: gtin → clear_gtin (the copy's GTINs stay with MOESA LTD's
-- products), code → new_code, media_link → demote, anything else → map onto the existing row.
-- No client copies the files afterwards, so the transfer keeps files_status 'pending': Europe's
-- KRN shows the pending-files notice, and transferring it onward is refused
-- (transfer_files_pending). No story_end: the transfer's audit transactions stay at now(), and the
-- feed shows them as cannot be reverted (audit_transfer_locked). The transfer row's id comes from
-- the RPC; it is found by its source and target customer.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('akif@moesa-panel.test', 'MOESA LTD');
    v_europe UUID := (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA Europe');
    v_krn UUID := (SELECT c.id FROM public.customer c WHERE c.code = 'KRN' AND c.tenant_id = private.requested_tenant());
    v_decisions JSONB := '{}';
    v_added JSONB;
    v_report JSONB;
    v_round INT := 0;
    v_run public.transfer;
BEGIN
    IF v_europe IS NULL OR v_krn IS NULL THEN
        RAISE EXCEPTION 'story 10: MOESA Europe or KRN is missing';
    END IF;

    LOOP
        v_report := public.transfer_customer(v_tenant, v_europe, v_krn, 'copy', decisions => v_decisions);

        SELECT coalesce(jsonb_object_agg(c ->> 'key', CASE c ->> 'kind'
                   WHEN 'gtin' THEN '{"action": "clear_gtin"}'::JSONB
                   WHEN 'code' THEN '{"action": "new_code"}'::JSONB
                   WHEN 'media_link' THEN '{"action": "demote"}'::JSONB
                   ELSE jsonb_build_object('action', 'map', 'target_id', c -> 'existing_id')
               END), '{}')
        INTO v_added
        FROM jsonb_array_elements(v_report -> 'conflicts') c
        WHERE NOT (c -> 'actions') ? coalesce(v_decisions -> (c ->> 'key') ->> 'action', '');

        EXIT WHEN v_added = '{}';

        v_round := v_round + 1;
        IF v_round > 5 THEN
            RAISE EXCEPTION 'story 10: the rehearsals still add decisions after 5 rounds';
        END IF;
        v_decisions := v_decisions || v_added;
    END LOOP;

    IF (v_report ->> 'unresolved')::INT IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'story 10: % conflicts left undecided', v_report ->> 'unresolved';
    END IF;

    v_run := jsonb_populate_record(NULL::public.transfer, public.transfer_customer(
        v_tenant, v_europe, v_krn, 'copy', decisions => v_decisions, dry_run => FALSE, report_hash => v_report ->> 'report_hash'
    ));

    IF v_run.tenant_id IS DISTINCT FROM v_europe OR v_run.mode IS DISTINCT FROM 'copy' OR v_run.path IS DISTINCT FROM 'copy'
       OR v_run.files_status IS DISTINCT FROM 'pending' OR coalesce(jsonb_array_length(v_run.files), 0) = 0 THEN
        RAISE EXCEPTION 'story 10: the copy is not a pending copy into MOESA Europe (%, %, %)', v_run.mode, v_run.path, v_run.files_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.id = v_run.target_customer_id AND c.tenant_id = v_europe AND c.code = 'KRN') THEN
        RAISE EXCEPTION 'story 10: the copy has no KRN in MOESA Europe';
    END IF;

    IF coalesce(cardinality(v_run.audit_transaction_ids), 0) = 0
       OR EXISTS (SELECT 1 FROM unnest(v_run.audit_transaction_ids) a WHERE public.audit_transfer_locked(a) IS NOT TRUE) THEN
        RAISE EXCEPTION 'story 10: an audit transaction of the copy could be reverted';
    END IF;
END;
$$;

-- Step 11 (2 days ago): Amazon listing, as koordinator in MOESA LTD. THO's amazon account is
-- connected (the sandbox uses the self-authorized token, so no Vault secret holds one); the R3
-- fixture (scripts/seed-story.mjs hands it over as the story.amazon_* settings) is the cached
-- LUGGAGE definition of every marketplace the step 07 cells use, and THO-MOP40-2P (a variation
-- parent) has its product type, schema version and attributes. The five Amazon cells of step 07
-- show one listing state each: DE live (a done create), FR issues (an invalid create, Amazon's
-- sandbox INVALID list), IT submitted (a create still processing), ES ready, NL draft. The
-- business status of the cells does not move (R2). Submission ids 5eed0011-…-NN.
DO $$
DECLARE
    v_tenant UUID := private.story_begin('koordinator@moesa-panel.test', 'MOESA LTD');
    v_definition JSONB := current_setting('story.amazon_definition')::JSONB;
    -- The property groups in Amazon's order: read as json (jsonb would reorder the keys), stored as
    -- an array of {key, title, description, propertyNames}.
    v_groups JSONB := (
        SELECT jsonb_agg(jsonb_build_object('key', g.key) || g.value::JSONB ORDER BY g.n)
        FROM json_each(current_setting('story.amazon_definition')::JSON -> 'propertyGroups') WITH ORDINALITY AS g (key, value, n)
    );
    v_attributes JSONB := current_setting('story.amazon_attributes')::JSONB;
    v_seller TEXT := current_setting('story.amazon_seller_id');
    v_account UUID;
    v_product UUID;
    v_attributes_all JSONB;
    v_sent JSONB;
BEGIN
    -- The connection and listing columns are server-only (052): the story writes them as the server.
    PERFORM private.begin_server_write();

    INSERT INTO public.amazon_product_type_definition (marketplace_id, product_type, locale, version, display_name, schema, property_groups)
    SELECT m, v_definition ->> 'productType', v_definition ->> 'locale', v_definition -> 'productTypeVersion' ->> 'version',
           v_definition ->> 'displayName', v_definition -> 'schema', v_groups
    FROM unnest(ARRAY['A1PA6795UKMFR9', 'A13V1IB3VIYZZH', 'APJ6JRA9NG5V4', 'A1RKKUPIHCS9HS', 'A1805IZSGTT6HS']) m;

    UPDATE public.customer_platform_account a
    SET api_connection = 'connected', seller_id = v_seller, authorized_at = now() - INTERVAL '2 days'
    FROM public.customer c
    WHERE c.id = a.customer_id AND c.code = 'THO' AND c.tenant_id = v_tenant AND a.platform_id = 'amazon'
    RETURNING a.id INTO v_account;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'story 11: THO has no amazon account';
    END IF;

    -- The mop is a variation parent (it has children), so its attributes name the theme. A parent
    -- derives only its identity from the product card (its pack quantity, dimensions and weights are
    -- its children's): the German brand comes from the card (derived on publish, never stored), so
    -- the fixture's brand is dropped, and the French brand is overridden for that language. What
    -- was sent carries the derived brand beside the override.
    v_attributes_all := (v_attributes - 'brand')
        || '{"variation_theme": [{"value": "NUMBER_OF_ITEMS"}], "brand": [{"value": "OKAEI Maison", "language_tag": "fr_FR"}]}'::JSONB;
    v_sent := v_attributes_all || jsonb_build_object('brand', (v_attributes_all -> 'brand') || (v_attributes -> 'brand'));
    UPDATE public.product
    SET amazon_product_type = v_definition ->> 'productType',
        amazon_schema_version = v_definition -> 'productTypeVersion' ->> 'version',
        listing_attributes = v_attributes_all
    WHERE tenant_id = v_tenant AND sku = 'THO-MOP40-2P'
    RETURNING id INTO v_product;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'story 11: no THO-MOP40-2P';
    END IF;

    UPDATE public.market_cell c
    SET listing_language = l.language, fulfillment_channel = l.channel
    FROM (VALUES ('5eed0007-0000-4000-8000-000000000001'::UUID, 'de_DE', 'fbm'), ('5eed0007-0000-4000-8000-000000000002', 'fr_FR', NULL),
                 ('5eed0007-0000-4000-8000-000000000003', 'it_IT', NULL), ('5eed0007-0000-4000-8000-000000000004', 'es_ES', NULL),
                 ('5eed0007-0000-4000-8000-000000000005', 'nl_NL', NULL)) l (id, language, channel)
    WHERE c.id = l.id AND c.tenant_id = v_tenant;

    INSERT INTO public.listing_submission (id, tenant_id, cell_id, kind, sku, marketplace_id, payload, amazon_submission_id, status, issues, created_at)
    VALUES
        ('5eed0011-0000-4000-8000-000000000001', v_tenant, '5eed0007-0000-4000-8000-000000000001', 'create', 'THO-MOP40-2P-DE', 'A1PA6795UKMFR9',
         jsonb_build_object('productType', 'LUGGAGE', 'requirements', 'LISTING', 'attributes', v_sent),
         'f1dc2914-75dd-11ea-bc55-0242ac130003', 'processing', '[]', now() - INTERVAL '2 days'),
        ('5eed0011-0000-4000-8000-000000000002', v_tenant, '5eed0007-0000-4000-8000-000000000002', 'create', 'THO-MOP40-2P-FR', 'A13V1IB3VIYZZH',
         jsonb_build_object('productType', 'LUGGAGE', 'requirements', 'LISTING', 'attributes', v_sent),
         NULL, 'processing', '[]', now() - INTERVAL '2 days'),
        ('5eed0011-0000-4000-8000-000000000003', v_tenant, '5eed0007-0000-4000-8000-000000000003', 'create', 'THO-MOP40-2P-IT', 'APJ6JRA9NG5V4',
         jsonb_build_object('productType', 'LUGGAGE', 'requirements', 'LISTING', 'attributes', v_sent),
         NULL, 'processing', '[]', now() - INTERVAL '2 days');

    -- DE: Amazon accepted the create and the poll found the listing live.
    PERFORM public.listing_apply_submission('5eed0011-0000-4000-8000-000000000001', 'done', 'f1dc2914-75dd-11ea-bc55-0242ac130003', '[]', 'live', 'B0STORY001');
    PERFORM public.listing_set_state('5eed0007-0000-4000-8000-000000000001', 'live',
        jsonb_build_object('asin', 'B0STORY001', 'restricted', FALSE, 'reasons', '[]'::JSONB, 'checked_at', now() - INTERVAL '2 days'));
    -- FR: Amazon's sandbox INVALID answer; the cell goes to issues and says why in its open issue.
    PERFORM public.listing_apply_submission('5eed0011-0000-4000-8000-000000000002', 'invalid', NULL, jsonb_build_array(
        jsonb_build_object('code', '90220', 'message', '''condition_type'' is required but not supplied.', 'severity', 'ERROR', 'attributeNames', jsonb_build_array('condition_type')),
        jsonb_build_object('code', '90000900', 'message', '''fake_attribute'' is not defined in the product type definition.', 'severity', 'ERROR', 'attributeNames', jsonb_build_array('fake_attribute'))
    ), 'issues', NULL);
    -- IT: sent, Amazon has not answered yet.
    PERFORM public.listing_set_state('5eed0007-0000-4000-8000-000000000003', 'submitted', NULL);
    -- ES and NL: the cell is complete / still being filled in.
    PERFORM public.listing_set_state('5eed0007-0000-4000-8000-000000000004', 'ready', NULL);
    PERFORM public.listing_set_state('5eed0007-0000-4000-8000-000000000005', 'draft', NULL);

    PERFORM private.end_server_write();
    PERFORM private.story_end('2 days');
END;
$$;

DROP FUNCTION private.story_begin (TEXT, TEXT),
private.story_bypass (BOOLEAN),
private.story_end (INTERVAL),
private.story_doc (UUID, public.document_entity, UUID, UUID, public.document_type, INT, public.document_status, DATE, TEXT, UUID),
private.story_pass_gate (UUID, UUID, public.gate_code, TIMESTAMPTZ, UUID[]),
private.story_po_walk (UUID, public.purchase_order_status, TIMESTAMPTZ),
private.story_po_pi (UUID, UUID, public.document_status, DATE, NUMERIC),
private.story_shipment_walk (UUID, public.shipment_status, TIMESTAMPTZ, DATE),
private.story_cell (UUID, TEXT, TEXT, TEXT, public.market_cell_status[], JSONB),
private.story_incident (UUID, public.incident_family, TEXT, public.incident_severity, TIMESTAMPTZ, public.document_entity, UUID, TEXT, TEXT, JSONB),
private.story_cr (UUID, public.change_request_source, public.change_request_urgency, public.change_kind[], TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]),
private.story_media (UUID, UUID, TEXT, TEXT);

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
