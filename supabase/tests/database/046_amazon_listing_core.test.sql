CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- The Amazon listing core (046) on the demo companies of seed.sql: the new columns and enums; the
-- definition cache is read by every user and written by none; a user's submission starts
-- processing with no issues and is never changed by a user; listing_state and the Amazon
-- connection are server-only; another tenant sees no submission; as the service role, connecting
-- an account stores its token in Vault (one secret per account) and disconnecting with 'none'
-- removes it; listing_apply_submission walks market_cell.status only through the legal
-- transitions (R2: accepted → uploaded, live only with the listing data, issues keep the status
-- and write open_issue) and fills the platform product ID from the ASIN; the parent cell is
-- created on demand and mirrors its worst child (R7); the registry row, the public bucket and the
-- coordinator's publish permission are there; a transferred account starts disconnected. The
-- cells are THO-MOP40-2P's on amazon PL, SE, BE and GB, inserted as postgres and walked with
-- UPDATEs. What it writes is rolled back.
BEGIN;

SELECT plan(45);

SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('europe', (SELECT id FROM public.tenant WHERE display_name = 'MOESA Europe')),
    ('eski', (SELECT id FROM public.tenant WHERE display_name = 'Eski Ticaret')),
    ('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test')),
    ('selin', (SELECT id FROM public.user WHERE email = 'selin@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('acct', (SELECT a.id FROM public.customer_platform_account a JOIN public.customer c ON c.id = a.customer_id
              WHERE c.code = 'THO' AND a.platform_id = 'amazon'))
) AS x (k, v);

-- The four cells, as postgres: PL preparing (later complete), SE planned, BE a candidate, GB
-- uploaded without a price.
INSERT INTO public.market_cell (tenant_id, customer_id, product_id, platform_id, country)
SELECT current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.mop')::UUID, 'amazon', c
FROM unnest(ARRAY['PL', 'SE', 'BE', 'GB']) AS c;

SELECT set_config('test.cell_' || lower(m.country), m.id::TEXT, TRUE)
FROM public.market_cell m
WHERE m.product_id = current_setting('test.mop')::UUID AND m.platform_id = 'amazon';

UPDATE public.market_cell SET status = 'planned' WHERE id IN (current_setting('test.cell_pl')::UUID, current_setting('test.cell_se')::UUID, current_setting('test.cell_gb')::UUID);
UPDATE public.market_cell SET status = 'preparing' WHERE id IN (current_setting('test.cell_pl')::UUID, current_setting('test.cell_gb')::UUID);
UPDATE public.market_cell SET status = 'uploaded', platform_sku = 'THO-MOP40-2P', platform_product_id = 'B07N4M94X4',
    currency = 'GBP', stock_source = 'platform', content_status = 'approved'
WHERE id = current_setting('test.cell_gb')::UUID;
UPDATE public.market_cell SET price = 12.99, currency = 'PLN', stock_source = 'platform', content_status = 'approved'
WHERE id = current_setting('test.cell_pl')::UUID;

-- The submissions the service applies, as postgres.
DO $$
DECLARE
    s RECORD;
    new_id UUID;
BEGIN
    FOR s IN SELECT * FROM (VALUES ('preparing', 'pl'), ('planned', 'se'), ('candidate', 'be'), ('complete', 'pl'), ('no_price', 'gb'), ('issues', 'be')) AS v (k, cell) LOOP
        INSERT INTO public.listing_submission (tenant_id, cell_id, kind, sku, marketplace_id, payload)
        VALUES (current_setting('test.moesa')::UUID, current_setting('test.cell_' || s.cell)::UUID, 'create', 'THO-MOP40-2P', 'A1C3SOZRARQ6R3', '{}')
        RETURNING id INTO new_id;
        PERFORM set_config('test.sub_' || s.k, new_id::TEXT, TRUE);
    END LOOP;
END;
$$;

