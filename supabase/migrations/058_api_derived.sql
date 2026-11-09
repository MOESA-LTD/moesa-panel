-- 058: the derived views over api, the write RPCs as api_owner definers (R8) that check field write
-- rights before writing (S1), RPCs returning api row types (C2, S6) and the catalog-driven transfer
-- gate (S3).
--
-- api.<derived view>     The public dashboard and overview views restated over the api views:
--                        security_invoker = true, an explicit column list (no t.*), only api relations
--                        (a view reading another derived view reads its api twin), SELECT for
--                        authenticated only. A masked field reads NULL here as in its api view, and so
--                        does everything computed from it. A whole-row argument (api.status,
--                        api.owned_via) is passed as an explicit ROW(...) of the api view's columns, so
--                        no view text holds a t.*. The public views stay until the cutover; the
--                        notification feed follows in 059.
-- private.purchase_order_figures
--                        Restated over api.purchase_order and api.purchase_order_line, still SECURITY
--                        INVOKER: a masked unit price (never NULL in the base) makes the subtotal and
--                        everything after it NULL rather than a wrong figure; a masked extra, discount
--                        or rate does the same for what depends on it. purchase_order_guard (DEFINER)
--                        checks a PI approval against the figures the request's user may read, so an
--                        approver without cost read fails closed (po_pi_mismatch).
-- R8 definers            import_products, save_role, set_user_roles, pass_gate, rollback_gate, save_plan
--                        and set_primary_media run as api_owner (NOLOGIN, not BYPASSRLS, a member of
--                        authenticated): the caller's RLS policies and the base write guards (driven by
--                        the request identity, 051/052) still apply, and the bodies reach schema private
--                        through api_owner's USAGE (save_role's field rights no longer need the
--                        caller's). gates_for is IMMUTABLE and pure and stays INVOKER; register_tenant
--                        stays INVOKER as it is service_role only and the service role keeps its base
--                        grants.
-- S1 in RPCs             A parameter stored into a sensitive field is checked before any write, by its
--                        presence (non-NULL), never by comparing it with the stored value:
--                        pass_gate(note) → project_gate.note; import_products: every non-NULL row key
--                        naming a sensitive product field, supplier_code as supplier_id. rollback_gate
--                        stores its reason in rolled_back_reason, which is not sensitive.
--                        field_write_forbidden (42501), DETAIL <table>.<field>.
-- C2/S6                  pass_gate and rollback_gate return api.project_gate, set_primary_media
--                        api.media_link, transfer_check_files api.transfer: the row is re-read through
--                        the api view, so a field the caller may not read comes back NULL. public.actor
--                        and public.reverter (the audit embeds) return api.user, so a colleague's
--                        personal data is masked per S5.
-- S3 transfer gate       private.transfer_field_rights(user, tenants): for every table of
--                        private.transfer_registry and every sensitive field of 'public.' || table in
--                        public.field_class, the user may read and write it in each of the tenants
--                        (private.field_tenants). Derived from the catalog: a table added to the
--                        registry is covered without a code change. transfer_customer checks the source
--                        and the target, transfer_check_files the transfer's source and target,
--                        transfer_options the source (and refuses a target where the rights are
--                        missing with that code).
--
--   field_write_forbidden           (42501) see S1 above
--   transfer_field_rights_required  (42501) the caller lacks a field right the transfer copies

-- 1. Derived views.

-- The figures (030) over the api views (see the header).
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
            (
                SELECT CASE WHEN bool_or(l.unit_price IS NULL) THEN NULL
                            ELSE round(coalesce(sum(l.quantity * l.unit_price), 0), 2) END
                FROM api.purchase_order_line l
                WHERE l.purchase_order_id = po.id AND l.tenant_id = po.tenant_id
            ) AS subtotal,
            coalesce(purchase_order_figures.extra_amount, po.pi_extra_amount) AS extra,
            coalesce(purchase_order_figures.discount_amount, po.pi_discount_amount) AS discount,
            coalesce(purchase_order_figures.deposit_rate, po.deposit_rate) AS rate
        FROM api.purchase_order po
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

