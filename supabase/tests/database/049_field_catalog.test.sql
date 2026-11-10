CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The field catalog (049): every column of every public table is classified, 84 are sensitive, and
-- the role defaults give each built-in role its field rights.
BEGIN;

SELECT plan(18);

INSERT INTO public.role (display_name, tenant_id)
SELECT n, (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD') FROM unnest(ARRAY['t_check', 't_custom']) AS n;

INSERT INTO public.role_permission (role_id, permission_id)
SELECT r.id, p.id FROM public.role r JOIN public.permission p ON p.resource_name = 'public.product' AND p.command IN ('select', 'update')
WHERE r.display_name = 't_custom';

SELECT is_empty($$ SELECT c.relname, a.attname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped
     AND NOT EXISTS (SELECT 1 FROM public.field_class f WHERE f.resource_name = 'public.' || c.relname AND f.field = a.attname) $$,
   'every column of every public table is classified');
SELECT is_empty($$ SELECT resource_name, field FROM public.field_class f WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
   WHERE a.attrelid = to_regclass(f.resource_name) AND a.attname = f.field AND NOT a.attisdropped) $$, 'no classification row is stale');
SELECT is((SELECT count(*)::INT FROM public.field_class WHERE class = 'sensitive'), 84, '84 sensitive fields');
SELECT results_eq($$ SELECT group_name, count(*)::INT FROM public.field_class WHERE class = 'sensitive' GROUP BY 1 ORDER BY 1 $$,
   $$ VALUES ('contract',5),('cost',18),('finance',5),('internal_note',21),('personal_data',8),('sell_price',2),('supplier_contact',4),('supplier_identity',8),('supplier_terms',13) $$, 'group sizes after OD2');
SELECT is((SELECT group_name FROM public.field_class WHERE resource_name = 'public.product' AND field = 'target_price_eur'), 'cost', 'OD2: target price is cost');
SELECT is((SELECT group_name FROM public.field_class WHERE resource_name = 'public.customer' AND field = 'restricted_drive_url'), 'internal_note', 'OD2: drive URL is internal');
SELECT is((SELECT group_name FROM public.field_class WHERE resource_name = 'public.incident' AND field = 'affected_parties'), 'supplier_identity', 'OD2: affected parties');
SELECT is((SELECT class::TEXT FROM public.field_class WHERE resource_name = 'public.shipment' AND field = 'forwarder'), 'open', 'OD2: forwarder stays readable');
SELECT throws_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
   SELECT id, 'public.product', 'sku', TRUE, TRUE FROM public.role WHERE display_name = 't_check' $$, '23514', 'field_not_sensitive', 'only sensitive fields carry rights');
SELECT throws_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write)
   SELECT id, 'public.product', 'notes', FALSE, TRUE FROM public.role WHERE display_name = 't_check' $$, '23514', NULL, 'write implies read');
SELECT is_empty($$ SELECT 1 FROM public.permission WHERE resource_name LIKE '%.%.%' $$, 'no field right is a permission row (T18)');
SELECT ok((SELECT bool_and(can_read AND can_write) FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   JOIN public.tenant t ON t.id = r.tenant_id WHERE t.display_name = 'Atlas Danışmanlık' AND r.display_name = 'Branch manager' AND rfp.resource_name = 'public.product'), 'R1 (seed): Branch manager keeps every product field');
SELECT results_eq($$ SELECT can_read, can_write FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   JOIN public.tenant t ON t.id = r.tenant_id WHERE t.display_name = 'MOESA LTD' AND r.display_name = 'coordinator'
   AND rfp.resource_name = 'public.supplier' AND rfp.field = 'deposit_rate' $$, $$ VALUES (TRUE, FALSE) $$, 'coordinator reads, not writes, supplier terms');
SELECT is((SELECT count(*)::INT FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'customer_viewer' AND rfp.field IN ('purchase_price','notes')), 0, 'portal has no cost or notes');
SELECT ok(EXISTS (SELECT 1 FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'customer_viewer' AND rfp.resource_name = 'public.customer' AND rfp.field = 'deposit_rate' AND rfp.can_read), 'OD2: portal reads contract terms');
SELECT ok(EXISTS (SELECT 1 FROM public.user u JOIN public.user_role ur ON ur.user_id = u.id JOIN public.role r ON r.id = ur.role_id
   WHERE u.email = 'portal@moesa-panel.test' AND r.display_name = 'customer_viewer'), 'the portal test user exists');
SELECT lives_ok($$ SELECT private.backfill_role_fields() $$, 'the backfill runs');
SELECT results_eq($$ SELECT can_read, can_write FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 't_custom' AND rfp.resource_name = 'public.product' AND rfp.field = 'purchase_price' $$, $$ VALUES (TRUE, TRUE) $$, 'R1 (migration): a custom role keeps read and write on fields of tables it edits');

SELECT * FROM finish();
ROLLBACK;
