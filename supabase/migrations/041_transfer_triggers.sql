-- Cross-tenant customer transfer (M21), its triggers: while a transfer runs (private.transferring(),
-- 040) the triggers let it write the rows as they were in the source tenant, the composite foreign
-- keys between the carried tables can wait for the end of the transaction, and the code counters
-- take a tenant.
--
-- The triggers fall in three groups; a new trigger goes in one of them.
--
-- 1. Keep the copied values. The code, default and derived-value setters return at once, so the
--    copy keeps its code, status, dates and defaults; the AFTER triggers that write other rows
--    (the project's gates and checklists, superseding older document versions) write nothing,
--    because those rows are carried too:
--      project_set_code, project_create_gates, purchase_order_defaults, purchase_order_set_code,
--      shipment_set_code, incident_set_code, change_request_set_code, incident_notice_due,
--      incident_deadline_defaults, change_request_due, document_supersede,
--      media_link_demote_primary.
-- 2. Frozen-row and state rules are skipped (RETURN NEW, OLD on DELETE, NULL for an AFTER
--    trigger): a carried row may be passed, frozen or linked already:
--      customer_code_immutable, customer_contract_guard, project_immutable, project_gate_guard,
--      project_gate_advance, document_transition, purchase_order_immutable, media_customer_lock,
--      media_guard_delete; and the immutability branches that come before the rules_bypassed()
--      exit (030) of purchase_order_line_guard, shipment_guard, market_cell_guard,
--      incident_guard and change_request_guard (the exit moves to the top). shipment_line_guard
--      already starts with that exit, so its tenant rule needs no change. media_check_file skips
--      the Storage lookup on INSERT (the files are copied after the rows) and the immutability
--      check on UPDATE, and keeps the mime_type and size_bytes it is given; the CHECK
--      media_path_in_folder still applies. media_link_check exits only from its
--      media_link_identity_immutable branch.
-- 3. Integrity stays on: the entity, media and tenant checks that keep a row consistent with the
--    rows it refers to are not touched: document_check_entity, document_check_media,
--    document_signed_requires, the entity check of media_link_check,
--    purchase_order_line_customer, shipment_purchase_order_customer, market_cell_customer,
--    change_request_product_customer. purchase_order_guard, purchase_order_child_guard,
--    incident_child_guard and shipment_purchase_order_guard exit on rules_bypassed() (030), which
--    honours the flag.
--
-- Each exit reads moesa.transfer_id first and calls private.transferring() only when it is set.
-- Some of these functions are SECURITY INVOKER, and authenticated cannot call
-- private.transferring(): plpgsql prepares the inner IF only when it reaches it, so a user's write
-- never resolves the name. A transfer runs inside public.transfer_customer (SECURITY DEFINER),
-- where it does.
--
-- Deferrable foreign keys. The 49 composite foreign keys (id, tenant_id) between the tables a
-- transfer carries become DEFERRABLE INITIALLY IMMEDIATE, in place (the name and the ON DELETE
-- action stay): a transfer may SET CONSTRAINTS ... DEFERRED and write the rows in any order; for
-- everyone else they are checked as before. RESTRICT stays immediate: PostgreSQL checks a RESTRICT
-- action at once even on a deferrable key (only NO ACTION is deferred).
-- supplier_contact_supplier_fkey stays as it is, because suppliers never move.
--
-- Counters per tenant. private.next_code_in(tenant_id, kind, scope) is the 035 public.next_code
-- with the tenant as a parameter, so a transfer numbers codes in the target tenant;
-- public.next_code keeps its tenant_required check and calls it for the request's tenant.

-- Counters
CREATE OR REPLACE FUNCTION private.next_code_in (tenant_id UUID, kind TEXT, scope TEXT) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    current_year INT := extract(year FROM now())::INT;
    number INT;
    formatted TEXT;
BEGIN
    IF next_code_in.tenant_id IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'tenant_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    IF next_code_in.kind IS NULL OR next_code_in.kind NOT IN ('project', 'po', 'shp', 'cr', 'ol', 'oa', 'ou', 'ot', 'om')
       OR next_code_in.scope IS NULL OR next_code_in.scope !~ '^[A-Z0-9]+$' THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'invalid_code_kind_or_scope')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    INSERT INTO public.code_sequence AS cs (tenant_id, kind, scope, year, last_no)
    VALUES (next_code_in.tenant_id, next_code_in.kind, next_code_in.scope, current_year, 1)
    ON CONFLICT ON CONSTRAINT code_sequence_pkey DO UPDATE SET last_no = cs.last_no + 1
    RETURNING cs.last_no INTO number;

    -- At least three digits; a 1000th code still gets its full number.
    formatted := next_code_in.scope || '-' || current_year || '-' || lpad(number::TEXT, greatest(3, length(number::TEXT)), '0');

    IF next_code_in.kind = 'project' THEN
        RETURN formatted;
    END IF;
    RETURN upper(next_code_in.kind) || '-' || formatted;
END;
$$;

REVOKE ALL ON FUNCTION private.next_code_in (UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_code (kind TEXT, scope TEXT) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    active UUID := private.tenant_id();
BEGIN
    IF active IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'tenant_required')::TEXT,
            DETAIL = json_build_object('status', 403, 'headers', json_build_object())::TEXT;
    END IF;

    RETURN private.next_code_in(active, next_code.kind, next_code.scope);
END;
$$;

