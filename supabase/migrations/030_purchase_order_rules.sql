-- Purchase order rules (M6, S09): the status flow, the spec sheet rule, the PI checks, the payment
-- gates and the locks, and the overview the order screens read.
--
-- Status flow   draft → sent → pi_received → pi_approved → deposit_paid → in_production → ready →
--               balance_paid → closed, one step at a time. With a deposit rate of 0 there is no
--               deposit step: pi_approved goes straight to in_production. Any order may be cancelled
--               until it is closed; closed and cancelled are final. A new order is a draft (the code
--               trigger sets it; the status guard runs after it, hence its name
--               purchase_order_z_guard).
-- Spec sheets   An order is sent only when each line that needs one references a spec sheet. A line
--               needs one (private.po_line_needs_spec) from the company's spec_sheet_required_from
--               on (K3; a missing or unreadable date counts as reached), and before it for a new SKU
--               only (product status concept, development or approved). A referenced spec sheet is a
--               signed or approved spec_sheet of the line's product. A sent order (or one whose PI
--               is in) takes no new line, and no product or spec change, that breaks the rule.
-- PI            pi_received needs the PI document (a pi document of this order) and its total.
--               pi_approved needs all 30 S09 items "ok" and the S09 §C arithmetic to hold:
--               private.purchase_order_figures is its only home (subtotal = round(Σ quantity ×
--               unit price, 2); total = subtotal + extra − discount; deposit = round(total × rate /
--               100, 2); balance = total − deposit), and every PI line total that is filled in equals
--               round(line_total, 2). Approving records who checked it and when.
-- Payments      deposit_paid needs a paid deposit, balance_paid a paid balance. A PSI before the
--               balance is a warning in the UI, not a rule (M7).
-- Locks         From pi_approved on, the terms and the PI (currency, Incoterm and place, deposit
--               rate, PI document, number, amounts and checklist) and the lines no longer change.
--               A closed or cancelled order's payments and updates no longer change either.
--
-- Each rule is a check_violation whose message is the rule's code:
--   po_status_order             not the next status, cancelled, or a move out of a final status
--   po_lines_required           sending an order without lines
--   po_spec_sheet_required      a line that needs a spec sheet has none (sending, or a line saved
--                               on a sent order)
--   po_line_spec_invalid        the line's spec sheet is not a signed or approved spec sheet of
--                               its product
--   po_pi_document_invalid      the PI document is not a pi document of this order
--   po_pi_required              pi_received without the PI document or total
--   po_pi_checklist_incomplete  pi_approved with fewer than 30 "ok" items
--   po_pi_mismatch              pi_approved with PI figures that differ from the recalculated ones
--   po_deposit_unpaid           deposit_paid without a paid deposit
--   po_balance_unpaid           balance_paid without a paid balance
--   po_locked                   a term, the PI or a line changed after pi_approved
--   po_closed                   a payment or update of a closed or cancelled order changed
--   po_line_identity_immutable  a line moved to another order
--
-- The guards are SECURITY DEFINER (they read lines, documents, products, payments and settings
-- whatever the caller may read) and filter on the row's tenant. A delete cascaded from the order
-- or the tenant (pg_trigger_depth() > 1) is not checked. The line and child guards read the order
-- FOR SHARE, so a concurrent status change (PI approval, close, cancel) and a line, payment or
-- update write are serialised: the later one sees the earlier one's commit.
--
-- Test fixtures: private.rules_bypassed() is TRUE when the transaction-local flag
-- moesa.rules_bypass is '1', the session has not switched role (current_setting('role') =
-- 'none') AND it was opened as postgres or supabase_admin (session_user: a migration, psql or a
-- test as postgres). PostgREST logs in as authenticator and always runs SET ROLE, and inside a
-- SECURITY DEFINER function current_setting('role') still reports it, so a user cannot use the
-- flag. The guards return at once when it holds; the code and immutability triggers ignore it.
--
-- public.purchase_order_overview: each order with its customer, supplier and project codes, its
-- line count, quantity and products, the lines missing a spec sheet, the recalculated figures,
-- the payment dates and whether an approved PSI report is on file.