GRANT EXECUTE ON FUNCTION private.purchase_order_figures (UUID, UUID, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE VIEW api.company_subscription WITH (security_invoker = true) AS
SELECT t.id,
    t.display_name,
    t.email,
    t.created_at,
    s.id AS subscription_id,
    s.plan_id,
    p.display_name AS plan_name,
    CASE
        WHEN s.id IS NULL THEN 'none'::TEXT
        ELSE api.status(ROW(s.id, s.tenant_id, s.plan_id, s.starts_at, s.ends_at, s.canceled_at, s.is_trial, s.note, s.created_by, s.created_at)::api.subscription)
    END AS status,
    s.starts_at,
    s.ends_at,
    s.canceled_at,
    s.is_trial,
    u.branches,
    u.users
FROM api.tenant t
CROSS JOIN LATERAL private.entitlements(ARRAY[t.id]) e (tenant_id, company_id, subscription_id, plan_id, modules, writable)
LEFT JOIN api.subscription s ON s.id = e.subscription_id
LEFT JOIN api.plan p ON p.id = e.plan_id
CROSS JOIN LATERAL private.company_usage(t.id) u (branches, users)
WHERE t.parent_id IS NULL AND (SELECT private.check_super_admin());

CREATE OR REPLACE VIEW api.dashboard_change_request WITH (security_invoker = true) AS
SELECT r.id AS change_request_id,
    r.code,
    r.customer_id,
    c.code::TEXT AS customer_code,
    r.tenant_id,
    r.status,
    r.urgency,
    r.title,
    r.decision_due_on,
    coalesce(r.status = 'open'::public.change_request_status AND r.decision_due_on < CURRENT_DATE, FALSE) AS overdue
FROM api.change_request r
LEFT JOIN api.customer c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
WHERE r.status = ANY (ARRAY['open'::public.change_request_status, 'approved'::public.change_request_status]);

CREATE OR REPLACE VIEW api.dashboard_gate_pending WITH (security_invoker = true) AS
SELECT g.id AS gate_id,
    p.id AS project_id,
    p.code AS project_code,
    p.display_name AS project_display_name,
    p.customer_id,
    c.code::TEXT AS customer_code,
    p.tenant_id,
    g.code AS gate_code,
    g.position,
    g.needs_customer_approval,
    floor(EXTRACT(epoch FROM now() - coalesce(prev.passed_at, p.created_at)) / 86400::NUMERIC)::INTEGER AS waiting_days,
    CASE
        WHEN g.code = 'G2'::public.gate_code THEN 'supply_qc'::TEXT
        WHEN g.code = 'G4'::public.gate_code THEN 'compliance'::TEXT
        WHEN g.code = ANY (ARRAY['L_G1'::public.gate_code, 'L_G2'::public.gate_code]) THEN 'content_listing'::TEXT
        ELSE 'coordinator'::TEXT
    END AS owner_role,
    private.management_gates(p.tenant_id) ? g.code::TEXT AS needs_management
FROM api.project p
JOIN LATERAL (
    SELECT pg.id, pg.code, pg.position, pg.needs_customer_approval
    FROM api.project_gate pg
    WHERE pg.project_id = p.id AND pg.tenant_id = p.tenant_id
      AND pg.status = ANY (ARRAY['pending'::public.gate_status, 'rolled_back'::public.gate_status])
    ORDER BY pg.position
    LIMIT 1
) g ON TRUE
LEFT JOIN LATERAL (
    SELECT pg.passed_at
    FROM api.project_gate pg
    WHERE pg.project_id = p.id AND pg.tenant_id = p.tenant_id AND pg.position < g.position
    ORDER BY pg.position DESC
    LIMIT 1
) prev ON TRUE
LEFT JOIN api.customer c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
WHERE p.status = 'active'::public.project_status;

CREATE OR REPLACE VIEW api.incident_overview WITH (security_invoker = true) AS
SELECT i.id,
    i.tenant_id,
    i.customer_id,
    i.code,
    i.family,
    i.incident_type,
    i.severity,
    i.status,
    i.owner_id,
    i.title,
    i.what_happened,
    i.reported_by,
    i.current_state,
    i.immediate_action,
    i.entity_type,
    i.entity_id,
    i.opened_at,
    i.affected_parties,
    i.management_notified_at,
    i.customer_notice_due_at,
    i.customer_notified_at,
    i.outcome,
    i.root_cause,
    i.root_cause_note,
    i.impact_note,
    i.lessons,
    i.preventive_action,
    i.customer_closure_notified_on,
    i.closed_on,
    i.closed_by,
    i.created_at,
    i.updated_at,
    c.code::TEXT AS customer_code,
    CASE i.entity_type
        WHEN 'project'::public.document_entity THEN pj.code
        WHEN 'purchase_order'::public.document_entity THEN po.code
        WHEN 'shipment'::public.document_entity THEN s.code
        WHEN 'product'::public.document_entity THEN pr.sku
        WHEN 'market_cell'::public.document_entity THEN (((mp.sku || ' · '::TEXT) || m.platform_id) || '_'::TEXT) || m.country
        ELSE NULL::TEXT
    END AS entity_label,
    d.next_deadline_at,
    d.overdue_deadline_count,
    (EXISTS (
        SELECT 1
        FROM api.incident r
        WHERE r.tenant_id = i.tenant_id AND r.customer_id = i.customer_id AND r.incident_type = i.incident_type AND r.id <> i.id
          AND r.opened_at < i.opened_at AND r.opened_at >= (i.opened_at - '90 days'::INTERVAL)
    )) AS is_repeat
FROM api.incident i
LEFT JOIN api.customer c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
LEFT JOIN api.project pj ON i.entity_type = 'project'::public.document_entity AND pj.id = i.entity_id AND pj.tenant_id = i.tenant_id
LEFT JOIN api.purchase_order po ON i.entity_type = 'purchase_order'::public.document_entity AND po.id = i.entity_id AND po.tenant_id = i.tenant_id
LEFT JOIN api.shipment s ON i.entity_type = 'shipment'::public.document_entity AND s.id = i.entity_id AND s.tenant_id = i.tenant_id
LEFT JOIN api.product pr ON i.entity_type = 'product'::public.document_entity AND pr.id = i.entity_id AND pr.tenant_id = i.tenant_id
LEFT JOIN api.market_cell m ON i.entity_type = 'market_cell'::public.document_entity AND m.id = i.entity_id AND m.tenant_id = i.tenant_id
LEFT JOIN api.product mp ON mp.id = m.product_id AND mp.tenant_id = m.tenant_id
LEFT JOIN LATERAL (
    SELECT min(dl.due_at) AS next_deadline_at,
        count(*) FILTER (WHERE dl.due_at < now())::INTEGER AS overdue_deadline_count
    FROM api.incident_deadline dl
    WHERE dl.incident_id = i.id AND dl.tenant_id = i.tenant_id AND dl.met_at IS NULL
) d ON TRUE;

CREATE OR REPLACE VIEW api.dashboard_incident WITH (security_invoker = true) AS
SELECT i.id AS incident_id,
    i.code,
    i.customer_id,
    i.customer_code,
    i.tenant_id,
    i.severity,
    i.status,
    i.title,
    i.opened_at,
    (i.severity = ANY (ARRAY['s1'::public.incident_severity, 's2'::public.incident_severity])) AND i.management_notified_at IS NULL AS management_notice_missing,
    i.customer_notice_due_at,
    coalesce(i.customer_notice_due_at < now() AND i.customer_notified_at IS NULL, FALSE) AS customer_notice_late,
    i.next_deadline_at,
    coalesce(i.overdue_deadline_count, 0) AS overdue_deadline_count
FROM api.incident_overview i
WHERE i.status <> 'closed'::public.incident_status;

CREATE OR REPLACE VIEW api.dashboard_market WITH (security_invoker = true) AS
SELECT m.customer_id,
    c.code::TEXT AS customer_code,
    m.tenant_id,
    count(*) FILTER (WHERE m.status = 'live'::public.market_cell_status)::INTEGER AS live_count,
    count(*) FILTER (WHERE m.status = ANY (ARRAY['preparing'::public.market_cell_status, 'uploaded'::public.market_cell_status]))::INTEGER AS preparing_count,
    count(*) FILTER (WHERE m.status = 'suppressed'::public.market_cell_status)::INTEGER AS suppressed_count,
    count(*) FILTER (WHERE m.status = ANY (ARRAY['planned'::public.market_cell_status, 'preparing'::public.market_cell_status, 'uploaded'::public.market_cell_status,
                                                 'live'::public.market_cell_status, 'suppressed'::public.market_cell_status, 'paused'::public.market_cell_status]))::INTEGER AS target_count
FROM api.market_cell m
LEFT JOIN api.customer c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
GROUP BY m.customer_id, c.code, m.tenant_id;

CREATE OR REPLACE VIEW api.product_evidence WITH (security_invoker = true) AS
SELECT p.id AS product_id,
    p.customer_id,
    p.tenant_id,
    p.sku,
    p.status,
    spec.id IS NOT NULL AS has_signed_spec,
    spec.version AS spec_version,
    spec.id AS spec_document_id,
    p.compliance_status,
    p.compliance_status = 'complete'::public.compliance_status AS compliance_complete,
    (
        SELECT po.code
        FROM api.purchase_order_line l
        JOIN api.purchase_order po ON po.id = l.purchase_order_id AND po.tenant_id = l.tenant_id
        WHERE l.tenant_id = p.tenant_id AND l.product_id = p.id AND po.status <> 'cancelled'::public.purchase_order_status
        ORDER BY po.created_at DESC, po.code DESC
        LIMIT 1
    ) AS last_po_code,
    (
        SELECT count(*)::INTEGER AS count
        FROM api.market_cell m
        WHERE m.product_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'live'::public.market_cell_status
    ) AS live_cell_count
FROM api.product p
LEFT JOIN LATERAL (
    SELECT d.id, d.version
    FROM api.document d
    WHERE d.tenant_id = p.tenant_id AND d.entity_type = 'product'::public.document_entity AND d.entity_id = p.id
      AND d.type = 'spec_sheet'::public.document_type
      AND d.status = ANY (ARRAY['signed'::public.document_status, 'approved'::public.document_status])
    ORDER BY d.version DESC
    LIMIT 1
) spec ON TRUE;

CREATE OR REPLACE VIEW api.dashboard_product_evidence WITH (security_invoker = true) AS
SELECT e.customer_id,
    c.code::TEXT AS customer_code,
    e.tenant_id,
    count(*)::INTEGER AS active_sku_count,
    count(*) FILTER (WHERE e.has_signed_spec)::INTEGER AS signed_spec_count,
    count(*) FILTER (WHERE e.compliance_complete)::INTEGER AS compliance_complete_count,
    count(*) FILTER (WHERE NOT e.has_signed_spec)::INTEGER AS unsigned_sku_count
FROM api.product_evidence e
LEFT JOIN api.customer c ON c.id = e.customer_id AND c.tenant_id = e.tenant_id
WHERE e.status <> ALL (ARRAY['archived'::public.product_status, 'concept'::public.product_status])
GROUP BY e.customer_id, c.code, e.tenant_id;

CREATE OR REPLACE VIEW api.purchase_order_overview WITH (security_invoker = true) AS
SELECT po.id,
    po.tenant_id,
    po.customer_id,
    po.supplier_id,
    po.project_id,
    po.code,
    po.status,
    po.currency,
    po.incoterm,
    po.incoterm_place,
    po.deposit_rate,
    po.ready_on,
    po.tolerance_pct,
    po.penalty_rule,
    po.packing_instruction_document_id,
    po.pi_document_id,
    po.pi_number,
    po.pi_subtotal,
    po.pi_total,
    po.pi_deposit_amount,
    po.pi_balance_amount,
    po.pi_extra_amount,
    po.pi_discount_amount,
    po.pi_check,
    po.pi_checked_by,
    po.pi_checked_at,
    po.notes,
    po.created_at,
    po.updated_at,
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
    (EXISTS (
        SELECT 1
        FROM api.document d
        WHERE d.tenant_id = po.tenant_id AND d.entity_type = 'purchase_order'::public.document_entity AND d.entity_id = po.id
          AND d.type = 'psi_report'::public.document_type AND d.status = 'approved'::public.document_status
    )) AS has_approved_psi
FROM api.purchase_order po
LEFT JOIN api.customer c ON c.id = po.customer_id AND c.tenant_id = po.tenant_id
LEFT JOIN api.supplier s ON s.id = po.supplier_id AND s.tenant_id = po.tenant_id
LEFT JOIN api.project pr ON pr.id = po.project_id AND pr.tenant_id = po.tenant_id
LEFT JOIN LATERAL (
    SELECT count(*)::INTEGER AS line_count,
        coalesce(sum(ln.quantity), 0::BIGINT)::INTEGER AS total_quantity,
        coalesce(array_agg(ln.product_id ORDER BY ln.position, ln.created_at, ln.id), '{}'::UUID[]) AS product_ids,
        coalesce(array_agg(ln.id ORDER BY ln.position, ln.created_at, ln.id)
                 FILTER (WHERE ln.spec_document_id IS NULL AND private.po_line_needs_spec(ln.product_id, ln.tenant_id)), '{}'::UUID[]) AS spec_missing_line_ids
    FROM api.purchase_order_line ln
    WHERE ln.purchase_order_id = po.id AND ln.tenant_id = po.tenant_id
) l ON TRUE
LEFT JOIN LATERAL private.purchase_order_figures(po.id, po.tenant_id) f (subtotal, total, deposit, balance) ON TRUE
LEFT JOIN LATERAL (
    SELECT min(p.planned_on) FILTER (WHERE p.kind = 'deposit'::public.payment_kind AND p.paid_on IS NULL) AS deposit_planned_on,
        max(p.paid_on) FILTER (WHERE p.kind = 'deposit'::public.payment_kind) AS deposit_paid_on,
        min(p.planned_on) FILTER (WHERE p.kind = 'balance'::public.payment_kind AND p.paid_on IS NULL) AS balance_planned_on,
        max(p.paid_on) FILTER (WHERE p.kind = 'balance'::public.payment_kind) AS balance_paid_on
    FROM api.purchase_order_payment p
    WHERE p.purchase_order_id = po.id AND p.tenant_id = po.tenant_id
) pay ON TRUE;

CREATE OR REPLACE VIEW api.dashboard_purchase_order WITH (security_invoker = true) AS
SELECT o.id AS purchase_order_id,
    o.code,
    o.customer_id,
    o.customer_code,
    o.supplier_code,
    o.tenant_id,
    o.status,
    o.ready_on,
    o.ready_on - CURRENT_DATE AS days_to_ready,
    o.deposit_planned_on,
    o.balance_planned_on,
    o.system_total,
    o.currency
FROM api.purchase_order_overview o
WHERE o.status <> ALL (ARRAY['draft'::public.purchase_order_status, 'closed'::public.purchase_order_status, 'cancelled'::public.purchase_order_status]);

CREATE OR REPLACE VIEW api.shipment_overview WITH (security_invoker = true) AS
SELECT s.id,
    s.tenant_id,
    s.customer_id,
    s.code,
    s.status,
    s.mode,
    s.delivery_warehouse_id,
    s.forwarder,
    s.customs_broker,
    s.carrier,
    s.incoterm_buy,
    s.incoterm_sell,
    s.is_insured,
    s.ready_on,
    s.booking_confirmed_on,
    s.etd,
    s.eta,
    s.customs_cleared_on,
    s.planned_delivery_on,
    s.delivered_at,
    s.container_no,
    s.seal_no,
    s.free_days_port,
    s.free_days_detention,
    s.demurrage_note,
    s.carton_count,
    s.pallet_count,
    s.volume_m3,
    s.gross_kg,
    s.accepted_by,
    s.accepted_on,
    s.quantity_matches,
    s.has_damage,
    s.dispute_deadline_at,
    s.notes,
    s.created_at,
    s.updated_at,
    c.code::TEXT AS customer_code,
    w.display_name AS warehouse_name,
    o.purchase_order_ids,
    o.purchase_order_codes,
    o.psi_missing_po_codes,
    ln.product_ids
FROM api.shipment s
LEFT JOIN api.customer c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
LEFT JOIN api.customer_warehouse w ON w.id = s.delivery_warehouse_id AND w.tenant_id = s.tenant_id
LEFT JOIN LATERAL (
    SELECT coalesce(array_agg(po.id ORDER BY po.code, po.id), '{}'::UUID[]) AS purchase_order_ids,
        coalesce(array_agg(po.code ORDER BY po.code, po.id), '{}'::TEXT[]) AS purchase_order_codes,
        coalesce(array_agg(po.code ORDER BY po.code, po.id) FILTER (WHERE NOT (EXISTS (
            SELECT 1
            FROM api.document d
            WHERE d.tenant_id = po.tenant_id AND d.entity_type = 'purchase_order'::public.document_entity AND d.entity_id = po.id
              AND d.type = 'psi_report'::public.document_type AND d.status = 'approved'::public.document_status
        ))), '{}'::TEXT[]) AS psi_missing_po_codes
    FROM api.shipment_purchase_order sp
    JOIN api.purchase_order po ON po.id = sp.purchase_order_id AND po.tenant_id = sp.tenant_id
    WHERE sp.shipment_id = s.id AND sp.tenant_id = s.tenant_id
) o ON TRUE
LEFT JOIN LATERAL (
    SELECT coalesce(array_agg(DISTINCT pol.product_id), '{}'::UUID[]) AS product_ids
    FROM api.shipment_line l
    JOIN api.purchase_order_line pol ON pol.id = l.purchase_order_line_id AND pol.tenant_id = l.tenant_id
    WHERE l.shipment_id = s.id AND l.tenant_id = s.tenant_id
) ln ON TRUE;

CREATE OR REPLACE VIEW api.dashboard_shipment WITH (security_invoker = true) AS
SELECT s.id AS shipment_id,
    s.code,
    s.customer_id,
    s.customer_code,
    s.tenant_id,
    s.status,
    s.mode,
    s.etd,
    s.eta,
    s.eta - CURRENT_DATE AS days_to_eta,
    coalesce(s.eta < CURRENT_DATE AND (s.status = ANY (ARRAY['planned'::public.shipment_status, 'booked'::public.shipment_status, 'loaded'::public.shipment_status,
                                                           'in_transit'::public.shipment_status, 'at_customs'::public.shipment_status])), FALSE) AS overdue,
    s.warehouse_name,
    s.dispute_deadline_at
FROM api.shipment_overview s
WHERE s.status <> ALL (ARRAY['accepted'::public.shipment_status, 'cancelled'::public.shipment_status]);

CREATE OR REPLACE VIEW api.dashboard_task_due WITH (security_invoker = true) AS
SELECT t.id AS task_id,
    p.id AS project_id,
    p.code AS project_code,
    p.customer_id,
    c.code::TEXT AS customer_code,
    p.tenant_id,
    t.display_name,
    t.role,
    t.phase,
    t.due_on,
    t.due_on - CURRENT_DATE AS days_left,
    t.due_on < CURRENT_DATE AS overdue,
    t.blocks_gate
FROM api.project_task t
JOIN api.project p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
LEFT JOIN api.customer c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
WHERE t.status <> 'done'::public.task_status AND t.due_on IS NOT NULL AND t.due_on <= (CURRENT_DATE + 5) AND p.status = 'active'::public.project_status;

CREATE OR REPLACE VIEW api.market_cell_overview WITH (security_invoker = true) AS
SELECT m.id,
    m.tenant_id,
    m.customer_id,
    m.product_id,
    m.project_id,
    m.platform_id,
    m.country,
    m.status,
    m.priority,
    m.compliance,
    m.compliance_note,
    m.platform_product_id,
    m.platform_sku,
    m.price,
    m.currency,
    m.stock_source,
    m.content_status,
    m.target_launch_on,
    m.launched_on,
    m.last_checked_on,
    m.open_issue,
    m.notes,
    m.created_at,
    m.updated_at,
    m.listing_state,
    m.listing_checked_at,
    m.listing_language,
    m.fulfillment_channel,
    m.listing_match,
    c.code::TEXT AS customer_code,
    pj.code AS project_code,
    p.sku,
    p.display_name AS product_name,
    p.gtin,
    pl.display_name AS platform_name,
    (m.platform_id || '_'::TEXT) || m.country AS cell_key
FROM api.market_cell m
LEFT JOIN api.customer c ON c.id = m.customer_id AND c.tenant_id = m.tenant_id
LEFT JOIN api.project pj ON pj.id = m.project_id AND pj.tenant_id = m.tenant_id
LEFT JOIN api.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
LEFT JOIN api.platform pl ON pl.id = m.platform_id;

CREATE OR REPLACE VIEW api.media_library WITH (security_invoker = true) AS
SELECT m.id,
    m.tenant_id,
    m.customer_id,
    m.storage_path,
    m.thumbnail_path,
    m.file_name,
    m.mime_type,
    m.size_bytes,
    m.width,
    m.height,
    m.title,
    m.alt_text,
    m.tags,
    m.uploaded_by,
    m.created_at,
    m.updated_at,
    CASE
        WHEN m.mime_type ~~ 'image/%'::TEXT THEN 'image'::TEXT
        WHEN m.mime_type = 'application/pdf'::TEXT THEN 'pdf'::TEXT
        ELSE 'video'::TEXT
    END AS kind,
    l.link_count,
    l.linked_types,
    l.linked_entities,
    d.document_count
FROM api.media m
CROSS JOIN LATERAL (
    SELECT count(*)::INTEGER AS link_count,
        coalesce(array_agg(DISTINCT ml.entity_type), '{}'::public.document_entity[]) AS linked_types,
        coalesce(array_agg((ml.entity_type::TEXT || ':'::TEXT) || ml.entity_id::TEXT), '{}'::TEXT[]) AS linked_entities
    FROM api.media_link ml
    WHERE ml.media_id = m.id AND ml.tenant_id = m.tenant_id
) l
CROSS JOIN LATERAL (
    SELECT count(*)::INTEGER AS document_count
    FROM api.document doc
    WHERE doc.media_id = m.id AND doc.tenant_id = m.tenant_id
) d;

CREATE OR REPLACE VIEW api.product_with_evidence WITH (security_invoker = true) AS
SELECT p.id,
    p.tenant_id,
    p.customer_id,
    p.parent_id,
    p.sku,
    p.display_name,
    p.variant_label,
    p.category,
    p.brand,
    p.gtin,
    p.gs1_prefix_owner,
    p.supplier_id,
    p.supplier_product_code,
    p.manufacturer_art_no,
    p.status,
    p.golden_sample_on,
    p.golden_sample_locations,
    p.is_hazmat,
    p.compliance_status,
    p.eu_responsible_person,
    p.hs_code,
    p.origin_country,
    p.unit_dims_mm,
    p.unit_net_g,
    p.pack_qty,
    p.pack_dims_mm,
    p.pack_gross_g,
    p.carton_pack_qty,
    p.carton_dims_mm,
    p.carton_net_kg,
    p.carton_gross_kg,
    p.pallet_carton_qty,
    p.pallet_type,
    p.lot_rule,
    p.purchase_price,
    p.purchase_currency,
    p.purchase_incoterm,
    p.landed_cost_eur,
    p.landed_cost_on,
    p.target_price_eur,
    p.company_price_eur,
    p.price_list_version,
    p.notes,
    p.created_at,
    p.updated_at,
    e.has_signed_spec,
    e.spec_version,
    e.compliance_complete,
    coalesce(m.thumbnail_path, m.storage_path) AS primary_image_path
FROM api.product p
LEFT JOIN api.product_evidence e ON e.product_id = p.id
LEFT JOIN api.media_link ml ON ml.tenant_id = p.tenant_id AND ml.entity_type = 'product'::public.document_entity AND ml.entity_id = p.id
    AND ml.role = 'primary_image'::public.media_role
LEFT JOIN api.media m ON m.id = ml.media_id AND m.tenant_id = ml.tenant_id;

-- owned_via is passed the api row (ROW of its columns); it reads only the id.
CREATE OR REPLACE VIEW api.tenant_member WITH (security_invoker = true) AS
SELECT (tu.tenant_id::TEXT || ':'::TEXT) || u.id::TEXT AS key,
    u.id,
    u.user_metadata,
    u.email,
    u.phone,
    u.created_at,
    tu.tenant_id,
    (SELECT t.display_name FROM api.tenant t WHERE t.id = tu.tenant_id) AS branch_name,
    api.owned_via(ROW(u.id, u.user_metadata, u.email, u.phone, u.created_at)::api.user) AS owned_via
FROM api.tenant_user tu
JOIN api.user u ON u.id = tu.user_id
WHERE tu.tenant_id = ANY (((SELECT private.permitted_tenants('public.user'::TEXT, 'select'::TEXT)))::UUID[])
UNION ALL
SELECT 'owner:'::TEXT || u.id::TEXT AS key,
    u.id,
    u.user_metadata,
    u.email,
    u.phone,
    u.created_at,
    NULL::UUID AS tenant_id,
    NULL::TEXT AS branch_name,
    api.owned_via(ROW(u.id, u.user_metadata, u.email, u.phone, u.created_at)::api.user) AS owned_via
FROM api.user u
WHERE u.id = ANY (((SELECT private.scope_owners()))::UUID[])
  AND NOT (EXISTS (
      SELECT 1 FROM api.tenant_user tu
      WHERE tu.user_id = u.id AND tu.tenant_id = ANY (((SELECT private.tenant_scope()))::UUID[])
  ));

DO $$
DECLARE
    v TEXT;
BEGIN
    FOREACH v IN ARRAY ARRAY['company_subscription', 'dashboard_change_request', 'dashboard_gate_pending', 'dashboard_incident',
                             'dashboard_market', 'dashboard_product_evidence', 'dashboard_purchase_order', 'dashboard_shipment',
                             'dashboard_task_due', 'incident_overview', 'market_cell_overview', 'media_library', 'product_evidence',
                             'product_with_evidence', 'purchase_order_overview', 'shipment_overview', 'tenant_member'] LOOP
        EXECUTE format('REVOKE ALL ON api.%I FROM PUBLIC, anon, authenticated, service_role', v);
        EXECUTE format('GRANT SELECT ON api.%I TO authenticated', v);
    END LOOP;
END;
$$;

-- 2. RPCs.

-- S1 for RPCs: refuses a sensitive field the request's user may not write in the tenant, before any
-- write. System paths pass as at the base write guard (private.field_guard_bypassed, S2). Called by
-- the api_owner definers below.
CREATE OR REPLACE FUNCTION private.require_field_write (p_resource TEXT, p_field TEXT, p_tenant UUID) RETURNS VOID LANGUAGE plpgsql STABLE
SET
   search_path = '' AS $$
BEGIN
    IF private.field_guard_bypassed() OR NOT private.api_is_sensitive(p_resource, p_field) THEN
        RETURN;
    END IF;

    IF NOT coalesce(p_tenant = ANY (private.field_write_tenants(p_resource, p_field)), FALSE) THEN
        RAISE EXCEPTION 'field_write_forbidden' USING ERRCODE = '42501', DETAIL = substr(p_resource, 8) || '.' || p_field;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.require_field_write (TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.require_field_write (TEXT, TEXT, UUID) TO api_owner;

-- The import of 039, as api_owner, with the S1 check of every row before any write (see the header).
CREATE OR REPLACE FUNCTION public.import_products (rows JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    -- The product columns a row may set, in table order. The supplier comes as supplier_code, the
    -- parent as parent_sku.
    value_columns CONSTANT TEXT[] := ARRAY[
        'display_name', 'variant_label', 'category', 'brand', 'gtin', 'gs1_prefix_owner',
        'supplier_product_code', 'manufacturer_art_no', 'status', 'golden_sample_on',
        'golden_sample_locations', 'is_hazmat', 'compliance_status', 'eu_responsible_person',
        'hs_code', 'origin_country', 'unit_dims_mm', 'unit_net_g', 'pack_qty', 'pack_dims_mm',
        'pack_gross_g', 'carton_pack_qty', 'carton_dims_mm', 'carton_net_kg', 'carton_gross_kg',
        'pallet_carton_qty', 'pallet_type', 'lot_rule', 'purchase_price', 'purchase_currency',
        'purchase_incoterm', 'landed_cost_eur', 'landed_cost_on', 'target_price_eur',
        'company_price_eur', 'price_list_version', 'notes'
    ];
    -- Columns that cannot be empty: an empty value keeps the product's own (or the default).
    not_null_columns CONSTANT TEXT[] := ARRAY['status', 'is_hazmat', 'compliance_status'];
    written_columns CONSTANT TEXT[] := value_columns || ARRAY['supplier_id'];
    defaults CONSTANT JSONB := '{"status": "concept", "is_hazmat": false, "compliance_status": "none"}';
    errors JSONB := '[]';
    sku_duplicates BIGINT[];
    gtin_duplicates BIGINT[];
    item JSONB;
    n BIGINT;
    row_values JSONB;
    customer UUID;
    tenant UUID;
    holder TEXT;
    column_name TEXT;
    written INT;
    inserted INT := 0;
    updated INT := 0;
BEGIN
    IF jsonb_typeof(import_products.rows) IS DISTINCT FROM 'array' THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'rows_must_be_an_array')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    -- The rows repeating an earlier row's (customer, sku), or an earlier active row's GTIN.
    SELECT array_agg(d.n) INTO sku_duplicates
    FROM (
        SELECT e.n, row_number() OVER (PARTITION BY e.v ->> 'customer_code', e.v ->> 'sku' ORDER BY e.n) AS seen
        FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n)
        WHERE coalesce(e.v ->> 'sku', '') <> ''
    ) d
    WHERE d.seen > 1;

    SELECT array_agg(d.n) INTO gtin_duplicates
    FROM (
        SELECT e.n, row_number() OVER (PARTITION BY e.v ->> 'gtin' ORDER BY e.n) AS seen
        FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n)
        WHERE e.v ->> 'gtin' IS NOT NULL AND coalesce(e.v ->> 'status', '') <> 'archived'
    ) d
    WHERE d.seen > 1;

    -- 1. Check every row.
    FOR item, n IN SELECT e.v, e.n FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n) LOOP
        -- One customer of that code: of several tenants read together, none is guessed.
        SELECT c.id, c.tenant_id INTO customer, tenant
        FROM public.customer c
        WHERE c.code = item ->> 'customer_code'
            AND (SELECT count(*) FROM public.customer o WHERE o.code = c.code) = 1;

        -- S1, before any write: every value given (non-NULL) for a sensitive product field must be
        -- writable in the customer's tenant; supplier_code sets supplier_id. Present, not compared.
        IF tenant IS NOT NULL THEN
            FOR column_name IN
                SELECT CASE WHEN e.key = 'supplier_code' THEN 'supplier_id' ELSE e.key END
                FROM jsonb_each(item) AS e
                WHERE (e.key = ANY (value_columns) OR e.key = 'supplier_code') AND jsonb_typeof(e.value) <> 'null'
                ORDER BY 1
            LOOP
                PERFORM private.require_field_write('public.product', column_name, tenant);
            END LOOP;
        END IF;

        IF customer IS NULL THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'customer_code', 'code', 'customer_unknown');
        END IF;

        IF coalesce(item ->> 'sku', '') = '' THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'sku', 'code', 'invalid_value');
        ELSIF n = ANY (sku_duplicates) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'sku', 'code', 'sku_duplicate');
        END IF;

        IF item ->> 'supplier_code' IS NOT NULL AND customer IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.supplier s WHERE s.tenant_id = tenant AND s.code = item ->> 'supplier_code'
        ) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'supplier_code', 'code', 'supplier_unknown');
        END IF;

        -- The parent is another product of the same customer, already saved or in the file.
        IF item ->> 'parent_sku' IS NOT NULL AND (
            item ->> 'parent_sku' = item ->> 'sku'
            OR NOT (
                EXISTS (SELECT 1 FROM public.product p WHERE p.customer_id = customer AND p.sku = item ->> 'parent_sku')
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(import_products.rows) AS e (v)
                    WHERE e.v ->> 'customer_code' = item ->> 'customer_code' AND e.v ->> 'sku' = item ->> 'parent_sku'
                )
            )
        ) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'parent_sku', 'code', 'parent_unknown');
        END IF;

        IF item ->> 'gtin' IS NOT NULL THEN
            -- The GS1 check of private.gtin_valid, which the caller cannot call (schema private):
            -- 8, 12, 13 or 14 digits, the last the mod-10 check digit of the others weighted 3, 1, …
            IF item ->> 'gtin' !~ '^([0-9]{8}|[0-9]{12,14})$' OR (
                SELECT (10 - sum(substr(item ->> 'gtin', length(item ->> 'gtin') - i, 1)::INT * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END) % 10) % 10
                FROM generate_series(1, length(item ->> 'gtin') - 1) AS i
            ) <> substr(item ->> 'gtin', length(item ->> 'gtin'), 1)::INT THEN
                errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_invalid');
            ELSIF n = ANY (gtin_duplicates) THEN
                errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_duplicate');
            ELSIF coalesce(item ->> 'status', '') <> 'archived' THEN
                -- Only the caller's own products are visible here; the unique index guards the rest.
                SELECT p.sku INTO holder
                FROM public.product p
                WHERE p.gtin = item ->> 'gtin' AND p.status <> 'archived'
                    AND NOT (p.customer_id IS NOT DISTINCT FROM customer AND p.sku = item ->> 'sku')
                LIMIT 1;

                IF holder IS NOT NULL THEN
                    errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_in_use', 'sku', holder);
                END IF;
            END IF;
        END IF;

        -- Values the columns cannot hold (enums, numbers, dates, booleans, currency codes): read
        -- as a whole first, then column by column to name the ones that fail.
        row_values := coalesce((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(item) AS e WHERE e.key = ANY (value_columns)), '{}');
        BEGIN
            PERFORM jsonb_populate_record(NULL::public.product, row_values);
        EXCEPTION
            WHEN data_exception OR integrity_constraint_violation THEN
                FOREACH column_name IN ARRAY value_columns LOOP
                    CONTINUE WHEN NOT row_values ? column_name;
                    BEGIN
                        PERFORM jsonb_populate_record(NULL::public.product, jsonb_build_object(column_name, row_values -> column_name));
                    EXCEPTION
                        WHEN data_exception OR integrity_constraint_violation THEN
                            errors := errors || jsonb_build_object('row', n, 'field', column_name, 'code', 'invalid_value');
                    END;
                END LOOP;
        END;
    END LOOP;

    IF jsonb_array_length(errors) > 0 THEN
        RETURN jsonb_build_object('ok', FALSE, 'errors', errors);
    END IF;

    -- 2. Write every row: the product of the same (customer, sku) is updated, otherwise one is made.
    FOR item IN SELECT e.v FROM jsonb_array_elements(import_products.rows) AS e (v) LOOP
        SELECT c.id, c.tenant_id INTO customer, tenant
        FROM public.customer c
        WHERE c.code = item ->> 'customer_code';

        row_values := coalesce((
            SELECT jsonb_object_agg(e.key, e.value)
            FROM jsonb_each(item) AS e
            WHERE e.key = ANY (value_columns)
                AND NOT (e.key = ANY (not_null_columns) AND jsonb_typeof(e.value) = 'null')
        ), '{}');

        IF item ? 'supplier_code' THEN
            row_values := row_values || jsonb_build_object('supplier_id', (
                SELECT s.id FROM public.supplier s WHERE s.tenant_id = tenant AND s.code = item ->> 'supplier_code'
            ));
        END IF;

        EXECUTE format(
            'UPDATE public.product p SET (%s) = (SELECT %s FROM jsonb_populate_record(p, $1) AS r) WHERE p.customer_id = $2 AND p.sku = $3',
            array_to_string(written_columns, ', '),
            'r.' || array_to_string(written_columns, ', r.')
        )
        USING row_values, customer, item ->> 'sku';
        GET DIAGNOSTICS written = ROW_COUNT;

        IF written > 0 THEN
            updated := updated + 1;
        ELSE
            EXECUTE format(
                'INSERT INTO public.product (tenant_id, customer_id, sku, %s) SELECT $2, $3, $4, %s FROM jsonb_populate_record(jsonb_populate_record(NULL::public.product, $5), $1) AS r',
                array_to_string(written_columns, ', '),
                'r.' || array_to_string(written_columns, ', r.')
            )
            USING row_values, tenant, customer, item ->> 'sku', defaults;
            inserted := inserted + 1;
        END IF;
    END LOOP;

    -- 3. Link the variants to their parents, now that every row of the file is saved. An empty
    -- parent_sku unlinks the product.
    UPDATE public.product c
    SET parent_id = parent.id
    FROM jsonb_array_elements(import_products.rows) AS e (v)
    JOIN public.customer cu ON cu.code = e.v ->> 'customer_code'
    LEFT JOIN public.product parent ON parent.customer_id = cu.id AND parent.sku = e.v ->> 'parent_sku'
    WHERE e.v ? 'parent_sku'
        AND c.customer_id = cu.id
        AND c.sku = e.v ->> 'sku'
        AND c.parent_id IS DISTINCT FROM parent.id;

    RETURN jsonb_build_object('ok', TRUE, 'inserted', inserted, 'updated', updated);
