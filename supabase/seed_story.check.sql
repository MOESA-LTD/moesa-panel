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
--   pg_temp.has_rows(tbl)       whether public.<tbl> has a MOESA LTD row.
--   pg_temp.refusal_as, pg_temp.move_error, pg_temp.copy_error (Task 10) the transfer refusal
--                               a user meets, asked of the server's own logic (see there).
--
-- story_enum_column classifies every enum column of every public base table:
--   all      every value must occur in MOESA LTD (checked by enum.gap);
--   pending  will be 'all' once the task that produces its values is done;
--   exempt   not covered, with the reason.
-- A column nobody classified (a later migration added it) fails enum.unlisted.

BEGIN;
-- Today as the story saw it: the script sets story.today (the date before the story's transaction
-- began) so a run across midnight UTC does not fail the date checks; run by hand it is current_date.
CREATE FUNCTION pg_temp.today () RETURNS DATE LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('story.today', TRUE), '')::date, current_date);
$$;


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

CREATE FUNCTION pg_temp.has_rows (p_tbl TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id = $1)', p_tbl) INTO v_found USING pg_temp.moesa();
    RETURN v_found;
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
    ('product', 'status', 'all', NULL),
    ('product', 'compliance_status', 'all', NULL),
    -- Task 4: customer lifecycle, projects and tasks.
    ('customer', 'status', 'all', NULL),
    ('project', 'type', 'all', NULL),
    ('project', 'path', 'all', NULL),
    ('project', 'status', 'all', NULL),
    ('project_task', 'status', 'all', NULL),
    -- Task 5: purchase orders.
    ('purchase_order', 'status', 'all', NULL),
    ('purchase_order_payment', 'kind', 'all', NULL),
    ('purchase_order_payment', 'paid_by', 'all', NULL),
    -- Task 6: shipments.
    ('shipment', 'status', 'all', NULL),
    ('shipment', 'mode', 'all', NULL),
    -- Task 7: market cells.
    ('market_cell', 'status', 'all', NULL),
    ('market_cell', 'compliance', 'all', NULL),
    ('market_cell', 'stock_source', 'all', NULL),
    ('market_cell', 'content_status', 'all', NULL),
    ('market_cell', 'listing_state', 'all', NULL),
    -- Task 8: gates, incidents and change requests.
    ('project_gate', 'status', 'all', NULL),
    ('incident', 'family', 'all', NULL),
    ('incident', 'severity', 'all', NULL),
    ('incident', 'status', 'all', NULL),
    ('change_request', 'status', 'all', NULL),
    ('change_request', 'source', 'all', NULL),
    ('change_request', 'urgency', 'all', NULL),
    ('change_request', 'change_kinds', 'all', NULL),
    -- Task 9: documents and media.
    ('document', 'type', 'all', NULL),
    ('document', 'status', 'all', NULL),
    ('document', 'entity_type', 'all', NULL),
    ('media_link', 'role', 'all', NULL),
    -- Not covered.
    ('project_gate', 'code', 'exempt', 'G0-G7 come from the project trigger, every project has all'),
    ('project', 'current_phase', 'exempt', 'derived from the gates'),
    ('project_task', 'phase', 'exempt', 'copied from the task templates'),
    ('task_template', 'phase', 'exempt', 'reference data, not tenant rows'),
    ('incident', 'outcome', 'exempt', 'only some closed incidents carry one'),
    ('incident', 'root_cause', 'exempt', 'free choice per incident, no screen depends on each value'),
    ('incident', 'affected_parties', 'exempt', 'free choice per incident, no screen depends on each value'),
    ('incident', 'entity_type', 'exempt', 'which kinds of record (order, shipment, project, ...) the incidents hang on is not checked; only the incident rows themselves are'),
    ('incident_deadline', 'kind', 'exempt', 'a sample of deadlines is enough'),
    ('incident_log', 'cost_payer', 'exempt', 'a sample of cost lines is enough'),
    ('change_request', 'cost_payer', 'exempt', 'a sample is enough'),
    ('change_request', 'affected_gate_code', 'exempt', 'a sample of gates is enough'),
    ('media_link', 'entity_type', 'exempt', 'media links go to products, orders, shipments and change requests'),
    ('permission', 'command', 'exempt', 'reference data, not tenant rows'),
    ('permission', 'kind', 'exempt', 'reference data, not tenant rows'),
    ('customer_platform_account', 'api_connection', 'exempt', 'revoked comes only from Amazon (invalid_grant)'),
    ('listing_submission', 'kind', 'exempt', 'API-driven; the story holds create'),
    ('listing_submission', 'status', 'exempt', 'API-driven; the story holds done, invalid and processing');

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
SELECT 'm1.tho_contract' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.document d ON d.id = c.contract_document_id AND d.type = 'contract' AND d.status = 'signed'
  WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on <= pg_temp.today() - 2 AND c.restricted_drive_url IS NOT NULL AND c.eu_responsible_person IS NOT NULL);
SELECT 'm1.contract_missing', k FROM unnest(ARRAY['LEA', 'KRN']) k WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.code = k AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on IS NULL);
SELECT 'm1.packages', p FROM unnest(ARRAY['A0', 'A2', 'D']) p WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.tenant_id = pg_temp.moesa() AND p = ANY (c.packages));
SELECT 'm1.contacts' WHERE (SELECT count(*) FROM public.customer_contact x JOIN public.customer c ON c.id = x.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT x.can_approve) < 3;
SELECT 'm1.default_warehouse' WHERE NOT EXISTS (SELECT 1 FROM public.customer_warehouse w JOIN public.customer c ON c.id = w.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT w.is_default);
SELECT 'm1.brand_pending' WHERE NOT EXISTS (SELECT 1 FROM public.customer_brand WHERE tenant_id = pg_temp.moesa() AND name = 'OKAEI Pro' AND registration_status = 'pending');
SELECT 'm2.contacts', s FROM unnest(ARRAY['TR1', 'CN1']) s WHERE NOT EXISTS (SELECT 1 FROM public.supplier_contact x JOIN public.supplier p ON p.id = x.supplier_id WHERE p.code = s AND p.tenant_id = pg_temp.moesa());
SELECT 'm1.krn' WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.moesa() AND c.country = 'Austria')
   OR NOT EXISTS (SELECT 1 FROM public.customer_warehouse w JOIN public.customer c ON c.id = w.customer_id WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.moesa() AND w.city = 'Wien')
   OR (SELECT count(*) FROM public.customer_platform_account a JOIN public.customer c ON c.id = a.customer_id WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.moesa() AND a.platform_id IN ('bol', 'kaufland')) <> 2;
SELECT 'm2.tr1_terms' WHERE NOT EXISTS (SELECT 1 FROM public.supplier WHERE tenant_id = pg_temp.moesa() AND code = 'TR1' AND storage_fee_rule IS NOT NULL AND late_payment_penalty IS NOT NULL);
SELECT 'm2.supplier_states', s.c FROM (VALUES ('CN3', 'candidate'), ('TR3', 'suspended')) s (c, st) WHERE NOT EXISTS (SELECT 1 FROM public.supplier p WHERE p.tenant_id = pg_temp.moesa() AND p.code = s.c AND p.status = s.st::public.supplier_status);
SELECT 'm2.documents' WHERE (SELECT count(DISTINCT d.type) FROM public.document d WHERE d.tenant_id = pg_temp.moesa() AND d.entity_type = 'supplier' AND d.type IN ('certificate', 'contract')) < 2;
SELECT 'm2.rating' WHERE NOT EXISTS (SELECT 1 FROM public.supplier WHERE tenant_id = pg_temp.moesa() AND code = 'CN1' AND rating = 2 AND last_audit_on IS NOT NULL);
SELECT 'core.trading_media_cap' WHERE (SELECT value FROM public.setting WHERE tenant_id = pg_temp.tenant('MOESA Trading GmbH') AND key = 'media_max_mb') IS DISTINCT FROM '5'::JSONB;
SELECT 'feed.step02_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'customer' AND now()::DATE - created_at::DATE > 7);

-- Task 3: products, specs, product documents
SELECT 'm3.variant_tree' WHERE (SELECT count(*) FROM public.product c JOIN public.product p ON p.id = c.parent_id WHERE p.sku = 'THO-MOP40-2P' AND p.tenant_id = pg_temp.moesa()) < 2;
SELECT 'm3.archived_reuses_gtin' WHERE (SELECT count(*) FROM public.product WHERE gtin = '4260696025800' AND tenant_id = pg_temp.moesa()) < 2;
SELECT 'm3.hazmat' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE sku = 'THO-TIPS-6-50' AND tenant_id = pg_temp.moesa() AND is_hazmat AND hs_code IS NOT NULL AND origin_country IS NOT NULL);
SELECT 'm3.dimensions' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE sku = 'THO-MOP40-2P' AND tenant_id = pg_temp.moesa() AND unit_dims_mm IS NOT NULL AND carton_dims_mm IS NOT NULL AND pallet_carton_qty IS NOT NULL);
SELECT 'm3.second_customer' WHERE (SELECT count(*) FROM public.product p JOIN public.customer c ON c.id = p.customer_id WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.moesa()) < 2;
SELECT 'm4.spec_superseded' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet' AND d.version = 1 AND d.status = 'superseded')
   OR NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet' AND d.version = 2 AND d.status = 'signed');