-- The test fixture bypass (see the header).
CREATE OR REPLACE FUNCTION private.rules_bypassed () RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT coalesce(
        current_setting('moesa.rules_bypass', TRUE) = '1'
        AND current_setting('role') = 'none'
        AND session_user IN ('postgres', 'supabase_admin'),
        FALSE
    );
$$;

REVOKE ALL ON FUNCTION private.rules_bypassed () FROM PUBLIC, anon, authenticated;

-- Whether a line of this product needs a spec sheet: from the company's spec_sheet_required_from
-- on (a missing or unreadable date counts as reached), and before it for a new SKU (concept,
-- development or approved). SECURITY DEFINER: the setting and the product whatever the caller may
-- read, in the given tenant only. It stays DEFINER: PL/pgSQL resolves private.company_setting when
-- it runs, and the overview's caller (authenticated) has no USAGE on private.
CREATE OR REPLACE FUNCTION private.po_line_needs_spec (product_id UUID, tenant_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    required_from DATE;
BEGIN
    BEGIN
        required_from := (private.company_setting(po_line_needs_spec.tenant_id, 'spec_sheet_required_from') #>> '{}')::DATE;
    EXCEPTION WHEN data_exception THEN
        required_from := NULL;
    END;

    IF required_from IS NULL OR current_date >= required_from THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.product p
        WHERE p.id = po_line_needs_spec.product_id
          AND p.tenant_id = po_line_needs_spec.tenant_id
          AND p.status IN ('concept', 'development', 'approved')
    );
END;
$$;

REVOKE ALL ON FUNCTION private.po_line_needs_spec (UUID, UUID) FROM PUBLIC, anon, authenticated;

-- The overview calls it as the reading user.
GRANT EXECUTE ON FUNCTION private.po_line_needs_spec (UUID, UUID) TO authenticated;

-- The order's figures by S09 §C, the only SQL home of the formula: subtotal = round(Σ quantity ×
-- unit price, 2) (0 without lines); total = subtotal + extra − discount; deposit = round(total ×
-- deposit rate / 100, 2); balance = total − deposit. The extra, discount and rate are the stored
-- order's unless given: the guard passes the values being written, which are not stored yet. No
-- row when the order is not there. SECURITY INVOKER: the order and the lines the caller may read
-- (the guards are DEFINER and read them all), in the given tenant only.
CREATE OR REPLACE FUNCTION private.purchase_order_figures (
   purchase_order_id UUID,
   tenant_id UUID,
   extra_amount NUMERIC DEFAULT NULL,
   discount_amount NUMERIC DEFAULT NULL,
   deposit_rate NUMERIC DEFAULT NULL
) RETURNS TABLE (subtotal NUMERIC, total NUMERIC, deposit NUMERIC, balance NUMERIC) LANGUAGE sql STABLE SECURITY INVOKER
SET
   search_path = '' AS $$
    WITH base AS (
        SELECT
            round(coalesce((
                SELECT sum(l.quantity * l.unit_price)
                FROM public.purchase_order_line l
                WHERE l.purchase_order_id = po.id AND l.tenant_id = po.tenant_id
            ), 0), 2) AS subtotal,
            coalesce(purchase_order_figures.extra_amount, po.pi_extra_amount) AS extra,
            coalesce(purchase_order_figures.discount_amount, po.pi_discount_amount) AS discount,
            coalesce(purchase_order_figures.deposit_rate, po.deposit_rate) AS rate
        FROM public.purchase_order po
        WHERE po.id = purchase_order_figures.purchase_order_id
          AND po.tenant_id = purchase_order_figures.tenant_id
    ),
    totals AS (
        SELECT b.subtotal, b.subtotal + b.extra - b.discount AS total, b.rate
        FROM base b
    ),
    deposits AS (
        SELECT t.subtotal, t.total, round(t.total * t.rate / 100, 2) AS deposit
        FROM totals t
    )
    SELECT d.subtotal, d.total, d.deposit, d.total - d.deposit
    FROM deposits d;
$$;

