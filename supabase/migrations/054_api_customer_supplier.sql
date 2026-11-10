-- 054: masked api views for the customer and supplier tables. product is regenerated afterwards so
-- the supplier relationships across the sensitive link (R4) exist now that api.supplier does.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['customer', 'customer_brand', 'customer_contact', 'customer_platform_account', 'customer_warehouse',
                  'supplier', 'supplier_contact']) AS t;
SELECT private.enable_field_security ('product');
