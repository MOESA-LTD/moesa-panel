CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Purchase order rules (030) on the MOESA demo company of seed.sql: the status flow (one step at a
-- time, no deposit step at 0 %, cancelled and closed final, the code trigger's draft on insert), the
-- spec sheet rule before and from spec_sheet_required_from, the PI document, checklist and S09
-- arithmetic, the locks from pi_approved, the payment gates, the closed order's children, the
-- overview's figures and hints, and the rules_bypass flag a user cannot use. What it writes is
-- rolled back.
BEGIN;

SELECT plan(33);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('tr1', (SELECT id FROM public.supplier WHERE code = 'TR1')),
    ('cn1', (SELECT id FROM public.supplier WHERE code = 'CN1')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('tips', (SELECT id FROM public.product WHERE sku = 'THO-TIPS-6-50')),
    ('cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100')),
    ('spec_mop', (SELECT d.id FROM public.document d JOIN public.product p ON p.id = d.entity_id
                  WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet')),
    ('rosbach', (SELECT id FROM public.customer_warehouse WHERE display_name = 'Rosbach')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu'))
) AS x (k, v);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

-- Fixtures, as the coordinator. Every order is THO / TR1 / USD (EXW and 30 % from TR1); f has no deposit.
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, status, supplier_id)
VALUES ('00000000-0000-4000-8000-000000030001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'THO-NEW-1', 'New mop', 'development', current_setting('test.tr1')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, deposit_rate)
VALUES ('00000000-0000-4000-8000-000000030011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL),
       ('00000000-0000-4000-8000-000000030013', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030014', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL),
       ('00000000-0000-4000-8000-000000030015', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030016', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 0);
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price, spec_document_id)
VALUES ('00000000-0000-4000-8000-000000030021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', current_setting('test.mop')::UUID, 1000, 2, NULL), ('00000000-0000-4000-8000-000000030022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', current_setting('test.tips')::UUID, 10, 1, NULL),
       ('00000000-0000-4000-8000-000000030023', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030013', '00000000-0000-4000-8000-000000030001', 5, 1, NULL), ('00000000-0000-4000-8000-000000030024', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030014', current_setting('test.tips')::UUID, 5, 1, NULL),
       ('00000000-0000-4000-8000-000000030025', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030015', current_setting('test.mop')::UUID, 5, 1, current_setting('test.spec_mop')::UUID), ('00000000-0000-4000-8000-000000030026', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030016', current_setting('test.mop')::UUID, 1, 1, NULL);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000030031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000030011', 'pi', 'https://example.test/pi-a.pdf'),
       ('00000000-0000-4000-8000-000000030032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000030012', 'pi', 'https://example.test/pi-b.pdf');

-- The status guard runs after the code trigger: a client-sent status is replaced by draft, not refused.
SELECT lives_ok($$ INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, status)
                   VALUES ('00000000-0000-4000-8000-000000030017', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID,
                           current_setting('test.tr1')::UUID, 'USD', 'balance_paid') $$,
                'an insert with a client-sent status passes the guard');
SELECT is((SELECT status::TEXT FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000030017'), 'draft',
          'and the order starts as a draft');

RESET ROLE;
UPDATE public.setting SET value = to_jsonb((current_date + 1)::TEXT) WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'spec_sheet_required_from';
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_status_order', 'no skipping statuses');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030012' $$,
                 '23514', 'po_lines_required', 'an order needs lines');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'before the date, SKUs on sale go without a spec reference');
SELECT is((SELECT cardinality(spec_missing_line_ids) FROM public.purchase_order_overview WHERE id = '00000000-0000-4000-8000-000000030011'), 0,
          'no missing-spec hint before the date for SKUs on sale');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030013' $$,
                 '23514', 'po_spec_sheet_required', 'a new SKU needs its spec sheet');
SELECT is((SELECT spec_missing_line_ids FROM public.purchase_order_overview WHERE id = '00000000-0000-4000-8000-000000030013'),
          ARRAY['00000000-0000-4000-8000-000000030023']::UUID[], 'the overview names the new SKU''s line');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'draft' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_status_order', 'no going back');

RESET ROLE;
UPDATE public.setting SET value = to_jsonb((current_date)::TEXT) WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'spec_sheet_required_from';
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030014' $$,
                 '23514', 'po_spec_sheet_required', 'from the date on, every SKU');
SELECT throws_ok($$ UPDATE public.purchase_order_line SET spec_document_id = current_setting('test.spec_mop')::UUID WHERE id = '00000000-0000-4000-8000-000000030024' $$,
                 '23514', 'po_line_spec_invalid', 'another product''s spec sheet does not count');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030015' $$,
                'a referenced signed spec sheet passes');
