-- Dashboard (M6): the views behind the weekly rhythm (Monday plan, Wednesday operations, Friday
-- reports).
--
-- dashboard_gate_pending      Per active project, the gate it waits on (the first gate by position
--                             that is pending or rolled back), how many days it has waited (since
--                             the previous gate passed, or since the project was created), the
--                             role that owns it (spec §7.1) and whether management has to act on
--                             it (the company's setting management_gates).
-- dashboard_task_due          The open tasks of active projects due within five days, overdue ones
--                             included.
-- dashboard_product_evidence  Per customer, the evidence behind its active products (neither
--                             concept nor archived): how many have a signed spec sheet and how many
--                             have complete compliance (public.product_evidence).
--
-- The views run as the caller (security_invoker), so each shows what the caller's RLS lets them
-- read. The customer is joined LEFT: a caller who may read projects but not customers still sees
-- the rows, without the customer's code. A caller who cannot read the settings gets the default
-- management gates (G1).

-- Settings: the gates that need management's approval, added to the defaults of new companies and
-- given to the companies that exist now.
CREATE OR REPLACE FUNCTION private.default_settings () RETURNS TABLE (key TEXT, value JSONB, description TEXT, source_question TEXT) LANGUAGE sql IMMUTABLE
SET
   search_path = '' AS $$
    VALUES
        ('deposit_rate_default', '30'::JSONB, 'Default deposit rate on purchase orders (%)', NULL),
        ('safety_stock_days', '30'::JSONB, 'Safety stock added to the reorder point (days of sales)', NULL),
        ('document_request_days', '5'::JSONB, 'Time given to answer a document request (business days)', NULL),
        ('s1_customer_notify_hours', '4'::JSONB, 'Time to notify the customer of an S1 incident (hours)', NULL),
        ('spec_sheet_required_from', '"2026-12-31"'::JSONB, 'Date from which every purchase order needs an approved spec sheet', NULL),
        ('wip_limit_per_role', '5'::JSONB, 'Work in progress allowed per role', NULL),
        ('gate_evidence_blocking', 'true'::JSONB, 'Whether missing gate evidence blocks the gate (else a warning)', NULL),
        ('management_gates', '["G1"]'::JSONB, 'Yönetim onayı gereken kapılar', NULL);
$$;

INSERT INTO
   public.setting (tenant_id, key, value, description, source_question)
SELECT
   t.id,
   d.key,
   d.value,
   d.description,
   d.source_question
FROM
   public.tenant t,
   private.default_settings () d
WHERE
   t.parent_id IS NULL
   AND d.key = 'management_gates'
ON CONFLICT ON CONSTRAINT unique_setting_key DO NOTHING;

-- Pending gates
CREATE OR REPLACE VIEW public.dashboard_gate_pending
WITH
   (security_invoker = TRUE) AS
SELECT
   g.id AS gate_id,
   p.id AS project_id,
   p.code AS project_code,
   p.display_name AS project_display_name,
   p.customer_id,
   c.code::TEXT AS customer_code,
   p.tenant_id,
   g.code AS gate_code,
   g.position,
   g.needs_customer_approval,
   floor(extract(epoch FROM now() - coalesce(prev.passed_at, p.created_at)) / 86400)::INT AS waiting_days,
   (
      CASE
         WHEN g.code IN ('G2') THEN 'supply_qc'
         WHEN g.code IN ('G4') THEN 'compliance'
         WHEN g.code IN ('L_G1', 'L_G2') THEN 'content_listing'
         ELSE 'coordinator'
      END
   )::TEXT AS owner_role,
   -- A JSONB array of gate codes; `?` matches its string elements.
   coalesce(s.value, '["G1"]'::JSONB) ? g.code::TEXT AS needs_management
FROM
   public.project p
   JOIN LATERAL (
      SELECT
         pg.id,
         pg.code,
         pg.position,
         pg.needs_customer_approval
      FROM
         public.project_gate pg
      WHERE
         pg.project_id = p.id
         AND pg.tenant_id = p.tenant_id
         AND pg.status IN ('pending', 'rolled_back')
      ORDER BY
         pg.position
      LIMIT
         1
   ) g ON TRUE
   LEFT JOIN LATERAL (
      SELECT
         pg.passed_at
      FROM
         public.project_gate pg
      WHERE
         pg.project_id = p.id
         AND pg.tenant_id = p.tenant_id
         AND pg.position < g.position
      ORDER BY
         pg.position DESC
      LIMIT
         1
   ) prev ON TRUE
   LEFT JOIN public.customer c ON c.id = p.customer_id
   AND c.tenant_id = p.tenant_id
   LEFT JOIN public.setting s ON s.tenant_id = p.tenant_id
   AND s.key = 'management_gates'
WHERE
   p.status = 'active';

COMMENT ON VIEW public.dashboard_gate_pending IS 'Per active project: the gate it waits on (first pending or rolled-back gate by position), the days it has waited since the previous gate passed or the project was created, the role that owns it, and whether management must act on it (setting management_gates, default ["G1"]).';

GRANT SELECT ON public.dashboard_gate_pending TO authenticated;

-- Tasks due
CREATE OR REPLACE VIEW public.dashboard_task_due
WITH
   (security_invoker = TRUE) AS
SELECT
   t.id AS task_id,
   p.id AS project_id,
   p.code AS project_code,
   p.customer_id,
   c.code::TEXT AS customer_code,
   p.tenant_id,
   t.display_name,
   t.role,
   t.phase,
   t.due_on,
   (t.due_on - current_date)::INT AS days_left,
   t.due_on < current_date AS overdue,
   t.blocks_gate
FROM
   public.project_task t
   JOIN public.project p ON p.id = t.project_id
   AND p.tenant_id = t.tenant_id
   LEFT JOIN public.customer c ON c.id = p.customer_id
   AND c.tenant_id = p.tenant_id
WHERE
   t.status <> 'done'
   AND t.due_on IS NOT NULL
   AND t.due_on <= current_date + 5
   AND p.status = 'active';

COMMENT ON VIEW public.dashboard_task_due IS 'The open (not done) tasks of active projects due within five days, overdue ones included: days_left is negative and overdue true once the due date has passed.';

GRANT SELECT ON public.dashboard_task_due TO authenticated;

-- Product evidence
CREATE OR REPLACE VIEW public.dashboard_product_evidence
WITH
   (security_invoker = TRUE) AS
SELECT
   e.customer_id,
   c.code::TEXT AS customer_code,
   e.tenant_id,
   count(*)::INT AS active_sku_count,
   (count(*) FILTER (WHERE e.has_signed_spec))::INT AS signed_spec_count,
   (count(*) FILTER (WHERE e.compliance_complete))::INT AS compliance_complete_count,
   (count(*) FILTER (WHERE NOT e.has_signed_spec))::INT AS unsigned_sku_count
FROM
   public.product_evidence e
   LEFT JOIN public.customer c ON c.id = e.customer_id
   AND c.tenant_id = e.tenant_id
WHERE
   e.status NOT IN ('archived', 'concept')
GROUP BY
   e.customer_id,
   c.code,
   e.tenant_id;

COMMENT ON VIEW public.dashboard_product_evidence IS 'Per customer, over its active products (neither concept nor archived): how many there are, how many have a signed or approved spec sheet, how many have complete compliance, and how many lack a signed spec sheet.';

GRANT SELECT ON public.dashboard_product_evidence TO authenticated;
