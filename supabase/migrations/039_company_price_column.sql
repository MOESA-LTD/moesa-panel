-- The product's selling price is named after one operating company; the panel serves any company:
-- moesa_price_eur becomes company_price_eur (the price the company sells the product at, in EUR).
-- The column was created in 019_products.sql; the rename reaches what refers to it:
--
-- product                The column, renamed in place: its values, grants and policies stay.
-- product_with_evidence  The product list view (025) selects every product column: its column of
--                        the same name is renamed too, so the list reads company_price_eur.
-- import_products        The S10 import (020) names the columns a row may set: recreated with
--                        the new name. The CSV header of the S10 template stays moesa_fiyat_eur;
--                        the client maps it to company_price_eur.
-- audit_log              The product rows recorded before the rename keep their values under the
--                        old key: the key is renamed so the history shows them under the new
--                        field and a revert of such a change still matches the row.

ALTER TABLE public.product RENAME COLUMN moesa_price_eur TO company_price_eur;

ALTER VIEW public.product_with_evidence RENAME COLUMN moesa_price_eur TO company_price_eur;

COMMENT ON COLUMN public.product.company_price_eur IS 'The price the company sells the product at, in EUR (S10 header moesa_fiyat_eur).';

-- The import of 020, unchanged but for the column name in value_columns.
CREATE OR REPLACE FUNCTION public.import_products (rows JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET
   search_path = '' AS $$
DECLARE
    -- The product columns a row may set, in table order. The supplier comes as supplier_code, the
    -- parent as parent_sku.
    value_columns CONSTANT TEXT[] := ARRAY[
        'display_name', 'variant_label', 'category', 'brand', 'gtin', 'gs1_prefix_owner',
        'supplier_product_code', 'manufacturer_art_no', 'status', 'golden_sample_on',
        'golden_sample_locations', 'is_hazmat', 'compliance_status', 'eu_responsible_person',
        'hs_code', 'origin_country', 'unit_dims_mm', 'unit_net_g', 'pack_qty', 'pack_dims_mm',
        'pack_gross_g', 'carton_pack_qty', 'carton_dims_mm', 'carton_net_kg', 'carton_gross_kg',
        'pallet_carton_qty', 'pallet_type', 'lot_rule', 'purchase_price', 'purchase_currency',
        'purchase_incoterm', 'landed_cost_eur', 'landed_cost_on', 'target_price_eur',
        'company_price_eur', 'price_list_version', 'notes'
    ];
    -- Columns that cannot be empty: an empty value keeps the product's own (or the default).
    not_null_columns CONSTANT TEXT[] := ARRAY['status', 'is_hazmat', 'compliance_status'];
    written_columns CONSTANT TEXT[] := value_columns || ARRAY['supplier_id'];
    defaults CONSTANT JSONB := '{"status": "concept", "is_hazmat": false, "compliance_status": "none"}';
    errors JSONB := '[]';
    sku_duplicates BIGINT[];
    gtin_duplicates BIGINT[];
    item JSONB;
    n BIGINT;
    row_values JSONB;
    customer UUID;
    tenant UUID;
    holder TEXT;
    column_name TEXT;
    written INT;
    inserted INT := 0;
    updated INT := 0;
BEGIN
    IF jsonb_typeof(import_products.rows) IS DISTINCT FROM 'array' THEN
        RAISE SQLSTATE 'PGRST' USING
            MESSAGE = json_build_object('code', 'P0001', 'message', 'rows_must_be_an_array')::TEXT,
            DETAIL = json_build_object('status', 400, 'headers', json_build_object())::TEXT;
    END IF;

    -- The rows repeating an earlier row's (customer, sku), or an earlier active row's GTIN.
    SELECT array_agg(d.n) INTO sku_duplicates
    FROM (
        SELECT e.n, row_number() OVER (PARTITION BY e.v ->> 'customer_code', e.v ->> 'sku' ORDER BY e.n) AS seen
        FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n)
        WHERE coalesce(e.v ->> 'sku', '') <> ''
    ) d
    WHERE d.seen > 1;

    SELECT array_agg(d.n) INTO gtin_duplicates
    FROM (
        SELECT e.n, row_number() OVER (PARTITION BY e.v ->> 'gtin' ORDER BY e.n) AS seen
        FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n)
        WHERE e.v ->> 'gtin' IS NOT NULL AND coalesce(e.v ->> 'status', '') <> 'archived'
    ) d
    WHERE d.seen > 1;

    -- 1. Check every row.
    FOR item, n IN SELECT e.v, e.n FROM jsonb_array_elements(import_products.rows) WITH ORDINALITY AS e (v, n) LOOP
        -- One customer of that code: of several tenants read together, none is guessed.
        SELECT c.id, c.tenant_id INTO customer, tenant
        FROM public.customer c
        WHERE c.code = item ->> 'customer_code'
            AND (SELECT count(*) FROM public.customer o WHERE o.code = c.code) = 1;

        IF customer IS NULL THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'customer_code', 'code', 'customer_unknown');
        END IF;

        IF coalesce(item ->> 'sku', '') = '' THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'sku', 'code', 'invalid_value');
        ELSIF n = ANY (sku_duplicates) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'sku', 'code', 'sku_duplicate');
        END IF;

        IF item ->> 'supplier_code' IS NOT NULL AND customer IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.supplier s WHERE s.tenant_id = tenant AND s.code = item ->> 'supplier_code'
        ) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'supplier_code', 'code', 'supplier_unknown');
        END IF;

        -- The parent is another product of the same customer, already saved or in the file.
        IF item ->> 'parent_sku' IS NOT NULL AND (
            item ->> 'parent_sku' = item ->> 'sku'
            OR NOT (
                EXISTS (SELECT 1 FROM public.product p WHERE p.customer_id = customer AND p.sku = item ->> 'parent_sku')
                OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(import_products.rows) AS e (v)
                    WHERE e.v ->> 'customer_code' = item ->> 'customer_code' AND e.v ->> 'sku' = item ->> 'parent_sku'
                )
            )
        ) THEN
            errors := errors || jsonb_build_object('row', n, 'field', 'parent_sku', 'code', 'parent_unknown');
        END IF;

        IF item ->> 'gtin' IS NOT NULL THEN
            -- The GS1 check of private.gtin_valid, which the caller cannot call (schema private):
            -- 8, 12, 13 or 14 digits, the last the mod-10 check digit of the others weighted 3, 1, …
            IF item ->> 'gtin' !~ '^([0-9]{8}|[0-9]{12,14})$' OR (
                SELECT (10 - sum(substr(item ->> 'gtin', length(item ->> 'gtin') - i, 1)::INT * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END) % 10) % 10
                FROM generate_series(1, length(item ->> 'gtin') - 1) AS i
            ) <> substr(item ->> 'gtin', length(item ->> 'gtin'), 1)::INT THEN
                errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_invalid');
            ELSIF n = ANY (gtin_duplicates) THEN
                errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_duplicate');
            ELSIF coalesce(item ->> 'status', '') <> 'archived' THEN
                -- Only the caller's own products are visible here; the unique index guards the rest.
                SELECT p.sku INTO holder
                FROM public.product p
                WHERE p.gtin = item ->> 'gtin' AND p.status <> 'archived'
                    AND NOT (p.customer_id IS NOT DISTINCT FROM customer AND p.sku = item ->> 'sku')
                LIMIT 1;

                IF holder IS NOT NULL THEN
                    errors := errors || jsonb_build_object('row', n, 'field', 'gtin', 'code', 'gtin_in_use', 'sku', holder);
                END IF;
            END IF;
        END IF;

        -- Values the columns cannot hold (enums, numbers, dates, booleans, currency codes): read
        -- as a whole first, then column by column to name the ones that fail.
        row_values := coalesce((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(item) AS e WHERE e.key = ANY (value_columns)), '{}');
        BEGIN
            PERFORM jsonb_populate_record(NULL::public.product, row_values);
        EXCEPTION
            WHEN data_exception OR integrity_constraint_violation THEN
                FOREACH column_name IN ARRAY value_columns LOOP
                    CONTINUE WHEN NOT row_values ? column_name;
                    BEGIN
                        PERFORM jsonb_populate_record(NULL::public.product, jsonb_build_object(column_name, row_values -> column_name));
                    EXCEPTION
                        WHEN data_exception OR integrity_constraint_violation THEN
                            errors := errors || jsonb_build_object('row', n, 'field', column_name, 'code', 'invalid_value');
                    END;
                END LOOP;
        END;
    END LOOP;

    IF jsonb_array_length(errors) > 0 THEN
        RETURN jsonb_build_object('ok', FALSE, 'errors', errors);
    END IF;

    -- 2. Write every row: the product of the same (customer, sku) is updated, otherwise one is made.
    FOR item IN SELECT e.v FROM jsonb_array_elements(import_products.rows) AS e (v) LOOP
        SELECT c.id, c.tenant_id INTO customer, tenant
        FROM public.customer c
        WHERE c.code = item ->> 'customer_code';

        row_values := coalesce((
            SELECT jsonb_object_agg(e.key, e.value)
            FROM jsonb_each(item) AS e
            WHERE e.key = ANY (value_columns)
                AND NOT (e.key = ANY (not_null_columns) AND jsonb_typeof(e.value) = 'null')
        ), '{}');

        IF item ? 'supplier_code' THEN
            row_values := row_values || jsonb_build_object('supplier_id', (
                SELECT s.id FROM public.supplier s WHERE s.tenant_id = tenant AND s.code = item ->> 'supplier_code'
            ));
        END IF;

        EXECUTE format(
            'UPDATE public.product p SET (%s) = (SELECT %s FROM jsonb_populate_record(p, $1) AS r) WHERE p.customer_id = $2 AND p.sku = $3',
            array_to_string(written_columns, ', '),
            'r.' || array_to_string(written_columns, ', r.')
        )
        USING row_values, customer, item ->> 'sku';
        GET DIAGNOSTICS written = ROW_COUNT;

        IF written > 0 THEN
            updated := updated + 1;
        ELSE
            EXECUTE format(
                'INSERT INTO public.product (tenant_id, customer_id, sku, %s) SELECT $2, $3, $4, %s FROM jsonb_populate_record(jsonb_populate_record(NULL::public.product, $5), $1) AS r',
                array_to_string(written_columns, ', '),
                'r.' || array_to_string(written_columns, ', r.')
            )
            USING row_values, tenant, customer, item ->> 'sku', defaults;
            inserted := inserted + 1;
        END IF;
    END LOOP;

    -- 3. Link the variants to their parents, now that every row of the file is saved. An empty
    -- parent_sku unlinks the product.
    UPDATE public.product c
    SET parent_id = parent.id
    FROM jsonb_array_elements(import_products.rows) AS e (v)
    JOIN public.customer cu ON cu.code = e.v ->> 'customer_code'
    LEFT JOIN public.product parent ON parent.customer_id = cu.id AND parent.sku = e.v ->> 'parent_sku'
    WHERE e.v ? 'parent_sku'
        AND c.customer_id = cu.id
        AND c.sku = e.v ->> 'sku'
        AND c.parent_id IS DISTINCT FROM parent.id;

    RETURN jsonb_build_object('ok', TRUE, 'inserted', inserted, 'updated', updated);
END;
$$;

REVOKE ALL ON FUNCTION public.import_products (JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.import_products (JSONB) TO authenticated;

-- The product changes recorded before the rename.
UPDATE public.audit_log
SET
   old_data = CASE
      WHEN old_data ? 'moesa_price_eur'
         THEN (old_data - 'moesa_price_eur') || jsonb_build_object('company_price_eur', old_data -> 'moesa_price_eur')
      ELSE old_data
   END,
   new_data = CASE
      WHEN new_data ? 'moesa_price_eur'
         THEN (new_data - 'moesa_price_eur') || jsonb_build_object('company_price_eur', new_data -> 'moesa_price_eur')
      ELSE new_data
   END
WHERE table_schema = 'public'
   AND table_name = 'product'
   AND (old_data ? 'moesa_price_eur' OR new_data ? 'moesa_price_eur');
