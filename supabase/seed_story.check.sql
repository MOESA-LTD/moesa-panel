-- The smoke check of the development story seed (seed_story.sql), run by scripts/seed-story.mjs
-- after the story. Every check is one top-level query that returns no row when it holds, and a
-- row (check id, detail) when it fails; the script prints each row as "FAIL <id> <detail>" and
-- exits 1 on any. Only the checks start with "SELECT" at the start of a line (the script counts
-- them that way); everything runs in one transaction that is rolled back.
--
-- Helpers (pg_temp, gone with the session):
--   pg_temp.tenant(name)        the id of a tenant by display name, NULL when missing.
--   pg_temp.moesa()             MOESA LTD's id.
--   pg_temp.act_as(email, name) the claims and headers of that user in that tenant (local; no
--                               SET ROLE, so RLS stays off).
--   pg_temp.error_of(sql)       runs the statement and returns the error it raised, or
--                               'story_check_succeeded'; the write is undone either way.
--   pg_temp.enum_gaps(tbl, col) the values of an enum column (or enum array column) of
--                               public.<tbl> that no MOESA LTD row holds.
--
-- story_enum_column classifies every enum column of every public base table:
--   all      every value must occur in MOESA LTD (checked by enum.gap);
--   pending  will be 'all' once the task that produces its values is done;
--   exempt   not covered, with the reason.
-- A column nobody classified (a later migration added it) fails enum.unlisted.

BEGIN;

CREATE FUNCTION pg_temp.tenant (p_name TEXT) RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT t.id FROM public.tenant t WHERE t.display_name = p_name;
$$;

CREATE FUNCTION pg_temp.moesa () RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT pg_temp.tenant('MOESA LTD');
$$;

CREATE FUNCTION pg_temp.act_as (p_email TEXT, p_tenant_name TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_user UUID := (SELECT u.id FROM public.user u WHERE u.email = p_email);
    v_tenant UUID := pg_temp.tenant(p_tenant_name);
BEGIN
    IF v_user IS NULL OR v_tenant IS NULL THEN
        RAISE EXCEPTION 'story check: unknown user/tenant % / %', p_email, p_tenant_name;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::TEXT, TRUE);
    PERFORM set_config('request.headers', json_build_object('x-tenant-id', v_tenant, 'x-tenant-ids', v_tenant)::TEXT, TRUE);
END;
$$;

CREATE FUNCTION pg_temp.error_of (p_sql TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'story_check_succeeded';
EXCEPTION
    WHEN OTHERS THEN
        RETURN SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.enum_gaps (p_tbl TEXT, p_col TEXT) RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_type REGTYPE;
    v_is_array BOOLEAN;
    v_value TEXT;
    v_found BOOLEAN;
BEGIN
    SELECT coalesce(nullif(t.typelem, 0), t.oid)::REGTYPE, t.typelem <> 0
    INTO v_type, v_is_array
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = format('public.%I', p_tbl)::REGCLASS AND a.attname = p_col AND a.attnum > 0
      AND NOT a.attisdropped;

    IF v_type IS NULL THEN
        RAISE EXCEPTION 'story check: no column public.%.%', p_tbl, p_col;
    END IF;

    FOR v_value IN EXECUTE format('SELECT unnest(enum_range(NULL::%s))::TEXT', v_type) LOOP
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id = $1 AND %s)',
            p_tbl,
            CASE WHEN v_is_array THEN format('$2::%s = ANY (%I)', v_type, p_col)
                 ELSE format('%I = $2::%s', p_col, v_type) END
        ) INTO v_found USING pg_temp.moesa(), v_value;

        IF NOT v_found THEN
            RETURN NEXT v_value;
        END IF;
    END LOOP;
END;
$$;

CREATE TEMP TABLE story_enum_column (
    tbl TEXT NOT NULL,
    col TEXT NOT NULL,
    rule TEXT NOT NULL CHECK (rule IN ('all', 'pending', 'exempt')),
    note TEXT,
    PRIMARY KEY (tbl, col)
);

