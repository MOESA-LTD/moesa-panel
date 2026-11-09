-- Guards that follow the request, not the executing role (R6), and that detect a cascade by its
-- parent being gone, not by trigger depth (R7). The api views (later) put SECURITY DEFINER
-- forwarders owned by a role other than authenticated in front of the tables: there current_user is
-- that owner and every base trigger runs at depth 2, so a test on either would let a user's write
-- through.
--
-- private.begin_server_write()  Sets moesa.server_write = '1', transaction-local. Called first by
--                               the definer RPCs granted to authenticated that write a server-only
--                               column: amazon_account_disconnect and listing_begin_submission
--                               (bodies otherwise as in 046). The other 046 definers that write
--                               them are service-only (listing_act_for sets the role claim to
--                               amazon-listing).
-- private.server_write()        Reads it. Both are revoked from PUBLIC, anon and authenticated: a
--                               PostgREST caller sets no GUC and calls neither.
--
-- R6. market_cell_listing_server_only and platform_account_api_server_only (046) refuse when
--     auth.role() = 'authenticated' AND NOT private.server_write(), in place of current_user =
--     'authenticated'. They become SECURITY DEFINER (they call server_write). 046's transfer branch of
--     platform_account_api_server_only is kept as it is. market_cell_listing_server_only gains the
--     same INSERT exit for a running transfer: transfer_customer (a definer granted to
--     authenticated) copies a cell with its listing columns, which current_user = postgres let
--     through before.
--
-- R7. The cascade exits of purchase_order_line_guard (041), purchase_order_child_guard (030),
--     shipment_purchase_order_guard and shipment_line_guard (031), incident_child_guard (035) and
--     market_cell_guard (041) test private.parent_gone (050) for each ON DELETE CASCADE parent of
--     the guarded tables (pg_constraint.confdeltype = 'c'):
--       purchase_order_line                       tenant, purchase_order
--       purchase_order_payment, _update           tenant, purchase_order
--       shipment_purchase_order                   tenant, shipment
--       shipment_line                             tenant, shipment
--       incident_log, incident_deadline           tenant, incident
--       market_cell                               tenant
--     A delete through a view, or by any trigger, with the parent still there is checked like a
--     direct one. Every other line is as in the migration named.

CREATE OR REPLACE FUNCTION private.begin_server_write () RETURNS VOID LANGUAGE sql VOLATILE
SET
   search_path = '' AS $$
    SELECT set_config('moesa.server_write', '1', TRUE);
$$;

CREATE OR REPLACE FUNCTION private.server_write () RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT coalesce(current_setting('moesa.server_write', TRUE), '') = '1';
$$;

REVOKE ALL ON FUNCTION private.begin_server_write () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.server_write () FROM PUBLIC, anon, authenticated;

-- R6 (046).
CREATE OR REPLACE FUNCTION private.market_cell_listing_server_only () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    -- A running transfer copies a cell as it is (041).
    IF TG_OP = 'INSERT' AND nullif(current_setting('moesa.transfer_id', TRUE), '') IS NOT NULL THEN
        IF private.transferring() THEN
            RETURN NEW;
        END IF;
    END IF;

    IF auth.role() = 'authenticated' AND NOT private.server_write() AND (
        TG_OP = 'INSERT' AND (NEW.listing_state IS NOT NULL OR NEW.listing_checked_at IS NOT NULL OR NEW.listing_match IS NOT NULL)
        OR TG_OP = 'UPDATE' AND (
            NEW.listing_state IS DISTINCT FROM OLD.listing_state
            OR NEW.listing_checked_at IS DISTINCT FROM OLD.listing_checked_at
            OR NEW.listing_match IS DISTINCT FROM OLD.listing_match
        )
    ) THEN
        RAISE EXCEPTION 'market_cell_listing_server_only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.platform_account_api_server_only () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' AND nullif(current_setting('moesa.transfer_id', TRUE), '') IS NOT NULL THEN
        IF private.transferring() THEN
            NEW.api_connection := 'none';
            NEW.authorized_at := NULL;
            NEW.seller_id := NULL;
            RETURN NEW;
        END IF;
    END IF;

    IF auth.role() = 'authenticated' AND NOT private.server_write() AND (
        TG_OP = 'INSERT' AND (NEW.api_connection <> 'none' OR NEW.authorized_at IS NOT NULL OR NEW.seller_id IS NOT NULL)
        OR TG_OP = 'UPDATE' AND (
            NEW.api_connection IS DISTINCT FROM OLD.api_connection
            OR NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
            OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
        )
    ) THEN
        RAISE EXCEPTION 'platform_account_api_server_only' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.market_cell_listing_server_only () FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.platform_account_api_server_only () FROM PUBLIC, anon, authenticated;