REVOKE ALL ON FUNCTION private.purchase_order_figures (UUID, UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- The overview calls it as the reading user.
GRANT EXECUTE ON FUNCTION private.purchase_order_figures (UUID, UUID, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- The order's rules (see the header), in this order: status flow, locks, PI document, then what
-- the status being entered needs.
CREATE OR REPLACE FUNCTION private.purchase_order_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    statuses public.purchase_order_status[] := enum_range(NULL::public.purchase_order_status);
    allowed public.purchase_order_status;
    entering BOOLEAN;
    ok_items INT;
    figures RECORD;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- 1. One step at a time; cancelled from anywhere but a final status.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'po_status_order' USING ERRCODE = 'check_violation';
        END IF;
        entering := TRUE;
    ELSE
        entering := NEW.status IS DISTINCT FROM OLD.status;
        IF entering THEN
            IF OLD.status IN ('closed', 'cancelled') THEN
                RAISE EXCEPTION 'po_status_order' USING ERRCODE = 'check_violation';
            END IF;
            IF NEW.status <> 'cancelled' THEN
                IF OLD.status = 'pi_approved' THEN
                    allowed := CASE WHEN NEW.deposit_rate > 0 THEN 'deposit_paid' ELSE 'in_production' END;
                ELSE
                    allowed := statuses[array_position(statuses, OLD.status) + 1];
                END IF;
                IF NEW.status IS DISTINCT FROM allowed THEN
                    RAISE EXCEPTION 'po_status_order' USING ERRCODE = 'check_violation';
                END IF;
            END IF;
        END IF;
    END IF;

    -- 2. The terms and the PI are fixed from pi_approved on.
    IF TG_OP = 'UPDATE' AND OLD.status >= 'pi_approved'
       AND ROW(NEW.currency, NEW.incoterm, NEW.incoterm_place, NEW.deposit_rate, NEW.pi_document_id, NEW.pi_number,
               NEW.pi_subtotal, NEW.pi_extra_amount, NEW.pi_discount_amount, NEW.pi_total, NEW.pi_deposit_amount,
               NEW.pi_balance_amount, NEW.pi_check)
           IS DISTINCT FROM
           ROW(OLD.currency, OLD.incoterm, OLD.incoterm_place, OLD.deposit_rate, OLD.pi_document_id, OLD.pi_number,
               OLD.pi_subtotal, OLD.pi_extra_amount, OLD.pi_discount_amount, OLD.pi_total, OLD.pi_deposit_amount,
               OLD.pi_balance_amount, OLD.pi_check) THEN
        RAISE EXCEPTION 'po_locked' USING ERRCODE = 'check_violation';
    END IF;

    -- 3. The PI document is a pi document of this order.
    IF NEW.pi_document_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM public.document d
            WHERE d.id = NEW.pi_document_id
              AND d.tenant_id = NEW.tenant_id
              AND d.type = 'pi'
              AND d.entity_type = 'purchase_order'
              AND d.entity_id = NEW.id
        ) THEN
        RAISE EXCEPTION 'po_pi_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT entering THEN
        RETURN NEW;
    END IF;

    -- 4. Sent: lines, each with a spec sheet where it needs one.
    IF NEW.status = 'sent' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.purchase_order_line l WHERE l.purchase_order_id = NEW.id AND l.tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'po_lines_required' USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.purchase_order_line l
            WHERE l.purchase_order_id = NEW.id
              AND l.tenant_id = NEW.tenant_id
              AND l.spec_document_id IS NULL
              AND private.po_line_needs_spec(l.product_id, l.tenant_id)
        ) THEN
            RAISE EXCEPTION 'po_spec_sheet_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 5. PI received: its document and total.
    ELSIF NEW.status = 'pi_received' THEN
        IF NEW.pi_document_id IS NULL OR NEW.pi_total IS NULL THEN
            RAISE EXCEPTION 'po_pi_required' USING ERRCODE = 'check_violation';
        END IF;

    -- 6. PI approved: the 30 S09 items, then the S09 §C arithmetic.
    ELSIF NEW.status = 'pi_approved' THEN
        SELECT count(*) INTO ok_items
        FROM jsonb_each(NEW.pi_check) e
        WHERE e.key IN (SELECT g::TEXT FROM generate_series(1, 30) g)
          AND e.value = '"ok"'::JSONB;
        IF ok_items < 30 THEN
            RAISE EXCEPTION 'po_pi_checklist_incomplete' USING ERRCODE = 'check_violation';
        END IF;

        SELECT f.subtotal, f.total, f.deposit, f.balance INTO figures
        FROM private.purchase_order_figures(NEW.id, NEW.tenant_id, NEW.pi_extra_amount, NEW.pi_discount_amount, NEW.deposit_rate) f;
        IF NEW.pi_subtotal IS DISTINCT FROM figures.subtotal
           OR NEW.pi_total IS DISTINCT FROM figures.total
           OR NEW.pi_deposit_amount IS DISTINCT FROM figures.deposit
           OR NEW.pi_balance_amount IS DISTINCT FROM figures.balance
           OR EXISTS (
                SELECT 1
                FROM public.purchase_order_line l
                WHERE l.purchase_order_id = NEW.id
                  AND l.tenant_id = NEW.tenant_id
                  AND l.pi_line_total IS NOT NULL
                  AND l.pi_line_total <> round(l.line_total, 2)
            ) THEN
            RAISE EXCEPTION 'po_pi_mismatch' USING ERRCODE = 'check_violation';
        END IF;

        NEW.pi_checked_by := auth.uid();
        NEW.pi_checked_at := now();

    -- 7. Deposit paid: a paid deposit.
    ELSIF NEW.status = 'deposit_paid' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.purchase_order_payment p
            WHERE p.purchase_order_id = NEW.id AND p.tenant_id = NEW.tenant_id AND p.kind = 'deposit' AND p.paid_on IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'po_deposit_unpaid' USING ERRCODE = 'check_violation';
        END IF;

    -- 8. Balance paid: a paid balance.
    ELSIF NEW.status = 'balance_paid' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.purchase_order_payment p
            WHERE p.purchase_order_id = NEW.id AND p.tenant_id = NEW.tenant_id AND p.kind = 'balance' AND p.paid_on IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'po_balance_unpaid' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_order_guard () FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order: the z sorts it after purchase_order_set_code, which sets the