SELECT 'm3.evidence_mix' WHERE NOT EXISTS (SELECT 1 FROM public.product_evidence e JOIN public.product p ON p.id = e.product_id WHERE p.sku = 'THO-TIPS-6-50' AND NOT e.has_signed_spec)
   OR NOT EXISTS (SELECT 1 FROM public.product_evidence e JOIN public.product p ON p.id = e.product_id WHERE p.sku = 'THO-MOP40-3P' AND e.has_signed_spec);
-- box.unsigned_skus / box.incomplete_compliance: a story SKU is one the box counts (an active product, neither
-- concept nor archived, of the customer's row), not only a seed.sql one.
SELECT 'box.unsigned_skus' WHERE NOT EXISTS (SELECT 1 FROM public.product_evidence e WHERE e.tenant_id = pg_temp.moesa() AND e.sku = 'THO-MOP40-4P' AND e.status NOT IN ('archived', 'concept') AND NOT e.has_signed_spec)
   OR NOT EXISTS (SELECT 1 FROM public.dashboard_product_evidence WHERE tenant_id = pg_temp.moesa() AND customer_code = 'THO' AND unsigned_sku_count > 0);
SELECT 'box.incomplete_compliance' WHERE NOT EXISTS (SELECT 1 FROM public.product_evidence e WHERE e.tenant_id = pg_temp.moesa() AND e.sku = 'THO-MOP40-3P' AND e.status NOT IN ('archived', 'concept') AND NOT e.compliance_complete)
   OR NOT EXISTS (SELECT 1 FROM public.dashboard_product_evidence WHERE tenant_id = pg_temp.moesa() AND customer_code = 'THO' AND active_sku_count > compliance_complete_count);
SELECT 'm4.tips_compliance_docs' WHERE (SELECT count(DISTINCT d.type) FROM public.document d JOIN public.product p ON p.id = d.entity_id AND d.entity_type = 'product' WHERE p.sku = 'THO-TIPS-6-50' AND p.tenant_id = pg_temp.moesa() AND d.type IN ('sds', 'doc_of_conformity', 'test_report') AND d.is_signed AND d.status IN ('signed', 'approved')) < 3;
SELECT 'm4.old_certificate' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id AND d.entity_type = 'product' WHERE p.sku = 'THO-CONES-100' AND p.tenant_id = pg_temp.moesa() AND d.type = 'certificate' AND d.status = 'signed' AND d.is_signed AND d.issued_on < pg_temp.today() - 365);
SELECT 'm4.no_spec' WHERE EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id AND d.entity_type = 'product' WHERE p.sku = 'THO-MOP40-4P' AND p.tenant_id = pg_temp.moesa() AND d.type = 'spec_sheet')
   OR NOT EXISTS (SELECT 1 FROM public.product p WHERE p.sku = 'THO-MOP40-4P' AND p.tenant_id = pg_temp.moesa());
SELECT 'm4.draft_spec' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id AND d.entity_type = 'product' WHERE p.sku = 'THO-TIPS-6-50' AND p.tenant_id = pg_temp.moesa() AND d.type = 'spec_sheet' AND d.status = 'draft');
SELECT 'feed.step03_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'product' AND now()::DATE - created_at::DATE > 7);

-- Task 4: projects, phases, gates without a PI rule, tasks
SELECT 'core.encoding' WHERE NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000001' AND display_name = U&'OKAEI f\0131r\00E7a private label');
SELECT 'm5.pilot_on_g1' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending g WHERE g.project_display_name = 'Mop ailesi çok ülke pilotu' AND g.gate_code = 'G1' AND g.needs_management);
SELECT 'm5.pilot_blocking_task' WHERE NOT EXISTS (SELECT 1 FROM public.project_task t JOIN public.project p ON p.id = t.project_id WHERE p.display_name = 'Mop ailesi çok ülke pilotu' AND t.blocks_gate AND t.status <> 'done' AND t.phase <= public.phase_before('G1'));
SELECT 'm5.pl_passed_with_approval' WHERE (SELECT count(*) FROM public.project_gate g WHERE g.project_id = '5eed0004-0000-4000-8000-000000000001' AND g.status = 'passed' AND (NOT g.needs_customer_approval OR g.approval_document_id IS NOT NULL)) < 2;
SELECT 'm5.task_states', s FROM unnest(ARRAY['todo', 'doing', 'done', 'blocked']::public.task_status[]) s WHERE NOT EXISTS (SELECT 1 FROM public.project_task WHERE tenant_id = pg_temp.moesa() AND status = s);
SELECT 'm5.task_unassigned' WHERE NOT EXISTS (SELECT 1 FROM public.project_task t JOIN public.project p ON p.id = t.project_id AND p.status = 'active' WHERE t.tenant_id = pg_temp.moesa() AND t.assignee_id IS NULL AND t.status <> 'done');
SELECT 'box.tasks_overdue' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_task_due WHERE tenant_id = pg_temp.moesa() AND overdue);
SELECT 'box.tasks_due_soon' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_task_due WHERE tenant_id = pg_temp.moesa() AND NOT overdue AND days_left BETWEEN 0 AND 5);
SELECT 'box.gates_management' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND needs_management);
SELECT 'box.gates_customer' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND NOT needs_management AND needs_customer_approval);
SELECT 'm1.closed_with_project' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.project p ON p.customer_id = c.id WHERE c.code = 'CLS' AND c.status = 'closed' AND p.status = 'closed');
SELECT 'm5.a0_only' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000008' AND code = 'PL_G1' AND status = 'pending');
SELECT 'feed.step04_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'project' AND now()::DATE - created_at::DATE > 7);
-- m5.gate_states: each story project's passed gates (in position order) and the gate it waits on (the variant's G3 was passed in step 05 and rolled back in step 08)
SELECT 'm5.gate_states', x.nn FROM (VALUES
    ('01', 'G1,PL_G1', 'PL_G2'), ('02', 'G2', 'G3'), ('03', 'G3', 'G4'), ('04', '', 'G2'), ('05', 'G1,G2,G3,G4,G5', NULL),
    ('06', '', 'G1'), ('07', '', 'G5'), ('08', '', 'PL_G1'), ('09', '', 'G1')) x (nn, passed, waits)
WHERE (SELECT coalesce(string_agg(g.code::TEXT, ',' ORDER BY g.position) FILTER (WHERE g.status = 'passed'), '')
       FROM public.project_gate g WHERE g.project_id = ('5eed0004-0000-4000-8000-0000000000' || x.nn)::UUID) IS DISTINCT FROM x.passed
   OR (SELECT g.code::TEXT FROM public.project_gate g WHERE g.project_id = ('5eed0004-0000-4000-8000-0000000000' || x.nn)::UUID AND g.status <> 'passed' ORDER BY g.position LIMIT 1) IS DISTINCT FROM x.waits;
