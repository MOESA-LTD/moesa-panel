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

DROP FUNCTION private.story_begin (TEXT, TEXT),
private.story_bypass (BOOLEAN),
private.story_end (INTERVAL),
private.story_doc (UUID, public.document_entity, UUID, UUID, public.document_type, INT, public.document_status, DATE, TEXT, UUID);

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