END;
$$;

-- pass_gate (032) as api_owner: the note checked before any write (S1), the row returned through
-- api.project_gate (C2). The rest as in 032.
DROP FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.pass_gate (
   gate_id UUID,
   note TEXT,
   customer_approved_on DATE DEFAULT NULL,
   approval_document_id UUID DEFAULT NULL,
   evidence_document_ids UUID[] DEFAULT '{}'
) RETURNS api.project_gate LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    gate_tenant UUID;
    passed public.project_gate;
    result api.project_gate;
BEGIN
    SELECT g.project_id, g.tenant_id INTO gate_project, gate_tenant FROM public.project_gate g WHERE g.id = pass_gate.gate_id;

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

    -- S1: a note given is a write of project_gate.note, whatever the stored one.
    IF pass_gate.note IS NOT NULL THEN
        PERFORM private.require_field_write('public.project_gate', 'note', gate_tenant);
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
    RETURNING * INTO passed;

    IF passed.approval_document_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.document d
        WHERE d.id = passed.approval_document_id AND d.tenant_id = passed.tenant_id
          AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = passed.id
    ) THEN
        RAISE EXCEPTION 'gate_approval_document_invalid' USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1 FROM unnest(passed.evidence_document_ids) AS e (id)
        WHERE NOT EXISTS (
            SELECT 1 FROM public.document d
            WHERE d.id = e.id AND d.tenant_id = passed.tenant_id
              AND ((d.entity_type = 'project_gate' AND d.entity_id = passed.id)
                   OR (d.entity_type = 'project' AND d.entity_id = passed.project_id)
                   OR (d.entity_type = 'purchase_order' AND EXISTS (
                       SELECT 1 FROM public.purchase_order po
                       WHERE po.id = d.entity_id AND po.tenant_id = passed.tenant_id
                         AND po.project_id = passed.project_id
                   ))
                   OR (d.entity_type = 'shipment' AND EXISTS (
                       SELECT 1 FROM public.shipment_purchase_order spo
                       JOIN public.purchase_order po
                         ON po.id = spo.purchase_order_id AND po.tenant_id = spo.tenant_id
                       WHERE spo.shipment_id = d.entity_id AND spo.tenant_id = passed.tenant_id
                         AND po.project_id = passed.project_id
                   )))
        )
    ) THEN
        RAISE EXCEPTION 'gate_evidence_invalid' USING ERRCODE = 'check_violation';
    END IF;

    SELECT g.* INTO result FROM api.project_gate g WHERE g.id = pass_gate.gate_id;
    RETURN result;