SELECT 'm5.project_states', x.nn FROM (VALUES ('04', 'on_hold'), ('06', 'cancelled'), ('09', 'closed'), ('01', 'active'), ('02', 'active'), ('03', 'active'), ('05', 'closed'), ('07', 'active'), ('08', 'active')) x (nn, st)
WHERE NOT EXISTS (SELECT 1 FROM public.project p WHERE p.id = ('5eed0004-0000-4000-8000-0000000000' || x.nn)::UUID AND p.status = x.st::public.project_status);
-- m5.waiting_days: the private label project has waited on PL_G2 since PL_G1 passed nine days ago (two days' margin)
SELECT 'm5.waiting_days' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000001' AND gate_code = 'PL_G2' AND waiting_days BETWEEN 7 AND 11);
-- m5.passed_with_evidence: every passed gate of a story project passed the real rules, in the past: approval document of that gate and approval date where it needs them, no open blocking task up to the phase it closes
SELECT 'm5.passed_with_evidence', g.project_id || ' ' || g.code FROM public.project_gate g
LEFT JOIN public.document d ON d.id = g.approval_document_id AND d.type = 'gate_approval' AND d.entity_type = 'project_gate' AND d.entity_id = g.id AND d.status = 'signed'
WHERE g.project_id::TEXT LIKE '5eed0004-%' AND g.status = 'passed'
  AND (g.passed_at IS NULL OR g.passed_at > now() - interval '1 day'
       OR (g.needs_customer_approval AND (d.id IS NULL OR g.customer_approved_on IS NULL))
       OR EXISTS (SELECT 1 FROM public.project_task t WHERE t.project_id = g.project_id AND t.blocks_gate AND t.status <> 'done' AND t.phase <= public.phase_before(g.code)));
-- m5.story_tasks: the dashboard task states sit on non-blocking tasks of the variant and reorder projects, so later gate passes keep them
SELECT 'm5.story_tasks', x.k FROM (VALUES ('overdue'), ('due_soon'), ('blocked'), ('doing_unassigned'), ('done')) x (k)
WHERE NOT EXISTS (SELECT 1 FROM public.project_task t WHERE t.project_id IN ('5eed0004-0000-4000-8000-000000000002', '5eed0004-0000-4000-8000-000000000003') AND NOT t.blocks_gate
    AND CASE x.k WHEN 'overdue' THEN t.status = 'todo' AND t.due_on = pg_temp.today() - 3
                 WHEN 'due_soon' THEN t.status = 'todo' AND t.due_on = pg_temp.today() + 2
                 WHEN 'blocked' THEN t.status = 'blocked'
                 WHEN 'doing_unassigned' THEN t.status = 'doing' AND t.assignee_id IS NULL
                 ELSE t.status = 'done' END);

-- Task 5: purchase orders and the gates that need a PI (core.bypass_off is the story's last block, not a check)
SELECT 'm7.missing_spec' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000001' AND status = 'draft' AND cardinality(spec_missing_line_ids) > 0);
SELECT 'm7.pi_differs' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000003' AND pi_total IS DISTINCT FROM system_total);
SELECT 'm7.balance_overdue' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000007' AND balance_planned_on < pg_temp.today());
SELECT 'm7.psi_missing' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000007' AND NOT has_approved_psi);
SELECT 'm7.deposit_zero' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order WHERE id = '5eed0005-0000-4000-8000-000000000011' AND deposit_rate = 0 AND status = 'in_production');
SELECT 'm7.production_updates' WHERE (SELECT count(*) FROM public.purchase_order_update WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000006') < 2;
SELECT 'm7.second_customer' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order o JOIN public.customer c ON c.id = o.customer_id WHERE c.code = 'KRN' AND o.status = 'sent');
SELECT 'box.po_action', s FROM unnest(ARRAY['sent', 'pi_received', 'pi_approved']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'box.po_production', s FROM unnest(ARRAY['deposit_paid', 'in_production', 'ready', 'balance_paid']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'm5.reorder_on_g4' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000003' AND gate_code = 'G4' AND waiting_days >= 10);
SELECT 'box.gates_team' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND NOT needs_management AND NOT needs_customer_approval);
SELECT 'm5.closed_project' WHERE NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000005' AND status = 'closed' AND current_phase = 'closed');
SELECT 'feed.step05_last_week' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'purchase_order' AND now()::DATE - created_at::DATE BETWEEN 2 AND 7);
-- m7.po_states: each story order's status and project
SELECT 'm7.po_states', x.nn FROM (VALUES
    ('01', 'draft', NULL), ('02', 'sent', NULL), ('03', 'pi_received', NULL), ('04', 'pi_approved', '03'), ('05', 'deposit_paid', '02'),
    ('06', 'in_production', NULL), ('07', 'ready', NULL), ('08', 'balance_paid', NULL), ('09', 'closed', '05'), ('10', 'cancelled', NULL),
    ('11', 'in_production', NULL), ('12', 'sent', NULL)) x (nn, st, project)
WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order o WHERE o.id = ('5eed0005-0000-4000-8000-0000000000' || x.nn)::UUID AND o.status = x.st::public.purchase_order_status
    AND o.project_id IS NOT DISTINCT FROM ('5eed0004-0000-4000-8000-0000000000' || x.project)::UUID);
-- m7.spec_cited: every story line whose product has a signed or approved spec sheet cites one (the draft's MOP40-4P line has none to cite)
SELECT 'm7.spec_cited', o.id FROM public.purchase_order_line l JOIN public.purchase_order o ON o.id = l.purchase_order_id
WHERE o.id::TEXT LIKE '5eed0005-%' AND l.spec_document_id IS NULL AND EXISTS (SELECT 1 FROM public.product_evidence e WHERE e.product_id = l.product_id AND e.has_signed_spec);
-- m7.pi_approved: every story order from pi_approved on has an approved PI document of its own, 30 "ok" items, a checker in the past and PI figures equal to the recalculated ones
SELECT 'm7.pi_approved', o.id FROM public.purchase_order_overview o
LEFT JOIN public.document d ON d.id = o.pi_document_id AND d.type = 'pi' AND d.status = 'approved' AND d.entity_type = 'purchase_order' AND d.entity_id = o.id
WHERE o.id::TEXT LIKE '5eed0005-%' AND o.status >= 'pi_approved' AND o.status <> 'cancelled'
  AND (d.id IS NULL OR (SELECT count(*) FROM jsonb_each(o.pi_check) e WHERE e.value = '"ok"'::JSONB) <> 30 OR o.pi_checked_by IS NULL OR o.pi_checked_at > now() - interval '2 days'
       OR ROW(o.pi_subtotal, o.pi_total, o.pi_deposit_amount, o.pi_balance_amount) IS DISTINCT FROM ROW(o.system_subtotal, o.system_total, o.system_deposit, o.system_balance));
-- m7.pi_checker: baris checked the reorder's PI thirteen days ago (two days' margin); the differing PI is still a draft, unchecked
SELECT 'm7.pi_checker' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order o JOIN public.user u ON u.id = o.pi_checked_by WHERE o.id = '5eed0005-0000-4000-8000-000000000004' AND u.email = 'baris@moesa-panel.test' AND o.pi_checked_at BETWEEN now() - interval '15 days' AND now() - interval '11 days')
   OR NOT EXISTS (SELECT 1 FROM public.purchase_order o JOIN public.document d ON d.id = o.pi_document_id WHERE o.id = '5eed0005-0000-4000-8000-000000000003' AND d.status = 'draft' AND o.pi_checked_at IS NULL);
-- m7.payments: who paid what, and what is still open
SELECT 'm7.payments', x.k FROM (VALUES ('05_deposit'), ('07_balance_open'), ('08_balance_customer'), ('08_freight'), ('09_all_paid'), ('11_no_deposit')) x (k)
WHERE NOT CASE x.k
    WHEN '05_deposit' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000005' AND p.kind = 'deposit' AND p.paid_on = pg_temp.today() - 8 AND p.paid_by = 'company')
    WHEN '07_balance_open' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000007' AND p.kind = 'balance' AND p.planned_on = pg_temp.today() - 10 AND p.paid_on IS NULL)
    WHEN '08_balance_customer' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000008' AND p.kind = 'balance' AND p.paid_on = pg_temp.today() - 12 AND p.paid_by = 'customer')
    WHEN '08_freight' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000008' AND p.kind = 'other')
    WHEN '09_all_paid' THEN (SELECT count(*) FILTER (WHERE p.paid_on IS NOT NULL) = count(*) AND count(*) >= 2 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000009')
    ELSE NOT EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000011' AND p.kind = 'deposit') END;
-- m7.psi_docs: an approved PSI report on the order in production, only a draft one on the ready order
SELECT 'm7.psi_docs' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000006' AND has_approved_psi)
   OR NOT EXISTS (SELECT 1 FROM public.document WHERE entity_type = 'purchase_order' AND entity_id = '5eed0005-0000-4000-8000-000000000007' AND type = 'psi_report' AND status = 'draft');
-- m5.g3_pi: each G3 of a story project passed on the PI of that project's approved order (the variant's was rolled back in step 08 and keeps its evidence)
SELECT 'm5.g3_pi', x.nn FROM (VALUES ('02', '05', 'rolled_back'), ('03', '04', 'passed'), ('05', '09', 'passed')) x (nn, po, st)
WHERE NOT EXISTS (SELECT 1 FROM public.project_gate g JOIN public.purchase_order o ON o.id = ('5eed0005-0000-4000-8000-0000000000' || x.po)::UUID AND o.project_id = g.project_id
    WHERE g.project_id = ('5eed0004-0000-4000-8000-0000000000' || x.nn)::UUID AND g.code = 'G3' AND g.status = x.st::public.gate_status AND g.passed_at IS NOT NULL
      AND o.pi_document_id = ANY (g.evidence_document_ids));

-- Task 6: shipments, the partial receipt of PO-008 and the cones project's G5
SELECT 'box.shipments_in_transit', s FROM unnest(ARRAY['loaded', 'in_transit', 'at_customs']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'box.shipments_late' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE shipment_id = '5eed0006-0000-4000-8000-000000000005' AND overdue);
SELECT 'm8.eta_ahead' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE shipment_id = '5eed0006-0000-4000-8000-000000000004' AND NOT overdue);
SELECT 'm8.dispute_running' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000007' AND dispute_deadline_at >= now() + interval '2 days');
SELECT 'm8.events' WHERE (SELECT count(*) FROM public.shipment_event WHERE shipment_id = '5eed0006-0000-4000-8000-000000000005') < 3;
SELECT 'm7.partially_received' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_line l WHERE l.purchase_order_id = '5eed0005-0000-4000-8000-000000000008'
   AND (SELECT sum(sl.quantity) FROM public.shipment_line sl JOIN public.shipment s ON s.id = sl.shipment_id AND s.status = 'accepted' WHERE sl.purchase_order_line_id = l.id) < l.quantity);
SELECT 'feed.step06_yesterday' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND table_name = 'shipment' AND since = 'yesterday');
-- m8.ship_states: each story shipment's status, mode, code number, order and shipped quantity (order NULL: none; 0: linked, no line)
SELECT 'm8.ship_states', x.nn FROM (VALUES
    ('01', 'planned', 'road', '08', 400), ('02', 'booked', 'fcl20', '11', 0), ('03', 'loaded', 'lcl', '06', 1000),
    ('04', 'in_transit', 'fcl40', '07', 4000), ('05', 'in_transit', 'fcl40', '05', 800), ('06', 'at_customs', 'fcl20', '06', 1000),
    ('07', 'delivered', 'road', '06', 1000), ('08', 'accepted', 'courier', '08', 600), ('09', 'disputed', 'air', '09', 500),
    ('10', 'cancelled', 'lcl', NULL, NULL), ('11', 'accepted', 'fcl20', '09', 1500)) x (nn, st, mode, po, qty)