-- 1–11. The columns.
SELECT has_column('public', 'product', 'amazon_product_type', 'product.amazon_product_type');
SELECT has_column('public', 'product', 'amazon_schema_version', 'product.amazon_schema_version');
SELECT has_column('public', 'product', 'listing_attributes', 'product.listing_attributes');
SELECT has_column('public', 'customer_platform_account', 'api_connection', 'customer_platform_account.api_connection');
SELECT has_column('public', 'customer_platform_account', 'authorized_at', 'customer_platform_account.authorized_at');
SELECT has_column('public', 'customer_platform_account', 'seller_id', 'customer_platform_account.seller_id');
SELECT has_column('public', 'market_cell', 'listing_state', 'market_cell.listing_state');
SELECT has_column('public', 'market_cell', 'listing_checked_at', 'market_cell.listing_checked_at');
SELECT has_column('public', 'market_cell', 'listing_language', 'market_cell.listing_language');
SELECT has_column('public', 'market_cell', 'fulfillment_channel', 'market_cell.fulfillment_channel');
SELECT has_column('public', 'market_cell', 'listing_match', 'market_cell.listing_match');

-- 12–15. The enums.
SELECT enum_has_labels('public', 'listing_state', ARRAY['draft', 'ready', 'submitted', 'live', 'issues'], 'listing_state values');
SELECT enum_has_labels('public', 'api_connection', ARRAY['none', 'connected', 'revoked'], 'api_connection values');
SELECT enum_has_labels('public', 'listing_submission_kind', ARRAY['create', 'update', 'delete'], 'submission kinds');
SELECT enum_has_labels('public', 'listing_submission_status', ARRAY['accepted', 'invalid', 'processing', 'done', 'failed'], 'submission statuses');

-- 16–23. akif in MOESA LTD.
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);

SELECT lives_ok($$ SELECT * FROM public.amazon_product_type_definition $$, 'a user reads the definition cache');
SELECT throws_ok(
    $$ INSERT INTO public.amazon_product_type_definition (marketplace_id, product_type, locale, version, schema, property_groups)
       VALUES ('X', 'Y', 'en_GB', '1', '{}', '{}') $$,
    '42501',
    NULL,
    'a user cannot write the definition cache'
);

WITH s AS (
    INSERT INTO public.listing_submission (tenant_id, cell_id, kind, sku, marketplace_id, payload, status, issues, amazon_submission_id)
    VALUES (current_setting('test.moesa')::UUID, current_setting('test.cell_se')::UUID, 'create', 'THO-MOP40-2P', 'A2NODRKZP88ZB9', '{}',
            'done', '[{"message": "forged"}]', 'forged')
    RETURNING id, status
)
SELECT set_config('test.sub', s.id::TEXT, TRUE), set_config('test.inserted_status', s.status::TEXT, TRUE) FROM s;

SELECT is(current_setting('test.inserted_status'), 'processing', 'a user insert starts processing');
SELECT is((SELECT issues FROM public.listing_submission WHERE id = current_setting('test.sub')::UUID), '[]'::JSONB, 'a user insert carries no issues');

UPDATE public.listing_submission SET status = 'done';
SELECT is(
    (SELECT status::TEXT FROM public.listing_submission WHERE id = current_setting('test.sub')::UUID),
    'processing',
    'a user cannot update a submission'
);

SELECT throws_ok(
    $$ UPDATE public.market_cell SET listing_state = 'live' WHERE id = current_setting('test.cell_pl')::UUID $$,
    '23514',
    'market_cell_listing_server_only',
    'listing_state is server-only'
);
SELECT throws_ok(
    $$ UPDATE public.customer_platform_account SET api_connection = 'connected' WHERE id = current_setting('test.acct')::UUID $$,
    '23514',
    'platform_account_api_server_only',
    'api_connection is server-only'
);
SELECT throws_ok(
    $$ SELECT public.amazon_account_token(current_setting('test.acct')::UUID) $$,
    '42501',
    NULL,
    'a user cannot read a token'
);

