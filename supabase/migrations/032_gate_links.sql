-- Gate evidence from orders and shipments (M5, K3): the gates of a project now cite the documents
-- of its purchase orders and shipments, and G3 needs the order's approved PI.
--
-- Evidence   An evidence document of a gate (evidence_document_ids) is a document of the gate or of
--            its project (021), or now also a document of
--              - a purchase order of the gate's project (purchase_order.project_id), in the tenant;
--              - a shipment linked (shipment_purchase_order) to such a purchase order.
--            The predicate sits in private.project_gate_guard and, inline, in public.pass_gate (still
--            SECURITY INVOKER: it reads the orders and shipment links through RLS and calls nothing
--            in private).
-- K3/M5      Which document is a gate's evidence:
--              G3  the purchase order's PI: a hard rule (spec M5: only G2 and G3 block);
--              G4  the PSI report: a warning, not a rule;
--              G5  the shipment's delivery receipt: a warning, not a rule.
--            Shipments are not tied to a gate's pass: a shipment's status does not move a gate,
--            and a gate's pass does not need a shipment.
--
-- Rules, added to private.project_gate_guard after gate_evidence_invalid, each a check_violation
-- whose message is the rule's code:
--   gate_evidence_invalid  (changed) an evidence document is not a document of this gate, its
--                          project, one of the project's orders or a shipment of those orders
--   gate_pi_required       G3 (always, like G2's gate_spec_sheet_required) without an evidence
--                          document that is the pi_document_id of a non-cancelled order of the
--                          project at pi_approved or later
--
-- Both functions are CREATE OR REPLACE with the 021 body otherwise unchanged; their grants stay.

-- The gate rules (see the header), for every way a gate is passed: pass_gate or a direct update.
-- SECURITY DEFINER, so the checks see the whole project whatever the caller may read, and every
-- query filters on the gate's own tenant itself.
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

-- Passes a gate. Runs as the caller: the gate and project are read through RLS (one the caller
-- cannot see is a 404) and the update needs the caller's right to update gates. The rules are
-- the project_gate_guard trigger's, and the phase move and checklists project_gate_advance's;
-- this function adds no rule checks of its own before the update. After it, the approval and
-- evidence documents are checked once more through RLS, so the caller must be able to see them.
-- The project row is locked first, as in rollback_gate, so passes and rollbacks of one project
-- run one after the other.
CREATE OR REPLACE FUNCTION public.pass_gate (
   gate_id UUID,
   note TEXT,
   customer_approved_on DATE DEFAULT NULL,
   approval_document_id UUID DEFAULT NULL,
   evidence_document_ids UUID[] DEFAULT '{}'
) RETURNS public.project_gate LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    result public.project_gate;
BEGIN
    SELECT g.project_id INTO gate_project FROM public.project_gate g WHERE g.id = pass_gate.gate_id;

    IF gate_project IS NULL THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'gate not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    PERFORM 1 FROM public.project p WHERE p.id = gate_project FOR UPDATE;

    IF NOT FOUND THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0002', 'message', 'project not found')::TEXT,
            DETAIL = json_build_object('status', 404, 'headers', json_build_object())::TEXT;
    END IF;

    UPDATE public.project_gate g
    SET status = 'passed',
        passed_at = now(),
        decided_by_role = NULL,
        note = pass_gate.note,
        customer_approved_on = pass_gate.customer_approved_on,
        approval_document_id = pass_gate.approval_document_id,
        evidence_document_ids = coalesce(pass_gate.evidence_document_ids, '{}')
    WHERE g.id = pass_gate.gate_id
    RETURNING * INTO result;

    IF result.approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = result.approval_document_id AND d.tenant_id = result.tenant_id
          AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = result.id
    ) THEN
        RAISE EXCEPTION 'gate_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(result.evidence_document_ids) AS e (id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.id = e.id AND d.tenant_id = result.tenant_id
              AND ((d.entity_type = 'project_gate' AND d.entity_id = result.id)
                   OR (d.entity_type = 'project' AND d.entity_id = result.project_id)
                   OR (d.entity_type = 'purchase_order' AND EXISTS (
                       SELECT 1 FROM public.purchase_order po
                       WHERE po.id = d.entity_id AND po.tenant_id = result.tenant_id
                         AND po.project_id = result.project_id
                   ))
                   OR (d.entity_type = 'shipment' AND EXISTS (
                       SELECT 1 FROM public.shipment_purchase_order spo
                       JOIN public.purchase_order po
                         ON po.id = spo.purchase_order_id AND po.tenant_id = spo.tenant_id
                       WHERE spo.shipment_id = d.entity_id AND spo.tenant_id = result.tenant_id
                         AND po.project_id = result.project_id
                   )))
        )
    ) THEN
        RAISE EXCEPTION 'gate_evidence_invalid' USING ERRCODE = 'check_violation';
    END IF;

    RETURN result;
END;
$$;
