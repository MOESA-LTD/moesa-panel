-- 055: masked api views for purchase orders and shipments. The purchase_order run creates
-- api.supplier(api.purchase_order) and api.purchase_order_by_supplier(api.supplier) because
-- api.supplier already exists.
SELECT private.enable_field_security (t)
FROM unnest(ARRAY['purchase_order', 'purchase_order_line', 'purchase_order_payment', 'purchase_order_update',
                  'shipment', 'shipment_event', 'shipment_line', 'shipment_purchase_order']) AS t;