RESET ROLE;

-- 24. A user of Eski Ticaret.
SELECT private.impersonate(current_setting('test.selin')::UUID, current_setting('test.eski')::UUID);
SELECT is((SELECT count(*) FROM public.listing_submission)::INT, 0, 'another tenant sees no submission');
RESET ROLE;

-- 25–30. The service role: connect, the token, disconnect.
SET LOCAL ROLE service_role;

SELECT is(
    (public.amazon_account_connect(current_setting('test.acct')::UUID, 'Atzr|test', 'A3TEST')).api_connection,
    'connected',
    'connect sets connected'
);
SELECT is(public.amazon_account_token(current_setting('test.acct')::UUID), 'Atzr|test', 'the token round-trips through Vault');
SELECT ok(
    (SELECT seller_id = 'A3TEST' AND authorized_at IS NOT NULL FROM public.customer_platform_account WHERE id = current_setting('test.acct')::UUID),
    'connect stores the seller id and the date'
);

RESET ROLE;
SELECT is((SELECT count(*) FROM vault.secrets WHERE name = 'amazon:' || current_setting('test.acct'))::INT, 1, 'one secret per account');
SET LOCAL ROLE service_role;

SELECT lives_ok($$ SELECT public.amazon_account_disconnect(current_setting('test.acct')::UUID, 'none') $$, 'disconnect');
SELECT is(public.amazon_account_token(current_setting('test.acct')::UUID), NULL, 'disconnect none removes the token');

-- 31–39. Applying submissions (R2).
SELECT is(
    (public.listing_apply_submission(current_setting('test.sub_preparing')::UUID, 'accepted', 'f1dc2914-75dd-11ea-bc55-0242ac130003', '[]', 'submitted', NULL)).status,
    'uploaded',
    'accepted moves preparing to uploaded'
);
SELECT is(
    (public.listing_apply_submission(current_setting('test.sub_planned')::UUID, 'accepted', 's2', '[]', 'submitted', NULL)).status,
    'uploaded',
    'accepted walks planned through preparing'
);
SELECT is(
    (public.listing_apply_submission(current_setting('test.sub_candidate')::UUID, 'accepted', 's3', '[]', 'submitted', NULL)).status,
    'candidate',
    'a candidate stays a candidate'
);
SELECT is(
    (public.listing_apply_submission(current_setting('test.sub_complete')::UUID, 'done', NULL, '[]', 'live', 'B07N4M94X4')).status,
    'live',
    'live with complete data goes live'
);
SELECT is((SELECT launched_on FROM public.market_cell WHERE id = current_setting('test.cell_pl')::UUID), current_date, 'going live dates the launch');

SELECT is(
    (public.listing_apply_submission(current_setting('test.sub_no_price')::UUID, 'done', NULL, '[]', 'live', 'B07N4M94X4')).status,
    'uploaded',
    'live without a price keeps uploaded'
);
SELECT is((SELECT listing_state FROM public.market_cell WHERE id = current_setting('test.cell_gb')::UUID), 'live', 'its listing_state is live anyway');
SELECT matches(
    (public.listing_apply_submission(
        current_setting('test.sub_issues')::UUID, 'done', NULL,
        '[{"code":"90220","message":"''size'' is required but not supplied.","severity":"ERROR","attributeNames":["size"]}]',
        'issues', NULL
    )).open_issue,
    '^Amazon: ''size'' is required',
    'issues write open_issue and keep the status'
);
SELECT is((SELECT platform_product_id FROM public.market_cell WHERE id = current_setting('test.cell_pl')::UUID), 'B07N4M94X4', 'the ASIN fills the platform product id');

-- The parent case: a parent product with one child, the child's cell on amazon DE.
RESET ROLE;