WHERE NOT EXISTS (SELECT 1 FROM public.shipment s JOIN public.customer c ON c.id = s.customer_id AND c.code = 'THO'
    WHERE s.id = ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID AND s.status = x.st::public.shipment_status AND s.mode = x.mode::public.shipment_mode
      AND s.code LIKE 'SHP-THO-%-0' || x.nn)
   OR (SELECT string_agg(right(sp.purchase_order_id::TEXT, 2), ',') FROM public.shipment_purchase_order sp WHERE sp.shipment_id = ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID) IS DISTINCT FROM x.po
   OR (SELECT CASE WHEN x.po IS NOT NULL THEN coalesce(sum(sl.quantity), 0) END FROM public.shipment_line sl WHERE sl.shipment_id = ('5eed0006-0000-4000-8000-0000000000' || x.nn)::UUID) IS DISTINCT FROM x.qty;
-- m8.po_lines_capped: no story order line ships more than ordered plus tolerance, over the shipments that are not cancelled
SELECT 'm8.po_lines_capped', l.id FROM public.purchase_order_line l JOIN public.purchase_order o ON o.id = l.purchase_order_id
WHERE o.id::TEXT LIKE '5eed0005-%'
  AND (SELECT coalesce(sum(sl.quantity), 0) FROM public.shipment_line sl JOIN public.shipment s ON s.id = sl.shipment_id AND s.status <> 'cancelled' WHERE sl.purchase_order_line_id = l.id) > floor(l.quantity * (1 + coalesce(o.tolerance_pct, 0) / 100));
-- m7.rest_planned: the rest of PO-008 (1000 - 600) is on the planned shipment
SELECT 'm7.rest_planned' WHERE NOT EXISTS (SELECT 1 FROM public.shipment_line sl JOIN public.shipment s ON s.id = sl.shipment_id
    WHERE s.id = '5eed0006-0000-4000-8000-000000000001' AND s.status = 'planned' AND sl.purchase_order_line_id = '5eed0005-0000-4000-8000-000000000108' AND sl.quantity = 400);
-- m8.accepted: every accepted story shipment has a signed delivery receipt, matching quantities, no damage, an acceptor and an acceptance date on or after the delivery
SELECT 'm8.accepted', s.id FROM public.shipment s
WHERE s.id::TEXT LIKE '5eed0006-%' AND s.status = 'accepted'
  AND (s.quantity_matches IS NOT TRUE OR s.has_damage IS NOT FALSE OR s.accepted_on IS NULL OR s.delivered_at IS NULL OR s.accepted_on < s.delivered_at::DATE
       OR nullif(btrim(s.accepted_by), '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.document d WHERE d.entity_type = 'shipment' AND d.entity_id = s.id AND d.type = 'delivery_receipt' AND d.status = 'signed'));
SELECT 'm8.accepted_on' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000008' AND accepted_on = pg_temp.today() - 3 AND delivered_at < now() - interval '4 days');
-- m8.delivered: delivered yesterday, its dispute deadline three days ahead
SELECT 'm8.delivered' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000007' AND dispute_deadline_at BETWEEN now() + interval '2 days 12 hours' AND now() + interval '3 days 12 hours' AND delivered_at BETWEEN now() - interval '2 days' AND now() - interval '12 hours');
SELECT 'm8.disputed' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000009' AND has_damage AND delivered_at IS NOT NULL AND dispute_deadline_at = delivered_at + interval '48 hours' AND dispute_deadline_at < now());
-- m8.booked: the booked shipment's confirmation and dates; the loaded one leaves tomorrow
SELECT 'm8.booked' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000002' AND booking_confirmed_on = pg_temp.today() - 2 AND etd = pg_temp.today() + 5 AND eta = pg_temp.today() + 30)
   OR NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000003' AND etd = pg_temp.today() + 1 AND eta = pg_temp.today() + 28);
-- m8.docs: the shipment documents of step 06
SELECT 'm8.docs', x.nn FROM (VALUES ('201', '04', 'packing_list', 'draft'), ('202', '04', 'commercial_invoice', 'signed'), ('203', '05', 'bill_of_lading', 'signed'),
    ('204', '06', 'customs', 'draft'), ('205', '08', 'delivery_receipt', 'signed'), ('206', '11', 'delivery_receipt', 'signed')) x (nn, ship, type, st)
WHERE NOT EXISTS (SELECT 1 FROM public.document d WHERE d.id = ('5eed0006-0000-4000-8000-000000000' || x.nn)::UUID AND d.entity_type = 'shipment'
    AND d.entity_id = ('5eed0006-0000-4000-8000-0000000000' || x.ship)::UUID AND d.type = x.type::public.document_type AND d.status = x.st::public.document_status);
-- m5.g5_receipt: the cones project's G5 cites the signed delivery receipt of its order's accepted shipment, passed after that delivery
SELECT 'm5.g5_receipt' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate g
    JOIN public.document d ON d.id = ANY (g.evidence_document_ids) AND d.type = 'delivery_receipt' AND d.status = 'signed' AND d.entity_type = 'shipment'
    JOIN public.shipment s ON s.id = d.entity_id AND s.status = 'accepted' AND s.delivered_at < g.passed_at
    JOIN public.shipment_purchase_order sp ON sp.shipment_id = s.id AND sp.purchase_order_id = '5eed0005-0000-4000-8000-000000000009'
    WHERE g.project_id = '5eed0004-0000-4000-8000-000000000005' AND g.code = 'G5' AND g.status = 'passed');

-- Task 7: market cells
SELECT 'box.market_summary', c FROM unnest(ARRAY['THO', 'KRN']) c WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_market WHERE tenant_id = pg_temp.moesa() AND customer_code = c AND target_count >= 1);
SELECT 'm9.red_candidate' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = '5eed0007-0000-4000-8000-000000000009' AND status = 'candidate' AND compliance = 'red' AND compliance_note IS NOT NULL);
SELECT 'm9.suppressed_issue' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = '5eed0007-0000-4000-8000-000000000005' AND tenant_id = pg_temp.moesa() AND status = 'suppressed' AND open_issue LIKE 'OA-06:%');
SELECT 'feed.step07_last_week' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND table_name = 'market_cell' AND since = 'last_week');
-- m9.cells: each story cell's product, platform, country, status, compliance and content state
SELECT 'm9.cells', x.nn FROM (VALUES
    ('01', 'THO-MOP40-2P', 'amazon', 'DE', 'live', 'green', 'approved'), ('02', 'THO-MOP40-2P', 'amazon', 'FR', 'live', 'yellow', 'approved'),
    ('03', 'THO-MOP40-2P', 'amazon', 'IT', 'preparing', 'pending', 'translated'), ('04', 'THO-MOP40-2P', 'amazon', 'ES', 'uploaded', 'green', 'none'),
    ('05', 'THO-MOP40-2P', 'amazon', 'NL', 'suppressed', 'green', 'approved'), ('06', 'THO-TIPS-6-50', 'amazon', 'ES', 'planned', 'green', 'en_master'),
    ('07', 'THO-TIPS-6-50', 'amazon', 'IT', 'stopped', 'green', 'approved'), ('08', 'THO-TIPS-6-50', 'kaufland', 'DE', 'live', 'green', 'approved'),
    ('09', 'THO-CONES-100', 'amazon', 'PL', 'candidate', 'red', 'none'), ('10', 'THO-CONES-100', 'ebay', 'DE', 'paused', 'green', 'none'),
    ('11', 'THO-CONES-100', 'otto', 'DE', 'removed', 'green', 'none'), ('12', 'KRN-VASE-01', 'bol', 'NL', 'live', 'green', 'approved'),
    ('13', 'KRN-VASE-01', 'kaufland', 'AT', 'planned', 'green', 'none')) x (nn, sku, platform, country, st, comp, content)
WHERE NOT EXISTS (SELECT 1 FROM public.market_cell m JOIN public.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
    WHERE m.id = ('5eed0007-0000-4000-8000-0000000000' || x.nn)::UUID AND m.tenant_id = pg_temp.moesa() AND p.sku = x.sku AND m.platform_id = x.platform
      AND m.country = x.country AND m.status = x.st::public.market_cell_status AND m.compliance = x.comp::public.market_compliance
      AND m.content_status = x.content::public.content_status);
-- m9.live_listed: every live or suppressed story cell carries its listing data and a launch date that is not in the future
SELECT 'm9.live_listed', m.id FROM public.market_cell m
WHERE m.id::TEXT LIKE '5eed0007-%' AND m.status IN ('live', 'suppressed', 'stopped')
  AND (nullif(btrim(m.platform_product_id), '') IS NULL OR nullif(btrim(m.platform_sku), '') IS NULL OR m.price IS NULL OR m.currency IS NULL
       OR m.stock_source IS NULL OR m.content_status <> 'approved' OR m.launched_on IS NULL OR m.launched_on > pg_temp.today());
