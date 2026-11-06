# M22 Amazon Listing Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coordinator fills a product's Amazon content against Amazon's own product type schema, presses Publish in an Amazon market cell, and watches the cell move draft → ready → submitted → live / issues. Every Amazon call goes through Edge Functions, which hold all the Amazon secrets.

**Architecture:** Two migrations: 046 holds the core data, the Vault helpers and the function that derives the listing state; 047 adds the pg_cron and pg_net schedules. On top of them sit five Deno Edge Functions. They share one SP-API client (`_shared/amazon.ts`) and one pure completeness module (`_shared/listingCompleteness.ts`), which the app imports too. The Vue app adds a zod-parsed API module, a schema-driven "Amazon" product tab, a "Connect Amazon" action on the customer's platform account, a cell drawer and a bulk publish action. Everything runs against the SP-API static sandbox; production needs only the credentials.

**Tech Stack:** Postgres + pgTAP, Supabase Vault / pg_cron / pg_net / Storage, Deno Edge Functions (`npm:@supabase/supabase-js@2.50.3`, `npm:zod@3.25.76`, `jsr:@std/assert@1`, `jsr:@std/crypto@1`), Vue 3.5 + PrimeVue 4 + TanStack Query + zod, vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-11-06-amazon-listing-design.md` (binding, including "Rulings after the builder check" 1–8, cited below as R1–R8). Research: `docs/superpowers/specs/2026-11-06-spapi-integration-options.md`.

## Global Constraints

- Secrets: "LWA client secret, refresh tokens and access tokens never leave the server side (Edge Functions + Vault)." No Amazon value appears in any `VITE_*` variable, response body, log line or audit row (the Vault secret is not a table column).
- No hand-maintained copy of Amazon's schema: the only hand-made schema is the fixture under `supabase/seed_files/amazon/` (R3). No field list in code.
- K8: copy is tenant-neutral and logs hold no sensitive fields. Amazon issue messages are stored verbatim (they contain no PII).
- K9.5: platform credentials are never stored in a table; the panel shows only the connection state.
- Migrations continue at `046` and `047` (production is at 027; the owner pushes them all in one go). Each migration has its own `supabase/tests/database/<nnn>_<name>.test.sql`.
- Every new tenant table that refers to a registry table is in `private.transfer_registry`, so 040's `pg_temp.unregistered()` check stays `{}`.
- EU only (R1): `AMAZON_SPAPI_REGION=eu`. A non-EU country of the `amazon` platform is refused with `amazon_marketplace_unsupported`.
- One connection per customer (R1): `customer_platform_account` keeps `UNIQUE (customer_id, platform_id)`.
- Rate limits: SP-API allows 5 req/s with a burst of 15 in sandbox. Use one token bucket per function instance (rate 5/s, burst 10). Retry only on 429/5xx, with backoff, at most 3 times.
- `VALIDATION_PREVIEW` runs only when the user presses "Validate with Amazon" (it is heavily throttled). It never runs in bulk or in the poll.
- `market_cell.status` is the business state and moves only through 034's legal transitions (R2). `listing_state` is the API journey.
- Copy: every new i18n key exists in all 13 locales (`locales.test.ts`). `en` is the source and `tr` is Turkish; the other 11 carry the English text, as the repo already does. Every `RAISE EXCEPTION '<code>'` has an `errors.<code>` message.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Access token expires mid-run.** The cached LWA token is rejected with 403 `Unauthorized` between the exchange and `putListingsItem`. The client drops the cached token, exchanges once more and retries the same request once (PUT by SKU is idempotent). A second 403 surfaces as `amazon_auth_failed`. Pinned: Task 3 `spapi refreshes the token once on 403 Unauthorized`.
2. **Schema version drift.** A product was filled against version A, and the cache now holds version B with a new required attribute. Stored values are kept, the missing list is recomputed against B, and the tab shows "schema moved". Pinned: Task 4 `a new schema version keeps values and recomputes missing`, Task 10 `shows the schema-moved notice`.
3. **Amazon issue with no `attributeNames`** (the sandbox's `18027` image issue). It is stored, counted as an issue and shown under "General" in the drawer. It is not dropped and does not crash the field link. Pinned: Task 7 `deriveListingState keeps issues without attributeNames`, Task 11 `lists an issue without attributeNames under General`.
4. **Image URL that Amazon cannot fetch.** This covers a `media:` reference whose copy failed, or a non-public or `localhost` base URL in production. The submission is refused before Amazon is called, with `listing_image_missing` or `listing_image_url_not_public`. No submission row is left in `processing`. Pinned: Task 7 `refuses non-public image URLs in production` and `buildListingBody refuses a media reference without a copied image`.
5. **Poll never resolving.** `getListingsItem` keeps answering 404, or never reports the cell's marketplace. After 24 h the submission becomes `failed`, the cell `issues`, and `open_issue` says so. Pinned: Task 8 `gives up after 24 hours`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/046_amazon_listing_core.sql` | enums, new columns, `amazon_product_type_definition`, `listing_submission`, guards, Vault helpers, service RPCs, module/permissions, `listing-images` bucket, view rebuild, registry row |
| `supabase/migrations/047_amazon_cron.sql` | `pg_net`, `private.call_edge_function`, two `cron.schedule` jobs |
| `supabase/tests/database/046_amazon_listing_core.test.sql`, `047_amazon_cron.test.sql` | pgTAP |
| `supabase/functions/_shared/amazon.ts` | env, hosts, EU marketplace map, LWA token cache, token bucket, retrying SP-API client, typed errors |
| `supabase/functions/_shared/amazonAccount.ts` | refresh token + seller id of a customer (from Vault, or the sandbox self-authorization) |
| `supabase/functions/_shared/listingCompleteness.ts` | pure and import-free: missing/required/filled per marketplace and language (used by Deno and the app) |
| `supabase/functions/_shared/auth.ts` (modify) | `assertServiceCall` |
| `supabase/functions/amazon-schema/{index.ts,schema.ts}` | product type search, cached or fetched definition, weekly refresh |
| `supabase/functions/amazon-auth/{index.ts,auth.ts}` | consent URL, signed state, callback, sandbox connect, disconnect |
| `supabase/functions/amazon-listing/{index.ts,listing.ts}` | check, validate, publish, delete, bulk publish |
| `supabase/functions/amazon-poll/{index.ts,poll.ts}` | cron status poll |
| `supabase/functions/tests/amazon_*_test.ts`, `listing_completeness_test.ts`, `amazon_live_test.ts` | Deno tests (mocked fetch; the live test runs only when gated in) |
| `supabase/functions/scripts/probe.ts` | smoke test: LWA + `getMarketplaceParticipations` |
| `supabase/seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json`, `LUGGAGE.attributes.json` | R3 fixture + the story's attributes |
| `app/src/api/amazon/index.ts` | types, zod schemas, edge calls, hooks |
| `app/src/components/service-components/amazon-form/{amazonForm.ts,AmazonAttributeForm.vue,AmazonAttributeField.vue}` | schema-driven form |
| `app/src/views/pages/ops/product/tabs/Amazon.vue` | product "Amazon" tab |
| `app/src/views/pages/ops/market/CellAmazonDrawer.vue` | cell drawer |
| `app/src/views/pages/ops/product/AmazonBulkPublish.vue` | bulk publish dialog |
| `app/src/views/pages/ops/customer/PlatformUpsert.vue`, `tabs/Platforms.vue` (modify) | Connect Amazon + connection badge |

---

### Task 1: Migration 046, the Amazon listing core

