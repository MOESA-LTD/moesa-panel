-- The attack list, run against a relation {V} as whoever is signed in. Returns "label|result" rows.
CREATE OR REPLACE FUNCTION public.spike_suite (v TEXT, tag TEXT) RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
    t RECORD;
    s CONSTANT TEXT := 'sku = ''SPIKE-SECRET''';
BEGIN
    FOR t IN SELECT * FROM (VALUES
        (1, 'T0  positive control (row visible)', 'Q', format('SELECT sku, display_name FROM %s WHERE %s', v, s)),
        (2, 'T1  masked columns', 'Q', format('SELECT purchase_price, purchase_currency, purchase_incoterm, landed_cost_eur, landed_cost_on, company_price_eur, supplier_id, supplier_product_code, notes FROM %s WHERE %s', v, s)),
        (3, 'T1b whole-row to_jsonb', 'Q', format('SELECT to_jsonb(x) ->> ''purchase_price'' AS pp, to_jsonb(x) ->> ''notes'' AS n FROM %s x WHERE %s', v, s)),
        (4, 'T1c select * ', 'Q', format('SELECT count(*) FROM (SELECT * FROM %s WHERE %s) z', v, s)),
        (5, 'T2a filter purchase_price > 10', 'Q', format('SELECT count(*) FROM %s WHERE %s AND purchase_price > 10', v, s)),
        (6, 'T2b filter purchase_price = 12.5', 'Q', format('SELECT count(*) FROM %s WHERE %s AND purchase_price = 12.5', v, s)),
        (7, 'T2c ORDER BY purchase_price (non-null values seen)', 'Q', format('SELECT array_agg(sku ORDER BY purchase_price DESC) FILTER (WHERE purchase_price IS NOT NULL) FROM %s', v)),
        (8, 'T2d leaky fn in WHERE (reset)', 'Q', 'SELECT set_config(''spike.leaked'', '''', TRUE)'),
        (9, 'T2d leaky fn in WHERE', 'Q', format('SELECT count(*) FROM %s WHERE spike_leak(purchase_price) AND spike_leak(notes)', v)),
        (10, 'T2d leaky fn: values seen', 'Q', 'SELECT current_setting(''spike.leaked'', TRUE)'),
        (11, 'T3  count FILTER / aggregates', 'Q', format('SELECT count(*) FILTER (WHERE purchase_price IS NOT NULL) AS n, sum(purchase_price) AS s, max(landed_cost_eur) AS m FROM %s', v)),
        (12, 'T4  UPDATE masked column', 'D', format('UPDATE %s SET purchase_price = 1 WHERE %s RETURNING sku', v, s)),
        (13, 'T4b UPDATE masked column to NULL (wipe)', 'D', format('UPDATE %s SET purchase_price = NULL, notes = NULL WHERE %s RETURNING sku', v, s)),
        (14, 'T4c UPDATE allowed column only', 'D', format('UPDATE %s SET display_name = ''renamed'' WHERE %s RETURNING sku, display_name', v, s)),
        (15, 'T5  INSERT with masked column', 'D', format('INSERT INTO %s (tenant_id, customer_id, sku, purchase_price) VALUES (''72fd7328-1c1c-4694-b564-2510741ce128'', ''5eed0002-0000-4000-8000-000000000001'', ''SPIKE-INS-%s'', 3) RETURNING sku, purchase_price', v, tag)),
        (16, 'T5b INSERT without masked column', 'D', format('INSERT INTO %s (tenant_id, customer_id, sku) VALUES (''72fd7328-1c1c-4694-b564-2510741ce128'', ''5eed0002-0000-4000-8000-000000000001'', ''SPIKE-OK-%s'') RETURNING sku, purchase_price', v, tag)),
        (17, 'T6a division-by-zero oracle 1/(pp-12.5)', 'Q', format('SELECT 1 / (purchase_price - 12.5) FROM %s WHERE %s', v, s)),
        (18, 'T6b cast error echoes value', 'Q', format('SELECT (''x'' || notes)::INT FROM %s WHERE %s', v, s)),
        (19, 'T6c UPDATE SET expr oracle', 'D', format('UPDATE %s SET display_name = (1 / (purchase_price - 12.5))::TEXT WHERE %s RETURNING sku', v, s)),
        (20, 'T6d allowed col set from masked col, cast error', 'D', format('UPDATE %s SET pack_qty = notes::INT WHERE %s RETURNING sku', v, s)),
        (21, 'T7  RETURNING masked cols on allowed UPDATE', 'D', format('UPDATE %s SET display_name = ''r2'' WHERE %s RETURNING purchase_price, notes, landed_cost_eur', v, s)),
        (22, 'T7b RETURNING * on allowed UPDATE', 'D', format('UPDATE %s x SET display_name = ''r3'' WHERE %s RETURNING to_jsonb(x) ->> ''purchase_price''', v, s)),
        (23, 'T8a join to customer', 'Q', format('SELECT v.sku, c.code, v.purchase_price, v.notes FROM %s v JOIN public.customer c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id WHERE v.%s', v, s)),
        (24, 'T8b existing view product_with_evidence', 'Q', 'SELECT purchase_price, notes FROM public.product_with_evidence WHERE sku = ''SPIKE-SECRET'''),
        (25, 'T8c direct base table public.product', 'Q', 'SELECT purchase_price, notes FROM public.product WHERE sku = ''SPIKE-SECRET'''),
        (26, 'T10 audit_log trail of the product', 'Q', 'SELECT new_data ->> ''purchase_price'' FROM public.audit_log WHERE table_name = ''product'' AND new_data ->> ''sku'' = ''SPIKE-SECRET'' LIMIT 2'),
        (27, 'T11 cross-tenant rows visible (E secret)', 'Q', format('SELECT count(*) FROM %s WHERE sku = ''SPIKE-EU''', v))
    ) AS x (n, label, kind, q) ORDER BY n LOOP
        RETURN NEXT tag || '|' || t.label || '|' || CASE WHEN t.kind = 'Q' THEN spike_try(t.q) ELSE spike_try_dml(t.q) END;
    END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.spike_suite (TEXT, TEXT) TO PUBLIC;
