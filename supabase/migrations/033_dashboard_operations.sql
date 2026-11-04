-- Dashboard boxes for orders and shipments (M6, the Wednesday operations review): the views behind
-- the boxes "orders waiting for action", "orders in production", "shipments on the way" and
-- "late shipments".
--
-- dashboard_purchase_order  The open purchase orders (neither draft, closed nor cancelled) of
--                           purchase_order_overview: the codes, the status, the ready date and the
--                           days left to it, the planned dates of the unpaid deposit and balance,
--                           and the S09 total recalculated by private.purchase_order_figures.
-- dashboard_shipment        The open shipments (neither accepted nor cancelled) of
--                           shipment_overview: the mode, ETD, ETA and the days left to the ETA,
--                           whether the shipment is late (its ETA has passed and it has not been
--                           delivered yet: planned, booked, loaded, in_transit or at_customs), the
--                           delivery warehouse and the dispute deadline (S16).
--
-- The app groups the rows into the boxes (groupPurchaseOrders, groupShipments); no rule is added
-- and nothing here raises. The views run as the caller (security_invoker) over the two overviews,
-- which run as the caller too, so each shows what the caller's RLS lets them read: the tenant's
-- own orders and shipments only, as the 022 views. They call nothing in private beyond what the
-- overviews already call (private.purchase_order_figures and private.po_line_needs_spec, granted
-- in 030). current_date is UTC (a known Phase 1 backlog item).

-- Open purchase orders
CREATE OR REPLACE VIEW public.dashboard_purchase_order
WITH
   (security_invoker = TRUE) AS
SELECT
   o.id AS purchase_order_id,
   o.code,
   o.customer_id,
   o.customer_code,
   o.supplier_code,
   o.tenant_id,
   o.status,
   o.ready_on,
   (o.ready_on - current_date)::INT AS days_to_ready,
   o.deposit_planned_on,
   o.balance_planned_on,
   o.system_total,
   o.currency
FROM
   public.purchase_order_overview o
WHERE
   o.status NOT IN ('draft', 'closed', 'cancelled');

COMMENT ON VIEW public.dashboard_purchase_order IS 'The open purchase orders (neither draft, closed nor cancelled) of purchase_order_overview: codes, status, ready_on and days_to_ready (negative once passed), the earliest planned date of the unpaid deposit and balance, and the S09 system_total in the order''s currency.';

GRANT SELECT ON public.dashboard_purchase_order TO authenticated;

-- Open shipments
CREATE OR REPLACE VIEW public.dashboard_shipment
WITH
   (security_invoker = TRUE) AS
SELECT
   s.id AS shipment_id,
   s.code,
   s.customer_id,
   s.customer_code,
   s.tenant_id,
   s.status,
   s.mode,
   s.etd,
   s.eta,
   (s.eta - current_date)::INT AS days_to_eta,
   coalesce(
      s.eta < current_date
      AND s.status IN ('planned', 'booked', 'loaded', 'in_transit', 'at_customs'),
      FALSE
   ) AS overdue,
   s.warehouse_name,
   s.dispute_deadline_at
FROM
   public.shipment_overview s
WHERE
   s.status NOT IN ('accepted', 'cancelled');

COMMENT ON VIEW public.dashboard_shipment IS 'The open shipments (neither accepted nor cancelled) of shipment_overview: codes, status, mode, etd, eta and days_to_eta (negative once passed), overdue (the ETA has passed and the shipment is still planned, booked, loaded, in transit or at customs), the delivery warehouse and the S16 dispute deadline.';

GRANT SELECT ON public.dashboard_shipment TO authenticated;
