DROP VIEW if EXISTS public.dashboard_best_selling_products;

CREATE OR REPLACE VIEW public.dashboard_best_selling_products
WITH
   (security_invoker = TRUE) AS
SELECT
   p.id AS product_id,
   r.record_type,
   r.record_status,
   r.currency_code,
   COUNT(*) AS record_count,
   SUM(r.quantity) AS sum_quantity,
   AVG(r.quantity) AS avg_quantity,
   SUM(r.bid) AS sum_bid,
   AVG(r.bid) AS avg_bid,
   SUM(r.bid_discount) AS sum_discount,
   AVG(r.bid_discount) AS avg_discount,
   SUM(r.tax) AS sum_tax,
   AVG(r.tax) AS avg_tax
FROM
   public.record r
   JOIN public.stock_view s ON r.stock_id = s.id
   JOIN public.product p ON s.product_id = p.id
GROUP BY
   p.id,
   r.currency_code,
   r.record_type,
   r.record_status;

DROP VIEW if EXISTS public.dashboard_product_category_sales_summary;

CREATE OR REPLACE VIEW public.dashboard_product_category_sales_summary
WITH
   (security_invoker = TRUE) AS
SELECT
   r.tenant_id,
   c.id AS category_id,
   c.display_name AS category_name,
   COUNT(*) AS record_count,
   SUM(r.quantity) AS total_quantity,
   SUM(r.bid) AS total_bid,
   SUM(r.bid_discount) AS total_discount,
   SUM(r.tax) AS total_tax,
   ROUND(AVG(r.quantity), 2) AS avg_quantity,
   ROUND(AVG(r.bid), 2) AS avg_bid,
   ROUND(AVG(r.bid_discount), 2) AS avg_discount,
   ROUND(AVG(r.tax), 2) AS avg_tax,
   CASE
      WHEN SUM(r.bid) > 0 THEN ROUND(SUM(r.bid_discount) / SUM(r.bid) * 100, 2)
      ELSE 0
   END AS discount_rate_pct,
   CASE
      WHEN SUM(r.bid) > 0 THEN ROUND(SUM(r.tax) / SUM(r.bid) * 100, 2)
      ELSE 0
   END AS tax_rate_pct,
   COUNT(*) FILTER (
      WHERE
         r.record_status = 'done'
   ) AS done_count,
   CASE
      WHEN COUNT(*) > 0 THEN ROUND(
         COUNT(*) FILTER (
            WHERE
               r.record_status = 'done'
         )::DECIMAL / COUNT(*) * 100,
         2
      )
      ELSE 0
   END AS fulfillment_rate_pct
FROM
   public.record r
   JOIN public.product_categories pc ON pc.product_id = (
      SELECT
         s.product_id
      FROM
         public.stock s
      WHERE
         s.id = r.stock_id
      LIMIT
         1
   )
   JOIN public.product_category c ON c.id = pc.category_id
WHERE
   r.record_type = 'sale'
GROUP BY
   r.tenant_id,
   c.id,
   c.display_name
ORDER BY
   total_quantity DESC;

