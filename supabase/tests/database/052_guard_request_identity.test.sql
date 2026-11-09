CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Request-identity guards (052): a server-only column guard follows the request role, not
-- current_user (R6), and a child guard detects a cascade by its parent being gone, not by trigger
-- depth (R7). A SECURITY DEFINER forwarder owned by a role other than authenticated (as the api
-- views will be) makes current_user <> 'authenticated' and the base trigger depth 2.
BEGIN;

SELECT plan(19);

SELECT private.field_test_fixtures();
SELECT private.create_test_helpers();

-- The forwarder role: a member of authenticated (its policies apply), not authenticated itself.
CREATE ROLE t_fwd NOLOGIN;
GRANT t_fwd TO postgres;
GRANT authenticated TO t_fwd;
GRANT USAGE, CREATE ON SCHEMA t TO t_fwd;
GRANT ALL ON public.market_cell, public.customer_platform_account, public.purchase_order_line, public.purchase_order_payment,
   public.shipment_line, public.shipment_purchase_order, public.incident_log TO t_fwd;

-- t.<table>: a view over the base table whose INSTEAD OF trigger (SECURITY DEFINER, owner t_fwd)
-- applies the update or delete to the base row by id. shipment_purchase_order has no id: its key is
-- (shipment_id, purchase_order_id).
CREATE FUNCTION t.forward () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
   search_path = '' AS $$
DECLARE
    cols TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'shipment_purchase_order' THEN
            DELETE FROM public.shipment_purchase_order s WHERE s.shipment_id = OLD.shipment_id AND s.purchase_order_id = OLD.purchase_order_id;
        ELSE
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', TG_TABLE_NAME) USING OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO cols
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = format('public.%I', TG_TABLE_NAME)::REGCLASS AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
    EXECUTE format('UPDATE public.%1$I b SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1)) WHERE b.id = $2',
                   TG_TABLE_NAME, cols)
    USING to_jsonb(NEW), OLD.id;
    RETURN NEW;
END;
$$;
ALTER FUNCTION t.forward () OWNER TO t_fwd;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['market_cell', 'customer_platform_account', 'purchase_order_line', 'purchase_order_payment',
                               'shipment_line', 'shipment_purchase_order', 'incident_log'] LOOP
        EXECUTE format('CREATE VIEW t.%1$I AS SELECT * FROM public.%1$I', tbl);
        EXECUTE format('CREATE TRIGGER forward INSTEAD OF UPDATE OR DELETE ON t.%1$I FOR EACH ROW EXECUTE FUNCTION t.forward ()', tbl);
        EXECUTE format('GRANT ALL ON t.%1$I TO authenticated', tbl);
    END LOOP;
END;
$$;

-- Locked parents, so each direct delete is refused: the approved order closed, the shipment
-- loaded, the incident closed.
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = 'closed' WHERE id = current_setting('test.po_approved')::UUID;
UPDATE public.shipment SET status = 'loaded' WHERE id = current_setting('test.shp')::UUID;
UPDATE public.incident SET status = 'closed' WHERE id = current_setting('test.inc')::UUID;
-- The live cell is listed (no request: the server-only guard does not apply).
UPDATE public.market_cell SET listing_state = 'live', listing_checked_at = now() WHERE id = current_setting('test.live_cell')::UUID;