WITH parent AS (
    INSERT INTO public.product (tenant_id, customer_id, sku, display_name)
    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'THO-M22-PARENT', 'M22 parent')
    RETURNING id
), child AS (
    INSERT INTO public.product (tenant_id, customer_id, parent_id, sku, display_name)
    SELECT current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, parent.id, 'THO-M22-CHILD', 'M22 child' FROM parent
    RETURNING id
), cell AS (
    INSERT INTO public.market_cell (tenant_id, customer_id, product_id, platform_id, country)
    SELECT current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, child.id, 'amazon', 'DE' FROM child
    RETURNING id
)
SELECT set_config('test.child_cell', cell.id::TEXT, TRUE) FROM cell;

WITH s AS (
    INSERT INTO public.listing_submission (tenant_id, cell_id, kind, sku, marketplace_id, payload)
    VALUES (current_setting('test.moesa')::UUID, current_setting('test.child_cell')::UUID, 'create', 'THO-M22-CHILD', 'A1PA6795UKMFR9', '{}')
    RETURNING id
)
SELECT set_config('test.sub_child', s.id::TEXT, TRUE) FROM s;

SET LOCAL ROLE service_role;

-- 40–41.
SELECT isnt(public.listing_parent_cell(current_setting('test.child_cell')::UUID), NULL, 'the parent cell is created');

SELECT 1 FROM public.listing_apply_submission(
    current_setting('test.sub_child')::UUID, 'done', NULL, '[{"code":"18027","message":"image","severity":"ERROR"}]', 'issues', NULL
);

SELECT is(
    (SELECT listing_state FROM public.market_cell WHERE id = public.listing_parent_cell(current_setting('test.child_cell')::UUID)),
    'issues',
    'the parent mirrors the worst child'
);

RESET ROLE;

-- 42–44. The registry, the bucket, the coordinator.
SELECT ok(
    EXISTS (SELECT 1 FROM private.transfer_registry WHERE table_name = 'listing_submission' AND parent_table = 'market_cell'),
    'listing_submission is registered'
);
SELECT ok((SELECT public FROM storage.buckets WHERE id = 'listing-images'), 'listing-images is public');
SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.role_permission rp
        JOIN public.role r ON r.id = rp.role_id
        JOIN public.permission p ON p.id = rp.permission_id
        WHERE r.tenant_id = current_setting('test.moesa')::UUID AND r.display_name = 'coordinator'
          AND p.resource_name = 'public.listing_submission' AND p.command = 'insert'
    ),
    'the coordinator may publish'
);

-- 45. A connected account inserted by a transfer (the flag raised as 040's test does).
INSERT INTO public.customer (tenant_id, code, display_name, commercial_model)
VALUES (current_setting('test.moesa')::UUID, 'ZZA', 'Zed Amazon', 'trading_partner');

INSERT INTO public.transfer (id, tenant_id, source_tenant_id, customer_id, mode, path, started_by, report)
VALUES ('00000000-0000-4000-8000-000000046001', current_setting('test.moesa')::UUID, current_setting('test.europe')::UUID,
        current_setting('test.tho')::UUID, 'copy', 'copy', current_setting('test.akif')::UUID, '{}');

SELECT set_config('moesa.transfer_id', '00000000-0000-4000-8000-000000046001', TRUE);

WITH a AS (
    INSERT INTO public.customer_platform_account (tenant_id, customer_id, platform_id, api_connection, authorized_at, seller_id)
    SELECT current_setting('test.moesa')::UUID, c.id, 'amazon', 'connected', now(), 'A3SOURCE'
    FROM public.customer c WHERE c.code = 'ZZA' AND c.tenant_id = current_setting('test.moesa')::UUID
    RETURNING api_connection
)
SELECT set_config('test.transferred_connection', a.api_connection::TEXT, TRUE) FROM a;

SELECT set_config('moesa.transfer_id', '', TRUE);

SELECT is(current_setting('test.transferred_connection'), 'none', 'a transferred account starts disconnected');

SELECT * FROM finish();

ROLLBACK;