END;
$$;

-- rollback_gate (036) as api_owner, the row returned through api.project_gate (C2). The reason goes
-- to rolled_back_reason, which is not sensitive: no S1 check.
DROP FUNCTION public.rollback_gate (UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.rollback_gate (gate_id UUID, reason TEXT, incident_id UUID DEFAULT NULL) RETURNS api.project_gate LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    gate_project UUID;
    gate public.project_gate;
    later UUID;
    result api.project_gate;
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

    SELECT g.* INTO result FROM api.project_gate g WHERE g.id = rollback_gate.gate_id;
    RETURN result;
END;
$$;

-- set_primary_media (025) as api_owner, the link returned through api.media_link (C2).
DROP FUNCTION public.set_primary_media (UUID);

CREATE OR REPLACE FUNCTION public.set_primary_media (link_id UUID) RETURNS api.media_link LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    link public.media_link;
    result api.media_link;
BEGIN
    UPDATE public.media_link l
    SET role = 'primary_image'
    WHERE l.id = set_primary_media.link_id
    RETURNING l.* INTO link;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'media_link_entity_missing' USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT l.* INTO result FROM api.media_link l WHERE l.id = link.id;
    RETURN result;
END;
$$;

-- R8: the write RPCs run as api_owner. Changing a function's owner needs the new owner's CREATE on
-- its schema (as in 053); api_owner keeps none on public.
ALTER FUNCTION public.save_role (JSONB, UUID[], JSONB) SECURITY DEFINER;

ALTER FUNCTION public.set_user_roles (UUID, UUID[]) SECURITY DEFINER;

ALTER FUNCTION public.save_plan (JSONB, TEXT[], JSONB) SECURITY DEFINER;

GRANT CREATE ON SCHEMA public TO api_owner;

ALTER FUNCTION public.import_products (JSONB) OWNER TO api_owner;

ALTER FUNCTION public.save_role (JSONB, UUID[], JSONB) OWNER TO api_owner;

ALTER FUNCTION public.set_user_roles (UUID, UUID[]) OWNER TO api_owner;

ALTER FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]) OWNER TO api_owner;

