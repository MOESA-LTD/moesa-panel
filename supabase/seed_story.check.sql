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
    ('incident', 'entity_type', 'exempt', 'which kinds of record (order, shipment, project, ...) the incidents hang on is not checked; only the incident rows themselves are'),
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
SELECT 'm1.tho_contract' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.document d ON d.id = c.contract_document_id AND d.type = 'contract' AND d.status = 'signed'
  WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on <= current_date - 2 AND c.restricted_drive_url IS NOT NULL AND c.eu_responsible_person IS NOT NULL);
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
SELECT 'm4.old_certificate' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id AND d.entity_type = 'product' WHERE p.sku = 'THO-CONES-100' AND p.tenant_id = pg_temp.moesa() AND d.type = 'certificate' AND d.status = 'signed' AND d.is_signed AND d.issued_on < current_date - 365);
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
-- m5.gate_states: each story project's passed gates (in position order) and the gate it waits on
SELECT 'm5.gate_states', x.nn FROM (VALUES
    ('01', 'G1,PL_G1', 'PL_G2'), ('02', 'G2,G3', 'G4'), ('03', 'G3', 'G4'), ('04', '', 'G2'), ('05', 'G1,G2,G3,G4,G5', NULL),
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
    AND CASE x.k WHEN 'overdue' THEN t.status = 'todo' AND t.due_on = current_date - 3
                 WHEN 'due_soon' THEN t.status = 'todo' AND t.due_on = current_date + 2
                 WHEN 'blocked' THEN t.status = 'blocked'
                 WHEN 'doing_unassigned' THEN t.status = 'doing' AND t.assignee_id IS NULL
                 ELSE t.status = 'done' END);

-- Task 5: purchase orders and the gates that need a PI (core.bypass_off is the story's last block, not a check)
SELECT 'm7.missing_spec' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000001' AND status = 'draft' AND cardinality(spec_missing_line_ids) > 0);
SELECT 'm7.pi_differs' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000003' AND pi_total IS DISTINCT FROM system_total);
SELECT 'm7.balance_overdue' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000007' AND balance_planned_on < current_date);
SELECT 'm7.psi_missing' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000007' AND NOT has_approved_psi);
SELECT 'm7.deposit_zero' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order WHERE id = '5eed0005-0000-4000-8000-000000000011' AND deposit_rate = 0 AND status = 'in_production');
SELECT 'm7.production_updates' WHERE (SELECT count(*) FROM public.purchase_order_update WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000006') < 2;
SELECT 'm7.second_customer' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order o JOIN public.customer c ON c.id = o.customer_id WHERE c.code = 'KRN' AND o.status = 'sent');
SELECT 'box.po_action', s FROM unnest(ARRAY['sent', 'pi_received', 'pi_approved']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'box.po_production', s FROM unnest(ARRAY['deposit_paid', 'in_production', 'ready', 'balance_paid']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'm5.reorder_on_g4' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000003' AND gate_code = 'G4' AND waiting_days >= 10);
SELECT 'box.gates_team' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND NOT needs_management AND NOT needs_customer_approval);
SELECT 'm5.closed_project' WHERE NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000005' AND status = 'closed' AND current_phase = 'closed');
SELECT 'm5.variant_g3_passed' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND code = 'G3' AND status = 'passed');
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
    WHEN '05_deposit' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000005' AND p.kind = 'deposit' AND p.paid_on = current_date - 8 AND p.paid_by = 'company')
    WHEN '07_balance_open' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000007' AND p.kind = 'balance' AND p.planned_on = current_date - 10 AND p.paid_on IS NULL)
    WHEN '08_balance_customer' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000008' AND p.kind = 'balance' AND p.paid_on = current_date - 12 AND p.paid_by = 'customer')
    WHEN '08_freight' THEN EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000008' AND p.kind = 'other')
    WHEN '09_all_paid' THEN (SELECT count(*) FILTER (WHERE p.paid_on IS NOT NULL) = count(*) AND count(*) >= 2 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000009')
    ELSE NOT EXISTS (SELECT 1 FROM public.purchase_order_payment p WHERE p.purchase_order_id = '5eed0005-0000-4000-8000-000000000011' AND p.kind = 'deposit') END;
-- m7.psi_docs: an approved PSI report on the order in production, only a draft one on the ready order
SELECT 'm7.psi_docs' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000006' AND has_approved_psi)
   OR NOT EXISTS (SELECT 1 FROM public.document WHERE entity_type = 'purchase_order' AND entity_id = '5eed0005-0000-4000-8000-000000000007' AND type = 'psi_report' AND status = 'draft');
-- m5.g3_pi: each G3 of a story project passed on the PI of that project's approved order
SELECT 'm5.g3_pi', x.nn FROM (VALUES ('02', '05'), ('03', '04'), ('05', '09')) x (nn, po)
WHERE NOT EXISTS (SELECT 1 FROM public.project_gate g JOIN public.purchase_order o ON o.id = ('5eed0005-0000-4000-8000-0000000000' || x.po)::UUID AND o.project_id = g.project_id
    WHERE g.project_id = ('5eed0004-0000-4000-8000-0000000000' || x.nn)::UUID AND g.code = 'G3' AND g.status = 'passed' AND o.pi_document_id = ANY (g.evidence_document_ids));

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
SELECT 'm8.accepted_on' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000008' AND accepted_on = current_date - 3 AND delivered_at < now() - interval '4 days');
-- m8.delivered: delivered yesterday, its dispute deadline three days ahead
SELECT 'm8.delivered' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000007' AND dispute_deadline_at BETWEEN now() + interval '2 days 12 hours' AND now() + interval '3 days 12 hours' AND delivered_at BETWEEN now() - interval '2 days' AND now() - interval '12 hours');
SELECT 'm8.disputed' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000009' AND has_damage AND delivered_at IS NOT NULL AND dispute_deadline_at = delivered_at + interval '48 hours' AND dispute_deadline_at < now());
-- m8.booked: the booked shipment's confirmation and dates; the loaded one leaves tomorrow
SELECT 'm8.booked' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000002' AND booking_confirmed_on = current_date - 2 AND etd = current_date + 5 AND eta = current_date + 30)
   OR NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000003' AND etd = current_date + 1 AND eta = current_date + 28);
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

ROLLBACK;