-- The definer RPCs granted to authenticated that write those columns (046).
CREATE OR REPLACE FUNCTION public.amazon_account_disconnect (p_account_id UUID, p_state public.api_connection) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
BEGIN
    PERFORM private.begin_server_write();

    IF p_state IS NULL OR p_state NOT IN ('none', 'revoked') THEN
        RAISE EXCEPTION 'disconnect state must be none or revoked, not %', p_state USING ERRCODE = 'invalid_parameter_value';
    END IF;

    PERFORM private.platform_account_authorize(p_account_id, p_state);

    IF p_state = 'none' THEN
        UPDATE public.customer_platform_account a
        SET api_connection = 'none', authorized_at = NULL, seller_id = NULL
        WHERE a.id = p_account_id;
    ELSE
        UPDATE public.customer_platform_account a SET api_connection = 'revoked' WHERE a.id = p_account_id;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'platform account % not found', p_account_id USING ERRCODE = 'no_data_found';
    END IF;

    PERFORM private.amazon_token_set(p_account_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.listing_begin_submission (
   p_cell_id UUID,
   p_kind public.listing_submission_kind,
   p_payload JSONB
) RETURNS public.listing_submission LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    v_cell public.market_cell;
    v_latest public.listing_submission;
    v_submission public.listing_submission;
    v_sku TEXT;
    v_marketplace_id TEXT;
BEGIN
    PERFORM private.begin_server_write();

    SELECT * INTO v_cell FROM public.market_cell m WHERE m.id = p_cell_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'market cell % not found', p_cell_id USING ERRCODE = 'no_data_found';
    END IF;

    PERFORM private.listing_authorize(v_cell.tenant_id);

    -- The cell's own listing (see the header), as amazon-listing derives it.
    SELECT coalesce(nullif(btrim(v_cell.platform_sku), ''), p.sku) INTO v_sku
    FROM public.product p WHERE p.id = v_cell.product_id AND p.tenant_id = v_cell.tenant_id;
    v_marketplace_id := private.amazon_marketplace_id(v_cell.country);
    IF v_cell.platform_id <> 'amazon' OR v_marketplace_id IS NULL OR nullif(btrim(v_sku), '') IS NULL THEN
        RAISE EXCEPTION 'market cell % has no Amazon listing', p_cell_id USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF p_kind <> 'delete' THEN
        SELECT * INTO v_latest FROM public.listing_submission s
        WHERE s.cell_id = p_cell_id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 1;

        IF FOUND AND v_latest.kind <> 'delete' AND v_latest.status IN ('accepted', 'processing') THEN
            RAISE EXCEPTION 'listing_in_progress';
        END IF;
    END IF;

    INSERT INTO public.listing_submission (tenant_id, cell_id, kind, sku, marketplace_id, payload, created_by)
    VALUES (v_cell.tenant_id, v_cell.id, p_kind, v_sku, v_marketplace_id, coalesce(p_payload, '{}'::JSONB), auth.uid())
    RETURNING * INTO v_submission;

    IF p_kind <> 'delete' THEN
        UPDATE public.market_cell m
        SET listing_state = 'submitted', listing_checked_at = now()
        WHERE m.id = v_cell.id;

        PERFORM private.listing_mirror_parent(v_cell.id);
    END IF;

    RETURN v_submission;
END;
$$;

-- R7.
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
    IF TG_OP = 'DELETE' THEN
        IF private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('public.purchase_order', OLD.purchase_order_id) THEN
            RETURN OLD;
        END IF;
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
    IF TG_OP = 'DELETE' THEN
        IF private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('public.purchase_order', OLD.purchase_order_id) THEN
            RETURN OLD;
        END IF;
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

CREATE OR REPLACE FUNCTION private.shipment_purchase_order_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    link RECORD;
    shipment_status public.shipment_status;
    order_status public.purchase_order_status;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the shipment or the tenant.
    IF TG_OP = 'DELETE' THEN
        IF private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('public.shipment', OLD.shipment_id) THEN
            RETURN OLD;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        link := NEW;
    ELSE
        link := OLD;
    END IF;

    -- FOR SHARE: a concurrent move to loaded (or cancelled) waits for this write to commit, and
    -- this write waits for one in flight, then sees it; the foreign key's FOR KEY SHARE would not.
    SELECT s.status INTO shipment_status
    FROM public.shipment s
    WHERE s.id = link.shipment_id AND s.tenant_id = link.tenant_id
    FOR SHARE;
    IF shipment_status >= 'loaded' THEN
        RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- FOR SHARE: the order does not close or cancel while it is being linked.
        SELECT po.status INTO order_status
        FROM public.purchase_order po
        WHERE po.id = NEW.purchase_order_id AND po.tenant_id = NEW.tenant_id
        FOR SHARE;
        IF order_status NOT BETWEEN 'pi_approved' AND 'balance_paid' THEN
            RAISE EXCEPTION 'shipment_po_not_open' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.shipment_line l
        WHERE l.shipment_id = OLD.shipment_id AND l.purchase_order_id = OLD.purchase_order_id AND l.tenant_id = OLD.tenant_id
    ) THEN
        RAISE EXCEPTION 'shipment_po_has_lines' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION private.shipment_line_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    shipment_status public.shipment_status;
    ordered INT;
    tolerance NUMERIC;
    shipped BIGINT;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    -- A delete cascaded from the shipment or the tenant.
    IF TG_OP = 'DELETE' THEN
        IF private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('public.shipment', OLD.shipment_id) THEN
            RETURN OLD;
        END IF;
    END IF;

    -- FOR SHARE: a concurrent move to loaded (or cancelled) waits for this write to commit, and
    -- this write waits for one in flight, then sees it; the foreign key's FOR KEY SHARE would not.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT s.status INTO shipment_status
        FROM public.shipment s
        WHERE s.id = OLD.shipment_id AND s.tenant_id = OLD.tenant_id
        FOR SHARE;
        IF shipment_status >= 'loaded' THEN
            RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        SELECT s.status INTO shipment_status
        FROM public.shipment s
        WHERE s.id = NEW.shipment_id AND s.tenant_id = NEW.tenant_id
        FOR SHARE;
        IF shipment_status >= 'loaded' THEN
            RAISE EXCEPTION 'shipment_locked' USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- FOR NO KEY UPDATE on the order line: two lines of it on different shipments are capped one
    -- after the other (it does not conflict with the foreign keys' FOR KEY SHARE). An order line
    -- that is not there is left to the foreign key.
    SELECT pol.quantity, coalesce(po.tolerance_pct, 0) INTO ordered, tolerance
    FROM public.purchase_order_line pol
    JOIN public.purchase_order po ON po.id = pol.purchase_order_id AND po.tenant_id = pol.tenant_id
    WHERE pol.id = NEW.purchase_order_line_id AND pol.tenant_id = NEW.tenant_id
    FOR NO KEY UPDATE OF pol;
    IF ordered IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT coalesce(sum(l.quantity), 0) INTO shipped
    FROM public.shipment_line l
    JOIN public.shipment s ON s.id = l.shipment_id AND s.tenant_id = l.tenant_id
    WHERE l.purchase_order_line_id = NEW.purchase_order_line_id
      AND l.tenant_id = NEW.tenant_id
      AND l.id <> NEW.id
      AND s.status <> 'cancelled';

    IF shipped + NEW.quantity > floor(ordered * (1 + tolerance / 100)) THEN
        RAISE EXCEPTION 'shipment_quantity_exceeds_po' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.incident_child_guard () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    incident_ids UUID[];
    row_tenant UUID;
BEGIN
    IF private.rules_bypassed() THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('public.incident', OLD.incident_id) THEN
            RETURN OLD;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        incident_ids := ARRAY[NEW.incident_id];
        row_tenant := NEW.tenant_id;
    ELSIF TG_OP = 'UPDATE' THEN
        incident_ids := ARRAY[OLD.incident_id, NEW.incident_id];
        row_tenant := NEW.tenant_id;
    ELSE
        incident_ids := ARRAY[OLD.incident_id];
        row_tenant := OLD.tenant_id;
    END IF;

    PERFORM 1 FROM public.incident i
    WHERE i.id = ANY (incident_ids) AND i.tenant_id = row_tenant
    FOR SHARE;

    IF EXISTS (
        SELECT 1 FROM public.incident i
        WHERE i.id = ANY (incident_ids) AND i.tenant_id = row_tenant AND i.status = 'closed'
    ) THEN
        RAISE EXCEPTION 'incident_closed' USING ERRCODE = 'check_violation';
    END IF;

    RETURN coalesce(NEW, OLD);
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
        IF OLD.status <> 'candidate' AND NOT private.parent_gone('public.tenant', OLD.tenant_id) THEN
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
