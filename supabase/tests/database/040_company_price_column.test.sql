CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The product's company price (040): the column is company_price_eur on the product and on the
-- product list view, moesa_price_eur is gone, the S10 import writes the new column, and no product
-- change in the audit trail keeps the old key. What it writes is rolled back.
BEGIN;

SELECT plan(7);

SELECT has_column('public', 'product', 'company_price_eur', 'the product has company_price_eur');
SELECT hasnt_column('public', 'product', 'moesa_price_eur', 'the product has no moesa_price_eur');
SELECT has_column('public', 'product_with_evidence', 'company_price_eur', 'the product list reads company_price_eur');
SELECT hasnt_column('public', 'product_with_evidence', 'moesa_price_eur', 'the product list has no moesa_price_eur');

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'Atlas Danışmanlık')::TEXT, TRUE);

SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000000401', current_setting('test.tenant_id')::UUID, 'CPR', 'Company Price Trading',
        'trading_partner');

SELECT is(
    public.import_products($$[
        {"customer_code": "CPR", "sku": "CPR-001", "display_name": "Mop 40 cm", "company_price_eur": 4.25}
    ]$$::JSONB),
    '{"ok": true, "inserted": 1, "updated": 0}'::JSONB,
    'the import takes company_price_eur'
);

SELECT is(
    (SELECT p.company_price_eur FROM public.product_with_evidence p WHERE p.sku = 'CPR-001'),
    4.25::NUMERIC,
    'the imported price is in company_price_eur'
);

RESET ROLE;

SELECT is(
    (SELECT count(*)::INT FROM public.audit_log a
     WHERE a.table_schema = 'public' AND a.table_name = 'product'
         AND (a.old_data ? 'moesa_price_eur' OR a.new_data ? 'moesa_price_eur')),
    0,
    'no product change in the audit trail keeps moesa_price_eur'
);

SELECT * FROM finish();
ROLLBACK;