-- T scratch: a customer, supplier and product; a draft order with a line, an approved order with a
-- line, a candidate and a live cell. Numbered in its own tenant, as baris (a member).
INSERT INTO public.tenant (display_name) VALUES ('T scratch');
SELECT set_config('test.scratch', (SELECT id FROM public.tenant WHERE display_name = 'T scratch')::TEXT, TRUE);
INSERT INTO public.tenant_user (tenant_id, user_id) VALUES (current_setting('test.scratch')::UUID, current_setting('test.baris')::UUID);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.baris'), 'role', 'authenticated')::TEXT, TRUE);
SELECT set_config('request.headers', json_build_object('x-tenant-id', current_setting('test.scratch'))::TEXT, TRUE);
SELECT set_config('test.s_customer', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('test.s_supplier', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('test.s_product', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('test.s_po_draft', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('test.s_po_approved', gen_random_uuid()::TEXT, TRUE);
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES (current_setting('test.s_customer')::UUID, current_setting('test.scratch')::UUID, 'SCR', 'Scratch Customer', 'trading_partner');
INSERT INTO public.supplier (id, tenant_id, code, display_name, country)
VALUES (current_setting('test.s_supplier')::UUID, current_setting('test.scratch')::UUID, 'SC1', 'Scratch Supplier', 'CN');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, supplier_id)
VALUES (current_setting('test.s_product')::UUID, current_setting('test.scratch')::UUID, current_setting('test.s_customer')::UUID,
        'SCR-1', 'Scratch product', current_setting('test.s_supplier')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate, pi_total)
VALUES (current_setting('test.s_po_draft')::UUID, current_setting('test.scratch')::UUID, current_setting('test.s_customer')::UUID,
        current_setting('test.s_supplier')::UUID, 'USD', 'FOB', 0.3, 100),
       (current_setting('test.s_po_approved')::UUID, current_setting('test.scratch')::UUID, current_setting('test.s_customer')::UUID,
        current_setting('test.s_supplier')::UUID, 'USD', 'FOB', 0.3, 100);
INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES (current_setting('test.scratch')::UUID, current_setting('test.s_po_draft')::UUID, current_setting('test.s_product')::UUID, 10, 10),
       (current_setting('test.scratch')::UUID, current_setting('test.s_po_approved')::UUID, current_setting('test.s_product')::UUID, 10, 10);
UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = current_setting('test.s_po_approved')::UUID;
INSERT INTO public.market_cell (tenant_id, product_id, platform_id, country, status)
VALUES (current_setting('test.scratch')::UUID, current_setting('test.s_product')::UUID, 'amazon', 'DE', 'candidate'),
       (current_setting('test.scratch')::UUID, current_setting('test.s_product')::UUID, 'amazon', 'FR', 'live');
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT set_config('request.headers', '', TRUE);
SELECT set_config('moesa.rules_bypass', '', TRUE);

-- R6, as koordinator in MOESA LTD.
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
SELECT throws_ok($$ UPDATE t.market_cell SET listing_state = 'live' WHERE id = current_setting('test.cell')::UUID $$,
   '23514', 'market_cell_listing_server_only', 'R6: listing_state stays server-only through a definer forwarder');
-- The fixture account is connected (seed): 'revoked' is a change, and the disconnect below one too.
SELECT throws_ok($$ UPDATE t.customer_platform_account SET api_connection = 'revoked' WHERE id = current_setting('test.acct')::UUID $$,
   '23514', 'platform_account_api_server_only', 'R6: api_connection stays server-only through a definer forwarder');

-- R6 and R7, as akif in MOESA LTD.
RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
SELECT lives_ok($$ SELECT public.amazon_account_disconnect(current_setting('test.acct')::UUID, 'none') $$,
   'R6: the allowed definer RPC still writes it');
SELECT throws_ok($$ UPDATE public.customer_platform_account SET api_connection = 'connected' WHERE id = current_setting('test.acct')::UUID $$,
   '23514', 'platform_account_api_server_only', 'R6: the server-write flag ends with the RPC call (api_connection)');
SELECT lives_ok($$ SELECT public.listing_begin_submission(current_setting('test.cell')::UUID, 'create', '{}') $$,
   'R6: listing_begin_submission still writes the listing state');
SELECT throws_ok($$ UPDATE public.market_cell SET listing_state = 'live' WHERE id = current_setting('test.cell')::UUID $$,
   '23514', 'market_cell_listing_server_only', 'R6: the server-write flag ends with the RPC call (listing_state)');
SELECT is(t.error_of($$ DELETE FROM t.purchase_order_line WHERE id = current_setting('test.line_approved')::UUID $$),
   '23514:po_locked', 'R7: a delete through a view behaves like a direct delete (purchase_order_line)');
SELECT is(t.error_of($$ DELETE FROM t.purchase_order_payment WHERE id = current_setting('test.payment')::UUID $$),
   t.error_of($$ DELETE FROM public.purchase_order_payment WHERE id = current_setting('test.payment')::UUID $$),
   'R7: purchase_order child through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.shipment_line WHERE id = current_setting('test.shp_line')::UUID $$),
   t.error_of($$ DELETE FROM public.shipment_line WHERE id = current_setting('test.shp_line')::UUID $$),
   'R7: shipment_line through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.shipment_purchase_order
                         WHERE shipment_id = current_setting('test.shp')::UUID AND purchase_order_id = current_setting('test.po_approved')::UUID $$),
   t.error_of($$ DELETE FROM public.shipment_purchase_order
                  WHERE shipment_id = current_setting('test.shp')::UUID AND purchase_order_id = current_setting('test.po_approved')::UUID $$),
   'R7: shipment_purchase_order through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.incident_log WHERE id = current_setting('test.inc_log')::UUID $$),
   t.error_of($$ DELETE FROM public.incident_log WHERE id = current_setting('test.inc_log')::UUID $$),
   'R7: incident child through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.market_cell WHERE id = current_setting('test.live_cell')::UUID $$),
   '23514:market_cell_delete_candidate_only', 'R7: a live market cell through a view is refused');
SELECT is(t.error_of($$ DELETE FROM t.market_cell WHERE id = current_setting('test.live_cell')::UUID $$),
   t.error_of($$ DELETE FROM public.market_cell WHERE id = current_setting('test.live_cell')::UUID $$),
   'R7: market cell through a view = direct');

-- A copy of THO into MOESA Europe, as akif, carries the live cell's listing state (the transfer exit
-- of market_cell_listing_server_only). Conflicts are decided as the story does.
CREATE FUNCTION pg_temp.copy_tho () RETURNS JSONB LANGUAGE plpgsql AS $f$
DECLARE
    decisions JSONB := '{}';
    added JSONB;
    report JSONB;
BEGIN
    FOR i IN 1..5 LOOP
        report := public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
                                           current_setting('test.tho')::UUID, 'copy', decisions => decisions);
        SELECT coalesce(jsonb_object_agg(c ->> 'key', CASE c ->> 'kind'
                   WHEN 'gtin' THEN '{"action": "clear_gtin"}'::JSONB
                   WHEN 'code' THEN '{"action": "new_code"}'::JSONB
                   WHEN 'media_link' THEN '{"action": "demote"}'::JSONB
                   ELSE jsonb_build_object('action', 'map', 'target_id', c -> 'existing_id')
               END), '{}')
        INTO added
        FROM jsonb_array_elements(report -> 'conflicts') c
        WHERE NOT (c -> 'actions') ? coalesce(decisions -> (c ->> 'key') ->> 'action', '');
        EXIT WHEN added = '{}';
        decisions := decisions || added;
    END LOOP;
    PERFORM set_config('audit.transaction_id', '', TRUE);
    RETURN public.transfer_customer(current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
                                    current_setting('test.tho')::UUID, 'copy', decisions => decisions, dry_run => FALSE,
                                    report_hash => report ->> 'report_hash');
END;
$f$;
SELECT lives_ok($$ SELECT pg_temp.copy_tho() $$, 'a transfer copies a customer whose market cell has a listing state');
RESET ROLE;
SELECT is((SELECT m.listing_state::TEXT FROM public.market_cell m JOIN public.product p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
           WHERE m.tenant_id = current_setting('test.europe')::UUID AND p.sku = 'SPIKE-SECRET' AND m.platform_id = 'amazon' AND m.country = 'FR'),
   'live', 'the copy carries the listing state');

-- Cascades, as postgres without a request and with the rules on.
RESET ROLE;
SELECT private.unimpersonate();
SELECT lives_ok($$ DELETE FROM public.purchase_order WHERE id = current_setting('test.s_po_draft')::UUID $$,
   'a parent delete cascades its lines');
SELECT lives_ok($$ DELETE FROM public.tenant WHERE display_name = 'T scratch' $$,
   'a tenant delete cascades everything (an approved order''s line, a live cell)');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND prosrc ~ 'current_user\s*=\s*''authenticated'''),
   'no guard tests current_user');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND proname LIKE '%guard' AND prosrc ~ 'pg_trigger_depth'),
   'no guard detects a cascade by depth');

SELECT * FROM finish();
ROLLBACK;
