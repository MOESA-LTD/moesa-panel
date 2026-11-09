-- 065: list indexes for the newest-first lists of product and purchase_order (R10, Task 20b). The
-- app's lists and the field-security perf cases order them by created_at within the caller's tenants.
-- No equivalent index existed (product and purchase_order had (tenant_id, status) only).
-- Note (PostgreSQL 15): under RLS the tenant condition is tenant_id = ANY (<scope InitPlan>), and a
-- btree scan with an array condition on its leading column does not return rows in created_at order,
-- so the unfiltered newest-50 list still sorts; a query with tenant_id = <one tenant> uses the index.
CREATE INDEX IF NOT EXISTS idx_product_tenant_created ON public.product (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_order_tenant_created ON public.purchase_order (tenant_id, created_at DESC);