REVOKE ALL ON FUNCTION public.next_code (TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_code (TEXT, TEXT) TO authenticated;

-- Deferrable composite foreign keys
ALTER TABLE public.customer ALTER CONSTRAINT customer_contract_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.customer_contact ALTER CONSTRAINT customer_contact_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.customer_warehouse ALTER CONSTRAINT customer_warehouse_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.customer_platform_account ALTER CONSTRAINT customer_platform_account_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.customer_brand ALTER CONSTRAINT customer_brand_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.document ALTER CONSTRAINT document_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.document ALTER CONSTRAINT document_media_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.product ALTER CONSTRAINT product_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.product ALTER CONSTRAINT product_supplier_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.product ALTER CONSTRAINT product_parent_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project ALTER CONSTRAINT project_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_product ALTER CONSTRAINT project_product_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_product ALTER CONSTRAINT project_product_product_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_gate ALTER CONSTRAINT project_gate_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_gate ALTER CONSTRAINT project_gate_approval_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_gate ALTER CONSTRAINT project_gate_rollback_incident_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.project_task ALTER CONSTRAINT project_task_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.media ALTER CONSTRAINT media_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.media_link ALTER CONSTRAINT media_link_media_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order ALTER CONSTRAINT purchase_order_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order ALTER CONSTRAINT purchase_order_supplier_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order ALTER CONSTRAINT purchase_order_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order ALTER CONSTRAINT purchase_order_pi_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order ALTER CONSTRAINT purchase_order_packing_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order_line ALTER CONSTRAINT purchase_order_line_po_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order_line ALTER CONSTRAINT purchase_order_line_product_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order_line ALTER CONSTRAINT purchase_order_line_spec_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order_payment ALTER CONSTRAINT purchase_order_payment_po_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.purchase_order_update ALTER CONSTRAINT purchase_order_update_po_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment ALTER CONSTRAINT shipment_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment ALTER CONSTRAINT shipment_warehouse_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_purchase_order ALTER CONSTRAINT shipment_purchase_order_shipment_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_purchase_order ALTER CONSTRAINT shipment_purchase_order_po_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_line ALTER CONSTRAINT shipment_line_shipment_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_line ALTER CONSTRAINT shipment_line_link_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_line ALTER CONSTRAINT shipment_line_po_line_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.shipment_event ALTER CONSTRAINT shipment_event_shipment_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.market_cell ALTER CONSTRAINT market_cell_product_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.market_cell ALTER CONSTRAINT market_cell_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.incident ALTER CONSTRAINT incident_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.incident_log ALTER CONSTRAINT incident_log_incident_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.incident_deadline ALTER CONSTRAINT incident_deadline_incident_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request ALTER CONSTRAINT change_request_customer_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request ALTER CONSTRAINT change_request_project_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request ALTER CONSTRAINT change_request_affected_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request ALTER CONSTRAINT change_request_approval_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request ALTER CONSTRAINT change_request_result_document_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request_product ALTER CONSTRAINT change_request_product_cr_fkey DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.change_request_product ALTER CONSTRAINT change_request_product_product_fkey DEFERRABLE INITIALLY IMMEDIATE;

-- 1. Keep the copied values
CREATE OR REPLACE FUNCTION private.project_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
    customer_status public.customer_status;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.code, c.status INTO customer_code, customer_status
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'project_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF customer_status = 'closed' THEN
        RAISE EXCEPTION 'customer_closed' USING ERRCODE = 'check_violation';
    END IF;

    NEW.code := public.next_code('project', customer_code);
    NEW.current_phase := public.initial_phase(NEW.type, NEW.path, NEW.packages);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_create_gates () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NULL;
        END IF;
    END IF;

    INSERT INTO public.project_gate (tenant_id, project_id, code, position, needs_customer_approval)
    SELECT NEW.tenant_id, NEW.id, g.code, g.position::INT, g.code <> 'G4'
    FROM unnest(public.gates_for(NEW.type, NEW.path, NEW.packages)) WITH ORDINALITY AS g (code, position);

    PERFORM private.project_copy_checklists(NEW.id, NEW.tenant_id, NEW.current_phase);

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_order_defaults () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    supplier_incoterm TEXT;
    supplier_deposit NUMERIC;
    setting_value JSONB;
    company_deposit NUMERIC;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT s.default_incoterm, s.deposit_rate INTO supplier_incoterm, supplier_deposit
    FROM public.supplier s
    WHERE s.id = NEW.supplier_id AND s.tenant_id = NEW.tenant_id;

    IF NEW.incoterm IS NULL AND private.incoterm_valid(supplier_incoterm) THEN
        NEW.incoterm := supplier_incoterm;
    END IF;

    IF NEW.deposit_rate IS NULL THEN
        IF supplier_deposit IS NULL THEN
            setting_value := private.company_setting(NEW.tenant_id, 'deposit_rate_default');
            IF jsonb_typeof(setting_value) = 'number' THEN
                company_deposit := (setting_value #>> '{}')::NUMERIC;
            ELSIF jsonb_typeof(setting_value) = 'string' AND (setting_value #>> '{}') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' THEN
                company_deposit := (setting_value #>> '{}')::NUMERIC;
            END IF;
        END IF;
        NEW.deposit_rate := coalesce(supplier_deposit, company_deposit, 30);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_order_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'purchase_order_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('po', customer_code);
    NEW.status := 'draft';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.shipment_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'shipment_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('shp', customer_code);
    NEW.status := 'planned';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.incident_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'incident_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code(NEW.family::TEXT, customer_code);
    NEW.status := 'open';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.change_request_set_code () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    customer_code TEXT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT c.code INTO customer_code
    FROM public.customer c
    WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id;

    IF customer_code IS NULL THEN
        RAISE EXCEPTION 'change_request_customer_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.code := public.next_code('cr', customer_code);
    NEW.status := 'open';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.incident_notice_due () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    setting_value JSONB;
    hours NUMERIC;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.severity = 's1' THEN
        setting_value := private.company_setting(NEW.tenant_id, 's1_customer_notify_hours');
        IF jsonb_typeof(setting_value) IN ('number', 'string')
           AND (setting_value #>> '{}') ~ '^\s*[0-9]{1,6}(\.[0-9]+)?\s*$' THEN
            hours := btrim(setting_value #>> '{}')::NUMERIC;
        END IF;
        NEW.customer_notice_due_at := NEW.opened_at + coalesce(hours, 4) * INTERVAL '1 hour';
    ELSIF NEW.severity = 's2' THEN
        -- "Aynı iş günü": the end of the opening day, or of the next business day.
        NEW.customer_notice_due_at :=
            (public.add_business_days((NEW.opened_at AT TIME ZONE 'UTC')::DATE, 0) + TIME '23:59:59') AT TIME ZONE 'UTC';
    ELSE
        -- s3: the weekly summary.
        NEW.customer_notice_due_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.incident_deadline_defaults () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    opened TIMESTAMPTZ;
    setting_value JSONB;
    days INT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.due_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT i.opened_at INTO opened
    FROM public.incident i
    WHERE i.id = NEW.incident_id AND i.tenant_id = NEW.tenant_id;

    IF opened IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.kind
        WHEN 'supplier_damage', 'platform_escalation' THEN
            NEW.due_at := opened + INTERVAL '48 hours';
        WHEN 'carrier_claim' THEN
            NEW.due_at := opened + INTERVAL '7 days';
        WHEN 'document_request' THEN
            setting_value := private.company_setting(NEW.tenant_id, 'document_request_days');
            IF jsonb_typeof(setting_value) IN ('number', 'string')
               AND (setting_value #>> '{}') ~ '^\s*[0-9]{1,4}\s*$' THEN
                days := btrim(setting_value #>> '{}')::INT;
            END IF;
            NEW.due_at :=
                (public.add_business_days((opened AT TIME ZONE 'UTC')::DATE, coalesce(days, 5)) + TIME '23:59:59') AT TIME ZONE 'UTC';
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.change_request_due () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
DECLARE
    made_on DATE;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        made_on := (now() AT TIME ZONE 'UTC')::DATE;
    ELSE
        made_on := (OLD.created_at AT TIME ZONE 'UTC')::DATE;
    END IF;

    NEW.decision_due_on := CASE NEW.urgency
        WHEN 'urgent' THEN made_on + 1
        ELSE public.add_business_days(made_on, 5)
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.document_supersede () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NULL;
        END IF;
    END IF;

    UPDATE public.document
    SET status = 'superseded'
    WHERE tenant_id = NEW.tenant_id
      AND entity_type = NEW.entity_type
      AND entity_id = NEW.entity_id
      AND type = NEW.type
      AND version < NEW.version
      AND status <> 'superseded';
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.media_link_demote_primary () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.role = 'primary_image' THEN
        UPDATE public.media_link
        SET role = 'gallery'
        WHERE tenant_id = NEW.tenant_id
          AND entity_type = NEW.entity_type
          AND entity_id = NEW.entity_id
          AND role = 'primary_image'
          AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Frozen-row and state rules skipped
CREATE OR REPLACE FUNCTION private.customer_code_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'customer_code_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.customer_contract_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF (NEW.contract_accepted_on IS DISTINCT FROM OLD.contract_accepted_on
        OR NEW.contract_document_id IS DISTINCT FROM OLD.contract_document_id
        OR NEW.start_on IS DISTINCT FROM OLD.start_on
        OR NEW.deposit_rate IS DISTINCT FROM OLD.deposit_rate
        OR NEW.extra_cost_rule IS DISTINCT FROM OLD.extra_cost_rule
        OR NEW.restricted_drive_url IS DISTINCT FROM OLD.restricted_drive_url)
       AND auth.uid() IS NOT NULL
       AND cardinality(private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.setting', 'update')) = 0 THEN
        RAISE EXCEPTION 'customer_contract_restricted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'project_code_immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type
       OR NEW.path IS DISTINCT FROM OLD.path
       OR NEW.packages IS DISTINCT FROM OLD.packages
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'project_immutable_field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_gate_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    state public.project_status;
    blocking JSONB;
    pass_flag TEXT := 'moesa.gate_pass_' || replace(NEW.project_id::TEXT, '-', '_');
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Un-passing: only a rollback, with a reason, from the last passed gate backwards (rollback_gate
    -- goes from the highest position down). The phase moves back in project_gate_advance.
    IF OLD.status = 'passed' AND NEW.status <> 'passed' THEN
        PERFORM 1 FROM public.project p WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id FOR UPDATE;

        IF NEW.status <> 'rolled_back' THEN
            RAISE EXCEPTION 'gate_not_pending' USING ERRCODE = 'check_violation';
        END IF;

        IF nullif(btrim(NEW.rolled_back_reason), '') IS NULL THEN
            RAISE EXCEPTION 'gate_reason_required' USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.project_gate g
            WHERE g.project_id = NEW.project_id AND g.tenant_id = NEW.tenant_id
              AND g.position > NEW.position AND g.status = 'passed'
        ) THEN
            RAISE EXCEPTION 'gate_rollback_order' USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.rolled_back_incident_id IS NULL THEN
            RAISE EXCEPTION 'gate_rollback_incident_required' USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.incident i
            JOIN public.project p ON p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id
            WHERE i.id = NEW.rolled_back_incident_id AND i.tenant_id = NEW.tenant_id
              AND i.customer_id = p.customer_id AND i.status <> 'closed'
        ) THEN
            RAISE EXCEPTION 'gate_incident_invalid' USING ERRCODE = 'check_violation';
        END IF;

        RETURN NEW;
    END IF;

    -- The rollback's reason and incident change only when the gate is un-passed (above) or passed
    -- (cleared below).
    IF NEW.status <> 'passed' THEN
        IF NEW.rolled_back_incident_id IS DISTINCT FROM OLD.rolled_back_incident_id
           OR NEW.rolled_back_reason IS DISTINCT FROM OLD.rolled_back_reason THEN
            RAISE EXCEPTION 'gate_rollback_immutable' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'passed' THEN
        RAISE EXCEPTION 'gate_not_pending' USING ERRCODE = 'check_violation';
    END IF;

    -- Every pass of a project, through pass_gate or not, waits for the project row (pass_gate and
    -- rollback_gate already hold it).
    PERFORM 1 FROM public.project p WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id FOR UPDATE;

    -- One pass per project per statement: within one UPDATE, a later row would see an earlier
    -- row's pass and the order rule would let a whole chain of gates through at once. The flag is
    -- transaction-local; project_gate_advance clears it once the pass is done.
    IF current_setting(pass_flag, TRUE) = '1' THEN
        RAISE EXCEPTION 'gate_one_at_a_time' USING ERRCODE = 'check_violation';
    END IF;

    SELECT p.status INTO state
    FROM public.project p
    WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id;

    IF state IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'project_not_active' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.project_gate g
        WHERE g.project_id = NEW.project_id AND g.tenant_id = NEW.tenant_id
          AND g.position < NEW.position AND g.status <> 'passed'
    ) THEN
        RAISE EXCEPTION 'gate_order' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.needs_customer_approval AND (NEW.customer_approved_on IS NULL OR NEW.approval_document_id IS NULL) THEN
        RAISE EXCEPTION 'gate_customer_approval_required' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = NEW.approval_document_id AND d.tenant_id = NEW.tenant_id
          AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'gate_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(NEW.evidence_document_ids) AS e (id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.id = e.id AND d.tenant_id = NEW.tenant_id
              AND ((d.entity_type = 'project_gate' AND d.entity_id = NEW.id)
                   OR (d.entity_type = 'project' AND d.entity_id = NEW.project_id)
                   OR (d.entity_type = 'purchase_order' AND EXISTS (
                       SELECT 1 FROM public.purchase_order po
                       WHERE po.id = d.entity_id AND po.tenant_id = NEW.tenant_id
                         AND po.project_id = NEW.project_id
                   ))
                   OR (d.entity_type = 'shipment' AND EXISTS (
                       SELECT 1 FROM public.shipment_purchase_order spo
                       JOIN public.purchase_order po
                         ON po.id = spo.purchase_order_id AND po.tenant_id = spo.tenant_id
                       WHERE spo.shipment_id = d.entity_id AND spo.tenant_id = NEW.tenant_id
                         AND po.project_id = NEW.project_id
                   )))
        )
    ) THEN
        RAISE EXCEPTION 'gate_evidence_invalid' USING ERRCODE = 'check_violation';
    END IF;

    -- G3 needs the PI of one of the project's orders whose PI is approved (K3/M5): one of the
    -- evidence documents is the pi_document_id of a non-cancelled order at pi_approved or later.
    IF NEW.code = 'G3' AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order po
        WHERE po.tenant_id = NEW.tenant_id AND po.project_id = NEW.project_id
          AND po.pi_document_id = ANY (NEW.evidence_document_ids)
          AND po.status >= 'pi_approved' AND po.status <> 'cancelled'
    ) THEN
        RAISE EXCEPTION 'gate_pi_required' USING ERRCODE = 'check_violation';
    END IF;

    -- G2 needs products, and a signed or approved spec sheet for each of them.
    IF NEW.code = 'G2' AND (
        NOT EXISTS (
            SELECT 1 FROM public.project_product pp
            WHERE pp.project_id = NEW.project_id AND pp.tenant_id = NEW.tenant_id
        )
        OR EXISTS (
            SELECT 1
            FROM public.project_product pp
            LEFT JOIN public.product_evidence e ON e.product_id = pp.product_id AND e.tenant_id = pp.tenant_id
            WHERE pp.project_id = NEW.project_id AND pp.tenant_id = NEW.tenant_id
              AND NOT coalesce(e.has_signed_spec, FALSE)
        )
    ) THEN
        RAISE EXCEPTION 'gate_spec_sheet_required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT s.value INTO blocking
    FROM public.setting s
    WHERE s.tenant_id = NEW.tenant_id AND s.key = 'gate_evidence_blocking';

    -- The blocking tasks of the phases up to the one the gate closes; tasks of later phases (left
    -- from before a rollback) do not hold back an earlier gate.
    IF coalesce(blocking, 'true'::JSONB) = 'true'::JSONB AND EXISTS (
        SELECT 1 FROM public.project_task t
        WHERE t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id
          AND t.blocks_gate
          AND t.status <> 'done'
          AND t.phase <= public.phase_before(NEW.code)
    ) THEN
        RAISE EXCEPTION 'gate_blocked_by_task' USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config(pass_flag, '1', TRUE);

    NEW.passed_at := coalesce(NEW.passed_at, now());
    -- A pass clears the last rollback, so the next rollback names its own reason and incident.
    NEW.rolled_back_incident_id := NULL;
    NEW.rolled_back_reason := NULL;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.project_gate_advance () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    target public.project;
    next_phase public.project_phase;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT * INTO target FROM public.project p WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id;

    IF NEW.status = 'rolled_back' THEN
        UPDATE public.project p SET current_phase = public.phase_before(NEW.code) WHERE p.id = target.id;
        RETURN NULL;
    END IF;

    next_phase := public.phase_after(NEW.code, target.path, target.packages);

    UPDATE public.project p SET current_phase = next_phase WHERE p.id = target.id;

    PERFORM private.project_copy_checklists(target.id, target.tenant_id, next_phase, NEW.code = 'PL_G4');

    -- The pass is done: the next statement may pass the next gate (project_gate_guard).
    PERFORM set_config('moesa.gate_pass_' || replace(NEW.project_id::TEXT, '-', '_'), '', TRUE);

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.document_transition () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
        RAISE EXCEPTION 'document_superseded_sticky' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'document_identity_immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_order_immutable () RETURNS TRIGGER LANGUAGE plpgsql
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.code IS DISTINCT FROM OLD.code
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
        RAISE EXCEPTION 'purchase_order_immutable_field' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.media_customer_lock () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
       AND (EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id)
            OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = OLD.tenant_id AND d.media_id = OLD.id)) THEN
        RAISE EXCEPTION 'media_customer_locked' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.media_guard_delete () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN OLD;
        END IF;
    END IF;

    -- The tenant is being deleted: its media goes with it.
    IF NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF EXISTS (SELECT 1 FROM public.media_link l WHERE l.tenant_id = OLD.tenant_id AND l.media_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = OLD.tenant_id AND d.media_id = OLD.id) THEN
        RAISE EXCEPTION 'media_in_use' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION private.purchase_order_line_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    order_status public.purchase_order_status;
    spec_changed BOOLEAN;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN coalesce(NEW, OLD);
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
        RAISE EXCEPTION 'po_line_identity_immutable' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the order or the tenant.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- FOR SHARE: a concurrent status change (PI approval) waits for this line write to commit, so
    -- its figure check sees the line; the foreign key's FOR KEY SHARE does not block it.
    SELECT po.status INTO order_status
    FROM public.purchase_order po
    WHERE po.id = coalesce(NEW.purchase_order_id, OLD.purchase_order_id)
      AND po.tenant_id = coalesce(NEW.tenant_id, OLD.tenant_id)
    FOR SHARE;
    IF order_status >= 'pi_approved' THEN
        RAISE EXCEPTION 'po_locked' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        spec_changed := TRUE;
    ELSE
        spec_changed := NEW.product_id IS DISTINCT FROM OLD.product_id
            OR NEW.spec_document_id IS DISTINCT FROM OLD.spec_document_id;
    END IF;

    IF NOT spec_changed THEN
        RETURN NEW;
    END IF;

    IF NEW.spec_document_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM public.document d
            WHERE d.id = NEW.spec_document_id
              AND d.tenant_id = NEW.tenant_id
              AND d.type = 'spec_sheet'
              AND d.entity_type = 'product'
              AND d.entity_id = NEW.product_id
              AND d.status IN ('signed', 'approved')
        ) THEN
        RAISE EXCEPTION 'po_line_spec_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF order_status IN ('sent', 'pi_received')
       AND NEW.spec_document_id IS NULL
       AND private.po_line_needs_spec(NEW.product_id, NEW.tenant_id) THEN
        RAISE EXCEPTION 'po_spec_sheet_required' USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.shipment_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    allowed BOOLEAN;
    notice_hours INT;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 1. The code and the customer are fixed.
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'shipment_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- 2. The allowed transitions; accepted and cancelled are final.
    allowed := CASE OLD.status
        WHEN 'planned' THEN NEW.status IN ('booked', 'cancelled')
        WHEN 'booked' THEN NEW.status IN ('loaded', 'cancelled')
        WHEN 'loaded' THEN NEW.status = 'in_transit'
        WHEN 'in_transit' THEN NEW.status IN ('at_customs', 'delivered')
        WHEN 'at_customs' THEN NEW.status = 'delivered'
        WHEN 'delivered' THEN NEW.status IN ('accepted', 'disputed')
        WHEN 'disputed' THEN NEW.status = 'accepted'
        ELSE FALSE
    END;
    IF NOT allowed THEN
        RAISE EXCEPTION 'shipment_status_order' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Booked: an order, and the booking confirmation date.
    IF NEW.status = 'booked' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.shipment_purchase_order sp WHERE sp.shipment_id = NEW.id AND sp.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'shipment_po_required' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.booking_confirmed_on IS NULL THEN
            RAISE EXCEPTION 'shipment_booking_date_required' USING ERRCODE = 'check_violation';
        END IF;

    --    Loaded: at least one line (no goods, nothing to load).
    ELSIF NEW.status = 'loaded' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.shipment_line sl WHERE sl.shipment_id = NEW.id AND sl.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'shipment_lines_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 4. In transit: ETD and ETA.
    ELSIF NEW.status = 'in_transit' THEN
        IF NEW.etd IS NULL OR NEW.eta IS NULL THEN
            RAISE EXCEPTION 'shipment_eta_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 5. Delivered: the delivery time; an empty dispute deadline from the suppliers' shortest
    --    damage-notice time.
    ELSIF NEW.status = 'delivered' THEN
        IF NEW.delivered_at IS NULL THEN
            RAISE EXCEPTION 'shipment_delivery_time_required' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.dispute_deadline_at IS NULL THEN
            SELECT min(s.damage_notice_hours) INTO notice_hours
            FROM public.shipment_purchase_order sp
            JOIN public.purchase_order po ON po.id = sp.purchase_order_id AND po.tenant_id = sp.tenant_id
            JOIN public.supplier s ON s.id = po.supplier_id AND s.tenant_id = po.tenant_id
            WHERE sp.shipment_id = NEW.id AND sp.tenant_id = NEW.tenant_id;
            NEW.dispute_deadline_at := NEW.delivered_at + notice_hours * INTERVAL '1 hour';
        END IF;

    -- 6. Accepted: the signed or approved delivery receipt and, straight from delivered, no
    --    reservation. A disputed shipment is accepted as it is: the dispute settled the reservation
    --    its quantities and damage record.
    ELSIF NEW.status = 'accepted' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.document d
            WHERE d.tenant_id = NEW.tenant_id
              AND d.entity_type = 'shipment'
              AND d.entity_id = NEW.id
              AND d.type = 'delivery_receipt'
              AND d.status IN ('signed', 'approved')
        ) THEN
            RAISE EXCEPTION 'shipment_delivery_receipt_required' USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.status = 'delivered' AND (NEW.quantity_matches IS NOT TRUE OR NEW.has_damage IS NOT FALSE) THEN
            RAISE EXCEPTION 'shipment_acceptance_issue' USING ERRCODE = 'check_violation';
        END IF;
        NEW.accepted_on := coalesce(NEW.accepted_on, current_date);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.market_cell_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    allowed BOOLEAN;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN coalesce(NEW, OLD);
        END IF;
    END IF;

    -- 1. The product, platform and country are fixed.
    IF TG_OP = 'UPDATE' AND (
        NEW.product_id IS DISTINCT FROM OLD.product_id
        OR NEW.platform_id IS DISTINCT FROM OLD.platform_id
        OR NEW.country IS DISTINCT FROM OLD.country
    ) THEN
        RAISE EXCEPTION 'market_cell_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- 2. Only a candidate is deleted; a delete cascaded from the tenant is not checked.
    IF TG_OP = 'DELETE' THEN
        IF pg_trigger_depth() = 1 AND OLD.status <> 'candidate' THEN
            RAISE EXCEPTION 'market_cell_delete_candidate_only' USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- 3. A new cell: one of the platform's countries; a candidate, whatever the client sends.
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.platform pl WHERE pl.id = NEW.platform_id AND NEW.country = ANY (pl.countries)
        ) THEN
            RAISE EXCEPTION 'market_cell_country_invalid' USING ERRCODE = 'check_violation';
        END IF;
        NEW.status := 'candidate';

    -- 4. The allowed transitions (S05, and paused from candidate and planned); stopped is final.
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        allowed := CASE OLD.status
            WHEN 'candidate' THEN NEW.status IN ('planned', 'paused', 'removed')
            WHEN 'planned' THEN NEW.status IN ('preparing', 'paused')
            WHEN 'preparing' THEN NEW.status = 'uploaded'
            WHEN 'uploaded' THEN NEW.status IN ('live', 'suppressed')
            WHEN 'live' THEN NEW.status IN ('suppressed', 'stopped')
            WHEN 'suppressed' THEN NEW.status IN ('live', 'stopped')
            WHEN 'paused' THEN NEW.status = 'planned'
            WHEN 'removed' THEN NEW.status = 'candidate'
            ELSE FALSE
        END;
        IF NOT allowed THEN
            RAISE EXCEPTION 'market_cell_status_order' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 5. Live, on every write, so a live cell keeps them: the listing data and approved content
    --    (L-G1); a blank platform ID or SKU counts as missing. Entering live dates the launch today
    --    unless a date is given.
    IF NEW.status = 'live' THEN
        IF nullif(btrim(NEW.platform_product_id), '') IS NULL OR nullif(btrim(NEW.platform_sku), '') IS NULL
           OR NEW.price IS NULL
           OR NEW.currency IS NULL OR NEW.stock_source IS NULL OR NEW.content_status <> 'approved' THEN
            RAISE EXCEPTION 'market_cell_live_incomplete' USING ERRCODE = 'check_violation';
        END IF;
        IF TG_OP = 'INSERT' OR OLD.status <> 'live' THEN
            NEW.launched_on := coalesce(NEW.launched_on, current_date);
        END IF;
    END IF;

    -- 6. The reasons: the open issue when suppressed, a note when stopped or removed.
    IF NEW.status = 'suppressed' AND NEW.open_issue IS NULL
       OR NEW.status IN ('stopped', 'removed') AND NEW.notes IS NULL THEN
        RAISE EXCEPTION 'market_cell_reason_required' USING ERRCODE = 'check_violation';
    END IF;

    -- 7. Yellow and red compliance need a note (S12); a red cell is only a candidate, stopped or
    --    removed.
    IF NEW.compliance IN ('yellow', 'red') AND NEW.compliance_note IS NULL THEN
        RAISE EXCEPTION 'market_cell_compliance_note_required' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.compliance = 'red' AND NEW.status NOT IN ('candidate', 'stopped', 'removed') THEN
        RAISE EXCEPTION 'market_cell_compliance_red' USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.incident_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 1. The code, the customer and the family are fixed.
    IF TG_OP = 'UPDATE' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.family IS DISTINCT FROM OLD.family
    ) THEN
        RAISE EXCEPTION 'incident_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    -- 2. The Y10 card is of the incident's family (its format is incident_type_format).
    IF NEW.incident_type IS NOT NULL AND split_part(NEW.incident_type, '-', 1) <> upper(NEW.family::TEXT) THEN
        RAISE EXCEPTION 'incident_type_family' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. The linked record is there and the customer's (its kinds are incident_entity_kind), when
    --    it is set or changed: a linked candidate market cell may be deleted later.
    IF NEW.entity_type IS NOT NULL AND (
        TG_OP = 'INSERT'
        OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
        OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    ) AND private.entity_customer(NEW.entity_type, NEW.entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'incident_entity_invalid' USING ERRCODE = 'check_violation';
    END IF;

    -- Lowering an s1 or s2 (the enum orders s1 < s2 < s3) needs the management right, so a
    -- downgrade does not get around the management notice or the s1 closure.
    IF TG_OP = 'UPDATE' AND OLD.severity IN ('s1', 's2') AND NEW.severity > OLD.severity
       AND coalesce(cardinality(
           private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.tenant', 'update')
       ), 0) = 0 THEN
        RAISE EXCEPTION 'incident_severity_downgrade_requires_management' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        -- 4. open → contained | closed; contained → closed; closed is final.
        IF NOT (OLD.status = 'open' AND NEW.status IN ('contained', 'closed')
                OR OLD.status = 'contained' AND NEW.status = 'closed') THEN
            RAISE EXCEPTION 'incident_status_order' USING ERRCODE = 'check_violation';
        END IF;

        -- 5. An s1 or s2 leaves open only once management was told.
        IF OLD.status = 'open' AND NEW.severity IN ('s1', 's2') AND NEW.management_notified_at IS NULL THEN
            RAISE EXCEPTION 'incident_management_notice_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 6. Closing: the outcome, the root cause and the preventive action; management closes an s1.
        IF NEW.status = 'closed' THEN
            IF NEW.outcome IS NULL OR NEW.root_cause IS NULL OR nullif(btrim(NEW.preventive_action), '') IS NULL THEN
                RAISE EXCEPTION 'incident_closure_incomplete' USING ERRCODE = 'check_violation';
            END IF;
            IF NEW.severity = 's1' AND coalesce(cardinality(
                private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.tenant', 'update')
            ), 0) = 0 THEN
                RAISE EXCEPTION 'incident_close_management' USING ERRCODE = 'insufficient_privilege';
            END IF;
            NEW.closed_on := current_date;
            NEW.closed_by := auth.uid();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.change_request_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    affected_entity_type public.document_entity;
    affected_entity_id UUID;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 1. The code, the customer and when it was made are fixed; so is the customer's approval
    --    once the request is approved and it is entered (it may still be entered after the company
    --    approves); and a closed (applied or rejected) request keeps its documents, project and
    --    gate.
    IF TG_OP = 'UPDATE' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR OLD.status IN ('approved', 'applied') AND (
            OLD.customer_approved_on IS NOT NULL AND NEW.customer_approved_on IS DISTINCT FROM OLD.customer_approved_on
            OR OLD.customer_approval_document_id IS NOT NULL
               AND NEW.customer_approval_document_id IS DISTINCT FROM OLD.customer_approval_document_id
        )
        OR OLD.status IN ('applied', 'rejected') AND (
            NEW.affected_document_id IS DISTINCT FROM OLD.affected_document_id
            OR NEW.result_document_id IS DISTINCT FROM OLD.result_document_id
            OR NEW.project_id IS DISTINCT FROM OLD.project_id
            OR NEW.affected_gate_code IS DISTINCT FROM OLD.affected_gate_code
        )
    ) THEN
        RAISE EXCEPTION 'change_request_immutable_field' USING ERRCODE = 'check_violation';
    END IF;

    IF private.rules_bypassed() THEN
        RETURN NEW;
    END IF;

    -- Server-set: the company's approval and the closing date are set below on the transition that sets
    -- them; otherwise whatever the client sends is ignored.
    IF TG_OP = 'INSERT' THEN
        NEW.company_approved_on := NULL;
        NEW.company_approved_by := NULL;
        NEW.closed_on := NULL;
    ELSE
        NEW.company_approved_on := OLD.company_approved_on;
        NEW.company_approved_by := OLD.company_approved_by;
        NEW.closed_on := OLD.closed_on;
    END IF;

    -- 2. The affected document and the resulting document are the customer's.
    IF NEW.affected_document_id IS NOT NULL THEN
        SELECT d.entity_type, d.entity_id INTO affected_entity_type, affected_entity_id
        FROM public.document d
        WHERE d.id = NEW.affected_document_id AND d.tenant_id = NEW.tenant_id;

        IF private.entity_customer(affected_entity_type, affected_entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'change_request_document_invalid' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.result_document_id IS NOT NULL THEN
        SELECT d.entity_type, d.entity_id INTO affected_entity_type, affected_entity_id
        FROM public.document d
        WHERE d.id = NEW.result_document_id AND d.tenant_id = NEW.tenant_id;

        IF private.entity_customer(affected_entity_type, affected_entity_id, NEW.tenant_id) IS DISTINCT FROM NEW.customer_id THEN
            RAISE EXCEPTION 'change_request_document_invalid' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 3. The customer's written approval is a signed or approved document of this request.
    IF NEW.customer_approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = NEW.customer_approval_document_id
          AND d.tenant_id = NEW.tenant_id
          AND d.entity_type = 'change_request'
          AND d.entity_id = NEW.id
          AND d.status IN ('signed', 'approved')
    ) THEN
        RAISE EXCEPTION 'change_request_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        -- 4. open → approved | rejected; approved → applied.
        IF NOT (OLD.status = 'open' AND NEW.status IN ('approved', 'rejected')
                OR OLD.status = 'approved' AND NEW.status = 'applied') THEN
            RAISE EXCEPTION 'change_request_status_order' USING ERRCODE = 'check_violation';
        END IF;

        -- 5. Approving: the company's date and approver; the customer's approval after a passed gate of
        --    the project that needs it (S08 §4).
        IF NEW.status = 'approved' THEN
            NEW.company_approved_on := (now() AT TIME ZONE 'UTC')::DATE;
            NEW.company_approved_by := auth.uid();
            IF NEW.project_id IS NOT NULL AND NEW.affected_gate_code IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM public.project_gate g
                   WHERE g.project_id = NEW.project_id
                     AND g.tenant_id = NEW.tenant_id
                     AND g.code = NEW.affected_gate_code
                     AND g.status = 'passed'
                     AND g.needs_customer_approval
               )
               AND (NEW.customer_approved_on IS NULL OR NEW.customer_approval_document_id IS NULL) THEN
                RAISE EXCEPTION 'change_request_customer_approval_required' USING ERRCODE = 'check_violation';
            END IF;
        END IF;

        -- 6. Rejecting says why.
        IF NEW.status = 'rejected' AND nullif(btrim(NEW.decision_note), '') IS NULL THEN
            RAISE EXCEPTION 'change_request_decision_note_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 7. Applying a request that changes a document needs its new version: the same record and
        --    type, a higher version.
        IF NEW.status = 'applied' AND NEW.affected_document_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
            FROM public.document a
            JOIN public.document r
                ON r.tenant_id = a.tenant_id
               AND r.entity_type = a.entity_type
               AND r.entity_id = a.entity_id
               AND r.type = a.type
               AND r.version > a.version
            WHERE a.id = NEW.affected_document_id
              AND a.tenant_id = NEW.tenant_id
              AND r.id = NEW.result_document_id
        ) THEN
            RAISE EXCEPTION 'change_request_new_version_required' USING ERRCODE = 'check_violation';
        END IF;

        -- 8. Rejecting or applying closes it.
        IF NEW.status IN ('applied', 'rejected') THEN
            NEW.closed_on := (now() AT TIME ZONE 'UTC')::DATE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.media_check_file () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    meta JSONB;