-- m9.reasons: stock sources and the notes of the cells that need them
SELECT 'm9.reasons', x.nn FROM (VALUES ('01', 'customer_warehouse'), ('02', 'pan_eu'), ('08', '3pl'), ('12', 'platform')) x (nn, src)
WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = ('5eed0007-0000-4000-8000-0000000000' || x.nn)::UUID AND stock_source = x.src::public.stock_source)
UNION ALL
SELECT 'm9.notes', m.id::TEXT FROM public.market_cell m WHERE m.id::TEXT LIKE '5eed0007-%'
  AND (m.status IN ('stopped', 'removed') AND m.notes IS NULL OR m.compliance IN ('yellow', 'red') AND m.compliance_note IS NULL);
-- m9.krn: the second customer's cells belong to KRN
SELECT 'm9.krn', m.id FROM public.market_cell m WHERE m.id IN ('5eed0007-0000-4000-8000-000000000012', '5eed0007-0000-4000-8000-000000000013')
  AND NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.id = m.customer_id AND c.code = 'KRN');

-- Task 8: incidents (with the variant's G3 rollback) and change requests
SELECT 'box.incidents_open' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE tenant_id = pg_temp.moesa() AND management_notice_missing);
SELECT 'm10.notice_late' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE incident_id = '5eed0008-0000-4000-8000-000000000001' AND customer_notice_late AND management_notice_missing);
SELECT 'm10.deadline_past' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE incident_id = '5eed0008-0000-4000-8000-000000000002' AND overdue_deadline_count > 0);
SELECT 'm10.doc_request_ahead' WHERE NOT EXISTS (SELECT 1 FROM public.incident_deadline WHERE incident_id = '5eed0008-0000-4000-8000-000000000006' AND kind = 'document_request' AND due_at > now() + INTERVAL '2 days');
SELECT 'm10.repeat' WHERE (SELECT count(*) FROM public.incident WHERE tenant_id = pg_temp.moesa() AND incident_type = 'OL-09' AND opened_at > now() - INTERVAL '90 days') < 2
   OR NOT EXISTS (SELECT 1 FROM public.incident_overview WHERE id = '5eed0008-0000-4000-8000-000000000004' AND is_repeat);
SELECT 'm10.unclassified' WHERE NOT EXISTS (SELECT 1 FROM public.incident WHERE id = '5eed0008-0000-4000-8000-000000000008' AND family = 'om' AND incident_type IS NULL);
SELECT 'm10.cost_log' WHERE NOT EXISTS (SELECT 1 FROM public.incident_log WHERE incident_id = '5eed0008-0000-4000-8000-000000000002' AND cost_amount = 350 AND cost_currency = 'EUR' AND cost_payer = 'carrier_insurance' AND customer_approved);
SELECT 'm10.entity_kinds', k FROM unnest(ARRAY['project', 'purchase_order', 'shipment', 'product', 'market_cell']) k WHERE NOT EXISTS (SELECT 1 FROM public.incident WHERE tenant_id = pg_temp.moesa() AND entity_type::TEXT = k);
SELECT 'm10.closed_by_management' WHERE NOT EXISTS (SELECT 1 FROM public.incident i JOIN public.user u ON u.id = i.closed_by AND u.email = 'akif@moesa-panel.test' WHERE i.id = '5eed0008-0000-4000-8000-000000000007' AND i.closed_on IS NOT NULL);
-- m10.incidents: each story incident's family, card, severity, status, code prefix and linked record (all THO)
SELECT 'm10.incidents', x.nn FROM (VALUES
    ('01', 'ol', 'OL-02', 's1', 'open', 'shipment', '5eed0006-0000-4000-8000-000000000002'),
    ('02', 'ol', 'OL-05', 's2', 'contained', 'shipment', '5eed0006-0000-4000-8000-000000000009'),
    ('03', 'ol', 'OL-09', 's3', 'closed', 'shipment', '5eed0006-0000-4000-8000-000000000006'),
    ('04', 'ol', 'OL-09', 's3', 'open', 'shipment', '5eed0006-0000-4000-8000-000000000007'),
    ('05', 'ot', 'OT-04', 's2', 'contained', 'purchase_order', '5eed0005-0000-4000-8000-000000000003'),
    ('06', 'oa', 'OA-02', 's3', 'open', 'market_cell', '5eed0007-0000-4000-8000-000000000005'),
    ('07', 'ou', 'OU-01', 's1', 'closed', 'product', (SELECT id::TEXT FROM public.product WHERE sku = 'THO-TIPS-6-50' AND tenant_id = pg_temp.moesa())),
    ('08', 'om', NULL, 's3', 'open', 'project', (SELECT id::TEXT FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu' AND tenant_id = pg_temp.moesa()))
    ) x (nn, fam, typ, sev, st, et, eid)
WHERE NOT EXISTS (SELECT 1 FROM public.incident i JOIN public.customer c ON c.id = i.customer_id AND c.code = 'THO'
    WHERE i.id = ('5eed0008-0000-4000-8000-0000000000' || x.nn)::UUID AND i.tenant_id = pg_temp.moesa() AND i.family = x.fam::public.incident_family
      AND i.incident_type IS NOT DISTINCT FROM x.typ AND i.severity = x.sev::public.incident_severity AND i.status = x.st::public.incident_status
      AND i.entity_type = x.et::public.document_entity AND i.entity_id = x.eid::UUID
      AND i.code LIKE upper(x.fam) || '-THO-%');
-- m10.notified: management and the customer were told of the s1/s2 incidents that left open, after the opening and in time; m10.closed: the closed ones carry their closure
SELECT 'm10.notified', i.id::TEXT FROM public.incident i
WHERE i.id::TEXT LIKE '5eed0008-%' AND i.status <> 'open' AND i.severity IN ('s1', 's2')
  AND (i.management_notified_at IS NULL OR i.management_notified_at < i.opened_at OR i.customer_notified_at IS NULL OR i.customer_notified_at > i.customer_notice_due_at)
UNION ALL
SELECT 'm10.closed', x.nn FROM (VALUES ('03'), ('07')) x (nn)
WHERE NOT EXISTS (SELECT 1 FROM public.incident i WHERE i.id = ('5eed0008-0000-4000-8000-0000000000' || x.nn)::UUID AND i.status = 'closed'
    AND i.outcome IS NOT NULL AND i.root_cause IS NOT NULL AND nullif(btrim(i.preventive_action), '') IS NOT NULL AND i.closed_on IS NOT NULL AND i.closed_by IS NOT NULL);
-- m5.rolled_back: the variant's G3 was rolled back through the OT-04 incident; the project is back in the phase G3 closes
SELECT 'm5.rolled_back' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND code = 'G3' AND status = 'rolled_back'
       AND rolled_back_incident_id = '5eed0008-0000-4000-8000-000000000005' AND nullif(btrim(rolled_back_reason), '') IS NOT NULL)
   OR NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000002' AND status = 'active' AND current_phase = public.phase_before('G3'));
SELECT 'm5.variant_waits_customer' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND gate_code = 'G3' AND needs_customer_approval);
SELECT 'box.change_requests_open' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE tenant_id = pg_temp.moesa() AND overdue)
   OR NOT EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE tenant_id = pg_temp.moesa() AND NOT overdue);
SELECT 'm10.cr_applied_version' WHERE NOT EXISTS (SELECT 1 FROM public.change_request r JOIN public.document a ON a.id = r.affected_document_id JOIN public.document b ON b.id = r.result_document_id
   WHERE r.id = '5eed0008-0000-4000-8000-000000000015' AND r.status = 'applied' AND r.closed_on IS NOT NULL AND a.id = '5eed0003-0000-4000-8000-000000000030'
     AND b.version > a.version AND b.type = a.type AND b.entity_type = a.entity_type AND b.entity_id = a.entity_id AND b.status = 'signed' AND a.status = 'superseded');
SELECT 'm10.cr_trigger_on' WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'change_request_due' AND tgrelid = 'public.change_request'::REGCLASS AND tgenabled = 'O');
SELECT 'feed.step08_today' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND since = 'today' AND table_name IN ('incident', 'change_request'));
-- m10.crs: each story change request's source, urgency, status, kinds, project and code prefix (all THO)
SELECT 'm10.crs', x.nn FROM (VALUES
    ('11', 'customer', 'normal', 'open', '{packaging,design}', NULL), ('12', 'company', 'urgent', 'open', '{deadline}', NULL),
    ('13', 'customer', 'normal', 'approved', '{spec,content}', '01'), ('14', 'supplier', 'normal', 'rejected', '{price,supplier}', NULL),
    ('15', 'regulation', 'normal', 'applied', '{packaging}', '04')) x (nn, src, urg, st, kinds, project)
WHERE NOT EXISTS (SELECT 1 FROM public.change_request r JOIN public.customer c ON c.id = r.customer_id AND c.code = 'THO'
    WHERE r.id = ('5eed0008-0000-4000-8000-0000000000' || x.nn)::UUID AND r.tenant_id = pg_temp.moesa() AND r.source = x.src::public.change_request_source
      AND r.urgency = x.urg::public.change_request_urgency AND r.status = x.st::public.change_request_status AND r.change_kinds = x.kinds::public.change_kind[]
      AND r.project_id IS NOT DISTINCT FROM ('5eed0004-0000-4000-8000-0000000000' || x.project)::UUID AND r.code LIKE 'CR-THO-%');