ALTER FUNCTION public.rollback_gate (UUID, TEXT, UUID) OWNER TO api_owner;

ALTER FUNCTION public.save_plan (JSONB, TEXT[], JSONB) OWNER TO api_owner;

ALTER FUNCTION public.set_primary_media (UUID) OWNER TO api_owner;

REVOKE CREATE ON SCHEMA public FROM api_owner;

-- The grants they had: authenticated and service_role. set_user_roles had PUBLIC and anon as well
-- (009), which a definer does not keep.
REVOKE ALL ON FUNCTION public.import_products (JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.save_role (JSONB, UUID[], JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.set_user_roles (UUID, UUID[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.rollback_gate (UUID, TEXT, UUID) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.save_plan (JSONB, TEXT[], JSONB) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.set_primary_media (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.import_products (JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_role (JSONB, UUID[], JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_user_roles (UUID, UUID[]) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.pass_gate (UUID, TEXT, DATE, UUID, UUID[]) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rollback_gate (UUID, TEXT, UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_plan (JSONB, TEXT[], JSONB) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_primary_media (UUID) TO authenticated, service_role;

-- The audit embeds (010) return api.user: a colleague's personal data masked per S5 (C2). They stay
-- SECURITY INVOKER over the api view.
DROP FUNCTION public.actor (public.audit_transaction);

DROP FUNCTION public.reverter (public.audit_transaction);

CREATE OR REPLACE FUNCTION public.actor (public.audit_transaction) RETURNS SETOF api.user LANGUAGE sql STABLE ROWS 1
SET
   search_path = '' AS $$
    SELECT u.id, u.user_metadata, u.email, u.phone, u.created_at FROM api.user u WHERE u.id = $1.actor_id
$$;

CREATE OR REPLACE FUNCTION public.reverter (public.audit_transaction) RETURNS SETOF api.user LANGUAGE sql STABLE ROWS 1
SET
   search_path = '' AS $$
    SELECT u.id, u.user_metadata, u.email, u.phone, u.created_at FROM api.user u WHERE u.id = $1.reverted_by
$$;

REVOKE ALL ON FUNCTION public.actor (public.audit_transaction) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.reverter (public.audit_transaction) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.actor (public.audit_transaction) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reverter (public.audit_transaction) TO authenticated, service_role;

-- 3. The transfer gate (S3).

-- Whether p_user may read and write every sensitive field of every table a transfer copies, in each
-- of p_tenants. Read from private.transfer_registry and public.field_class, so a table added to the
-- registry or a field classified sensitive is covered without a code change. No user, or a NULL
-- tenant, is FALSE. Called by the transfer definers (owner postgres) only.
CREATE OR REPLACE FUNCTION private.transfer_field_rights (p_user UUID, p_tenants UUID[]) RETURNS BOOLEAN LANGUAGE sql STABLE
SET
   search_path = '' AS $$
    SELECT p_user IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM private.transfer_registry r
           JOIN public.field_class f ON f.resource_name = 'public.' || r.table_name AND f.class = 'sensitive'
           WHERE NOT coalesce(p_tenants <@ private.field_tenants(p_user, p_tenants, f.resource_name, f.field, FALSE), FALSE)
              OR NOT coalesce(p_tenants <@ private.field_tenants(p_user, p_tenants, f.resource_name, f.field, TRUE), FALSE)
       );
$$;

REVOKE ALL ON FUNCTION private.transfer_field_rights (UUID, UUID[]) FROM PUBLIC, anon, authenticated;

-- transfer_options (045): the source needs the field rights (transfer_field_rights_required), and a
-- target without them is refused with that code after the refusals of 042.
CREATE OR REPLACE FUNCTION public.transfer_options (source_tenant UUID, customer_id UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    mine UUID[];
    source_e RECORD;
BEGIN
    mine := ARRAY(
        SELECT tu.tenant_id FROM public.tenant_user tu WHERE tu.user_id = caller
        UNION
        SELECT o.id FROM unnest(private.owned_tenants(caller)) AS o (id)
    );

    IF caller IS NULL OR source_tenant IS NULL OR NOT (source_tenant = ANY (mine)) THEN
        RETURN jsonb_build_object('source_writable', FALSE, 'targets', '[]'::JSONB);
    END IF;

    IF NOT private.transfer_field_rights(caller, ARRAY[source_tenant]) THEN
        RAISE EXCEPTION 'transfer_field_rights_required' USING ERRCODE = '42501';
    END IF;

    SELECT e.company_id, e.writable INTO source_e FROM private.entitlements(ARRAY[source_tenant]) e;

    RETURN jsonb_build_object(
        'source_writable', coalesce(source_e.writable, FALSE),
        'targets', coalesce((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'display_name', t.display_name,
                    'same_company', e.company_id IS NOT DISTINCT FROM source_e.company_id,
                    'refusal', coalesce(
                        private.transfer_refusal(source_tenant, t.id, 'copy', transfer_options.customer_id),
                        CASE WHEN NOT private.transfer_field_rights(caller, ARRAY[t.id]) THEN 'transfer_field_rights_required' END
                    )
                )
                ORDER BY t.display_name, t.id
            )
            FROM public.tenant t
            JOIN private.entitlements(mine) e ON e.tenant_id = t.id
            WHERE t.id = ANY (mine) AND t.id <> source_tenant
        ), '[]'::JSONB)
    );
END;
$$;

-- transfer_check_files (045): the field rights in the transfer's source and target after the 404,
-- and the row returned through api.transfer (C2). Still owned by postgres (it reads Storage past its
-- policies and writes public.transfer, which users never write).
DROP FUNCTION public.transfer_check_files (UUID);

CREATE OR REPLACE FUNCTION public.transfer_check_files (transfer_id UUID) RETURNS api.transfer LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    caller UUID := auth.uid();
    run public.transfer;
    result api.transfer;
    missing TEXT[];
    saved_transaction TEXT := current_setting('audit.transaction_id', TRUE);
    saved_tenant TEXT := current_setting('audit.tenant_id', TRUE);
    saved_depth TEXT := current_setting('audit.depth', TRUE);
    check_transaction UUID;
BEGIN
    SELECT * INTO run FROM public.transfer t WHERE t.id = transfer_check_files.transfer_id FOR UPDATE;

    IF NOT FOUND
       OR NOT (
           coalesce(run.started_by = caller, FALSE)
           OR run.tenant_id = ANY (private.tenants_granting(caller, ARRAY[run.tenant_id], 'public.transfer', 'insert'))
       ) THEN
        PERFORM private.transfer_raise('transfer_not_found', 404);
    END IF;

    IF NOT private.transfer_field_rights(caller, ARRAY[run.source_tenant_id, run.tenant_id]) THEN
        RAISE EXCEPTION 'transfer_field_rights_required' USING ERRCODE = '42501';
    END IF;

    -- The listed target paths with no object in the target's folder, in list order.
    missing := ARRAY(
        SELECT f.value ->> 'to'
        FROM jsonb_array_elements(run.files) WITH ORDINALITY AS f (value, n)
        WHERE f.value ->> 'to' IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM storage.objects o
              WHERE o.bucket_id = 'media'
                AND o.name = f.value ->> 'to'
                AND private.storage_tenant(o.name) = run.tenant_id
          )
        ORDER BY f.n
    );

    -- The check's own audit transaction.
    PERFORM set_config('audit.transaction_id', '', TRUE);

    UPDATE public.transfer t
    SET missing_files = missing,
        files_status = CASE WHEN cardinality(missing) = 0 THEN 'done' ELSE 'partial' END
    WHERE t.id = run.id;

    check_transaction := nullif(current_setting('audit.transaction_id', TRUE), '')::UUID;

    IF check_transaction IS NOT NULL THEN
        UPDATE public.transfer t
        SET audit_transaction_ids = t.audit_transaction_ids || check_transaction
        WHERE t.id = run.id AND NOT (check_transaction = ANY (t.audit_transaction_ids));
    END IF;

    -- The caller's open audit transaction back, if there was one.
    IF nullif(saved_transaction, '') IS NOT NULL THEN
        PERFORM set_config('audit.transaction_id', saved_transaction, TRUE);
        PERFORM set_config('audit.tenant_id', coalesce(saved_tenant, ''), TRUE);
        PERFORM set_config('audit.depth', coalesce(saved_depth, ''), TRUE);
    END IF;

    SELECT t.* INTO result FROM api.transfer t WHERE t.id = run.id;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_check_files (UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.transfer_check_files (UUID) TO authenticated, service_role;

-- transfer_customer (042): the field rights in the source and the target, after the refusals.
CREATE OR REPLACE FUNCTION public.transfer_customer (
   source_tenant UUID,
   target_tenant UUID,
   customer_id UUID,
   mode TEXT,
   decisions JSONB DEFAULT '{}',
   dry_run BOOLEAN DEFAULT TRUE,
   report_hash TEXT DEFAULT NULL,
   product_ids UUID[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    refusal TEXT := private.transfer_refusal(source_tenant, target_tenant, transfer_customer.mode, transfer_customer.customer_id);
    report JSONB;
    new_id UUID;
    result JSONB;
BEGIN
    IF refusal IS NOT NULL THEN
        PERFORM private.transfer_raise(
            refusal, CASE WHEN refusal IN ('transfer_invalid_mode', 'transfer_same_tenant') THEN 400
                          WHEN refusal = 'transfer_files_pending' THEN 409
                          ELSE 403 END
        );
    END IF;

    IF NOT private.transfer_field_rights(auth.uid(), ARRAY[source_tenant, target_tenant]) THEN
        RAISE EXCEPTION 'transfer_field_rights_required' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.customer c
    WHERE c.id = transfer_customer.customer_id AND c.tenant_id = source_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
        PERFORM private.transfer_raise('transfer_customer_missing', 404);
    END IF;

    IF transfer_customer.product_ids IS NOT NULL AND (
        cardinality(transfer_customer.product_ids) = 0
        OR EXISTS (
            SELECT 1 FROM unnest(transfer_customer.product_ids) AS s (id)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.product p
                WHERE p.id = s.id AND p.tenant_id = source_tenant AND p.customer_id = transfer_customer.customer_id
            )
        )
    ) THEN
        PERFORM private.transfer_raise('transfer_products_invalid', 400);
    END IF;

    PERFORM private.transfer_collect(source_tenant, transfer_customer.customer_id, transfer_customer.product_ids);

    -- A real run locks the package, then reads it again: what a concurrent writer committed before
    -- the lock is in it, and nothing below a locked row changes until commit.
    IF NOT coalesce(transfer_customer.dry_run, TRUE) THEN
        PERFORM private.transfer_lock_rows();
        PERFORM private.transfer_collect(source_tenant, transfer_customer.customer_id, transfer_customer.product_ids);
        PERFORM private.transfer_lock_rows();
    END IF;

    -- A package file that an earlier transfer into the source has not copied yet (one moved in
    -- with another customer, or shared): transfer_files_pending, as for the customer above.
    IF EXISTS (
        SELECT 1
        FROM public.transfer t
        CROSS JOIN LATERAL jsonb_array_elements(t.files) f
        JOIN pg_temp.transfer_rows r ON r.table_name = 'media' AND r.source_id::TEXT = f ->> 'media_id'
        WHERE t.tenant_id = source_tenant AND t.files_status <> 'done'
          AND (t.files_status = 'pending' OR f ->> 'to' = ANY (t.missing_files))
    ) THEN
        PERFORM private.transfer_raise('transfer_files_pending', 409);
    END IF;

    PERFORM private.transfer_check_gates();

    report := private.transfer_report(
        source_tenant, target_tenant, transfer_customer.mode, transfer_customer.decisions, transfer_customer.product_ids
    );

    IF coalesce(transfer_customer.dry_run, TRUE) THEN
        RETURN report;
    END IF;

    IF transfer_customer.report_hash IS NULL THEN
        PERFORM private.transfer_raise('transfer_report_required', 400);
    END IF;

    IF transfer_customer.report_hash IS DISTINCT FROM report ->> 'report_hash' THEN
        PERFORM private.transfer_raise('transfer_report_stale', 409);
    END IF;

    IF transfer_customer.mode = 'move' AND jsonb_array_length(report -> 'left_behind') > 0 THEN
        PERFORM private.transfer_raise('transfer_product_in_use', 409);
    END IF;

    PERFORM private.transfer_check_decisions(report, transfer_customer.decisions, target_tenant, transfer_customer.mode);

    -- The run: the flag, a new audit transaction, then the transfer row as the first write (the target's audit transaction
    -- is about it), its audit transaction, the package (043), and the flag cleared.
    new_id := gen_random_uuid();
    PERFORM set_config('moesa.transfer_id', new_id::TEXT, TRUE);
    -- Its own audit transaction, even after an earlier write of the caller's transaction.
    PERFORM set_config('audit.transaction_id', '', TRUE);

    INSERT INTO public.transfer (
        id, tenant_id, source_tenant_id, customer_id, product_ids, mode, path, started_by, report, decisions
    )
    VALUES (
        new_id, target_tenant, source_tenant, transfer_customer.customer_id, transfer_customer.product_ids,
        transfer_customer.mode, report ->> 'path', auth.uid(), report, coalesce(transfer_customer.decisions, '{}')
    );

    UPDATE public.transfer t
    SET audit_transaction_ids = array_remove(ARRAY[nullif(current_setting('audit.transaction_id', TRUE), '')::UUID], NULL)
    WHERE t.id = new_id;

    PERFORM private.transfer_apply(new_id);

    PERFORM set_config('moesa.transfer_id', '', TRUE);

    SELECT to_jsonb(t) INTO result FROM public.transfer t WHERE t.id = new_id;
    RETURN result;
END;
$$;
