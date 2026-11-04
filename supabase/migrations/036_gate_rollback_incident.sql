-- A gate rolls back only through an incident (K3, M10): a rollback names an open incident of the
-- project's customer, and the gate remembers it (rolled_back_incident_id), so the incident lists
-- the gates it rolled back.
--
-- project_gate.rolled_back_incident_id  the incident a rollback was made through; an incident is
--                                       not deleted while a gate cites it (ON DELETE RESTRICT,
--                                       and incidents are never deleted anyway).
--
-- Rules, added to private.project_gate_guard's un-passing branch after gate_rollback_order, each a
-- check_violation whose message is the rule's code:
--   gate_rollback_incident_required  a rollback without an incident
--   gate_incident_invalid            the incident is not there, not of the project's customer, or
--                                    closed
--
-- private.project_gate_guard is CREATE OR REPLACE with the 032_gate_links.sql body otherwise
-- unchanged; its grants stay. public.rollback_gate gains the incident argument (DEFAULT NULL, so a
-- call without it reaches the guard and is refused with gate_rollback_incident_required) and sets
-- it on every gate it rolls back; otherwise the 021_projects.sql body. The two-argument function is
-- dropped first, so the call resolves to one function.

ALTER TABLE public.project_gate
ADD COLUMN IF NOT EXISTS rolled_back_incident_id UUID;

ALTER TABLE public.project_gate
ADD CONSTRAINT project_gate_rollback_incident_fkey FOREIGN KEY (rolled_back_incident_id, tenant_id) REFERENCES public.incident (id, tenant_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_project_gate_rollback_incident ON public.project_gate (tenant_id, rolled_back_incident_id);

-- A decision column like rolled_back_reason (021_projects.sql).
GRANT
UPDATE (rolled_back_incident_id) ON public.project_gate TO authenticated;

-- The gate rules (see 021_projects.sql and 032_gate_links.sql), for every way a gate is passed or
-- rolled back: the 032_gate_links.sql body, with the incident rules added to the un-passing branch.
CREATE OR REPLACE FUNCTION private.project_gate_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    state public.project_status;
    blocking JSONB;
    pass_flag TEXT := 'moesa.gate_pass_' || replace(NEW.project_id::TEXT, '-', '_');
BEGIN
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

    IF NEW.status <> 'passed' THEN
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
    RETURN NEW;
END;
$$;

-- Rolls back a passed gate and every later passed gate, through an incident (see the header): the
-- 021_projects.sql body, with the incident set on every gate it rolls back.
DROP FUNCTION public.rollback_gate (UUID, TEXT);

CREATE OR REPLACE FUNCTION public.rollback_gate (gate_id UUID, reason TEXT, incident_id UUID DEFAULT NULL) RETURNS public.project_gate LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    gate public.project_gate;
    later UUID;
    result public.project_gate;
BEGIN
    IF nullif(btrim(rollback_gate.reason), '') IS NULL THEN
        RAISE EXCEPTION 'gate_reason_required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT g.project_id INTO gate_project FROM public.project_gate g WHERE g.id = rollback_gate.gate_id;

    IF gate_project IS NOT NULL THEN
        PERFORM 1 FROM public.project p WHERE p.id = gate_project FOR UPDATE;

        IF NOT FOUND THEN
            RAISE SQLSTATE 'PGRST' USING
                MESSAGE = json_build_object('code', 'P0002', 'message', 'project not found')::TEXT,
                DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
        END IF;

        SELECT * INTO gate FROM public.project_gate g WHERE g.id = rollback_gate.gate_id FOR UPDATE;
    END IF;

    IF gate.id IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'gate not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    IF gate.status <> 'passed' THEN
        RAISE EXCEPTION 'gate_not_passed' USING ERRCODE = 'check_violation';
    END IF;

    -- One gate at a time from the last passed one back to this one, as project_gate_guard requires;
    -- project_gate_advance moves the phase back with each, ending at the phase this gate closes.
    FOR later IN
        SELECT g.id FROM public.project_gate g
        WHERE g.project_id = gate.project_id AND g.position >= gate.position AND g.status = 'passed'
        ORDER BY g.position DESC
    LOOP
        UPDATE public.project_gate g
        SET status = 'rolled_back', rolled_back_reason = rollback_gate.reason, rolled_back_incident_id = rollback_gate.incident_id
        WHERE g.id = later;
    END LOOP;

    SELECT * INTO result FROM public.project_gate g WHERE g.id = gate.id;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_gate (UUID, TEXT, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rollback_gate (UUID, TEXT, UUID) TO authenticated;