-- m10.cr_states: what each decision left behind
SELECT 'm10.cr_states', x.k FROM (VALUES ('11_products'), ('11_due_ahead'), ('12_overdue'), ('13_customer_approval'), ('14_rejected')) x (k)
WHERE NOT CASE x.k
    WHEN '11_products' THEN coalesce((SELECT array_agg(p.sku::TEXT ORDER BY p.sku) FROM public.change_request_product rp JOIN public.product p ON p.id = rp.product_id
                             WHERE rp.change_request_id = '5eed0008-0000-4000-8000-000000000011') = ARRAY['THO-MOP40-2P', 'THO-MOP40-3P'], FALSE)
    WHEN '11_due_ahead' THEN EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE change_request_id = '5eed0008-0000-4000-8000-000000000011' AND NOT overdue AND decision_due_on >= pg_temp.today() + 2)
    WHEN '12_overdue' THEN EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE change_request_id = '5eed0008-0000-4000-8000-000000000012' AND overdue AND decision_due_on = pg_temp.today() - 2)
    WHEN '13_customer_approval' THEN EXISTS (SELECT 1 FROM public.change_request r JOIN public.document d ON d.id = r.customer_approval_document_id
                                             JOIN public.user u ON u.id = r.company_approved_by AND u.email = 'akif@moesa-panel.test'
                                             JOIN public.project_gate g ON g.project_id = r.project_id AND g.code = r.affected_gate_code AND g.status = 'passed' AND g.needs_customer_approval
                                             WHERE r.id = '5eed0008-0000-4000-8000-000000000013' AND r.affected_gate_code = 'PL_G1' AND r.customer_approved_on = pg_temp.today() - 3
                                               AND r.company_approved_on IS NOT NULL AND d.type = 'change_request' AND d.status = 'signed'
                                               AND d.entity_type = 'change_request' AND d.entity_id = r.id)
    ELSE EXISTS (SELECT 1 FROM public.change_request WHERE id = '5eed0008-0000-4000-8000-000000000014' AND nullif(btrim(decision_note), '') IS NOT NULL AND closed_on IS NOT NULL) END;
-- dates.weekday (Ruling P5): every business-day deadline of the story falls on a weekday: the s2 customer notices, the document request and the normal requests' decision dates (and they are all there)
SELECT 'dates.weekday', x.k FROM (
    SELECT 'incident ' || i.id, (i.customer_notice_due_at AT TIME ZONE 'UTC')::DATE FROM public.incident i WHERE i.id::TEXT LIKE '5eed0008-%' AND i.severity = 's2'
    UNION ALL
    SELECT 'deadline ' || d.id, (d.due_at AT TIME ZONE 'UTC')::DATE FROM public.incident_deadline d WHERE d.incident_id::TEXT LIKE '5eed0008-%' AND d.kind = 'document_request'
    UNION ALL
    SELECT 'change_request ' || r.id, r.decision_due_on FROM public.change_request r WHERE r.id::TEXT LIKE '5eed0008-%' AND r.urgency = 'normal'
    UNION ALL
    SELECT 'rows', NULL::DATE WHERE (SELECT count(*) FROM public.incident WHERE id::TEXT LIKE '5eed0008-%' AND severity = 's2') <> 2
       OR (SELECT count(*) FROM public.incident_deadline WHERE incident_id::TEXT LIKE '5eed0008-%' AND kind = 'document_request') <> 1
       OR (SELECT count(*) FROM public.change_request WHERE id::TEXT LIKE '5eed0008-%' AND urgency = 'normal') <> 4
    ) x (k, d)
WHERE x.d IS NULL OR extract(isodow FROM x.d) >= 6;

-- Task 9: media with real files, the remaining documents, the 12 MB edge
-- m19.objects: every media row of MOESA LTD has its file (and its thumbnail, when it names one) in Storage
SELECT 'm19.objects', m.id::TEXT FROM public.media m WHERE m.tenant_id = pg_temp.moesa()
  AND (NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = m.storage_path)
       OR (m.thumbnail_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = m.thumbnail_path)));
-- m19.kinds: images, PDFs and videos
SELECT 'm19.kinds', k FROM unnest(ARRAY['image/png', 'application/pdf', 'video/mp4']) k WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND mime_type = k);
-- m19.thumb_and_none: an image without a thumbnail and a file with one
SELECT 'm19.thumb_and_none' WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND thumbnail_path IS NULL AND mime_type LIKE 'image/%')
   OR NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND thumbnail_path IS NOT NULL);
-- m19.rows: each story media row, its customer (none for the shared ones), its file and whether it has a thumbnail
SELECT 'm19.rows', x.nn FROM (VALUES
    ('01', 'THO', 'mop-primary.png', TRUE), ('02', 'THO', 'mop-gallery.png', FALSE), ('03', 'THO', 'production.png', TRUE), ('04', 'THO', 'damage.png', TRUE),
    ('05', 'THO', 'pi.pdf', FALSE), ('06', 'THO', 'artwork.pdf', FALSE), ('07', 'THO', 'demo.mp4', FALSE), ('08', 'THO', 'orphan.png', FALSE),
    ('09', NULL, 'catalogue.png', TRUE), ('10', 'KRN', 'vase.png', TRUE), ('11', 'THO', 'big-catalogue.pdf', FALSE), ('12', NULL, 'certificate.pdf', FALSE)) x (nn, customer, file, thumb)
WHERE NOT EXISTS (SELECT 1 FROM public.media m LEFT JOIN public.customer c ON c.id = m.customer_id
    WHERE m.id = ('5eed0009-0000-4000-8000-0000000000' || x.nn)::UUID AND m.tenant_id = pg_temp.moesa() AND c.code IS NOT DISTINCT FROM x.customer
      AND m.file_name = x.file AND m.storage_path = pg_temp.moesa() || '/' || m.id || '/' || x.file AND (m.thumbnail_path IS NOT NULL) = x.thumb);
-- m19.links: each link of the story and its role (MOP40-2P primary and gallery, the production and damage photos, the attachments, the mp4, the shared and KRN photos)
SELECT 'm19.links', x.nn || ' ' || x.kind || ' ' || x.ref FROM (VALUES
    ('01', 'product', 'THO-MOP40-2P', 'primary_image'), ('02', 'product', 'THO-MOP40-2P', 'gallery'),
    ('03', 'purchase_order', '5eed0005-0000-4000-8000-000000000006', 'evidence_photo'), ('04', 'shipment', '5eed0006-0000-4000-8000-000000000009', 'evidence_photo'),
    ('06', 'change_request', '5eed0008-0000-4000-8000-000000000015', 'attachment'), ('07', 'product', 'THO-TIPS-6-50', 'gallery'),
    ('09', 'product', 'THO-CONES-100', 'gallery'), ('09', 'product', 'KRN-VASE-01', 'gallery'), ('10', 'product', 'KRN-VASE-01', 'primary_image'),
    ('11', 'product', 'THO-MOP60-2P', 'attachment')) x (nn, kind, ref, role)
WHERE NOT EXISTS (SELECT 1 FROM public.media_link l
    WHERE l.media_id = ('5eed0009-0000-4000-8000-0000000000' || x.nn)::UUID AND l.tenant_id = pg_temp.moesa() AND l.entity_type = x.kind::public.document_entity
      AND l.role = x.role::public.media_role
      AND l.entity_id = CASE x.kind WHEN 'product' THEN (SELECT p.id FROM public.product p WHERE p.tenant_id = pg_temp.moesa() AND p.sku = x.ref) ELSE x.ref::UUID END);
-- m19.shared_two_customers: the shared catalogue photo (no customer) shows on THO's and KRN's products
SELECT 'm19.shared_two_customers' WHERE NOT EXISTS (SELECT 1 FROM public.media m WHERE m.id = '5eed0009-0000-4000-8000-000000000009' AND m.customer_id IS NULL AND (SELECT count(*) FROM public.media_link l WHERE l.media_id = m.id) >= 2);
-- m19.unlinked: the orphan PNG has no link and no document (management may delete it)
SELECT 'm19.unlinked' WHERE NOT EXISTS (SELECT 1 FROM public.media m WHERE m.id = '5eed0009-0000-4000-8000-000000000008' AND NOT EXISTS (SELECT 1 FROM public.media_link l WHERE l.media_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM public.document d WHERE d.media_id = m.id));
-- m19.cited_by_document: the PI PDF is the file of PO-011's own approved PI document, next to its Drive link
SELECT 'm19.cited_by_document' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.purchase_order o ON o.pi_document_id = d.id
    WHERE d.media_id = '5eed0009-0000-4000-8000-000000000005' AND o.id = '5eed0005-0000-4000-8000-000000000011' AND d.type = 'pi' AND d.status = 'approved' AND d.url IS NOT NULL);