BEGIN
    -- A running transfer (041).
    IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
           OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
           OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR (OLD.thumbnail_path IS NOT NULL AND NEW.thumbnail_path IS DISTINCT FROM OLD.thumbnail_path) THEN
            RAISE EXCEPTION 'media_file_immutable' USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT o.metadata INTO meta
        FROM storage.objects o
        WHERE o.bucket_id = 'media'
          AND o.name = NEW.storage_path
          AND private.storage_tenant(o.name) = NEW.tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'media_file_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;

        NEW.mime_type := meta ->> 'mimetype';
        NEW.size_bytes := (meta ->> 'size')::BIGINT;

        IF NEW.mime_type IS NULL
           OR NEW.mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4') THEN
            RAISE EXCEPTION 'media_type_not_allowed' USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.size_bytes > private.media_max_bytes(NEW.tenant_id) THEN
            RAISE EXCEPTION 'media_too_large' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.thumbnail_path IS NOT NULL
       AND NEW.thumbnail_path IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.thumbnail_path END)
       AND NOT EXISTS (
           SELECT 1 FROM storage.objects o
           WHERE o.bucket_id = 'media'
             AND o.name = NEW.thumbnail_path
             AND private.storage_tenant(o.name) = NEW.tenant_id
       ) THEN
        RAISE EXCEPTION 'media_file_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- media_link_check: only the identity branch exits; the entity, permission and customer checks stay.