-- draft status on insert, and after purchase_order_immutable on update.
CREATE OR REPLACE TRIGGER purchase_order_z_guard BEFORE INSERT
OR
UPDATE ON public.purchase_order FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_guard ();

-- A line's rules: it stays on its order (po_line_identity_immutable, whatever the bypass flag);
-- fixed from pi_approved on (closed and cancelled included); a referenced spec sheet is a signed or
-- approved spec sheet of the line's product (checked when the product or the spec sheet changes);
-- a sent order (or one whose PI is in) takes no line, product or spec change that leaves a line
-- needing a spec sheet without one. A PI line total alone is not checked against the spec rule.
CREATE OR REPLACE FUNCTION private.purchase_order_line_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    order_status public.purchase_order_status;
    spec_changed BOOLEAN;
BEGIN
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

REVOKE ALL ON FUNCTION private.purchase_order_line_guard () FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER purchase_order_line_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.purchase_order_line FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_line_guard ();

-- A closed or cancelled order's payments and updates no longer change (the order before and after
-- an update).
CREATE OR REPLACE FUNCTION private.purchase_order_child_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    order_status public.purchase_order_status;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the order or the tenant.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- FOR SHARE: a concurrent close or cancel waits for this write to commit (and the write waits
    -- for a close or cancel in flight, then sees it); FOR KEY SHARE would not.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT po.status INTO order_status
        FROM public.purchase_order po
        WHERE po.id = OLD.purchase_order_id AND po.tenant_id = OLD.tenant_id
        FOR SHARE;
        IF order_status IN ('closed', 'cancelled') THEN
            RAISE EXCEPTION 'po_closed' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT po.status INTO order_status
        FROM public.purchase_order po
        WHERE po.id = NEW.purchase_order_id AND po.tenant_id = NEW.tenant_id
        FOR SHARE;
        IF order_status IN ('closed', 'cancelled') THEN
            RAISE EXCEPTION 'po_closed' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_order_child_guard () FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER purchase_order_child_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.purchase_order_payment FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_child_guard ();

