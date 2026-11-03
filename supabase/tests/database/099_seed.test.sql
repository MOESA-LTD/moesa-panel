CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The MOESA demo company of seed.sql: its roles, the THOMETZKI customer with three products (one
-- with a signed spec sheet) and the pilot project waiting on G1. Reads the seed; what it writes is
-- rolled back.
BEGIN;

SELECT plan(16);

SELECT set_config('test.tenant_id', (SELECT t.id FROM public.tenant t WHERE t.display_name = 'MOESA LTD')::TEXT, TRUE);

SELECT is(
    (SELECT p.display_name FROM public.subscription s JOIN public.plan p ON p.id = s.plan_id
     WHERE s.tenant_id = current_setting('test.tenant_id')::UUID),
    'Enterprise',
    'MOESA LTD is on the Enterprise plan'
);

SELECT is(
    (SELECT string_agg(u.email || ':' || coalesce(r.display_name, 'owner'), ',' ORDER BY u.email)
     FROM public.tenant_user tu
     JOIN public.user u ON u.id = tu.user_id
     LEFT JOIN public.user_role ur ON ur.user_id = tu.user_id
     LEFT JOIN public.role r ON r.id = ur.role_id AND r.tenant_id = tu.tenant_id
     WHERE tu.tenant_id = current_setting('test.tenant_id')::UUID),
    'akif@moesa-panel.test:management,baris@moesa-panel.test:owner,koordinator@moesa-panel.test:coordinator',
    'MOESA LTD has its owner, a management member and a coordinator'
);

-- Management: everything of the business modules.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

SELECT is(
    (SELECT count(*)::INT FROM public.product p
     JOIN public.customer c ON c.id = p.customer_id
     WHERE c.code = 'THO' AND p.status = 'on_sale'),
    3,
    'management sees the three THOMETZKI products'
);

SELECT is(
    (SELECT string_agg(e.sku || ':' || e.has_signed_spec, ',' ORDER BY e.sku) FROM public.product_evidence e),
    'THO-CONES-100:false,THO-MOP40-2P:true,THO-TIPS-6-50:false',
    'only THO-MOP40-2P has a signed spec sheet'
);

SELECT is(
    (SELECT string_agg(d.gate_code::TEXT, ',') FROM public.dashboard_gate_pending d
     JOIN public.project p ON p.id = d.project_id
     WHERE p.display_name = 'Mop ailesi çok ülke pilotu'),
    'G1',
    'the pilot project waits on G1 on the dashboard'
);

SELECT is(
    (SELECT d.customer_code || ':' || d.active_sku_count || ':' || d.signed_spec_count
     FROM public.dashboard_product_evidence d),
    'THO:3:1',
    'the dashboard shows THOMETZKI with 3 active SKUs, 1 with a signed spec sheet'
);

SELECT is(
    (SELECT string_agg(s.code, ',' ORDER BY s.code) FROM public.supplier s WHERE s.status = 'approved'),
    'CN1,CN2,ID1,TR1,TR2',
    'the five approved suppliers'
);

SELECT lives_ok(
    $$ UPDATE public.setting SET value = value WHERE key = 'management_gates' $$,
    'management may change the settings'
);

RESET ROLE;

-- Media (M19): management deletes; the coordinator uploads but does not delete.
SELECT ok(
    cardinality(private.tenants_permitting(
        (SELECT u.id FROM public.user u WHERE u.email = 'akif@moesa-panel.test'),
        ARRAY[current_setting('test.tenant_id')::UUID], 'public.media', 'delete')) = 1,
    'management may delete media'
);

SELECT ok(
    cardinality(private.tenants_permitting(
        (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test'),
        ARRAY[current_setting('test.tenant_id')::UUID], 'public.media', 'delete')) = 0
    AND cardinality(private.tenants_permitting(
        (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test'),
        ARRAY[current_setting('test.tenant_id')::UUID], 'public.media', 'insert')) = 1,
    'a coordinator uploads but does not delete media'
);

-- Coordinator: the business modules, the settings read-only.
SELECT private.impersonate(
    (SELECT u.id FROM public.user u WHERE u.email = 'koordinator@moesa-panel.test'),
    current_setting('test.tenant_id')::UUID
);

SELECT cmp_ok(
    (SELECT count(*)::INT FROM public.setting s WHERE s.tenant_id = current_setting('test.tenant_id')::UUID),
    '>', 0,
    'the coordinator reads the settings'
);

SELECT throws_ok(
    $$ UPDATE public.setting SET value = value WHERE key = 'management_gates' $$,
    '42501',
    NULL,
    'the coordinator cannot change the settings'
);

-- Branch management is not the coordinator's: the company's details stay read-only, and a branch
-- cannot be opened by a direct insert either (branches are opened by public.create_branch, owners only).
SELECT throws_ok(
    $$ UPDATE public.tenant SET display_name = display_name WHERE id = current_setting('test.tenant_id')::UUID $$,
    '42501',
    NULL,
    'the coordinator cannot change the company or its branches'
);

SELECT throws_ok(
    format('INSERT INTO public.tenant (display_name, parent_id) VALUES (%L, %L)', 'X', current_setting('test.tenant_id')),
    '42501',
    NULL,
    'the coordinator cannot open a branch'
);

SELECT lives_ok(
    $$ UPDATE public.project SET notes = 'Koordinatör notu' WHERE display_name = 'Mop ailesi çok ülke pilotu' $$,
    'the coordinator writes the projects'
);

SELECT is(
    (SELECT count(*)::INT FROM public.project p WHERE p.notes = 'Koordinatör notu'),
    1,
    'the coordinator''s change is there'
);

SELECT * FROM finish();

ROLLBACK;
