-- 065: list indexes for the newest-first lists of product and purchase_order (R10, Task 20b). The
-- app's lists and the field-security perf cases order them by created_at within the caller's tenants.
-- Under RLS the tenant condition is tenant_id = ANY (<scope InitPlan>), and on PostgreSQL 15 a btree
-- scan with an array condition on its leading column does not return rows in created_at order, so a
-- (tenant_id, created_at) index is not used for these lists. (created_at DESC) is: the newest 50 come
-- from a backward index scan with the tenant filter, instead of a sort over every row, and PostgREST's
-- embed laterals then run for those 50 rows only. No equivalent index existed.
CREATE INDEX IF NOT EXISTS idx_product_created ON public.product (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_order_created ON public.purchase_order (created_at DESC);