-- m19.oversized_edge: THO's 12 MB PDF, within MOESA LTD's cap and above MOESA Trading GmbH's 5 MB
SELECT 'm19.oversized_edge' WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE id = '5eed0009-0000-4000-8000-000000000011' AND size_bytes > 5 * 1024 * 1024 AND size_bytes <= 25 * 1024 * 1024
    AND size_bytes <= private.media_max_bytes(pg_temp.moesa()) AND size_bytes > private.media_max_bytes(pg_temp.tenant('MOESA Trading GmbH')));
-- m4.file_kinds: Drive only, media only and both
SELECT 'm4.file_kinds', k FROM unnest(ARRAY['drive', 'media', 'both']) k
   WHERE NOT EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = pg_temp.moesa() AND CASE k WHEN 'drive' THEN d.url IS NOT NULL AND d.media_id IS NULL WHEN 'media' THEN d.url IS NULL AND d.media_id IS NOT NULL ELSE d.url IS NOT NULL AND d.media_id IS NOT NULL END);
-- m4.step09_docs: the documents of step 09 (type, record, version, status, file); the supplier's certificate has no customer, cites the shared PDF and supersedes its v1
SELECT 'm4.step09_docs', x.nn FROM (VALUES
    ('01', 'tech_pack', 'product', 1, 'draft', '06', TRUE), ('02', 'sample_report', 'product', 1, 'approved', NULL, TRUE),
    ('03', 'po', 'purchase_order', 1, 'signed', NULL, TRUE), ('04', 'technical_file', 'product', 1, 'approved', NULL, TRUE),
    ('05', 'other', 'incident', 1, 'draft', NULL, TRUE), ('06', 'certificate', 'supplier', 2, 'signed', '12', TRUE),
    ('07', 'other', 'market_cell', 1, 'draft', NULL, TRUE), ('08', 'other', 'project', 1, 'signed', NULL, TRUE),
    ('09', 'packing_list', 'shipment', 1, 'approved', '06', FALSE)) x (nn, type, kind, version, status, media, has_url)
WHERE NOT EXISTS (SELECT 1 FROM public.document d
    WHERE d.id = ('5eed0009-0000-4000-8000-0000000002' || x.nn)::UUID AND d.tenant_id = pg_temp.moesa() AND d.type = x.type::public.document_type
      AND d.entity_type = x.kind::public.document_entity AND d.version = x.version AND d.status = x.status::public.document_status
      AND d.media_id IS NOT DISTINCT FROM ('5eed0009-0000-4000-8000-0000000000' || x.media)::UUID AND (d.url IS NOT NULL) = x.has_url
      AND (d.customer_id IS NULL) = (x.kind = 'supplier'))
   OR (x.nn = '06' AND NOT EXISTS (SELECT 1 FROM public.document d WHERE d.id = '5eed0002-0000-4000-8000-000000000008' AND d.status = 'superseded'));
-- feed.step09_older: the media step lies in the feed's "older" band
SELECT 'feed.step09_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'media' AND now()::DATE - created_at::DATE > 7);
-- Task 10: the copy of KRN into MOESA Europe, the refused-move situations
-- The probe helpers set the claims and headers of the user who meets the situation, ask the
-- server's own refusal logic, put the caller's claims and headers back and return what the server
-- said: a refusal code (NULL when none), or the error of a real run that error_of undid
-- ('story_check_succeeded' when it ran).
CREATE FUNCTION pg_temp.restore_actor (p_claims TEXT, p_headers TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims', coalesce(p_claims, ''), TRUE);
    PERFORM set_config('request.headers', coalesce(p_headers, ''), TRUE);
END;
$$;

-- private.transfer_refusal(p_source, p_target, 'copy', p_customer_id) as p_email in p_source.
CREATE FUNCTION pg_temp.refusal_as (p_email TEXT, p_source TEXT, p_target TEXT, p_customer_id UUID) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_claims TEXT := current_setting('request.jwt.claims', TRUE);
    v_headers TEXT := current_setting('request.headers', TRUE);
    v_refusal TEXT;
BEGIN
    PERFORM pg_temp.act_as(p_email, p_source);
    v_refusal := private.transfer_refusal(pg_temp.tenant(p_source), pg_temp.tenant(p_target), 'copy', p_customer_id);
    PERFORM pg_temp.restore_actor(v_claims, v_headers);
    RETURN v_refusal;
END;
$$;

-- The error of a real product-only move of p_sku (of customer p_customer_code) from p_source to
-- p_target as p_email, on the dry run's report_hash.
CREATE FUNCTION pg_temp.move_error (p_email TEXT, p_source TEXT, p_target TEXT, p_customer_code TEXT, p_sku TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_claims TEXT := current_setting('request.jwt.claims', TRUE);
    v_headers TEXT := current_setting('request.headers', TRUE);
    v_source UUID := pg_temp.tenant(p_source);
    v_target UUID := pg_temp.tenant(p_target);
    v_customer UUID := (SELECT c.id FROM public.customer c WHERE c.code = p_customer_code AND c.tenant_id = pg_temp.tenant(p_source));
    v_products UUID[] := ARRAY(SELECT p.id FROM public.product p WHERE p.sku = p_sku AND p.tenant_id = pg_temp.tenant(p_source));
    v_hash TEXT;
    v_error TEXT;
BEGIN
    PERFORM pg_temp.act_as(p_email, p_source);
    v_hash := public.transfer_customer(v_source, v_target, v_customer, 'move', product_ids => v_products) ->> 'report_hash';
    v_error := pg_temp.error_of(format(
        'SELECT public.transfer_customer(%L::UUID, %L::UUID, %L::UUID, %L, dry_run => FALSE, report_hash => %L, product_ids => %L::UUID[])',
        v_source, v_target, v_customer, 'move', v_hash, v_products));
    PERFORM pg_temp.restore_actor(v_claims, v_headers);
    RETURN v_error;
END;
$$;

-- The error of a real copy of customer p_customer_code from p_source to p_target as p_email, on
-- the dry run's report_hash: only the GTIN conflicts are cleared (the only kind a copy into a
-- tenant without that customer meets; any other stays undecided, and the run says so).
CREATE FUNCTION pg_temp.copy_error (p_email TEXT, p_source TEXT, p_target TEXT, p_customer_code TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_claims TEXT := current_setting('request.jwt.claims', TRUE);
    v_headers TEXT := current_setting('request.headers', TRUE);
    v_source UUID := pg_temp.tenant(p_source);
    v_target UUID := pg_temp.tenant(p_target);
    v_customer UUID := (SELECT c.id FROM public.customer c WHERE c.code = p_customer_code AND c.tenant_id = pg_temp.tenant(p_source));
    v_decisions JSONB;
    v_hash TEXT;
    v_error TEXT;
BEGIN
    PERFORM pg_temp.act_as(p_email, p_source);
    v_decisions := (
        SELECT coalesce(jsonb_object_agg(c ->> 'key', '{"action": "clear_gtin"}'::JSONB), '{}')
        FROM jsonb_array_elements(public.transfer_customer(v_source, v_target, v_customer, 'copy') -> 'conflicts') c
        WHERE c ->> 'kind' = 'gtin'
    );
    v_hash := public.transfer_customer(v_source, v_target, v_customer, 'copy', decisions => v_decisions) ->> 'report_hash';
    v_error := pg_temp.error_of(format(
        'SELECT public.transfer_customer(%L::UUID, %L::UUID, %L::UUID, %L, decisions => %L::JSONB, dry_run => FALSE, report_hash => %L)',
        v_source, v_target, v_customer, 'copy', v_decisions, v_hash));
    PERFORM pg_temp.restore_actor(v_claims, v_headers);
    RETURN v_error;
END;
$$;

-- m21.copy_pending: akif's copy of KRN from MOESA LTD into MOESA Europe (Europe's own KRN row), path copy, its files listed and not copied (no client copies them)
SELECT 'm21.copy_pending' WHERE NOT EXISTS (SELECT 1 FROM public.transfer t
    JOIN public.customer c ON c.id = t.customer_id AND c.code = 'KRN' AND c.tenant_id = pg_temp.moesa()
    JOIN public.customer e ON e.id = t.target_customer_id AND e.code = 'KRN' AND e.tenant_id = pg_temp.tenant('MOESA Europe')
    WHERE t.tenant_id = pg_temp.tenant('MOESA Europe') AND t.source_tenant_id = pg_temp.moesa() AND t.mode = 'copy' AND t.path = 'copy'
      AND t.files_status = 'pending' AND jsonb_array_length(t.files) > 0
      AND t.started_by = (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test'));
-- m21.only_transfer: that copy is the story's only transfer (THO is never transferred; nothing transfers into Europe's KRN again)
SELECT 'm21.only_transfer', t.id::TEXT FROM public.transfer t JOIN public.customer c ON c.id = t.customer_id
   WHERE c.code <> 'KRN' OR t.tenant_id <> pg_temp.tenant('MOESA Europe') OR (SELECT count(*) FROM public.transfer) <> 1;
-- m21.gtin_cleared: the stored report has GTIN conflicts, each decided clear_gtin, and none left undecided
SELECT 'm21.gtin_cleared', coalesce(x.key, '(no transfer or no conflict)') FROM (VALUES (1)) one (n)
   LEFT JOIN public.transfer t ON t.tenant_id = pg_temp.tenant('MOESA Europe')
   LEFT JOIN LATERAL (SELECT c ->> 'key' AS key, c ->> 'kind' AS kind FROM jsonb_array_elements(t.report -> 'conflicts') c) x ON TRUE
   WHERE (x.key IS NULL OR (x.kind = 'gtin' AND t.decisions -> x.key ->> 'action' IS DISTINCT FROM 'clear_gtin')
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(t.report -> 'conflicts') g WHERE g ->> 'kind' = 'gtin')
          OR (t.report ->> 'unresolved')::INT <> 0);
-- m21.not_revertable: the copy's audit transactions lie in MOESA Europe and each shows as "cannot be reverted" in the feed
SELECT 'm21.not_revertable', coalesce(a::TEXT, '(no transfer or no audit transaction)') FROM (VALUES (1)) one (n)
   LEFT JOIN public.transfer t ON t.tenant_id = pg_temp.tenant('MOESA Europe') LEFT JOIN LATERAL unnest(t.audit_transaction_ids) a ON TRUE
   WHERE (a IS NULL OR NOT public.audit_transfer_locked(a)
      OR NOT EXISTS (SELECT 1 FROM public.audit_transaction x WHERE x.id = a AND x.tenant_id = pg_temp.tenant('MOESA Europe')));
-- m21.files_pending (situation): baris (owner of both companies) transferring Europe's copy of KRN onward into MOESA Trading GmbH meets transfer_files_pending (keyed on the transfer's target tenant and customer)
SELECT 'm21.files_pending', coalesce(r, '(allowed)') FROM pg_temp.refusal_as('baris@moesa-panel.test', 'MOESA Europe', 'MOESA Trading GmbH',
    (SELECT c.id FROM public.customer c WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.tenant('MOESA Europe'))) r
   WHERE r IS DISTINCT FROM 'transfer_files_pending';