CREATE OR REPLACE FUNCTION private.media_link_check () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    link public.media_link := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    found BOOLEAN;
    file public.media;
BEGIN
    -- The tenant is being deleted: its links go with it.
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.tenant t WHERE t.id = OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE'
       AND (NEW.media_id IS DISTINCT FROM OLD.media_id
            OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
            OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
        -- A running transfer (041).
        IF current_setting('moesa.transfer_id', TRUE) <> '' THEN
            IF private.transferring() THEN
                RETURN NEW;
            END IF;
        END IF;
        RAISE EXCEPTION 'media_link_identity_immutable' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF to_regclass('public.' || NEW.entity_type::TEXT) IS NULL THEN
            RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;

        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND tenant_id = $2)', NEW.entity_type::TEXT)
        INTO found
        USING NEW.entity_id, NEW.tenant_id;

        IF NOT found THEN
            RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF auth.uid() IS NOT NULL
       AND cardinality(private.tenants_permitting(auth.uid(), ARRAY[link.tenant_id], 'public.' || link.entity_type::TEXT, 'update')) = 0 THEN
        RAISE EXCEPTION 'media_link_forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT m.* INTO file FROM public.media m WHERE m.id = NEW.media_id AND m.tenant_id = NEW.tenant_id;

    -- No such file: the foreign key refuses it.
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF file.customer_id IS NOT NULL
       AND private.entity_customer(NEW.entity_type, NEW.entity_id, NEW.tenant_id) IS DISTINCT FROM file.customer_id THEN
        RAISE EXCEPTION 'media_customer_mismatch' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.role = 'primary_image' AND file.mime_type NOT LIKE 'image/%' THEN
        RAISE EXCEPTION 'media_primary_not_image' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