**Files:**
- Create: `supabase/migrations/046_amazon_listing_core.sql`
- Create: `supabase/tests/database/046_amazon_listing_core.test.sql`
- Modify: `supabase/seed.sql:126-130` (add `'listing'` to the group list of `private.seed_ops_roles`)
- Modify: `supabase/seed_story.check.sql:115-145` (classify the new enum columns in `story_enum_column`)
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.*` for the two new raise codes)
- Regenerate: `supabase/functions/_shared/database.types.ts`

**Interfaces:**
- Produces (SQL, exact):
  - `public.listing_state AS ENUM ('draft','ready','submitted','live','issues')`
  - `public.api_connection AS ENUM ('none','connected','revoked')`
  - `public.listing_submission_kind AS ENUM ('create','update','delete')`
  - `public.listing_submission_status AS ENUM ('accepted','invalid','processing','done','failed')`
  - `product`: `amazon_product_type TEXT CHECK (amazon_product_type ~ '^[A-Z0-9_]+$')`, `amazon_schema_version TEXT`, `listing_attributes JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(listing_attributes) = 'object')`
  - `customer_platform_account`: `api_connection public.api_connection NOT NULL DEFAULT 'none'`, `authorized_at TIMESTAMPTZ`, `seller_id TEXT`, `CONSTRAINT platform_account_api_amazon CHECK (api_connection = 'none' OR platform_id = 'amazon')`
  - `market_cell`: `listing_state public.listing_state` (NULL means the cell is not API-managed), `listing_checked_at TIMESTAMPTZ`, `listing_language TEXT CHECK (listing_language ~ '^[a-z]{2}_[A-Z]{2}$')`, `fulfillment_channel TEXT CHECK (fulfillment_channel IN ('fbm','fba'))`, `listing_match JSONB` (shape `{asin: string|null, restricted: boolean, reasons: string[], checked_at}`)
  - `public.amazon_product_type_definition (marketplace_id TEXT, product_type TEXT, locale TEXT, version TEXT NOT NULL, display_name TEXT, schema JSONB NOT NULL, property_groups JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (marketplace_id, product_type, locale))`. It is tenant-neutral: RLS is on, with one `SELECT … TO authenticated USING (TRUE)` policy (as `public.platform`, 015) and no write policy, so only the service role writes.
  - `public.listing_submission (id UUID PK DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenant ON DELETE CASCADE, cell_id UUID NOT NULL, kind public.listing_submission_kind NOT NULL, sku TEXT NOT NULL, marketplace_id TEXT NOT NULL, payload JSONB NOT NULL, amazon_submission_id TEXT, status public.listing_submission_status NOT NULL DEFAULT 'processing', issues JSONB NOT NULL DEFAULT '[]', created_by UUID` (defined like `public.document.created_by`, 016)`, created_at, updated_at, CONSTRAINT listing_submission_cell_fkey FOREIGN KEY (cell_id, tenant_id) REFERENCES public.market_cell (id, tenant_id) ON DELETE CASCADE)`. Add the index `(tenant_id, cell_id, created_at DESC)`, `private.enable_tenant_level_security('listing_submission')`, `private.audit_enable('public.listing_submission'::REGCLASS)` and the `set_updated_at` trigger.
  - Registry row: `('listing_submission', 215, 'product', 'market_cell', 'cell_id', NULL, NULL, '{}', '{}', '{"created_by": "actor"}', NULL, FALSE)`.
  - Module `('listing', TRUE, 195)`. Permissions: `('public.listing_submission','listing','select','read',FALSE,FALSE,NULL)` and `('public.listing_submission','listing','insert','create',FALSE,TRUE,NULL)`. Grant them to the owner role (as 034:411-421) and call `private.grant_group_to_product_editors('listing')`. The CASL subject is the table name: the app checks `$can('create','listing_submission')` and the edge functions require `[['insert','listing_submission']]`.
  - Guards (BEFORE triggers, raising `check_violation`):
    - `market_cell_listing_server_only` when `current_user = 'authenticated'` changes `listing_state`, `listing_checked_at` or `listing_match`.
    - `platform_account_api_server_only` when `current_user = 'authenticated'` writes a non-default `api_connection`, `authorized_at` or `seller_id`.
    - On a `listing_submission` INSERT by `authenticated`: force `status := 'processing'`, `issues := '[]'` and `amazon_submission_id := NULL`.
    - On a `customer_platform_account` INSERT while `private.transferring()` holds: force `api_connection := 'none'`, `authorized_at := NULL` and `seller_id := NULL`, because the Vault token is keyed by the source row's id.
  - Vault helpers: `private.amazon_token(account_id UUID) RETURNS TEXT` (reads `vault.decrypted_secrets` by name `'amazon:' || account_id`) and `private.amazon_token_set(account_id UUID, refresh_token TEXT) RETURNS VOID` (creates or updates the secret; NULL deletes it). Both are SECURITY DEFINER with `search_path = ''` and revoked from PUBLIC/anon/authenticated.
  - Service RPCs. PostgREST exposes only `public`, so the edge functions need public wrappers. Each is SECURITY DEFINER, with `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`, as `public.register_tenant` does (009:94-97):
    - `public.amazon_account_token(account_id UUID) RETURNS TEXT`
    - `public.amazon_account_connect(account_id UUID, refresh_token TEXT, seller_id TEXT) RETURNS public.customer_platform_account`: stores the token (skipped when NULL, as in sandbox) and sets `api_connection='connected'`, `authorized_at=now()` and `seller_id`.
    - `public.amazon_account_disconnect(account_id UUID, state public.api_connection) RETURNS VOID`: `'none'` also deletes the secret; `'revoked'` keeps it.
    - `public.listing_set_state(cell_id UUID, listing_state public.listing_state, listing_match JSONB) RETURNS VOID`: writes the state and `listing_checked_at=now()`, and the match when it is not NULL.
    - `public.listing_apply_submission(submission_id UUID, status public.listing_submission_status, amazon_submission_id TEXT, issues JSONB, listing_state public.listing_state, asin TEXT) RETURNS public.market_cell`
    - `public.listing_parent_cell(cell_id UUID) RETURNS UUID`: the cell of the product's parent in the same platform and country. It is inserted when missing (as a candidate, which the guard enforces) and is NULL when the product has no parent.
  - Updates go through `put` for both `create` and `update`: the panel owns the whole content, so a full replace is safe and `patchListingsItem` is not needed in v1.
  - Bucket `('listing-images','listing-images',TRUE,10485760,ARRAY['image/png','image/jpeg'])`, with no user storage policies (only the service role writes).
  - `public.market_cell_overview`: `DROP VIEW`, then re-`CREATE` with 034's exact definition and `GRANT SELECT … TO authenticated`. Its `m.*` was expanded when the view was created, so the new columns need a rebuild; `CREATE OR REPLACE` would fail on the column order.

The `listing_apply_submission` algorithm (the part the signature does not determine):

```text
1. UPDATE listing_submission SET status, amazon_submission_id = coalesce(new, old), issues WHERE id.
2. cell := its cell; sku := submission.sku.
3. Status walk. Each step is one UPDATE that passes market_cell_z_guard; the rules are not bypassed.
   - status = 'accepted': planned → preparing → uploaded; preparing → uploaded; others unchanged.
   - listing_state = 'live': planned/preparing first walk to uploaded; then uploaded|suppressed → live,
     but only if platform_product_id (or asin), platform_sku (or sku), price, currency and stock_source
     are set and content_status = 'approved'. Otherwise the status stays.
   - listing_state = 'issues': status unchanged; open_issue := 'Amazon: ' || the first 3 messages joined with '; '.
   - any other listing_state, when open_issue LIKE 'Amazon: %' and status <> 'suppressed': open_issue := NULL.
4. platform_product_id := coalesce(platform_product_id, asin); platform_sku := coalesce(platform_sku, sku);
   set listing_state and listing_checked_at := now().
5. If the product has a parent with a cell in the same platform and country, that cell's listing_state
   becomes the worst of its children's states, in the order issues < draft < ready < submitted < live
   (worst = lowest) (R7).
```

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/database/046_amazon_listing_core.test.sql`. Follow 045's layout: header comment, `BEGIN; SELECT plan(45);`, the `set_config('test.*')` block, and `ROLLBACK`. The test's cells are inserted as postgres for THO-MOP40-2P on amazon PL/SE/BE/GB and walked with UPDATEs; the parent case creates its own parent and child products. The assertions, by name:

```sql
-- columns (11): has_column for each new column on product, customer_platform_account and market_cell
SELECT enum_has_labels('public','listing_state', ARRAY['draft','ready','submitted','live','issues'], 'listing_state values');
SELECT enum_has_labels('public','api_connection', ARRAY['none','connected','revoked'], 'api_connection values');
SELECT enum_has_labels('public','listing_submission_kind', ARRAY['create','update','delete'], 'submission kinds');
SELECT enum_has_labels('public','listing_submission_status', ARRAY['accepted','invalid','processing','done','failed'], 'submission statuses');
-- as akif in MOESA LTD (private.impersonate):
SELECT lives_ok($$ SELECT * FROM public.amazon_product_type_definition $$, 'a user reads the definition cache');
SELECT throws_ok($$ INSERT INTO public.amazon_product_type_definition (marketplace_id, product_type, locale, version, schema, property_groups) VALUES ('X','Y','en_GB','1','{}','{}') $$, '42501', NULL, 'a user cannot write the definition cache');
SELECT is(:inserted_status, 'processing', 'a user insert starts processing');            -- INSERT … status 'done' … RETURNING status
SELECT is((SELECT issues FROM public.listing_submission WHERE id = :sub), '[]'::JSONB, 'a user insert carries no issues');
SELECT is_empty($$ UPDATE public.listing_submission SET status = 'done' RETURNING 1 $$, 'a user cannot update a submission');
SELECT throws_ok($$ UPDATE public.market_cell SET listing_state = 'live' WHERE id = :cell $$, '23514', 'market_cell_listing_server_only', 'listing_state is server-only');
SELECT throws_ok($$ UPDATE public.customer_platform_account SET api_connection = 'connected' WHERE id = :acct $$, '23514', 'platform_account_api_server_only', 'api_connection is server-only');
SELECT throws_ok($$ SELECT public.amazon_account_token(:acct) $$, '42501', NULL, 'a user cannot read a token');
-- as a user of 'Eski Ticaret':
SELECT is((SELECT count(*) FROM public.listing_submission)::INT, 0, 'another tenant sees no submission');
-- RESET ROLE; SET LOCAL ROLE service_role:
SELECT is((public.amazon_account_connect(:acct, 'Atzr|test', 'A3TEST')).api_connection, 'connected', 'connect sets connected');
SELECT is(public.amazon_account_token(:acct), 'Atzr|test', 'the token round-trips through Vault');
SELECT ok((SELECT seller_id = 'A3TEST' AND authorized_at IS NOT NULL FROM public.customer_platform_account WHERE id = :acct), 'connect stores the seller id and the date');
SELECT is((SELECT count(*) FROM vault.secrets WHERE name = 'amazon:' || :acct)::INT, 1, 'one secret per account');
SELECT lives_ok($$ SELECT public.amazon_account_disconnect(:acct, 'none') $$, 'disconnect');
SELECT is(public.amazon_account_token(:acct), NULL, 'disconnect none removes the token');
SELECT is((public.listing_apply_submission(:sub_preparing, 'accepted', 'f1dc2914-75dd-11ea-bc55-0242ac130003', '[]', 'submitted', NULL)).status, 'uploaded', 'accepted moves preparing to uploaded');
SELECT is((public.listing_apply_submission(:sub_planned, 'accepted', 's2', '[]', 'submitted', NULL)).status, 'uploaded', 'accepted walks planned through preparing');
SELECT is((public.listing_apply_submission(:sub_candidate, 'accepted', 's3', '[]', 'submitted', NULL)).status, 'candidate', 'a candidate stays a candidate');
SELECT is((public.listing_apply_submission(:sub_complete, 'done', NULL, '[]', 'live', 'B07N4M94X4')).status, 'live', 'live with complete data goes live');
SELECT is((SELECT launched_on FROM public.market_cell WHERE id = :cell_complete), current_date, 'going live dates the launch');
SELECT is((public.listing_apply_submission(:sub_no_price, 'done', NULL, '[]', 'live', 'B07N4M94X4')).status, 'uploaded', 'live without a price keeps uploaded');
SELECT is((SELECT listing_state FROM public.market_cell WHERE id = :cell_no_price), 'live', 'its listing_state is live anyway');
SELECT matches((public.listing_apply_submission(:sub_issues, 'done', NULL, '[{"code":"90220","message":"''size'' is required but not supplied.","severity":"ERROR","attributeNames":["size"]}]', 'issues', NULL)).open_issue, '^Amazon: ''size'' is required', 'issues write open_issue and keep the status');
SELECT is((SELECT platform_product_id FROM public.market_cell WHERE id = :cell_complete), 'B07N4M94X4', 'the ASIN fills the platform product id');
SELECT isnt(public.listing_parent_cell(:child_cell), NULL, 'the parent cell is created');
SELECT is((SELECT listing_state FROM public.market_cell WHERE id = public.listing_parent_cell(:child_cell)), 'issues', 'the parent mirrors the worst child');
SELECT ok(EXISTS (SELECT 1 FROM private.transfer_registry WHERE table_name = 'listing_submission' AND parent_table = 'market_cell'), 'listing_submission is registered');
SELECT ok((SELECT public FROM storage.buckets WHERE id = 'listing-images'), 'listing-images is public');
SELECT ok(EXISTS (SELECT 1 FROM public.role_permission rp JOIN public.role r ON r.id = rp.role_id JOIN public.permission p ON p.id = rp.permission_id WHERE r.tenant_id = :moesa AND r.display_name = 'coordinator' AND p.resource_name = 'public.listing_submission' AND p.command = 'insert'), 'the coordinator may publish');
-- raise the transfer flag as 040's test does, then INSERT a connected account:
SELECT is(:transferred_connection, 'none', 'a transferred account starts disconnected');
```