INSERT INTO story_enum_column (tbl, col, rule, note)
VALUES
    -- Task 2: customers and suppliers.
    ('customer', 'commercial_model', 'all', NULL),
    ('customer_warehouse', 'type', 'all', NULL),
    ('customer_platform_account', 'access', 'all', NULL),
    ('supplier', 'status', 'all', NULL),
    -- Task 3: products.
    ('product', 'status', 'pending', NULL),
    ('product', 'compliance_status', 'pending', NULL),
    -- Task 4: customer lifecycle, projects and tasks.
    ('customer', 'status', 'pending', NULL),
    ('project', 'type', 'pending', NULL),
    ('project', 'path', 'pending', NULL),
    ('project', 'status', 'pending', NULL),
    ('project_task', 'status', 'pending', NULL),
    -- Task 5: purchase orders.
    ('purchase_order', 'status', 'pending', NULL),
    ('purchase_order_payment', 'kind', 'pending', NULL),
    ('purchase_order_payment', 'paid_by', 'pending', NULL),
    -- Task 6: shipments.
    ('shipment', 'status', 'pending', NULL),
    ('shipment', 'mode', 'pending', NULL),
    -- Task 7: market cells.
    ('market_cell', 'status', 'pending', NULL),
    ('market_cell', 'compliance', 'pending', NULL),
    ('market_cell', 'stock_source', 'pending', NULL),
    ('market_cell', 'content_status', 'pending', NULL),
    -- Task 8: gates, incidents and change requests.
    ('project_gate', 'status', 'pending', NULL),
    ('incident', 'family', 'pending', NULL),
    ('incident', 'severity', 'pending', NULL),
    ('incident', 'status', 'pending', NULL),
    ('change_request', 'status', 'pending', NULL),
    ('change_request', 'source', 'pending', NULL),
    ('change_request', 'urgency', 'pending', NULL),
    ('change_request', 'change_kinds', 'pending', NULL),
    -- Task 9: documents and media.
    ('document', 'type', 'pending', NULL),
    ('document', 'status', 'pending', NULL),
    ('document', 'entity_type', 'pending', NULL),
    ('media_link', 'role', 'pending', NULL),
    -- Not covered.
    ('project_gate', 'code', 'exempt', 'G0-G7 come from the project trigger, every project has all'),
    ('project', 'current_phase', 'exempt', 'derived from the gates'),
    ('project_task', 'phase', 'exempt', 'copied from the task templates'),
    ('task_template', 'phase', 'exempt', 'reference data, not tenant rows'),
    ('incident', 'outcome', 'exempt', 'only some closed incidents carry one'),
    ('incident', 'root_cause', 'exempt', 'free choice per incident, no screen depends on each value'),
    ('incident', 'affected_parties', 'exempt', 'free choice per incident, no screen depends on each value'),
    ('incident', 'entity_type', 'exempt', 'covered through document.entity_type; incidents attach to a few kinds'),
    ('incident_deadline', 'kind', 'exempt', 'a sample of deadlines is enough'),
    ('incident_log', 'cost_payer', 'exempt', 'a sample of cost lines is enough'),
    ('change_request', 'cost_payer', 'exempt', 'a sample is enough'),
    ('change_request', 'affected_gate_code', 'exempt', 'a sample of gates is enough'),
    ('media_link', 'entity_type', 'exempt', 'media links go to products, orders, shipments and change requests'),
    ('permission', 'command', 'exempt', 'reference data, not tenant rows'),
    ('permission', 'kind', 'exempt', 'reference data, not tenant rows');

-- core.cast: the tenants and users the story runs as
SELECT 'core.cast', n FROM unnest(ARRAY['MOESA LTD', 'MOESA Europe', 'MOESA Trading GmbH']) n WHERE pg_temp.tenant(n) IS NULL;
-- enum.unlisted: an enum column nobody classified (a later migration added it)
SELECT 'enum.unlisted', a.attrelid::regclass || '.' || a.attname
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem
WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
  AND (t.typtype = 'e' OR e.typtype = 'e')
  AND NOT EXISTS (SELECT 1 FROM story_enum_column x WHERE x.tbl = c.relname AND x.col = a.attname);
-- enum.gap: a value of a covered column with no row in MOESA LTD
SELECT 'enum.gap', x.tbl || '.' || x.col || '=' || g FROM story_enum_column x, pg_temp.enum_gaps(x.tbl, x.col) g WHERE x.rule = 'all';

-- Task 2: customers, suppliers, settings
SELECT 'm1.tho_contract' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.document d ON d.id = c.contract_document_id AND d.type = 'contract'
  WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on <= current_date - 2 AND c.restricted_drive_url IS NOT NULL AND c.eu_responsible_person IS NOT NULL);
SELECT 'm1.contract_missing', k FROM unnest(ARRAY['LEA', 'KRN']) k WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.code = k AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on IS NULL);
SELECT 'm1.packages', p FROM unnest(ARRAY['A0', 'A2', 'D']) p WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.tenant_id = pg_temp.moesa() AND p = ANY (c.packages));
SELECT 'm1.contacts' WHERE (SELECT count(*) FROM public.customer_contact x JOIN public.customer c ON c.id = x.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT x.can_approve) < 3;
SELECT 'm1.default_warehouse' WHERE NOT EXISTS (SELECT 1 FROM public.customer_warehouse w JOIN public.customer c ON c.id = w.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT w.is_default);
SELECT 'm1.brand_pending' WHERE NOT EXISTS (SELECT 1 FROM public.customer_brand WHERE tenant_id = pg_temp.moesa() AND name = 'OKAEI Pro' AND registration_status = 'pending');
SELECT 'm2.contacts', s FROM unnest(ARRAY['TR1', 'CN1']) s WHERE NOT EXISTS (SELECT 1 FROM public.supplier_contact x JOIN public.supplier p ON p.id = x.supplier_id WHERE p.code = s AND p.tenant_id = pg_temp.moesa());
SELECT 'm2.documents' WHERE (SELECT count(DISTINCT d.type) FROM public.document d WHERE d.tenant_id = pg_temp.moesa() AND d.entity_type = 'supplier' AND d.type IN ('certificate', 'contract')) < 2;
SELECT 'm2.rating' WHERE NOT EXISTS (SELECT 1 FROM public.supplier WHERE tenant_id = pg_temp.moesa() AND code = 'CN1' AND rating = 2 AND last_audit_on IS NOT NULL);
SELECT 'core.trading_media_cap' WHERE (SELECT value FROM public.setting WHERE tenant_id = pg_temp.tenant('MOESA Trading GmbH') AND key = 'media_max_mb') IS DISTINCT FROM '5'::JSONB;
SELECT 'feed.step02_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'customer' AND now()::DATE - created_at::DATE > 7);

ROLLBACK;