CREATE OR REPLACE TRIGGER purchase_order_child_guard BEFORE INSERT
OR
UPDATE
OR DELETE ON public.purchase_order_update FOR EACH ROW
EXECUTE FUNCTION private.purchase_order_child_guard ();

-- The order screens' list and header. Runs as the caller (security_invoker), so it shows only the
-- orders, codes, lines, payments and documents the caller may read; the spec rule and the figures
-- come from the two private functions granted for it.
CREATE OR REPLACE VIEW public.purchase_order_overview
WITH
   (security_invoker = TRUE) AS
SELECT
   po.*,
   c.code::TEXT AS customer_code,
   s.code AS supplier_code,
   pr.code AS project_code,
   l.line_count,
   l.total_quantity,
   l.product_ids,
   l.spec_missing_line_ids,
   f.subtotal AS system_subtotal,
   f.total AS system_total,
   f.deposit AS system_deposit,
   f.balance AS system_balance,
   pay.deposit_planned_on,
   pay.deposit_paid_on,
   pay.balance_planned_on,
   pay.balance_paid_on,
   EXISTS (
      SELECT
         1
      FROM
         public.document d
      WHERE
         d.tenant_id = po.tenant_id
         AND d.entity_type = 'purchase_order'
         AND d.entity_id = po.id
         AND d.type = 'psi_report'
         AND d.status = 'approved'
   ) AS has_approved_psi
FROM
   public.purchase_order po
   LEFT JOIN public.customer c ON c.id = po.customer_id
   AND c.tenant_id = po.tenant_id
   LEFT JOIN public.supplier s ON s.id = po.supplier_id
   AND s.tenant_id = po.tenant_id
   LEFT JOIN public.project pr ON pr.id = po.project_id
   AND pr.tenant_id = po.tenant_id
   LEFT JOIN LATERAL (
      SELECT
         count(*)::INT AS line_count,
         coalesce(sum(ln.quantity), 0)::INT AS total_quantity,
         coalesce(array_agg(ln.product_id ORDER BY ln.position, ln.created_at, ln.id), '{}') AS product_ids,
         coalesce(
            array_agg(ln.id ORDER BY ln.position, ln.created_at, ln.id) FILTER (
               WHERE
                  ln.spec_document_id IS NULL
                  AND private.po_line_needs_spec (ln.product_id, ln.tenant_id)
            ),
            '{}'
         ) AS spec_missing_line_ids
      FROM
         public.purchase_order_line ln
      WHERE
         ln.purchase_order_id = po.id
         AND ln.tenant_id = po.tenant_id
   ) l ON TRUE
   LEFT JOIN LATERAL private.purchase_order_figures (po.id, po.tenant_id) f ON TRUE
   LEFT JOIN LATERAL (
      SELECT
         min(p.planned_on) FILTER (
            WHERE
               p.kind = 'deposit'
               AND p.paid_on IS NULL
         ) AS deposit_planned_on,
         max(p.paid_on) FILTER (
            WHERE
               p.kind = 'deposit'
         ) AS deposit_paid_on,
         min(p.planned_on) FILTER (
            WHERE
               p.kind = 'balance'
               AND p.paid_on IS NULL
         ) AS balance_planned_on,
         max(p.paid_on) FILTER (
            WHERE
               p.kind = 'balance'
         ) AS balance_paid_on
      FROM
         public.purchase_order_payment p
      WHERE
         p.purchase_order_id = po.id
         AND p.tenant_id = po.tenant_id
   ) pay ON TRUE;

COMMENT ON VIEW public.purchase_order_overview IS 'Per purchase order: every column of the order, the customer, supplier and project codes, line_count, total_quantity, product_ids (the lines'' products; filter the list with product_ids, not by embedding through the view), spec_missing_line_ids (lines without a spec sheet that need one, private.po_line_needs_spec), the S09 figures recalculated by private.purchase_order_figures (system_subtotal, system_total, system_deposit, system_balance), the earliest planned date of an unpaid deposit and balance, the latest paid date of each, and whether an approved PSI report is on file.';

GRANT SELECT ON public.purchase_order_overview TO authenticated;