- [ ] **Step 2: Run it and check that it fails.** From `app/`: `pnpm test:db`. Expected: `046_amazon_listing_core.test.sql` fails with `type "listing_state" does not exist`.
- [ ] **Step 3: Write `046_amazon_listing_core.sql`.** Use 034's header style (what each object is, the guards and their codes, R2's walk) and create the objects listed above.
- [ ] **Step 4: Add `'listing'` to the group list of `private.seed_ops_roles`** in `supabase/seed.sql`, with no exclusion for the coordinator.
- [ ] **Step 5: Run** `pnpm test:db`. Expected: every file reports `ok`, including 040 (`every table with a foreign key to a registry table is registered`) and 099.
- [ ] **Step 6: Keep the story check green.** In `seed_story.check.sql`, add these rows to `story_enum_column`: `('market_cell','listing_state','exempt','Task 12 sets it to all')`, `('customer_platform_account','api_connection','exempt','revoked comes only from Amazon (invalid_grant)')`, `('listing_submission','kind','exempt','API-driven; the story holds create')`, `('listing_submission','status','exempt','API-driven; the story holds done, invalid and processing')`.
- [ ] **Step 7: Add the error copy.** Add `errors.market_cell_listing_server_only` ("Only the Amazon connection updates the listing state.") and `errors.platform_account_api_server_only` ("The Amazon connection is set by connecting the account.") to all 13 locales. In tr: "Listeleme durumunu yalnız Amazon bağlantısı günceller." and "Amazon bağlantısı, hesap bağlanarak kurulur." Run from `app/`: `pnpm vitest run tests/plugins/i18n`. Expected: PASS, including `every error code raised by the business migrations has an errors.<code> message`.
- [ ] **Step 8: Regenerate the types.** From `app/`: `pnpm dev:supabase-types`, then run the repo's typecheck script; it must pass.
- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/046_amazon_listing_core.sql supabase/tests/database/046_amazon_listing_core.test.sql supabase/seed.sql supabase/seed_story.check.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(db): amazon listing core: columns, cache, submissions, vault helpers, derived state"
```

---

### Task 2: Migration 047, pg_cron schedules through pg_net (R8)

**Files:**
- Create: `supabase/migrations/047_amazon_cron.sql`, `supabase/tests/database/047_amazon_cron.test.sql`
- Modify: `scripts/seed-story.mjs` (sets the two Vault secrets), `scripts/seed-story.test.mjs`

**Interfaces:**
- Produces:
  - `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;`
  - `private.call_edge_function(name TEXT, body JSONB) RETURNS BIGINT`. It reads the Vault secrets `edge_function_url` and `edge_service_key`. When either is missing it returns NULL (`RAISE NOTICE 'edge_function_unconfigured'`). Otherwise it calls `net.http_post(url := url || '/' || name, body := body, headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'), timeout_milliseconds := 30000)`. SECURITY DEFINER, `search_path = ''`, revoked from PUBLIC/anon/authenticated.
- Jobs: `cron.schedule('amazon-poll', '*/10 * * * *', $$SELECT private.call_edge_function('amazon-poll', '{}')$$)` and `cron.schedule('amazon-schema-refresh', '0 4 * * 1', $$SELECT private.call_edge_function('amazon-schema', '{"action":"refresh"}')$$)`.
- Produces (script): `export function edgeSecretsSql(serviceRoleKey: string): string` in `scripts/seed-story.mjs`. It upserts the Vault secrets `edge_function_url = 'http://supabase_kong_moesa-panel:8000/functions/v1'` and `edge_service_key = <key>`: it deletes any old secret, then calls `vault.create_secret`, with the key quoted as `$k$…$k$`. `main()` runs it after the story check, using the key `localKeys()` already reads.

- [ ] **Step 1: Write the failing pgTAP test** (`plan(6)`):

```sql
SELECT has_extension('pg_net', 'pg_net is installed');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'amazon-poll'), '*/10 * * * *', 'the poll runs every ten minutes');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'amazon-schema-refresh'), '0 4 * * 1', 'the schema refresh runs weekly');
SELECT is(private.call_edge_function('amazon-poll', '{}'), NULL, 'no secrets, no call');
SELECT vault.create_secret('http://example.invalid/functions/v1', 'edge_function_url');
SELECT vault.create_secret('test-key', 'edge_service_key');
SELECT isnt(private.call_edge_function('amazon-poll', '{}'), NULL, 'with secrets the call is queued');
SELECT is((SELECT url FROM net.http_request_queue ORDER BY id DESC LIMIT 1), 'http://example.invalid/functions/v1/amazon-poll', 'it targets the function URL');
```

- [ ] **Step 2:** `pnpm test:db`. Expected: 047 fails (no `cron.job` row).
- [ ] **Step 3: Write 047.** The header says what runs when, where the secrets come from, and that the owner sets them on the hosted project (R8).
- [ ] **Step 4:** `pnpm test:db`. Expected: PASS.
- [ ] **Step 5: Script test.** In `scripts/seed-story.test.mjs` add `test('edgeSecretsSql sets both secrets after the check', …)`. It asserts that the SQL contains `'edge_function_url'`, `'edge_service_key'` and `supabase_kong_moesa-panel:8000/functions/v1`, and that `main` with a fake `sql` runs it after the check (the fake records the call order). Run `pnpm test:scripts` from `app/`: it fails; implement; it passes.
- [ ] **Step 6: Commit** `feat(db): schedule amazon poll and schema refresh via pg_cron and pg_net`.

---

### Task 3: The shared SP-API client, `_shared/amazon.ts`

**Files:**
- Create: `supabase/functions/_shared/amazon.ts`, `supabase/functions/_shared/amazonAccount.ts`, `supabase/functions/tests/amazon_test.ts`, `supabase/functions/tests/amazon_live_test.ts`, `supabase/functions/scripts/probe.ts`
- Modify: `supabase/functions/_shared/auth.ts` (add `assertServiceCall`), `supabase/functions/_shared/deps.ts` (export `crypto` from `jsr:@std/crypto@1`), `supabase/functions/deno.json` (tasks), `supabase/functions/.env.example`, `app/package.json` (`dev:amazon-probe`)

**Interfaces:**
- Produces (`_shared/amazon.ts`):

```ts
export type AmazonEnv = { env: 'sandbox' | 'production'; region: 'eu'; clientId: string; clientSecret: string;
  selfRefreshToken?: string; sellerId?: string };
export function amazonEnv(get?: (name: string) => string | undefined): AmazonEnv;
// a missing id or secret → AmazonError('amazon_unconfigured', 500); a region other than 'eu' → 'amazon_region_unsupported'
export const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
export function spapiHost(env: AmazonEnv): string; // sandbox: https://sandbox.sellingpartnerapi-eu.amazon.com; production: https://sellingpartnerapi-eu.amazon.com
export const EU_MARKETPLACES: Readonly<Record<string, { marketplaceId: string; languageTag: string; currency: string }>>;
//  DE A1PA6795UKMFR9 de_DE EUR · FR A13V1IB3VIYZZH fr_FR EUR · IT APJ6JRA9NG5V4 it_IT EUR · ES A1RKKUPIHCS9HS es_ES EUR
//  NL A1805IZSGTT6HS nl_NL EUR · PL A1C3SOZRARQ6R3 pl_PL PLN · SE A2NODRKZP88ZB9 sv_SE SEK · BE AMEN7PMS3EDWL fr_BE EUR · GB A1F83G8C2ARO7P en_GB GBP
export function marketplaceFor(country: string): { marketplaceId: string; languageTag: string; currency: string }; // otherwise HttpError(422,'amazon_marketplace_unsupported')
export class AmazonError extends Error { constructor(public code: string, public status: number, public details?: unknown) }
export class AmazonAuthError extends AmazonError {}     // 'amazon_connection_revoked' (invalid_grant) | 'amazon_auth_failed'
export class AmazonThrottleError extends AmazonError {} // 'amazon_throttled'
export class AmazonRequestError extends AmazonError {}  // 'amazon_request_invalid' (4xx; details = Amazon's errors[]) | 'amazon_not_found' (404)
export type Deps = { fetch: typeof fetch; now: () => number; sleep: (ms: number) => Promise<void> };
export class TokenBucket { constructor(ratePerSecond: number, burst: number, deps?: Partial<Deps>); take(): Promise<void> }
export function lwaToken(refreshToken: string, env: AmazonEnv, deps?: Partial<Deps>): Promise<string>; // cached per refresh token until expires_in − 60 s
export function clearTokenCache(): void;
export type SpapiRequest = { method: 'GET' | 'PUT' | 'PATCH' | 'DELETE'; path: string;
  query?: Record<string, string | readonly string[] | undefined>; body?: unknown };
export type SpapiCall = <T>(req: SpapiRequest) => Promise<T>;
export function spapiClient(refreshToken: string, env: AmazonEnv, deps?: Partial<Deps>): SpapiCall;
```

  Each request carries `x-amz-access-token` (SP-API no longer needs SigV4), `content-type: application/json` and `user-agent: moesa-panel/1.0 (Language=TypeScript)`. Array query values are joined with `,`. A module-level `TokenBucket(5, 10)` gates every call. Responses 429/500/502/503/504 are retried after `500 * 2**attempt` ms (attempts 0..2); after that the client throws `AmazonThrottleError` for 429, or `AmazonError('amazon_unavailable', 502)`. A 403 whose body has `errors[0].code === 'Unauthorized'` drops the cached token and retries once.
- Produces (`_shared/amazonAccount.ts`):

```ts
export type AmazonAccount = { id: string; tenantId: string; customerId: string; sellerId: string; refreshToken: string };
export function amazonAccountFor(db: SupabaseClient<Database>, customerId: string, tenantId: string, env: AmazonEnv): Promise<AmazonAccount>;
// the customer's 'amazon' platform account; api_connection ≠ 'connected' → HttpError(409,'amazon_not_connected');
// sandbox: refreshToken = env.selfRefreshToken, sellerId = row.seller_id ?? env.sellerId; production: rpc amazon_account_token
export function withRevocation<T>(db: SupabaseClient<Database>, accountId: string, run: () => Promise<T>): Promise<T>;
// AmazonAuthError 'amazon_connection_revoked' → rpc amazon_account_disconnect(accountId, 'revoked'), then rethrow as HttpError(409,'amazon_connection_revoked')
```
- Produces (`_shared/auth.ts`): `export function assertServiceCall(req: Request, key?: string): void`. The bearer token must equal `SUPABASE_SERVICE_ROLE_KEY` (constant-time compare); otherwise it throws `HttpError(401,'unauthorized')`.
- `.env.example` adds: `AMAZON_SPAPI_APP_ID=` (the application_id), `AMAZON_SPAPI_APP_BETA=true` (the app is still a draft), `AMAZON_SPAPI_STATE_SECRET=` (at least 32 random bytes, base64), `APP_URL=http://localhost:5173` and `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.
- `deno.json` tasks: `"test": "deno test --allow-env --allow-read tests/"`, `"test:live": "deno test --allow-env --allow-read --allow-net --env-file=.env tests/amazon_live_test.ts"`, `"probe": "deno run --allow-env --allow-net --env-file=.env scripts/probe.ts"`. `app/package.json`: `"dev:amazon-probe": "cd ../supabase/functions && deno task probe"`.

- [ ] **Step 1: Write the failing tests** in `tests/amazon_test.ts`. A fake `fetch` records `[url, init]`, a fake `sleep` records the milliseconds, and a fake `now` controls time.

```ts
Deno.test('amazonEnv refuses a region other than eu', …);  // AmazonError 'amazon_region_unsupported'
Deno.test('marketplaceFor maps DE and refuses US', …);      // DE → { marketplaceId: 'A1PA6795UKMFR9', languageTag: 'de_DE', currency: 'EUR' }; US → HttpError 'amazon_marketplace_unsupported'
Deno.test('lwaToken posts the refresh grant and caches until a minute before expiry', …); // calls at t=0 and t=3539 s → 1 fetch; at t=3541 s → 2; body grant_type=refresh_token, refresh_token, client_id, client_secret
Deno.test('lwaToken maps invalid_grant to AmazonAuthError amazon_connection_revoked', …);
Deno.test('spapi sends x-amz-access-token to the eu sandbox host', …);
// GET /listings/2021-08-01/items/SellerId/GM-ZDPI-9B4E, marketplaceIds ['A1PA6795UKMFR9'], includedData ['summaries','issues'] →
// url 'https://sandbox.sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/SellerId/GM-ZDPI-9B4E?marketplaceIds=A1PA6795UKMFR9&includedData=summaries%2Cissues', header x-amz-access-token 'Atza|t'
Deno.test('spapi retries 429 and 503 with backoff then succeeds', …);  // sleeps [500, 1000]
Deno.test('spapi gives up after three retries with AmazonThrottleError', …); // 4 fetches, sleeps [500, 1000, 2000]
Deno.test('spapi refreshes the token once on 403 Unauthorized', …); // LWA called twice, SP-API twice, result returned; a second 403 → AmazonAuthError 'amazon_auth_failed'
Deno.test('spapi throws AmazonRequestError with Amazon errors on 400', …); // the sandbox BadSKU body {"errors":[{"code":"BAD_REQUEST","message":"Invalid input","details":"Invalid input"}]}
Deno.test('spapi maps 404 to amazon_not_found', …);
Deno.test('TokenBucket lets the burst through and then waits', …); // burst 2, rate 1/s: the 3rd take sleeps ≈1000 ms
Deno.test('assertServiceCall accepts only the service key', …);
Deno.test('amazonAccountFor uses the self-authorized token in sandbox and refuses a revoked account', …); // fake db: from().select().eq()…maybeSingle()
```

  `tests/amazon_live_test.ts`: each test is `Deno.test({ name, ignore: !live, fn })` with `live = !!Deno.env.get('AMAZON_SPAPI_LWA_CLIENT_ID') && Deno.permissions.querySync({ name: 'net' }).state === 'granted'`. The tests use the sandbox's canned parameters:

```ts
'sandbox: putListingsItem answers the canned ACCEPTED'
//   PUT items/{sellerId}/THO-MOP40-2P, marketplaceIds [A1PA6795UKMFR9], body {productType:'LUGGAGE', requirements:'LISTING', attributes:{}}
//   → status 'ACCEPTED', submissionId 'f1dc2914-75dd-11ea-bc55-0242ac130003'
'sandbox: VALIDATION_PREVIEW of VALIDATION_INVALID returns the condition_type issue'
//   sku 'VALIDATION_INVALID', marketplaceIds ['ATVPDKIKX0DER'], includedData ['identifiers','issues'], mode 'VALIDATION_PREVIEW'
//   → status 'INVALID', issues[0].attributeNames ['condition_type']
'sandbox: getListingsItem returns GM-ZDPI-9B4E with BUYABLE and issues'
//   any sku → sku 'GM-ZDPI-9B4E', summaries[0].status ['BUYABLE'], an issue with code '18027' and no attributeNames
'sandbox: getDefinitionsProductType returns LUGGAGE UHqSqmb4FNUk='
//   → productTypeVersion.version 'UHqSqmb4FNUk=', schema.link.resource 'https://schema-url'
```

- [ ] **Step 2:** From `supabase/functions/`: `deno test --allow-env tests/amazon_test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `amazon.ts`, `amazonAccount.ts` and `assertServiceCall`. `scripts/probe.ts` prints only `ok <n> marketplaces` or the error code, never a token.
- [ ] **Step 4:** `deno task test`: PASS, with the live tests ignored. `deno task test:live` (with `.env`): 4 passed. `deno task probe`: prints `ok …`.
- [ ] **Step 5: Commit** `feat(edge): shared sp-api client with lwa cache, token bucket and retries`.

---

### Task 4: The completeness module and the R3 fixture

**Files:**
- Create: `supabase/functions/_shared/listingCompleteness.ts` (no imports, plain TS that both runtimes accept), `supabase/functions/tests/listing_completeness_test.ts`
- Create: `supabase/seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json`, `supabase/seed_files/amazon/LUGGAGE.attributes.json`
- Modify: `app/vite.config.mjs:92-103` (alias `'@edge-shared': path.resolve(__dirname, '../supabase/functions/_shared')`), `app/tsconfig.app.json` (`paths` `"@edge-shared/*": ["../supabase/functions/_shared/*"]`; `include` gains `../supabase/functions/_shared/listingCompleteness.ts`), `app/tsconfig.vitest.json` likewise

**Fixture contents (pinned).**

`LUGGAGE.A1PA6795UKMFR9.en_GB.json` is the sandbox's `getDefinitionsProductType` envelope with a schema written from the meta-schema docs and the listings workflow guide's examples:

```text
{ productType: 'LUGGAGE', marketplaceId: 'A1PA6795UKMFR9', locale: 'en_GB', displayName: 'Luggage',
  productTypeVersion: { version: 'UHqSqmb4FNUk=', latest: true, releaseCandidate: false },
  propertyGroups, schema }
```

- `propertyGroups` (title, propertyNames):
  - `product_identity`: item_name, brand, externally_assigned_product_identifier, merchant_suggested_asin, item_type_keyword
  - `offer`: condition_type, purchasable_offer, fulfillment_availability, list_price
  - `images`: main_product_image_locator, other_product_image_locator_1, swatch_product_image_locator
  - `product_details`: bullet_point, product_description, color, number_of_items, item_package_weight, is_fragile
  - `variations`: parentage_level, child_parent_sku_relationship, variation_theme
- `schema.required`: item_name, brand, externally_assigned_product_identifier, condition_type, main_product_image_locator, bullet_point.
- One `allOf` entry: `if: { required: ['parentage_level'], properties: { parentage_level: { contains: { properties: { value: { enum: ['child'] } } } } } }, then: { required: ['child_parent_sku_relationship', 'variation_theme'] }`.
- Every property is Amazon-shaped: `type: 'array'`, with `items.properties` holding `value` / `language_tag` / `marketplace_id`, plus `title` and `description`. Specifics:
  - `enum` + `enumNames` on condition_type, parentage_level and variation_theme.
  - `maxLength` 200 on item_name and 2000 on product_description; `maxItems` 5 on bullet_point.
  - `value` + `unit` (enum kilograms, grams) on item_package_weight.
  - `value: {type: 'boolean'}` on is_fragile.
  - `media_location` on the image locators.

`LUGGAGE.attributes.json` fills every required attribute in `de_DE` for THO-MOP40-2P, except `externally_assigned_product_identifier`, which comes from the GTIN. Values: `item_name` "Baumwoll-Wischmopp-Bezug 40 cm, 2er-Pack", brand "OKAEI", condition_type `new_new`, two bullet points, main image `media:5eed0009-0000-4000-8000-000000000001`.

**Interfaces:**
- Produces:

```ts
export type AmazonSchema = { properties: Record<string, PropertySchema>; required?: string[]; allOf?: unknown[] };
export type PropertySchema = { title?: string; description?: string; type?: string; items?: { properties?: Record<string, unknown>; required?: string[] }; maxItems?: number; hidden?: boolean; editable?: boolean };
export type PropertyGroups = Record<string, { title: string; description?: string; propertyNames: string[] }>;
export type Attributes = Record<string, unknown[]>;
export type CompletenessOptions = { marketplaceId: string; languageTag: string; provided?: readonly string[] };
export type MissingField = { attribute: string; group: string | null; reason: 'required' | 'conditional' };
export function attributeFilled(values: unknown, opts: CompletenessOptions): boolean;
export function requiredAttributes(schema: AmazonSchema, attributes: Attributes): { attribute: string; reason: 'required' | 'conditional' }[];
export function missingAttributes(schema: AmazonSchema, groups: PropertyGroups, attributes: Attributes, opts: CompletenessOptions): MissingField[];
export function groupMissingCounts(missing: readonly MissingField[], groups: PropertyGroups): Record<string, number>;
export function completeness(schema: AmazonSchema, attributes: Attributes, opts: CompletenessOptions): { required: number; filled: number };
```

  `attributeFilled` is true for an array with at least one entry that:
  - has a `marketplace_id` equal to the option's, or none;
  - has a `language_tag` equal to the option's, or none;
  - has a non-blank leaf (`value`, `media_location`, `currency`, …); an empty string, an empty array or null does not count.

  `provided` attributes count as filled, because the server adds them (the GTIN, and the offer from the cell). Conditional rules: only `allOf[].if/then` with `if.required` and `if.properties.<a>.contains|items.properties.value.enum` are evaluated. Any other construct is ignored, so it never makes a field required.

- [ ] **Step 1: Write the failing Deno tests.** They load the fixture with `Deno.readTextFile(new URL('../../seed_files/amazon/…', import.meta.url))`.

```ts
Deno.test('an empty product misses the six required attributes', …); // sorted: ['brand','bullet_point','condition_type','externally_assigned_product_identifier','item_name','main_product_image_locator'], all reason 'required'
Deno.test('a language-tagged value counts only in the cell language', …); // item_name [{value:'x', language_tag:'en_GB'}] with opts de_DE → item_name missing
Deno.test('a value for another marketplace does not count', …);
Deno.test('empty strings and empty arrays are not filled', …);
Deno.test('a child also needs child_parent_sku_relationship and variation_theme', …); // parentage_level [{value:'child'}] → those two, reason 'conditional'
Deno.test('groupMissingCounts counts per property group', …); // empty → { product_identity: 3, offer: 1, images: 1, product_details: 1, variations: 0 }
Deno.test('provided attributes count as filled', …); // provided ['externally_assigned_product_identifier']
Deno.test('the story attributes are complete for de_DE', …); // LUGGAGE.attributes.json + the provided ext id → []; completeness {required: 6, filled: 6}
Deno.test('a new schema version keeps values and recomputes missing', …); // schema' = fixture + required 'color'; attributes deep-equal before and after; missing = ['color']
```

- [ ] **Step 2:** `deno test --allow-env --allow-read tests/listing_completeness_test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the two fixture files and `listingCompleteness.ts`.
- [ ] **Step 4:** The Deno tests PASS. From `app/`, the typecheck resolves `@edge-shared/listingCompleteness`.
- [ ] **Step 5: Commit** `feat(amazon): schema completeness module and luggage fixture`.

---

### Task 5: The `amazon-schema` function

**Files:**
- Create: `supabase/functions/amazon-schema/index.ts`, `supabase/functions/amazon-schema/schema.ts`, `supabase/functions/tests/amazon_schema_test.ts`
- Modify: `supabase/config.toml` (`[functions.amazon-schema] verify_jwt = false`: the cron call carries the service key, and user calls are checked by `withAuthorization`)

**Interfaces:**
- Consumes: Task 3 `spapiClient`, `amazonEnv`, `amazonAccountFor`, `assertServiceCall`; Task 1 table `amazon_product_type_definition`.
- Produces (`schema.ts`):

```ts
export type DefinitionRow = Database['public']['Tables']['amazon_product_type_definition']['Insert'];
export function toDefinitionRow(meta: GetDefinitionResponse, schema: unknown, locale: string): DefinitionRow;
// version = meta.productTypeVersion.version, property_groups = meta.propertyGroups, display_name = meta.displayName, marketplace_id = meta.marketplaceIds[0]
export function downloadSchema(link: { resource: string }, checksum: string, deps?: Partial<Deps>): Promise<unknown>;
// GET without auth; the MD5 hex of the body must equal checksum, else AmazonError('amazon_schema_checksum', 502)
export function pickDefinition(rows: DefinitionRow[], key: { marketplaceId: string; productType: string; locale: string }, sandbox: boolean): DefinitionRow | null;
// the exact key; in sandbox, any row of the product type (R3: the fixture serves every marketplace)
export function searchProductTypes(call: SpapiCall, keywords: string, marketplaceId: string): Promise<{ name: string; displayName: string }[]>;
// GET /definitions/2020-09-01/productTypes?keywords=&marketplaceIds=
export function fetchDefinition(call: SpapiCall, key: { marketplaceId: string; productType: string; locale: string; sellerId: string }, deps?: Partial<Deps>): Promise<DefinitionRow>;
// GET /definitions/2020-09-01/productTypes/{productType}?marketplaceIds=&sellerId=&requirements=LISTING&locale=, then downloadSchema
```
- Routes (`index.ts`, wrapped in `serve` from `_shared/http.ts`):
  - `GET ?action=search&keywords=&country=&customer_id=`: `withAuthorization(req, [['update','product']])`, then returns `{ productTypes }`.
  - `GET ?action=definition&product_type=&country=&locale=&customer_id=`: same permission. Returns the cached row (`pickDefinition`). When the row is missing in production, it calls `fetchDefinition`, upserts the result with the service client and returns it. When it is missing in sandbox, it throws `HttpError(404,'amazon_schema_missing')`.
  - `POST {action:'refresh'}`: `assertServiceCall`.
    - Production: re-fetches every cached row with `fetched_at < now() - 7 days`, using the most recently authorized connected account (`api_connection='connected' ORDER BY authorized_at DESC`).
    - Sandbox: a no-op returning `{ refreshed: 0, sandbox: true }`, because sandbox schema links cannot be downloaded.

- [ ] **Step 1: Write the failing tests:**

```ts
Deno.test('toDefinitionRow keeps version, groups and display name of the sandbox LUGGAGE answer', …); // version 'UHqSqmb4FNUk=', property_groups.product_identity.title 'Product Identity', display_name 'Luggage'
Deno.test('downloadSchema refuses a checksum mismatch', …); // AmazonError 'amazon_schema_checksum'
Deno.test('downloadSchema accepts the md5 of the body', …);
Deno.test('pickDefinition falls back to the product type in sandbox only', …); // FR key → the DE fixture row in sandbox; null in production
Deno.test('searchProductTypes reads name and displayName', …); // sandbox body {productTypes:[{name:'LUGGAGE', displayName:'Luggage', marketplaceIds:['ATVPDKIKX0DER']}]}
Deno.test('refresh refuses a call without the service key', …); // handler(new Request(…, {method:'POST', body:'{"action":"refresh"}'})) → 401
```

- [ ] **Step 2:** `deno test --allow-env --allow-read tests/amazon_schema_test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export `handler(req: Request, deps?): Promise<Response>` from `index.ts`, and call `serve(handler)` only when `import.meta.main` holds.
- [ ] **Step 4:** The tests PASS and `deno task check` passes.
- [ ] **Step 5: Commit** `feat(edge): amazon-schema function with cache, checksum and weekly refresh`.

---

### Task 6: The `amazon-auth` function

**Files:**
- Create: `supabase/functions/amazon-auth/index.ts`, `supabase/functions/amazon-auth/auth.ts`, `supabase/functions/tests/amazon_auth_test.ts`
- Modify: `supabase/config.toml` (`[functions.amazon-auth] verify_jwt = false`: Amazon's redirect carries no JWT)

**Interfaces:**
- Consumes: Task 1 RPCs `amazon_account_connect` and `amazon_account_disconnect`; Task 3 `amazonEnv`, `LWA_TOKEN_URL`.
- Produces (`auth.ts`):

```ts
export type StatePayload = { account_id: string; tenant_id: string; user_id: string; return_to: string; exp: number };
export function signState(payload: StatePayload, secret: string): Promise<string>;   // base64url(JSON) + '.' + base64url(HMAC-SHA256)
export function verifyState(state: string, secret: string, now: number): Promise<StatePayload | null>;
// null for a bad signature, exp < now, or a return_to that does not start with '/' or starts with '//'
export function consentUrl(appId: string, state: string, beta: boolean): string;
// https://sellercentral-europe.amazon.com/apps/authorize/consent?application_id=<appId>&state=<state>[&version=beta]
export function exchangeCode(code: string, redirectUri: string, env: AmazonEnv, deps?: Partial<Deps>): Promise<string>;
// grant_type=authorization_code, code, redirect_uri, client_id, client_secret → refresh_token
```
- Routes:
  - `POST {action:'connect', account_id, return_to}`: `withAuthorization(req, [['update','customer_platform_account']])`. The account must be the caller tenant's `amazon` row, else 404 `platform_account_not_found`.
    - Production: returns `{ redirect: consentUrl(AMAZON_SPAPI_APP_ID, signState({… exp: now + 600_000}), AMAZON_SPAPI_APP_BETA === 'true') }`.
    - Sandbox: calls `amazon_account_connect(account_id, NULL, env.sellerId)` and returns `{ account }` (R6; the OAuth flow cannot run against sandbox hosts).
  - `GET /amazon-auth/callback?state&selling_partner_id&spapi_oauth_code`:
    - `verifyState`, then `exchangeCode` with `redirect_uri = PUBLIC_SUPABASE_URL + '/functions/v1/amazon-auth/callback'`.
    - `amazon_account_connect(payload.account_id, refresh_token, selling_partner_id)`, but only if the account still belongs to `payload.tenant_id`.
    - Responds `302 Location: APP_URL + return_to + '?amazon=connected'` (or `?amazon=error&reason=<code>`), with the header `Referrer-Policy: no-referrer`. It never echoes the code or the token.
  - `POST {action:'disconnect', account_id}`: same permission; calls `amazon_account_disconnect(account_id,'none')`.

`index.ts` exports `handler(req, deps = defaultDeps)` with `deps = { db: () => supabaseAdmin(), env: amazonEnv, now: Date.now, fetch, authorize: withAuthorization }`, so tests inject a fake `db` (recorders for `rpc` and `from`) and a pre-authorized context.

- [ ] **Step 1: Write the failing tests:**

```ts
Deno.test('consentUrl targets sellercentral-europe with application_id, state and version=beta', …);
Deno.test('consentUrl omits version once the app is published', …);
Deno.test('verifyState accepts its own state', …);
Deno.test('verifyState rejects a tampered, expired or off-site state', …); // a flipped character; exp = now − 1; return_to '//evil.test'
Deno.test('exchangeCode posts the authorization_code grant', …); // body fields asserted; returns 'Atzr|x'
Deno.test('callback stores the token with selling_partner_id and redirects to the app', …);
// the fake rpc records ('amazon_account_connect', {account_id, refresh_token:'Atzr|x', seller_id:'A3SELLER'}); Location 'http://localhost:5173/ops/customer/1/platforms?amazon=connected'
Deno.test('callback with a bad state redirects with amazon=error and stores nothing', …);
Deno.test('connect in sandbox stores no token and uses AMAZON_SPAPI_SELLER_ID', …); // rpc args refresh_token null, seller_id from the env
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `auth.ts` and `index.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(edge): amazon-auth consent flow, callback and sandbox connect`.

---

### Task 7: The `amazon-listing` function

**Files:**
- Create: `supabase/functions/amazon-listing/index.ts`, `supabase/functions/amazon-listing/listing.ts`, `supabase/functions/tests/amazon_listing_test.ts`
- Modify: `supabase/config.toml` (`[functions.amazon-listing] verify_jwt = true`)

**Interfaces:**
- Consumes: Tasks 1, 3, 4 and 5 (`pickDefinition`); the media table (`storage_path`, `file_name`, `mime_type`).
- Produces (`listing.ts`):

```ts
export type CellContext = { cell: MarketCellRow; product: ProductRow; parent: ProductRow | null; parentCell: MarketCellRow | null; children: ProductRow[];
  marketplaceId: string; languageTag: string; currency: string; sku: string };
export const MEDIA_REF: RegExp; // /^media:([0-9a-f-]{36})$/
export function skuFor(cell: MarketCellRow, product: ProductRow): string; // coalesce(cell.platform_sku, product.sku)
export function serverProvided(product: Pick<ProductRow, 'gtin'>, cell: Pick<MarketCellRow, 'price' | 'currency'>): string[];
// ['externally_assigned_product_identifier'] when the product has a GTIN; plus 'purchasable_offer', 'fulfillment_availability' when price and currency are set
export function buildListingBody(ctx: CellContext, attributes: Attributes, imageUrls: Record<string, string>, matchedAsin: string | null):
  { productType: string; requirements: 'LISTING' | 'LISTING_OFFER_ONLY'; attributes: Attributes };
export type AmazonIssue = { code: string; message: string; severity: 'ERROR' | 'WARNING' | 'INFO'; attributeNames: string[]; categories?: string[] };
export function parseSubmission(resp: { status: string; submissionId: string; issues?: unknown[] }): { status: 'accepted' | 'invalid'; submissionId: string; issues: AmazonIssue[] };
export function deriveListingState(item: { summaries?: ItemSummary[]; issues?: unknown[] }, marketplaceId: string, sandbox: boolean):
  { state: 'live' | 'issues' | 'submitted'; asin: string | null; issues: AmazonIssue[] };
export function publicImageUrl(base: string, path: string, env: AmazonEnv['env']): string;
// in production the base must be https and not localhost/127.0.0.1/kong, else HttpError(422,'listing_image_url_not_public')
```

  `buildListingBody` rules:
  - Keep attribute entries that have no `marketplace_id` or the cell's, then set `marketplace_id` on each.
  - Keep language-tagged entries only for `ctx.languageTag`.
  - Replace every `media:<id>` `media_location` with `imageUrls[id]`; a missing URL throws `HttpError(422,'listing_image_missing')`.
  - Add `externally_assigned_product_identifier: [{ type: 'ean', value: gtin, marketplace_id }]` when the product has a GTIN and the attribute is absent.
  - Add `purchasable_offer: [{ currency, our_price: [{ schedule: [{ value_with_tax: price }] }], marketplace_id }]` from the cell.
  - Add `fulfillment_availability: [{ fulfillment_channel_code: fba ? 'AMAZON_EU' : 'DEFAULT', quantity: 0 }]`. FBM quantity stays 0 in v1, because stock sync is a non-goal.
  - A parent (a product with children, R7): drop `externally_assigned_product_identifier` and `merchant_suggested_asin`, add `parentage_level [{value:'parent'}]`, and keep `variation_theme`.
  - A child: add `parentage_level [{value:'child'}]`, `child_parent_sku_relationship [{ child_relationship_type: 'variation', parent_sku: skuFor(ctx.parentCell, ctx.parent), marketplace_id }]`, and `variation_theme` from the parent's attributes.
  - A `matchedAsin` sets `requirements: 'LISTING_OFFER_ONLY'` and reduces the attributes to `merchant_suggested_asin [{value: asin}]`, `condition_type`, `purchasable_offer` and `fulfillment_availability`.

  `deriveListingState` rules:
  - The issues are the `item.issues` whose `marketplaceIds` is absent or contains the marketplace (in sandbox: all of them). `attributeNames` defaults to `[]`.
  - Any issue with `severity === 'ERROR'` gives `issues`.
  - Otherwise, a summary for the marketplace (in sandbox: the first summary) with status `BUYABLE` or `DISCOVERABLE` gives `live` with its `asin`.
  - Otherwise the state is `submitted`.
- Routes (all `POST`, body `{action, …}`). `check` requires `withAuthorization(req, [['select','market_cell']])`; every other action requires `[['insert','listing_submission']]`.
  - `check {cell_id}`:
    - Checks completeness against `pickDefinition` (a missing definition throws `amazon_schema_missing`).
    - Calls `searchCatalogItems` (`identifiers=[gtin]`, `identifiersType=EAN`, `includedData=summaries`) when the product has a GTIN.
    - Calls `getListingsRestrictions` (`asin`, `sellerId`, `marketplaceIds`, `conditionType=new_new`) when an ASIN matched.
    - Calls `listing_set_state(cell, missing.length ? 'draft' : 'ready', {asin, restricted, reasons, checked_at})`. When the cell is `submitted`, `live` or `issues`, it writes only the match and keeps the state.
    - Returns `{ missing, match, state }`.
  - `validate {cell_id}`: `putListingsItem … mode=VALIDATION_PREVIEW&includedData=identifiers,issues`; returns `{ status: 'VALID'|'INVALID', issues }` and writes nothing.
  - `publish {cell_id}`, in order:
    1. Refuse with `listing_incomplete` (422, `details: missing`) or `amazon_not_connected` (409).
    2. Copy the images from `media` to `listing-images` at `<tenant>/<media id>/<file_name>` (download, then upload), skipping objects that already exist. Only `image/png` and `image/jpeg` are copied.
    3. For a child, call `listing_parent_cell`. If the parent has no `done` or `accepted` submission, publish the parent first.
    4. Insert the `listing_submission` row with the **caller's** client. `kind` is `'update'` when the cell has a `done` submission, else `'create'`; `payload` is the body; also `sku` and `marketplace_id`.
    5. Call `putListingsItem`, then `listing_apply_submission(id, accepted|invalid, submissionId, issues, accepted ? 'submitted' : 'issues', NULL)`.
    6. If anything throws after the insert, call `listing_apply_submission(id, 'failed', NULL, [{code: <error code>, message, severity: 'ERROR', attributeNames: []}], 'issues', NULL)` and rethrow.
  - `delete {cell_id}`: `deleteListingsItem` with a submission of `kind 'delete'`; on ACCEPTED, `listing_set_state(cell,'draft',NULL)`.
  - `publish_bulk {product_ids: string[] (1..50), country}`: runs `publish` sequentially for each product's `amazon` cell in that country. Returns `{ results: { product_id, cell_id: string | null, result: 'submitted' | 'skipped_no_cell' | 'skipped_incomplete' | 'invalid' | 'error', code?: string }[] }`.

- [ ] **Step 1: Write the failing tests** (using the fixture and the sandbox bodies):

```ts
Deno.test('buildListingBody keeps the cell language and marketplace and stamps marketplace_id', …);
Deno.test('buildListingBody adds the GTIN as ean and the offer from the cell', …); // gtin '4260696025800', price 24.9 EUR, fbm → DEFAULT
Deno.test('buildListingBody replaces media references with public URLs', …);
Deno.test('buildListingBody refuses a media reference without a copied image', …); // 'listing_image_missing'
Deno.test('buildListingBody makes a parent without GTIN and a child that points at it', …);
Deno.test('buildListingBody sends an offer only for a matched ASIN', …); // requirements 'LISTING_OFFER_ONLY', merchant_suggested_asin [{value:'B07N4M94X4'}]
Deno.test('parseSubmission reads the canned ACCEPTED and INVALID answers', …); // 'f1dc2914-75dd-11ea-bc55-0242ac130003'; INVALID issues[0].attributeNames ['condition_type']
Deno.test('deriveListingState keeps issues without attributeNames', …); // the sandbox GET body → state 'issues'; issue '18027' has attributeNames []
Deno.test('deriveListingState is live for BUYABLE without errors', …); // summaries [{marketplaceId:'A1PA6795UKMFR9', asin:'B071VG5N9D', status:['BUYABLE']}] → {state:'live', asin:'B071VG5N9D'}
Deno.test('deriveListingState is submitted when the marketplace has no summary yet (production)', …);
Deno.test('refuses non-public image URLs in production', …); // publicImageUrl('http://127.0.0.1:54321', …, 'production') throws 'listing_image_url_not_public'; sandbox returns the URL
Deno.test('publish marks the submission failed when Amazon throws after the insert', …); // fake deps: the insert succeeds, spapi throws AmazonThrottleError → rpc listing_apply_submission with 'failed', 'issues'
Deno.test('publish_bulk reports products without a cell as skipped_no_cell', …);
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `listing.ts` and `index.ts` (`handler(req, deps)` as in Task 6).
- [ ] **Step 4:** The tests PASS and `deno task check` passes.
- [ ] **Step 5: Commit** `feat(edge): amazon-listing check, validate, publish, delete and bulk publish`.

---

### Task 8: The `amazon-poll` function

**Files:**
- Create: `supabase/functions/amazon-poll/index.ts`, `supabase/functions/amazon-poll/poll.ts`, `supabase/functions/tests/amazon_poll_test.ts`
- Modify: `supabase/config.toml` (`[functions.amazon-poll] verify_jwt = false`)

**Interfaces:**
- Consumes: Task 7 `deriveListingState`; Task 1 `listing_apply_submission`; Task 3 `amazonAccountFor`, `withRevocation`, `assertServiceCall`.
- Produces:

```ts
export const POLL_GIVE_UP_HOURS = 24;
export const POLL_BATCH = 100;
export type PollTarget = { submission_id: string; cell_id: string; tenant_id: string; customer_id: string; sku: string; marketplace_id: string; created_at: string };
export function pollOne(target: PollTarget, call: SpapiCall, sellerId: string, now: number, sandbox: boolean):
  Promise<{ status: 'processing' | 'done' | 'failed'; listing_state: 'submitted' | 'live' | 'issues'; issues: AmazonIssue[]; asin: string | null }>;
export function handler(req: Request, deps?: PollDeps): Promise<Response>;
// assertServiceCall; the targets are the latest submission of each cell with status in ('accepted','processing')
// and cell.listing_state = 'submitted', oldest first, POLL_BATCH at a time
```

  `pollOne` calls `GET /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds=&includedData=summaries,issues`.
  - `amazon_not_found`, or a derived state of `submitted`, gives `processing`, unless `now − created_at > POLL_GIVE_UP_HOURS`. Past that, it gives `failed` + `issues` with one issue `{code:'amazon_poll_timeout', message:'Amazon did not report the listing within 24 hours.', severity:'ERROR', attributeNames:[]}`.
  - A derived `live` or `issues` gives `done`.
  - A revoked account fails its targets with `amazon_connection_revoked`, and the run continues with the next target.
  - The response is `{ polled, done, failed }` (counts only).

- [ ] **Step 1: Write the failing tests:**

```ts
Deno.test('pollOne turns the canned sandbox answer into done with issues', …);
Deno.test('pollOne keeps a 404 processing within 24 hours', …);
Deno.test('gives up after 24 hours', …); // created_at = now − 25 h, 404 → {status:'failed', listing_state:'issues'}, issue code 'amazon_poll_timeout'
Deno.test('a live summary yields done, live and the ASIN', …);
Deno.test('the handler refuses a call without the service key', …);
Deno.test('a revoked account fails its targets and the run goes on', …); // two targets, the first account revoked → rpc apply('failed') for 1, apply('done') for 2
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `poll.ts` and `index.ts`.
- [ ] **Step 4:** `deno task test`. Expected: all green.
- [ ] **Step 5: Commit** `feat(edge): amazon-poll resolves submitted cells and gives up after a day`.

---

### Task 9: The app API module and copy

**Files:**
- Create: `app/src/api/amazon/index.ts`, `app/tests/api/amazon.test.ts`
- Modify: `app/src/api/glossary.ts` (add `listing_state` and `api_connection`), `app/tests/plugins/i18n/glossary.test.ts` (the list of enums the spec names), `app/src/plugins/i18n/locales/*/index.json`

**Interfaces:**
- Consumes: the generated `Database` types (Task 1); the edge routes (Tasks 5–7); `@edge-shared/listingCompleteness`.
- Produces:

```ts
export type ListingState = Enums['listing_state']; export type ApiConnection = Enums['api_connection'];
export const LISTING_STATES = allValues<ListingState>()(['draft','ready','submitted','live','issues']);
export const API_CONNECTIONS = allValues<ApiConnection>()(['none','connected','revoked']);
export const LISTING_STATE_SEVERITY: Record<ListingState, 'secondary' | 'info' | 'warn' | 'success' | 'danger'>; // draft secondary, ready info, submitted warn, live success, issues danger
export const AMAZON_COUNTRIES = ['DE','FR','IT','ES','NL','PL','SE','BE','GB'] as const;
export const AMAZON_LANGUAGE_TAGS = ['de_DE','fr_FR','it_IT','es_ES','nl_NL','pl_PL','sv_SE','fr_BE','en_GB'] as const;
export const amazonIssueSchema; // severity .catch('ERROR'), attributeNames .optional().default([])
export const definitionSchema;  // a row of amazon_product_type_definition; schema z.looseObject({properties: z.record(z.string(), z.looseObject({})), required: z.array(z.string()).optional(), allOf: z.array(z.unknown()).optional()}); property_groups z.record(z.string(), z.object({title: z.string(), description: z.string().optional(), propertyNames: z.array(z.string())}))
export const submissionSchema;  // a listing_submission row with issues: z.array(amazonIssueSchema)
export const checkResultSchema; // { missing: MissingField[], match: {asin: string|null, restricted: boolean, reasons: string[]} | null, state: ListingState }
export const bulkResultSchema;
export function searchProductTypes(args: { keywords: string; country: string; customerId: string }): Promise<{ name: string; displayName: string }[]>;
export function fetchDefinition(args: { productType: string; country: string; locale: string; customerId: string }): Promise<Definition>; // the cache table first, then the edge function
export function checkCell(cellId: string): Promise<CheckResult>;
export function validateCell(cellId: string): Promise<{ status: 'VALID' | 'INVALID'; issues: AmazonIssue[] }>;
export function publishCell(cellId: string): Promise<MarketCellRow>;
export function deleteListing(cellId: string): Promise<void>;
export function publishBulk(productIds: string[], country: string): Promise<BulkResult[]>;
export function connectAmazon(accountId: string, returnTo: string): Promise<{ redirect: string } | { account: PlatformAccountRow }>;
export function disconnectAmazon(accountId: string): Promise<void>;
export const issueField = (issue: AmazonIssue, schema: AmazonSchema | null): string | null; // the first attributeName's schema title, else the name, else null (General)
// hooks: useProductTypeSearch, useDefinition, useCellCheck, useListingSubmissions(cellId), usePublishCell, useValidateCell, useDeleteListing, usePublishBulk, useConnectAmazon, useDisconnectAmazon
// mutations invalidate ['market_cell','listing_submission'] (plus 'customer_platform_account' for connect) through invalidateTables
```

  Edge calls use `supabase.functions.invoke('amazon-listing', { method: 'POST', body, headers: { 'x-tenant-id': tenantId } })` (the `tenantHeaders` pattern of `api/user/index.ts:32`), and parse the result with the schema, so a `ZodError` surfaces.

- i18n keys. `en` is the source, `tr` is translated, and the other 11 copy `en`:
  - `ops.amazon.tab.{title, product_type, product_type_search, product_type_none, schema_version, schema_moved, language, next_missing, completeness, groups, badge.{required,conditional,optional}, image_pick, image_clear, save, values_kept}`
  - `ops.amazon.cell.{title, open, connection, not_connected, completeness, missing_none, missing_link, marketplace, listing_language, fulfillment_channel, fulfillment.{fbm,fba}, match.{found,new,none}, restriction.{none,restricted}, history, history_empty, issue_general, publish, update, validate, validated.{VALID,INVALID}, delete, delete_confirm, checked_at}`
  - `ops.amazon.connect.{button, reconnect, disconnect, connected_on, sandbox_note, result.{connected,error}}`
  - `ops.amazon.bulk.{open, open_count, title, country, submit, result.{submitted,skipped_no_cell,skipped_incomplete,invalid,error}}`
  - `glossary.listing_state.*` and `glossary.api_connection.*`
  - `errors.{amazon_not_connected, amazon_connection_revoked, amazon_auth_failed, amazon_unavailable, amazon_throttled, amazon_marketplace_unsupported, amazon_schema_missing, amazon_schema_checksum, amazon_request_invalid, amazon_not_found, listing_incomplete, listing_image_missing, listing_image_url_not_public, platform_account_not_found}`

- [ ] **Step 1: Write the failing test** `tests/api/amazon.test.ts`. Mock `@/lib/supabase` as `tests/api/transfer.test.ts` does, and add `functions.invoke`.

```ts
it('publishCell posts the publish action with the tenant header', …); // invoke('amazon-listing', {method:'POST', body:{action:'publish', cell_id:'c1'}, headers:{'x-tenant-id':'t1'}})
it('reads an issue without attributeNames as an empty list', …);
it('reads an unknown severity as ERROR', …);
it('issueField names the schema title, the attribute, or General', …); // 'condition_type' → its fixture title; 'size' (not in the schema) → 'size'; [] → null
it('connectAmazon returns the redirect in production and the account in sandbox', …);
it('fetchDefinition reads the cache before calling the edge function', …);
it('rejects a malformed check result', …); // ZodError
```

- [ ] **Step 2:** `pnpm vitest run tests/api/amazon.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the module and add the copy.
- [ ] **Step 4:** `pnpm vitest run tests/api/amazon.test.ts tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): amazon api module, glossary enums and copy`.

---

### Task 10: The product "Amazon" tab (schema-driven form, layout B)

**Files:**
- Create: `app/src/components/service-components/amazon-form/amazonForm.ts`, `AmazonAttributeForm.vue`, `AmazonAttributeField.vue`
- Create: `app/src/views/pages/ops/product/tabs/Amazon.vue`
- Modify: `app/src/views/pages/ops/product/useProductForm.ts:15-23` (`PRODUCT_CARD_TABS` gains `'amazon'` after `'media'`), `app/src/views/pages/ops/product/ProductCard.vue` (a tab panel, shown when `ability.can('update','product')`), `app/src/views/pages/ops/product/Manage.vue` (the route tab), locales (`ops.product.tabs.amazon`)
- Test: `app/tests/components/amazonForm.test.ts`, `app/tests/views/productAmazonTab.test.ts`

**Interfaces:**
- Consumes: Task 4's module; Task 9's `useDefinition`, `useProductTypeSearch`, `AMAZON_LANGUAGE_TAGS`; the media library picker used by `EntityMedia` (`components/service-components/entity-media`).
- Produces (`amazonForm.ts`):

```ts
export type Control = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'measure' | 'image' | 'json';
export function controlFor(name: string, property: PropertySchema): Control;
// *_image_locator* → image; items.properties.value.enum → select; value.type boolean → boolean; value + unit → measure;
// value.type number|integer → number; value.type string with maxLength > 200 → textarea; string → text;
// anything else → json (a JSON textarea, so no attribute is ever dropped)
export function readValue(attributes: Attributes, name: string, opts: { languageTag: string; index?: number }): unknown;
export function writeValue(attributes: Attributes, name: string, value: unknown, opts: { languageTag: string; languageTagged: boolean; index?: number }): Attributes;
// returns a new object; other languages' entries are untouched; a blank value removes only this entry
export function isLanguageTagged(property: PropertySchema): boolean; // items.properties has language_tag
export function badgeFor(name: string, required: ReturnType<typeof requiredAttributes>): 'required' | 'conditional' | 'optional';
```
- `AmazonAttributeForm.vue`: props `{ definition: Definition; modelValue: Attributes; languageTag: string; provided: string[] }`; emits `update:modelValue` and `update:languageTag`. Layout B:
  - On the left, the list of `property_groups` (title + a missing-count badge).
  - On the right, the selected group's fields (hidden properties skipped).
  - A "Next missing" button, which selects the group of the first missing field and focuses its input.
  - A language `Select` over `AMAZON_LANGUAGE_TAGS`.
  - A `ProgressBar` showing `filled / required`.
- Controls: `InputText`, `Textarea`, `InputNumber`, `Select` (labels from `enumNames`), `ToggleSwitch`; measure = `InputNumber` + a unit `Select`; image = the media picker, storing `{ media_location: 'media:<id>' }`; json = a `Textarea` that shows a JSON parse error. Every field is wrapped in `FormField`, with the schema `title` as the label and the `description` as the hint.
- `tabs/Amazon.vue`:
  - A product type picker: `AutoComplete` over `useProductTypeSearch`. The country is the one of the product's first Amazon cell, else DE.
  - Loads `useDefinition` and binds the form to `product.listing_attributes`.
  - Saves `amazon_product_type`, `amazon_schema_version = definition.version` and `listing_attributes` through the product resource.
  - Shows `ops.amazon.tab.schema_moved` when `product.amazon_schema_version !== definition.version` (R4: values are kept).

- [ ] **Step 1: Write the failing tests.** They read the fixture with `readFileSync(resolve(__dirname,'../../../supabase/seed_files/amazon/LUGGAGE.A1PA6795UKMFR9.en_GB.json'))`.

```ts
// amazonForm.test.ts
it.each([['condition_type','select'],['product_description','textarea'],['item_name','text'],['item_package_weight','measure'],['is_fragile','boolean'],['main_product_image_locator','image'],['number_of_items','number'],['purchasable_offer','json']])('controlFor %s is %s', …);
it('writeValue edits one language and keeps the others', …); // item_name en_GB is kept when de_DE is written
it('writeValue with a blank value removes only that entry', …);
// productAmazonTab.test.ts (mounts AmazonAttributeForm with PrimeVue and i18n, as tests/views/productForm.test.ts does)
it('lists the schema groups with their missing counts', …); // 'Product Identity 3', 'Offer 1', 'Images 1', 'Product Details 1', 'Variations' without a badge
it('next missing opens the first missing group and focuses its field', …);
it('shows required, conditional and optional badges', …); // item_name required; child_parent_sku_relationship conditional for a child; color optional
it('writes a language-tagged value in the chosen language only', …); // emits item_name [{value:'Mop', language_tag:'de_DE'}]
it('the completeness bar shows filled of required', …); // the story attributes + provided → '6 / 6'
it('an image slot stores a media reference', …); // emits main_product_image_locator [{media_location:'media:5eed0009-0000-4000-8000-000000000001'}]
it('shows the schema-moved notice', …); // product version 'OLD' vs 'UHqSqmb4FNUk='; values unchanged
```

- [ ] **Step 2:** `pnpm vitest run tests/components/amazonForm.test.ts tests/views/productAmazonTab.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the form, the field component and the tab.
- [ ] **Step 4:** The two files PASS, and `pnpm vitest run tests/views/productForm.test.ts tests/plugins/i18n` still passes.
- [ ] **Step 5: Commit** `feat(product): amazon tab with schema-driven form`.

---

### Task 11: Connect Amazon, the cell drawer, the grid badge and bulk publish

**Files:**
- Modify: `app/src/views/pages/ops/customer/PlatformUpsert.vue`, `app/src/views/pages/ops/customer/tabs/Platforms.vue` (an `api_connection` column as a `Tag` with `glossary.api_connection.*`, plus `authorized_at`)
- Create: `app/src/views/pages/ops/market/CellAmazonDrawer.vue`
- Modify: `app/src/views/pages/ops/market/CellUpsert.vue` (an `ops.amazon.cell.open` button when `platform_id === 'amazon' && id`, which opens the PrimeVue `Drawer` on the right), `app/src/components/service-components/market-matrix-grid/MarketMatrixGrid.vue` (a small `listing_state` tag under the status), `app/src/api/marketMatrix/index.ts` (the overview row carries the new columns; `toMarketCellPayload` never sends `listing_state`, `listing_checked_at` or `listing_match`)
- Create: `app/src/views/pages/ops/product/AmazonBulkPublish.vue`
- Modify: `app/src/views/pages/ops/product/Index.vue:220-245` (a second selection action next to Transfer, shown with `$can('create','listing_submission')`)
- Test: `app/tests/views/platformConnect.test.ts`, `app/tests/views/amazonCellDrawer.test.ts`, `app/tests/views/amazonBulkPublish.test.ts`, `app/tests/components/MarketMatrixGrid.test.ts` (extend), `app/tests/api/marketMatrix.test.ts` (extend)

**Interfaces:**
- Consumes: Task 9's hooks; Task 4's `missingAttributes`. The app passes `provided` with the same rule as the server's `serverProvided`: a GTIN gives `externally_assigned_product_identifier`; price + currency give `purchasable_offer` and `fulfillment_availability`.
- The drawer's sections, in order:
  1. Connection: the state tag. "Not connected" links to the customer's platforms tab (route `ops-customer-manage-platforms`).
  2. Completeness for this cell's marketplace and `listing_language`: the missing field titles, with a link to the product card's `amazon` tab.
  3. Marketplace fields: `price`, `currency`, `listing_language`, `fulfillment_channel` and `stock_source`, saved through the existing cell resource.
  4. Catalogue match and restriction, read from `listing_match`, with a "Check" button (`useCellCheck`). The check also runs when the drawer opens if `listing_checked_at` is older than 1 h.
  5. History (`useListingSubmissions`, newest first): a status tag, and the issues verbatim under `issueField` or `ops.amazon.cell.issue_general`.
  6. Actions:
     - "Validate with Amazon" (`useValidateCell`), on demand only.
     - **Publish on Amazon** (when there is no `done` submission) or **Update on Amazon**. Disabled unless the account is connected, `listing_state` is `ready`, `live` or `issues`, and no field is missing.
     - "Remove from Amazon", behind a confirm.
- `AmazonBulkPublish.vue`: props `{ productIds: string[] }`; a country `Select` over `AMAZON_COUNTRIES`; submit calls `usePublishBulk` and shows a result table keyed by `ops.amazon.bulk.result.*`.

- [ ] **Step 1: Write the failing tests:**

```ts
// platformConnect.test.ts
it('shows Connect Amazon only on the amazon account', …);
it('Connect Amazon sends the browser to the consent URL', …); // window.location.assign is called with the returned redirect
it('a sandbox connect shows the connected badge at once', …);
it('shows ?amazon=error as an error toast', …);
// amazonCellDrawer.test.ts
it('shows the missing required fields for the cell marketplace with a link to the Amazon tab', …);
it('Publish is disabled until connected and ready', …);
it('Publish calls amazon-listing publish and shows submitted', …);
it('shows Update on Amazon after a done submission', …);
it('shows the history with Amazon messages verbatim and field titles from the schema', …); // "'condition_type' is required but not supplied." under the condition_type title
it('lists an issue without attributeNames under General', …); // the 18027 message under ops.amazon.cell.issue_general
it('Validate with Amazon runs only on click', …); // no validate call on mount
// amazonBulkPublish.test.ts
it('publishes the selected products to the chosen marketplace and reports skipped ones', …);
// MarketMatrixGrid.test.ts
it('shows the listing state of an API-managed cell', …);
// marketMatrix.test.ts
it('toMarketCellPayload never sends the server-only listing columns', …);
```

- [ ] **Step 2:** Run the five files. Expected: FAIL.
- [ ] **Step 3:** Implement the drawer, the connect action, the grid badge and the bulk dialog.
- [ ] **Step 4:** The five files PASS, and so do `pnpm vitest run tests/views/marketMatrix.test.ts tests/plugins/i18n`.
- [ ] **Step 5: Commit** `feat(market): amazon cell drawer, connect amazon and bulk publish`.

---

### Task 12: Glossary terms, page guides and the dev story

**Files:**
- Modify: `app/src/constants/terms.ts`, `app/src/constants/guide.ts`, the locales, and `app/tests/constants/terms.test.ts` if it lists the categories.
  - `terms.ts`: category `'amazon'` in `TERM_CATEGORIES`, with the terms `{ code: 'productType', slug: 'product_type' }`, `{ code: 'submissionId', slug: 'submission_id' }` and `{ code: 'variation_theme', slug: 'variation_theme' }`. These are Amazon's own identifiers, as they appear in its messages. `TERM_SECTIONS` gains `{ id: 'amazon', categories: ['amazon'] }`.
  - `guide.ts`: new tasks `task('fill_amazon','update','product')` on product, `task('publish_amazon','create','listing_submission')` on market_matrix and `task('connect_amazon','update','customer_platform_account')` on customer. Add the codes each page marks to that page's `terms`.
  - Locales: `terms.<slug>.{short,long}`, `system_guide.sections.amazon.*` (mirroring `abbreviations`), and `guide.pages.<page>.tasks.<id>.{title,steps.1..3}`.
- Modify: `supabase/seed_story.sql` (Step 11), `supabase/seed_story.check.sql`, `scripts/seed-story.mjs` (injects the fixture and the seller id), `scripts/seed-story.test.mjs`

**Interfaces:**
- Produces (script): `export function amazonStoryPrelude(root: string, env: Record<string, string | undefined>): string`. It returns these statements, which `main()` prepends to the story SQL (the SQL loads the fixture; nothing is uploaded):

```sql
SELECT set_config('story.amazon_definition', $fx$<the definition file>$fx$, FALSE);
SELECT set_config('story.amazon_attributes', $fx$<the attributes file>$fx$, FALSE);
SELECT set_config('story.amazon_seller_id', '<AMAZON_SPAPI_SELLER_ID from supabase/functions/.env, else SANDBOX-SELLER>', FALSE);
```

- Story **Step 11 (2 days ago): Amazon listing, as koordinator in MOESA LTD.** One DO block with `story_begin` / `story_end('2 days')`; ids `5eed0011-0000-4000-8000-0000000000NN`.
  - `INSERT INTO public.amazon_product_type_definition` from `story.amazon_definition` (`marketplace_id 'A1PA6795UKMFR9'`, `product_type 'LUGGAGE'`, `locale 'en_GB'`, `version 'UHqSqmb4FNUk='`).
  - THO's `amazon` account (seed.sql:285): `api_connection 'connected'`, `seller_id = story.amazon_seller_id`, `authorized_at = now() - 2 days`. The story runs as postgres, so the guard lets this through. No Vault secret is written, because sandbox uses the self-authorized token.
  - THO-MOP40-2P: `amazon_product_type 'LUGGAGE'`, `amazon_schema_version 'UHqSqmb4FNUk='`, `listing_attributes = story.amazon_attributes`.
  - The cells from step 07: DE (…0007-…01) gets `listing_state 'live'`, `listing_language 'de_DE'` and `fulfillment_channel 'fbm'`; FR (…02) `issues`; IT (…03) `submitted`; ES (…04) `ready`; NL (…05) `draft`.
  - `listing_submission` rows:
    - `5eed0011-…-01`: DE, `create`, `done`, `amazon_submission_id 'f1dc2914-75dd-11ea-bc55-0242ac130003'`, `issues '[]'`.
    - `…-02`: FR, `create`, `invalid`, with `issues` set to the sandbox's INVALID list (`90220` condition_type and `90000900` fake_attribute).
    - `…-03`: IT, `create`, `processing`, created 2 days ago.
- Checks: append these before `ROLLBACK`, and flip `market_cell.listing_state` to `'all'` in `story_enum_column`.

```sql
-- m22.connected: THO's amazon account is connected with a seller id and a date
SELECT 'm22.connected' WHERE NOT EXISTS (SELECT 1 FROM public.customer_platform_account a JOIN public.customer c ON c.id = a.customer_id WHERE c.code = 'THO' AND a.platform_id = 'amazon' AND a.api_connection = 'connected' AND a.seller_id IS NOT NULL AND a.authorized_at IS NOT NULL);
-- m22.definition: the fixture is in the cache
SELECT 'm22.definition' WHERE NOT EXISTS (SELECT 1 FROM public.amazon_product_type_definition WHERE product_type = 'LUGGAGE' AND marketplace_id = 'A1PA6795UKMFR9' AND jsonb_typeof(schema -> 'properties') = 'object');
-- m22.attributes: the mop has its product type and attributes
SELECT 'm22.attributes' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE tenant_id = pg_temp.moesa() AND sku = 'THO-MOP40-2P' AND amazon_product_type = 'LUGGAGE' AND listing_attributes ? 'item_name');
-- m22.submissions: one done, one invalid with issues
SELECT 'm22.submissions', s FROM unnest(ARRAY['done','invalid']) s WHERE NOT EXISTS (SELECT 1 FROM public.listing_submission WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s AND (s = 'done' OR jsonb_array_length(issues) > 0));
-- m22.status_untouched: R2, the business status of the step 07 DE and NL cells did not move
SELECT 'm22.status_untouched', id FROM public.market_cell WHERE id IN ('5eed0007-0000-4000-8000-000000000001','5eed0007-0000-4000-8000-000000000005') AND status NOT IN ('live','suppressed');
```

- [ ] **Step 1: Write the failing tests.** Add the codes to `terms.ts` and `guide.ts` only, without copy, and run `pnpm vitest run tests/constants/terms.test.ts tests/plugins/i18n`: it fails on the missing copy. In `seed-story.test.mjs`, add `test('amazonStoryPrelude embeds both fixture files and the seller id', …)` and `test('the amazon fixture files exist and parse', …)`: they fail.
- [ ] **Step 2:** Write the copy (en, tr, and en in the other 11), the prelude, Step 11 and the checks.
- [ ] **Step 3:** `pnpm vitest run tests/constants tests/plugins/i18n` and `pnpm test:scripts` PASS. `pnpm dev:supabase-reset` prints `seed-story: ok (<n> checks)`.
- [ ] **Step 4: Commit** `feat(guide): amazon terms and guides; story step 11 with a connected THO account`.

---

### Task 13: Full verification and README

**Files:**
- Modify: `supabase/README.md`. Add an "Amazon (M22)" section covering:
  - the env keys of `.env.example`, and sandbox vs production;
  - `pnpm dev:amazon-probe` and `deno task test:live`;
  - the Vault secrets the owner sets on the hosted project: `select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_function_url');`, and the same for the service key as `edge_service_key`;
  - the redirect URI to register in the Amazon app: `<PUBLIC_SUPABASE_URL>/functions/v1/amazon-auth/callback`;
  - that the production push must include 046 and 047 with the rest.

- [ ] **Step 1:** From `app/`: `pnpm test:db`. Expected: every file `ok`.
- [ ] **Step 2:** From `supabase/functions/`: `deno task check && deno task test` passes; `deno task test:live` reports 4 passed.
- [ ] **Step 3:** From `app/`: `pnpm test` and `pnpm test:scripts` pass, and so do the repo's lint and typecheck scripts.
- [ ] **Step 4:** `pnpm dev:supabase-reset` prints `seed-story: ok`, and `pnpm dev:amazon-probe` prints `ok`.
- [ ] **Step 5: Browser walk.** Run `pnpm dev` and sign in as koordinator@moesa-panel.test in MOESA LTD. The edge functions are served by `supabase start`, with `supabase/functions/.env`.
  1. Customer THO → Platforms: the Amazon row shows "Connected" with the date. Disconnect, then press **Connect Amazon**: it is connected again at once (sandbox), with the toast `ops.amazon.connect.result.connected`.
  2. Product THO-MOP40-2P → Amazon tab: LUGGAGE, version `UHqSqmb4FNUk=`, bar 6 / 6 in de_DE. Switch to fr_FR: item_name, brand and bullet_point are missing. "Next missing" jumps to Product Identity.
  3. Market matrix → THO-MOP40-2P amazon ES (ready) → drawer: es_ES fields are missing until es_ES copy is filled on the tab. Check: the match is "new" (the sandbox has no EAN mock), and the restriction from the canned `used_acceptable` answer is shown.
  4. Press **Publish on Amazon**: a history row `accepted` appears and the cell badge shows `submitted`. The status moves (preparing → uploaded) only for a cell that was planned or preparing; ES was uploaded, so it is unchanged.
  5. Wait for the cron (at most 10 min), or run `select private.call_edge_function('amazon-poll','{}')`. The row turns `done` and the cell `issues`: the canned `90220 size` issue, and `18027` under General. `open_issue` starts with "Amazon: " and the status is unchanged (R2).
  6. Validate with Amazon on ES: a `VALID` or `INVALID` toast (the sandbox's default mock answers ACCEPTED, shown as valid); nothing is added to the history.
  7. Product list → select THO-MOP40-2P and THO-CONES-100 → Publish to Amazon → DE: the mop is `submitted`, the cones `skipped_no_cell`.
  8. Turkish UI: the same screens show Turkish copy, and the terms productType / submissionId / variation_theme open the guide panel.
- [ ] **Step 6: Commit** `docs(amazon): local and hosted setup for listing publishing`.
