-- Dashboard boxes for the market matrix, incidents and change requests (M6, the Wednesday
-- operations review): the views behind the boxes "market matrix summary", "open incidents" and
-- "open change requests".
--
-- dashboard_market          Per customer, the cells of market_cell by status: live, preparing
--                           (preparing or uploaded), suppressed, and the target (planned,
--                           preparing, uploaded, live, suppressed or paused: the app's
--                           TARGET_STATUSES; candidates, stopped and removed cells are not
--                           targets).
-- dashboard_incident        The incidents of incident_overview that are not closed: severity,
--                           status, whether management was not told yet (an s1 or s2 without
--                           management_notified_at), the customer notice due time and whether it
--                           passed before the customer was told, and the overview's next deadline
--                           and overdue deadline count.
-- dashboard_change_request  The open and approved change requests: status, urgency, decision due
--                           date and whether it passed while the request is still open.
--
-- The app sums and orders the rows into the boxes (marketSummary); no rule is added and nothing
-- here raises. The views run as the caller (security_invoker) over tables and an overview that run
-- as the caller too, so each shows what the caller's RLS lets them read: the tenant's own cells,
-- incidents and requests only. current_date is UTC (a known Phase 1 backlog item).

-- The market matrix per customer
CREATE OR REPLACE VIEW public.dashboard_market
WITH
   (security_invoker = TRUE) AS
SELECT
   m.customer_id,
   c.code::TEXT AS customer_code,
   m.tenant_id,
   count(*) FILTER (
      WHERE
         m.status = 'live'
   )::INT AS live_count,
   count(*) FILTER (
      WHERE
         m.status IN ('preparing', 'uploaded')
   )::INT AS preparing_count,
   count(*) FILTER (
      WHERE
         m.status = 'suppressed'
   )::INT AS suppressed_count,
   count(*) FILTER (
      WHERE
         m.status IN ('planned', 'preparing', 'uploaded', 'live', 'suppressed', 'paused')
   )::INT AS target_count
FROM
   public.market_cell m
   LEFT JOIN public.customer c ON c.id = m.customer_id
   AND c.tenant_id = m.tenant_id
GROUP BY
   m.customer_id,
   c.code,
   m.tenant_id;

COMMENT ON VIEW public.dashboard_market IS 'Per customer, its market cells by status: live_count, preparing_count (preparing or uploaded), suppressed_count and target_count (planned, preparing, uploaded, live, suppressed or paused, the app''s TARGET_STATUSES).';

GRANT SELECT ON public.dashboard_market TO authenticated;

-- Open incidents
CREATE OR REPLACE VIEW public.dashboard_incident
WITH
   (security_invoker = TRUE) AS
SELECT
   i.id AS incident_id,
   i.code,
   i.customer_id,
   i.customer_code,
   i.tenant_id,
   i.severity,
   i.status,
   i.title,
   i.opened_at,
   (
      i.severity IN ('s1', 's2')
      AND i.management_notified_at IS NULL
   ) AS management_notice_missing,
   i.customer_notice_due_at,
   coalesce(
      i.customer_notice_due_at < now()
      AND i.customer_notified_at IS NULL,
      FALSE
   ) AS customer_notice_late,
   i.next_deadline_at,
   coalesce(i.overdue_deadline_count, 0)::INT AS overdue_deadline_count
FROM
   public.incident_overview i
WHERE
   i.status <> 'closed';

COMMENT ON VIEW public.dashboard_incident IS 'The incidents of incident_overview that are not closed: codes, severity, status, title, opened_at, management_notice_missing (an s1 or s2 management was not told of), customer_notice_due_at and customer_notice_late (due passed and the customer not told), next_deadline_at and overdue_deadline_count (its unmet deadlines).';

GRANT SELECT ON public.dashboard_incident TO authenticated;

-- Open change requests
CREATE OR REPLACE VIEW public.dashboard_change_request
WITH
   (security_invoker = TRUE) AS
SELECT
   r.id AS change_request_id,
   r.code,
   r.customer_id,
   c.code::TEXT AS customer_code,
   r.tenant_id,
   r.status,
   r.urgency,
   r.title,
   r.decision_due_on,
   coalesce(
      r.status = 'open'
      AND r.decision_due_on < current_date,
      FALSE
   ) AS overdue
FROM
   public.change_request r
   LEFT JOIN public.customer c ON c.id = r.customer_id
   AND c.tenant_id = r.tenant_id
WHERE
   r.status IN ('open', 'approved');

COMMENT ON VIEW public.dashboard_change_request IS 'The open and approved change requests: codes, status, urgency, title, decision_due_on and overdue (still open past its decision date).';

GRANT SELECT ON public.dashboard_change_request TO authenticated;