SELECT throws_ok($$ INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030015', current_setting('test.tips')::UUID, 1, 1) $$,
                 '23514', 'po_spec_sheet_required', 'a sent order takes no line without a spec sheet');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_received' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_required', 'PI document and total first');
SELECT throws_ok($$ UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000030032' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_document_invalid', 'only this order''s PI');

UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000030031', pi_total = 2600, status = 'pi_received' WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_checklist_incomplete', 'all 30 S09 items must be OK');

UPDATE public.purchase_order SET pi_check = (SELECT jsonb_object_agg(i::TEXT, 'ok') FROM generate_series(1, 30) AS i) WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order
                    SET pi_subtotal = 2510, pi_extra_amount = 150, pi_discount_amount = 50, pi_total = 2610,
                        pi_deposit_amount = 783, pi_balance_amount = 1827, status = 'pi_approved'
                    WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_mismatch', 'a PI that does not add up is not approved');
SELECT lives_ok($$ UPDATE public.purchase_order
                   SET pi_subtotal = 2010, pi_extra_amount = 150, pi_discount_amount = 50, pi_total = 2110,
                       pi_deposit_amount = 633, pi_balance_amount = 1477, status = 'pi_approved'
                   WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'exact figures approve the PI');
SELECT is((SELECT pi_checked_by FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000030011'), current_setting('test.koordinator')::UUID, 'the checker is recorded');
SELECT is((SELECT system_subtotal || ':' || system_total || ':' || system_deposit || ':' || system_balance
           FROM public.purchase_order_overview WHERE id = '00000000-0000-4000-8000-000000030011'),
          '2010.00:2110.00:633.00:1477.00', 'the overview recalculates the PI');
SELECT throws_ok($$ UPDATE public.purchase_order_line SET quantity = 999 WHERE id = '00000000-0000-4000-8000-000000030021' $$,
                 '23514', 'po_locked', 'lines are fixed after PI approval');
SELECT throws_ok($$ UPDATE public.purchase_order SET currency = 'EUR' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_locked', 'terms are fixed after PI approval');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_deposit_unpaid', 'a paid deposit first');

INSERT INTO public.purchase_order_payment (id, tenant_id, purchase_order_id, kind, amount, currency, paid_on)
VALUES ('00000000-0000-4000-8000-000000030041', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', 'deposit', 633, 'USD', current_date);
UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030011';
UPDATE public.purchase_order SET status = 'in_production' WHERE id = '00000000-0000-4000-8000-000000030011';
UPDATE public.purchase_order SET status = 'ready' WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'balance_paid' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_balance_unpaid', 'a paid balance first');

INSERT INTO public.purchase_order_payment (id, tenant_id, purchase_order_id, kind, amount, currency, paid_on)
VALUES ('00000000-0000-4000-8000-000000030042', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', 'balance', 1477, 'USD', current_date);

SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'balance_paid' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'a paid balance lets the order move on');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'and close');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_status_order', 'closed is final');
SELECT throws_ok($$ UPDATE public.purchase_order_payment SET notes = 'late' WHERE id = '00000000-0000-4000-8000-000000030042' $$,
                 '23514', 'po_closed', 'a closed order''s payments no longer change');

RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030016';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030016' $$,
                 '23514', 'po_status_order', 'no deposit step at 0 %');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'in_production' WHERE id = '00000000-0000-4000-8000-000000030016' $$,
                'no deposit, straight to production');

UPDATE public.purchase_order SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000030013';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'draft' WHERE id = '00000000-0000-4000-8000-000000030013' $$,
                 '23514', 'po_status_order', 'cancelled is final');
SELECT throws_ok($$ INSERT INTO public.purchase_order_update (tenant_id, purchase_order_id, note)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030013', 'late note') $$,
                 '23514', 'po_closed', 'a cancelled order takes no more notes');

-- The bypass is not honoured for a user (role authenticated), even with the flag set.
SELECT set_config('moesa.rules_bypass', '1', TRUE);
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030012' $$,
                 '23514', 'po_status_order', 'an impersonated user cannot use the bypass flag');
SELECT set_config('moesa.rules_bypass', '', TRUE);

SELECT * FROM finish();

ROLLBACK;