-- m21.owner_required (situation): akif (management, not owner) transferring THO into MOESA Trading GmbH
SELECT 'm21.owner_required', coalesce(r, '(allowed)') FROM pg_temp.refusal_as('akif@moesa-panel.test', 'MOESA LTD', 'MOESA Trading GmbH',
    (SELECT c.id FROM public.customer c WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa())) r
   WHERE r IS DISTINCT FROM 'transfer_owner_required';
-- m21.product_in_use (situation): a product-only move of THO-CONES-100 (closed project, closed order, market cells) into MOESA Europe
SELECT 'm21.product_in_use', e FROM pg_temp.move_error('akif@moesa-panel.test', 'MOESA LTD', 'MOESA Europe', 'THO', 'THO-CONES-100') e
   WHERE e NOT LIKE '%transfer_product_in_use%';
-- m21.media_too_large (situation): baris copying THO into MOESA Trading GmbH, whose 5 MB cap the 12 MB catalogue exceeds
SELECT 'm21.media_too_large', e FROM pg_temp.copy_error('baris@moesa-panel.test', 'MOESA LTD', 'MOESA Trading GmbH', 'THO') e
   WHERE e NOT LIKE '%media_too_large%';
-- Task 11: nothing left pending, the feed's bands, the guide pages
-- enum.pending: every enum column is covered (all) or exempt with a reason; none waits on a task
SELECT 'enum.pending', tbl || '.' || col FROM story_enum_column WHERE rule = 'pending';
-- feed.bands: the notifications box groups the feed into today, yesterday, last week and older; each band has entries
SELECT 'feed.bands', b FROM unnest(ARRAY['today', 'yesterday', 'last_week', 'older']) b WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND since = b);
-- guide.page: every business page of GUIDE_PAGES (app/src/constants/guide.ts) has rows in MOESA LTD; the dashboard page is the box.* checks and feed.bands
SELECT 'guide.page', p FROM (VALUES ('setting', 'setting'), ('customer', 'customer'), ('supplier', 'supplier'), ('product', 'product'), ('project', 'project'),
   ('document', 'document'), ('media', 'media'), ('purchase_order', 'purchase_order'), ('shipment', 'shipment'), ('market_matrix', 'market_cell'),
   ('incident', 'incident'), ('change_request', 'change_request')) v (p, tbl)
   WHERE NOT pg_temp.has_rows(tbl);
-- amazon.cron_secrets: the Vault secrets the pg_cron jobs of migration 047 read exist (names only, never values)
SELECT 'amazon.cron_secrets', n FROM unnest(ARRAY['edge_function_url', 'edge_service_key']) n
   WHERE NOT EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = n);
-- m22.connected: THO's amazon account is connected with a seller id and a date
SELECT 'm22.connected' WHERE NOT EXISTS (SELECT 1 FROM public.customer_platform_account a JOIN public.customer c ON c.id = a.customer_id WHERE c.code = 'THO' AND a.platform_id = 'amazon' AND a.api_connection = 'connected' AND a.seller_id IS NOT NULL AND a.authorized_at IS NOT NULL);
-- m22.no_token: the sandbox uses the self-authorized token, so no Vault secret holds a refresh token for any account
SELECT 'm22.no_token', a.id FROM public.customer_platform_account a WHERE private.amazon_token(a.id) IS NOT NULL;
-- m22.definition: the fixture is in the cache, under the envelope's schema, for every marketplace of THO's amazon cells that has one
SELECT 'm22.definition', m FROM unnest(ARRAY['A1PA6795UKMFR9', 'A13V1IB3VIYZZH', 'APJ6JRA9NG5V4', 'A1RKKUPIHCS9HS', 'A1805IZSGTT6HS']) m
   WHERE NOT EXISTS (SELECT 1 FROM public.amazon_product_type_definition WHERE product_type = 'LUGGAGE' AND marketplace_id = m AND locale = 'en_GB' AND version = 'UHqSqmb4FNUk=' AND jsonb_typeof(schema -> 'properties') = 'object');
-- m22.group_order: the cached property groups are an array in Amazon's order (the fixture's order)
SELECT 'm22.group_order', d.marketplace_id FROM public.amazon_product_type_definition d
   WHERE d.product_type = 'LUGGAGE' AND (jsonb_typeof(d.property_groups) <> 'array'
      OR ARRAY(SELECT g ->> 'key' FROM jsonb_array_elements(d.property_groups) g) <> ARRAY['product_identity', 'offer', 'images', 'product_details', 'variations']);
-- m22.attributes: the mop has its product type, schema version, attributes and the variation theme of its family
SELECT 'm22.attributes' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE tenant_id = pg_temp.moesa() AND sku = 'THO-MOP40-2P' AND amazon_product_type = 'LUGGAGE' AND amazon_schema_version = 'UHqSqmb4FNUk='
   AND listing_attributes ? 'item_name' AND listing_attributes ? 'variation_theme');
-- m22.derived: the mop's brand, pack quantity and pack gross weight are on its product card and not typed again for Amazon; the package weight is overridden for the listing
SELECT 'm22.derived' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE tenant_id = pg_temp.moesa() AND sku = 'THO-MOP40-2P'
   AND brand = 'OKAEI' AND pack_qty = 2 AND pack_gross_g = 400 AND NOT listing_attributes ? 'brand' AND NOT listing_attributes ? 'number_of_items'
   AND listing_attributes -> 'item_package_weight' = '[{"value": 0.42, "unit": "kilograms"}]'::JSONB);
-- m22.submissions: one done, one invalid with issues
SELECT 'm22.submissions', s FROM unnest(ARRAY['done','invalid']) s WHERE NOT EXISTS (SELECT 1 FROM public.listing_submission WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s AND (s = 'done' OR jsonb_array_length(issues) > 0));
-- m22.cell_states: the step 07 THO cells carry the listing state of their journey, and the FR cell says why in its open issue
SELECT 'm22.cell_states', v.id FROM (VALUES ('5eed0007-0000-4000-8000-000000000001'::UUID, 'live'), ('5eed0007-0000-4000-8000-000000000002', 'issues'), ('5eed0007-0000-4000-8000-000000000003', 'submitted'),
   ('5eed0007-0000-4000-8000-000000000004', 'ready'), ('5eed0007-0000-4000-8000-000000000005', 'draft')) v (id, st)
   WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = v.id AND listing_state::TEXT = v.st);
-- m22.de_listing: the live DE cell has its language and fulfilment channel
SELECT 'm22.de_listing' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = '5eed0007-0000-4000-8000-000000000001' AND listing_language = 'de_DE' AND fulfillment_channel = 'fbm');
-- m22.fr_issue: the cell in issues has Amazon's issue as its open issue and the invalid submission behind it
SELECT 'm22.fr_issue' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell c JOIN public.listing_submission s ON s.cell_id = c.id AND s.status = 'invalid'
   WHERE c.id = '5eed0007-0000-4000-8000-000000000002' AND c.open_issue LIKE 'Amazon: %' AND s.issues @> '[{"code": "90220"}]' AND s.issues @> '[{"code": "90000900"}]');
-- m22.status_untouched: R2, the business status of the step 07 DE and NL cells did not move
SELECT 'm22.status_untouched', id FROM public.market_cell WHERE id IN ('5eed0007-0000-4000-8000-000000000001','5eed0007-0000-4000-8000-000000000005') AND status NOT IN ('live','suppressed');
ROLLBACK;
