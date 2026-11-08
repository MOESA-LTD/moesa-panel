# Field-Level Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tenant admin sets per role, per resource, per field read/write rights, and the database enforces them on every path (PostgREST tables, embeds, filters, RPCs, views, Edge Functions, exports, audit history, files), with the internal team's lists within the measured budget.

**Architecture:** Spike prototype "A-def". A catalog (`public.field_class`, `public.role_field_permission`) drives a generator, `private.enable_field_security(table)`. For each business table, the generator emits a masking view `api.<table>`, owned by the NOLOGIN, non-BYPASSRLS role `api_owner`. Each sensitive column is wrapped in a `CASE` over once-per-query field-right InitPlans, evaluated per row tenant. The generator also emits INSTEAD OF forwarding triggers that re-read through the view, computed relationships for masked FKs, and a per-table BEFORE write guard on the base table, driven by the request identity. The app and the Edge Functions switch to `api`. In one cutover migration, `anon`/`authenticated` lose every privilege on `public` tables.

**Tech Stack:** Postgres 15 + pgTAP, PostgREST (Supabase CLI 3.x locally), Deno Edge Functions (`npm:@supabase/supabase-js@2.50.3`, `jsr:@std/assert@1`), Vue 3.5 + PrimeVue 4 + TanStack Query + zod + CASL (`@casl/ability`), vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-11-08-field-permissions-design.md` is binding. That includes "Owner decisions" 1–5 and "Rulings after the builder check" 1–12, cited below as **OD1–OD5** and **R1–R12**. Column data comes from `docs/superpowers/specs/2026-11-08-field-classification.md` (**CL**), as amended by OD2 (Task 2 lists the amendments). The evidence is in `docs/superpowers/research/field-permissions/` (`research.md` "Attack-test checklist" = **AC**, `spike.md` T0–T12, `spike-scripts/`).

## Global Constraints

- "`anon` and `authenticated` lose SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every business table in `public`; only the view owner and the service role keep them." TRUNCATE (and REFERENCES, TRIGGER) go in Task 1. Everything else goes in the cutover (Task 19), never earlier.
- View owner: "A dedicated NOLOGIN role `api_owner`, **not** BYPASSRLS, member of `authenticated`, owns every `api` view". Views are `security_invoker = false`. No `security_barrier`, which measured +85–160% for no protection. Never a view or definer function owned by `postgres` that reads a business table for a user.
- Mask form: `CASE WHEN t.tenant_id = ANY((SELECT private.field_read_tenants('<resource>', '<field>'))) THEN t.<field> END`. R10 adds a fast path in front of it. "The field function never per row." The function is `STABLE`.
- Writes to a field without the write right fail with SQLSTATE `42501` and the message `field_write_forbidden`, naming the field in DETAIL. "`RETURNING` never reveals a hidden value."
- "Rights are evaluated against **each row's tenant**" (T17). The active tenant is never used for tenant tables.
- R1: roles outside the classification keep read+write on every field of every table they hold the table permission for. The classification defaults apply to `owner`, `management`, `coordinator` and `customer_viewer` only. New roles start from "sensitive denied".
- R10 budget: internal users ≤ +15%; restricted or mixed-rights multi-tenant users ≤ +40%. This covers embeds and `return=representation`, over SQL and HTTP.
- R2 cutover: "the REVOKE and the app's switch to `api` ship together". There is no compatibility window.
- R11: PostgREST upserts on views are not supported. The one service-role upsert (`amazon_product_type_definition`) stays on the base table.
- Migrations are new files `048`–`062`. Files `001`–`047` are never edited. Each migration has its own `supabase/tests/database/<nnn>_<name>.test.sql` (`BEGIN; SELECT plan(n); … ROLLBACK;`, with the header comment and the `set_config('test.*')` block as in `045_transfer_files.test.sql`). `plan(n)` is the number of assertions the task lists; a `:name` in a test is a `current_setting('test.name')` fixture set up in that file. The actor for a block is named in a comment above it and set with `private.impersonate` or `private.impersonate_scope`.
- Every new function: `SET search_path = ''`, schema-qualified names, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then explicit grants.
- Every `RAISE EXCEPTION '<code>'` has an `errors.<code>` message in all 13 locales under `app/src/plugins/i18n/locales/*/index.json` (`locales.test.ts`). `en` is the source and `tr` is Turkish; the other 11 carry the English text.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The five failure modes most likely to leak data, each pinned to a test:

1. **The definer view runs with more rights than the caller.** A view owned by a BYPASSRLS role, `api_owner` reachable through a JWT `role` claim (authenticator a member of it), or `authenticated` a member of `api_owner` each give a cross-tenant read (spike T11-pitfall). Pinned: Task 6 `api_owner cannot be assumed and does not bypass RLS` and `every api view is owned by api_owner`. Task 20 sends a JWT whose `role` is `api_owner` and expects 401/403.
2. **Mixed rights across `x-tenant-ids`.** The fast path or the audit rights map must not grant tenant B the rights held in tenant A (spike T9). Pinned: Task 3 `field_read_all is false when one scope tenant lacks the right`, Task 6 `T9 multi-tenant: Europe row visible, LTD row masked`, Task 12 `audit keys masked per row tenant`, Task 20 `mixed-rights user over x-tenant-ids`.
3. **Drift after this ships.** A new column, table or view added later without classification, or a stale `api` view, fails open. Pinned: Task 2 `every column of every public table is classified`, Task 6 `api_view_drift() is empty` (re-run in every later DB task), Task 19 `no public relation grants anything to anon or authenticated`.
4. **Write path side effects.** These are: RETURNING the base row (T7-naive); a masked `NULL` written back over a hidden value (T4b); a DELETE through a view treated as a cascade (R7); an audit revert writing a hidden field back (T6). Pinned: Task 6 `T7 RETURNING is masked`, `T4b wipe is accepted …` with `… and is a no-op (checked as postgres)`; Task 5 `a delete through a view is checked like a direct delete`; Task 12 `revert refused when a touched field is not writable`.
5. **A side door returning sensitive values outside the views.** These are SECURITY DEFINER RPCs, invoker views over `api`, computed relationships, audit JSON, files and Storage, and Edge Functions running as the service role. Pinned: Task 11 `no public function granted to authenticated returns a sensitive value` (table-driven over the catalog), Task 13 `portal user cannot read a PI document, its media or its Storage object`, Task 15 `amazon-listing response carries no sensitive key`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/048_revoke_unexpected_grants.sql` | TRUNCATE/REFERENCES/TRIGGER revoked from anon/authenticated, default privileges |
| `supabase/migrations/049_field_catalog.sql` | `field_group`, `field_class`, `role_field_permission`, `private.field_default`, classification data, default/backfill functions, module/permissions |
| `supabase/migrations/050_field_rights.sql` | field-right functions, `impersonate_scope`, `save_role` field rights, `my_access.fields` |
| `supabase/migrations/051_field_write_guard.sql` | `field_guard_bypassed`, `enable_field_write_guard`, guards on every table with sensitive fields |
| `supabase/migrations/052_guard_request_identity.sql` | R6 guard rewrite (`server_write`), R7 cascade detection (`parent_gone`) |
| `supabase/migrations/053_api_schema.sql` | `api_owner`, schema `api`, `enable_field_security`, `api_forward`, `api_view_drift`, product group |
| `supabase/migrations/054_api_customer_supplier.sql` | customer and supplier group views |
| `supabase/migrations/055_api_orders_shipments.sql` | purchase order and shipment group views |
| `supabase/migrations/056_api_projects_markets.sql` | project, market, listing, incident and change-request group views |
| `supabase/migrations/057_api_core.sql` | tenant, user, role, setting, transfer, files and catalog views; computed fields `owned_via`, `managed_in`, `status` |
| `supabase/migrations/058_api_derived.sql` | the 17 derived views in `api` (the feed goes to 059), invoker → `api_owner` definer conversion, definer inventory fixes |
| `supabase/migrations/059_api_audit.sql` | `api.audit_transaction`, `api.audit_log`, `api.actor`/`api.reverter`, `api.dashboard_notification_feed`, revert refusal |
| `supabase/migrations/060_file_row_rule.sql` | R3 row rule on `document`/`media`/`media_link`, `hidden_media_ids`, Storage check |
| `supabase/migrations/061_disable_graphql.sql` | `DROP EXTENSION pg_graphql` |
| `supabase/migrations/062_field_security_cutover.sql` | REVOKE on every `public` table and view, default privileges |
| `supabase/tests/database/048_…`–`062_….test.sql` | pgTAP, one per migration |
| `supabase/tests/perf/field_security_perf.sql`, `scripts/field-security-perf.mjs` | SQL timing and budget (R10) |
| `supabase/functions/http-tests/{helpers.ts,field_security_http_test.ts}` | HTTP attack suite against local PostgREST (R12) |
| `supabase/functions/scripts/field_perf_http.ts` | HTTP timing (R10) |
| `supabase/seed.sql`, `supabase/seed_story.sql`, `supabase/seed_story.check.sql` | role field rights, `customer_viewer` role and user, story checks |
| `supabase/config.toml`, `.github/workflows/ci.yml`, `supabase/README.md` | exposed schemas, CI, production steps |
| `app/src/lib/supabase.ts`, `app/src/@types/global.d.ts`, `app/package.json` | `api` client, `publicSchema` for RPCs, `api` types |
| `app/src/plugins/casl/index.ts`, `app/src/api/access.ts`, `app/src/store/auth/index.ts`, `app/src/composables/useFieldAccess.ts` | CASL field rules |
| `app/src/components/service-components/select-permissions/SelectFieldPermissions.vue`, `app/src/api/role/index.ts`, role form | role editor field toggles |
| `app/src/api/product/csv.ts`, `app/src/views/pages/ops/product/Index.vue` | export/import by field rights |
| `supabase/functions/_shared/supabaseClient.ts`, `amazon-listing/*`, `_shared/listingStatus.ts` | Edge Functions on `api`, projected service reads |

---

### Task 1: Revoke unexpected grants (quick win)

**Files:**
- Create: `supabase/migrations/048_revoke_unexpected_grants.sql`
- Test: `supabase/tests/database/048_revoke_unexpected_grants.test.sql`

**Interfaces:**
- Produces: no `public` table grants TRUNCATE, REFERENCES or TRIGGER to `anon` or `authenticated`. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated`. SELECT/INSERT/UPDATE/DELETE stay until Task 19.

- [ ] **Step 1: Write the failing test** (`plan(4)`)

```sql
SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER') $$, 'no public table grants TRUNCATE/REFERENCES/TRIGGER to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace
   AND d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'r'
   AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=[a-zA-Z]*[Dxt]') $$, 'new tables of postgres do not grant TRUNCATE/REFERENCES/TRIGGER');
-- as koordinator in MOESA LTD:
SELECT throws_ok($$ TRUNCATE public.product CASCADE $$, '42501', NULL, 'a user cannot TRUNCATE');
SELECT ok(has_table_privilege('authenticated', 'public.product', 'SELECT'), 'SELECT is untouched until the cutover');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL in `048_…` (the grants exist).
- [ ] **Step 3: Implement** the migration. It loops over `pg_class` (`relkind IN ('r','p')`, namespace `public`) and issues `REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated`, then alters the default privileges. Do not touch `FOR ROLE supabase_admin`: hosted `postgres` cannot. Task 19's test catches any later table.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add supabase/migrations/048_* supabase/tests/database/048_* && git commit -m "fix(security): revoke truncate, references and trigger from api roles"`

---

### Task 2: Field catalog, classification data and role defaults

**Files:**
- Create: `supabase/migrations/049_field_catalog.sql`
- Test: `supabase/tests/database/049_field_catalog.test.sql`
- Modify: `supabase/seed.sql:89-139` (`seed_roles`, `seed_ops_roles`), `supabase/seed.sql:14-75` (new auth user `portal@moesa-panel.test`), `supabase/seed.sql:216-222` (membership)
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_not_sensitive`)

**Interfaces:**
- Produces (SQL, exact):
  - `public.field_group (id TEXT PRIMARY KEY CHECK (id ~ '^[a-z_]+$'), position INT NOT NULL)` with rows `cost 10, sell_price 20, supplier_identity 30, supplier_contact 40, supplier_terms 50, contract 60, finance 70, internal_note 80, personal_data 90`.
  - `public.field_class_kind AS ENUM ('system','open','sensitive')`.
  - `public.field_class (resource_name TEXT NOT NULL, field TEXT NOT NULL, class public.field_class_kind NOT NULL, group_name TEXT REFERENCES public.field_group (id), self_readable BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (resource_name, field), CHECK ((class = 'sensitive') = (group_name IS NOT NULL)), CHECK (NOT self_readable OR class = 'sensitive'))`. `resource_name` is spelled like `permission.resource_name` (`'public.product'`).
  - `public.role_field_permission (role_id UUID NOT NULL REFERENCES public.role (id) ON DELETE CASCADE, resource_name TEXT NOT NULL, field TEXT NOT NULL, can_read BOOLEAN NOT NULL, can_write BOOLEAN NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (role_id, resource_name, field), FOREIGN KEY (resource_name, field) REFERENCES public.field_class ON DELETE CASCADE, CHECK (can_read OR NOT can_write))`. A BEFORE INSERT/UPDATE trigger `role_field_permission_sensitive_only` raises `field_not_sensitive` (`check_violation`) unless the field's class is `sensitive`. RLS is on. Its four `public.permission` rows copy those of `public.role_permission` (group, kind, `resource_condition`, `throws_error`) with `resource_name = 'public.role_field_permission'`. Grant them to the owner role, as 024 does for media. Audit it with `private.audit_enable`. Field rights do **not** go into `public.permission` (T18).
  - `field_class` and `field_group`: RLS on, one `SELECT … TO authenticated USING (TRUE)` policy (as `public.platform`), no write policy.
  - `private.field_default (profile TEXT, group_name TEXT REFERENCES public.field_group, can_read BOOLEAN NOT NULL, can_write BOOLEAN NOT NULL, PRIMARY KEY (profile, group_name))`.
  - `private.apply_field_defaults(p_role_id UUID, p_profile TEXT) RETURNS VOID`: upserts one row per sensitive field from `private.field_default`. Fields of `public.user` get `(TRUE, FALSE)` for `management`/`coordinator` and no row for `customer_viewer` (self access is `self_readable`).
  - `private.grant_all_fields(p_role_id UUID) RETURNS VOID`: per sensitive field, `can_read` when the role holds `select` on `resource_name`; `can_write` when it also holds `insert` or `update`.
  - `private.backfill_role_fields() RETURNS VOID`: every role with `tenant_id IS NOT NULL`. `display_name IN ('management','coordinator','customer_viewer')` → `apply_field_defaults(id, display_name)`; any other → `grant_all_fields(id)` (R1). It runs once at the end of 049. All three functions are SECURITY DEFINER and revoked from everyone but `postgres`.

`private.field_default` rows. These are CL's table with OD2 applied (portal reads its own `contract` terms; `restricted_drive_url` moves out of `contract`):

| group | management | coordinator | customer_viewer |
|---|---|---|---|
| cost | RW | RW | — |
| sell_price | RW | R | R |
| supplier_identity | RW | RW | — |
| supplier_contact | RW | RW | — |
| supplier_terms | RW | R | — |
| contract | RW | R | R |
| finance | RW | R | — |
| internal_note | RW | RW | — |
| personal_data | RW | RW | R |

`—` has no row. The owner role gets no rows: ownership grants every field (Task 3).

Classification data. All existing columns of every `public` base table go in first. A column is `system` when it is `id`, `tenant_id`, `created_at`, `updated_at`, `created_by` or `uploaded_by`, or is part of a foreign key. Every other column is `open`. Then one `UPDATE … FROM (VALUES …)` sets the sensitive rows: CL's 81 `**sensitive**` rows, as amended by OD2:
  - `product.target_price_eur` → `cost` (was `sell_price`).
  - `customer.restricted_drive_url` → `internal_note` (was `contract`).
  - add `shipment_event.from_party`, `shipment_event.to_party`, `incident.affected_parties` → `supplier_identity`.
  - `user.user_metadata`, `user.email`, `user.phone` get `self_readable = TRUE`.
  
  Result: **84 sensitive** = cost 18, sell_price 2, supplier_identity 8, supplier_contact 4, supplier_terms 13, contract 5, finance 5, internal_note 21, personal_data 8. Add a header comment: "a later migration that adds a column inserts its `field_class` row; `049_field_catalog.test.sql` fails otherwise."

- [ ] **Step 1: Write the failing test** (`plan(16)`)

```sql
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
   SELECT id, 'public.product', 'sku', TRUE, TRUE FROM public.role WHERE display_name = 'coordinator' LIMIT 1 $$, '23514', 'field_not_sensitive', 'only sensitive fields carry rights');
SELECT throws_ok($$ … can_read FALSE, can_write TRUE … $$, '23514', NULL, 'write implies read');
SELECT is_empty($$ SELECT 1 FROM public.permission WHERE resource_name LIKE '%.%.%' $$, 'no field right is a permission row (T18)');
-- seed (R1): Auditor of Atlas holds every field of tables it reads; coordinator of MOESA LTD has supplier_terms R only
SELECT ok((SELECT bool_and(can_read) FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'Auditor' AND rfp.resource_name = 'public.product'), 'R1: Auditor keeps product fields');
SELECT results_eq($$ SELECT can_read, can_write FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   JOIN public.tenant t ON t.id = r.tenant_id WHERE t.display_name = 'MOESA LTD' AND r.display_name = 'coordinator'
   AND rfp.resource_name = 'public.supplier' AND rfp.field = 'deposit_rate' $$, $$ VALUES (TRUE, FALSE) $$, 'coordinator reads, not writes, supplier terms');
SELECT is((SELECT count(*)::INT FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'customer_viewer' AND rfp.field IN ('purchase_price','notes')), 0, 'portal has no cost or notes');
SELECT ok(EXISTS (SELECT 1 FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'customer_viewer' AND rfp.resource_name = 'public.customer' AND rfp.field = 'deposit_rate' AND rfp.can_read), 'OD2: portal reads contract terms');
SELECT ok(EXISTS (SELECT 1 FROM public.user u JOIN public.user_role ur ON ur.user_id = u.id JOIN public.role r ON r.id = ur.role_id
   WHERE u.email = 'portal@moesa-panel.test' AND r.display_name = 'customer_viewer'), 'the portal test user exists');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`relation public.field_class does not exist`).
- [ ] **Step 3: Implement** the migration (Interfaces). Then update `seed.sql`:
  - `seed_roles` ends with `PERFORM private.grant_all_fields(r.id)` for its three roles.
  - `seed_ops_roles` also creates `customer_viewer`. Its permissions are only `select` on `public.customer`, `customer_brand`, `customer_contact`, `customer_platform_account`, `customer_warehouse`, `product`, `project`, `project_gate`, `project_product`, `shipment`, `shipment_event`, `shipment_line`, `market_cell`, `incident`, `incident_deadline`, `change_request`, `change_request_product`, `document`, `media`, `media_link`, from the CL table headings with portal access. It then calls `apply_field_defaults` for `management`, `coordinator` and `customer_viewer`.
  - Add the auth user `portal@moesa-panel.test` (password `Demo1234!`, as the other demo users) and `seed_member(moesa, portal, 'customer_viewer')`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS (`099_seed.test.sql` counts users; update its expected count by +1 if it fails on that only).
- [ ] **Step 5: Commit** `git commit -m "feat(security): field catalog, classification and role field defaults"` (migration, test, seed.sql, locales).

---

### Task 3: Field-right functions, `save_role` field rights and `my_access.fields`

**Files:**
- Create: `supabase/migrations/050_field_rights.sql`
- Test: `supabase/tests/database/050_field_rights.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_grant_exceeds_own`)

**Interfaces:**
- Consumes: Task 2 tables. `private.tenant_scope()`, `private.tenant_id()`, `private.owned_tenants(UUID)`, `private.check_super_admin(UUID)` (004).
- Produces (all `plpgsql STABLE SECURITY DEFINER`, `search_path = ''`):
  - `private.field_tenants(p_user UUID, p_tenants UUID[], p_resource TEXT, p_field TEXT, p_write BOOLEAN) RETURNS UUID[]`: the core rule. Returns `p_tenants` for a super admin, or when the field is not `sensitive`. Otherwise it returns `p_tenants ∩ owned_tenants(p_user)` (except write on `public.user` fields) `∪` the tenants of the user's roles with a `role_field_permission` row granting `can_read` (or `can_write` when `p_write`). Revoked from `authenticated`.
  - `private.field_read_tenants(p_resource TEXT, p_field TEXT) RETURNS UUID[]` = `field_tenants(auth.uid(), private.tenant_scope(), p_resource, p_field, FALSE)`.
  - `private.field_write_tenants(p_resource TEXT, p_field TEXT) RETURNS UUID[]`, the same with `TRUE`.
  - `private.field_read_all(p_resource TEXT, p_field TEXT) RETURNS BOOLEAN`: TRUE when every tenant of `tenant_scope()` is in `field_read_tenants` (R10 fast path).
  - `private.field_can_read(p_resource TEXT, p_field TEXT) RETURNS BOOLEAN` / `private.field_can_write(…)`: for tenant-less tables, against `ARRAY[private.tenant_id()]`.
  - `private.field_group_read_tenants(p_group TEXT) RETURNS UUID[]`: the intersection of `field_read_tenants` over every sensitive field of the group. It is strict on purpose (Task 13).
  - `private.field_rights_map() RETURNS JSONB`: `{"<tenant id>": ["<table>.<field>", …]}`, the **readable** sensitive fields per scope tenant (R9).
  - `private.sensitive_fields_map() RETURNS JSONB`: `{"<table>": ["<field>", …]}`.
  - `private.field_rights(p_user UUID, p_tenant UUID) RETURNS TABLE (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)`: every sensitive field, for the app.
  - `private.impersonate_scope(p_user UUID, p_active UUID, p_scope UUID[]) RETURNS VOID`: test-only, as `private.impersonate` (015:233) but with `x-tenant-ids` set to `array_to_string(p_scope, ',')`. Revoked from everyone.
  - EXECUTE to `authenticated` on `field_read_tenants`, `field_write_tenants`, `field_read_all`, `field_can_read`, `field_can_write`, `field_group_read_tenants`, `field_rights_map`, `sensitive_fields_map` (each reveals only the caller's own rights).
  - `public.save_role(role_data JSONB, permission_ids UUID[] DEFAULT '{}', field_rights JSONB DEFAULT NULL) RETURNS UUID`. `DROP FUNCTION public.save_role (JSONB, UUID[])` first. `field_rights` is `[{resource_name, field, can_read, can_write}]`. NULL leaves the rows unchanged, so a new role gets none (= sensitive denied, R1). An array syncs the rows (delete missing, upsert given). A right the caller does not hold in the role's tenant (`field_tenants(auth.uid(), ARRAY[role.tenant_id], …)`) raises `field_grant_exceeds_own` (`42501`). It stays SECURITY INVOKER here; Task 11 converts it.
  - `public.my_access(requested UUID)`: the returned JSONB gains `fields`, `jsonb_agg` of `private.field_rights(auth.uid(), <active tenant>)`. Restate 011's body; the other keys are unchanged.

- [ ] **Step 1: Write the failing test** (`plan(18)`). Fixtures: tenants `moesa` (MOESA LTD), `europe` (MOESA Europe); users `akif` (management in both), `koordinator`, `baris` (owner), `portal`, `elif`. Inside the test, `elif` joins MOESA LTD with role `t_restricted` (product select/update, no field rows), and joins Europe with role `t_cost` (product select + `cost` read on every cost field).

```sql
-- as koordinator in moesa
SELECT is(private.field_read_tenants('public.supplier','deposit_rate'), ARRAY[:moesa]::UUID[], 'coordinator reads supplier terms');
SELECT is(private.field_write_tenants('public.supplier','deposit_rate'), '{}'::UUID[], 'coordinator cannot write supplier terms');
SELECT is(private.field_read_tenants('public.product','sku'), ARRAY[:moesa]::UUID[], 'open fields pass with the scope');
-- as portal in moesa
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'portal has no cost');
SELECT is(private.field_read_tenants('public.product','company_price_eur'), ARRAY[:moesa]::UUID[], 'portal reads sell price');
-- as baris (owner) in moesa
SELECT is(private.field_write_tenants('public.product','purchase_price'), ARRAY[:moesa]::UUID[], 'an owner holds every field');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, europe])
SELECT is(private.field_read_tenants('public.product','purchase_price'), ARRAY[:europe]::UUID[], 'per tenant: cost only in Europe');
SELECT ok(NOT private.field_read_all('public.product','purchase_price'), 'field_read_all is false when one scope tenant lacks the right');
SELECT ok(private.field_read_all('public.product','sku'), 'field_read_all is true for open fields');
SELECT ok(private.field_rights_map() -> :europe ? 'product.purchase_price' AND NOT (private.field_rights_map() -> :moesa ? 'product.purchase_price'), 'rights map is per tenant');
SELECT ok(private.field_group_read_tenants('cost') = ARRAY[:europe]::UUID[], 'group right = every field of the group');
-- a forged scope: impersonate_scope(elif, moesa, ARRAY[moesa, <Nova>])
SELECT ok(NOT (:nova = ANY (private.field_read_tenants('public.product','sku'))), 'a foreign tenant in x-tenant-ids is dropped');
-- mid-session revoke (AC "Role change")
DELETE FROM public.role_field_permission WHERE role_id = :t_cost;  -- as postgres, then re-impersonate
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'a revoked right applies to the next statement');
-- save_role as akif in moesa
SELECT ok((SELECT NOT EXISTS (SELECT 1 FROM public.role_field_permission WHERE role_id = public.save_role('{"display_name":"t_new"}', '{}'))), 'a new role starts from sensitive denied');
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', :t_restricted, 'display_name', 't_restricted'), :perm_ids,
   '[{"resource_name":"public.product","field":"notes","can_read":true,"can_write":false}]') $$, 'save_role syncs field rights');
-- as koordinator (no write on supplier terms) granting it to a role it can edit (test grants role update for this case)
SELECT throws_ok($$ SELECT public.save_role(…, '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]') $$,
   '42501', 'field_grant_exceeds_own', 'a caller cannot grant a field right it lacks');
SELECT ok((SELECT public.my_access(:moesa) -> 'fields' @> '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'), 'my_access lists field rights');
-- register_tenant/create_branch (R1): a new branch has no role and so no field rows; its owner holds every field
SELECT is((SELECT count(*)::INT FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id WHERE r.tenant_id = (public.create_branch(:moesa, '{"display_name":"t_branch"}')).id), 0, 'a new branch seeds no field rows');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`function private.field_read_tenants does not exist`).
- [ ] **Step 3: Implement** `050_field_rights.sql` (Interfaces). Use two narrow lookups (roles, ownership) as `tenants_granting` does (004:472). There is no OR join.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): per-tenant field right functions, save_role field rights, my_access fields"`

---

### Task 4: Base-table field write guard (R5)

**Files:**
- Create: `supabase/migrations/051_field_write_guard.sql`
- Test: `supabase/tests/database/051_field_write_guard.test.sql`
- Modify: any existing `supabase/tests/database/*.test.sql` that breaks because a write by `koordinator` now touches a field the coordinator only reads (`supplier_terms`, `contract`, `finance`, `sell_price`). Switch that statement's actor to `akif`, and list each changed file in the commit body.
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_write_forbidden`)

**Interfaces:**
- Consumes: `private.field_write_tenants`, `private.field_can_write` (Task 3); `private.rules_bypassed()` (040).
- Produces:
  - `private.field_guard_bypassed() RETURNS BOOLEAN`: `private.rules_bypassed() OR auth.role() = 'service_role' OR (current_setting('role') = 'none' AND nullif(current_setting('request.jwt.claims', TRUE), '') IS NULL)`. The last term covers migrations, seed, cron and the GoTrue sync. PostgREST always runs SET ROLE, which a SECURITY DEFINER body still reports. It never uses `current_user`.
  - `private.enable_field_write_guard(p_table TEXT) RETURNS VOID` generates `private.<table>_field_write_guard() RETURNS TRIGGER` (SECURITY DEFINER, owner `postgres`) and `CREATE OR REPLACE TRIGGER aa_field_write_guard BEFORE INSERT OR UPDATE ON public.<table> FOR EACH ROW` (`aa_` sorts it before the other BEFORE triggers). The function returns at once when `field_guard_bypassed()`. Then, per sensitive non-generated column `f`:
    - "written" on UPDATE means `NEW.f IS DISTINCT FROM OLD.f`.
    - "written" on INSERT means `NEW.f IS DISTINCT FROM <default>`. `<default>` is the column default when it is a constant (`pg_get_expr` with no function call), else `NULL`.
    - A written field is checked with `NEW.tenant_id = ANY (private.field_write_tenants('public.<t>', 'f'))`. Tenant-less tables use `private.field_can_write(…)`. `public.user` also allows `NEW.id = auth.uid()`.
    - A failure raises `RAISE EXCEPTION 'field_write_forbidden' USING ERRCODE = '42501', DETAIL = '<table>.<field>'`. The message never contains a value.
  - The migration calls it for every table that has a sensitive field (`SELECT DISTINCT resource_name FROM public.field_class WHERE class = 'sensitive'`).

- [ ] **Step 1: Write the failing test** (`plan(12)`), on base tables, before any view exists:

```sql
-- as koordinator in moesa
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.5 WHERE code = 'CN1' $$, '42501', 'field_write_forbidden', 'T4: coordinator cannot write supplier terms');
SELECT lives_ok($$ UPDATE public.supplier SET city = 'Ningbo' WHERE code = 'CN1' $$, 'T4c: open fields stay writable');
SELECT throws_ok($$ INSERT INTO public.customer (tenant_id, code, display_name, deposit_rate) VALUES (:moesa, 'TST', 'x', 0.3) $$, '42501', 'field_write_forbidden', 'T5: insert with a hidden-write field refused');
SELECT lives_ok($$ INSERT INTO public.incident (…required open columns…) VALUES (…) $$, 'a NOT NULL default (affected_parties {}) is not a write');
SELECT lives_ok($$ UPDATE public.purchase_order_line SET quantity = quantity + 1 WHERE … $$, 'a generated cost column (line_total) is not a write');
-- error detail names the field, never a value (T7)
SELECT matches((SELECT pg_temp.error_detail($$ UPDATE public.supplier SET deposit_rate = 0.42 WHERE code = 'CN1' $$)), '^supplier\.deposit_rate$', 'the error names the field only');
-- definer path (R5): a postgres-owned SECURITY DEFINER function writing as the caller is guarded too
SELECT throws_ok($$ SELECT pg_temp.definer_write_supplier_deposit() $$, '42501', 'field_write_forbidden', 'a definer function is guarded by the request identity');
-- as koordinator (personal_data on user: R only; akif's row is visible to it)
SELECT throws_ok($$ UPDATE public.user SET phone = '+1' WHERE email = 'akif@moesa-panel.test' $$, '42501', 'field_write_forbidden', 'nobody else writes a user''s phone');
SELECT lives_ok($$ UPDATE public.user SET phone = '+90' WHERE id = auth.uid() $$, 'a user writes their own phone (self)');
-- bypasses: RESET ROLE; no claims
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.31 WHERE code = 'CN1' $$, 'migrations/seed/cron (role none, no claims) bypass');
SET LOCAL ROLE service_role;
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.32 WHERE code = 'CN1' $$, 'the service role bypasses');
-- request identity, not current_user: as koordinator, SET LOCAL ROLE postgres inside impersonation is not possible, so assert the function body
SELECT ok((SELECT prosrc NOT LIKE '%current_user%' FROM pg_proc WHERE proname = 'field_guard_bypassed'), 'the bypass never reads current_user');
```

`pg_temp.definer_write_supplier_deposit()` is created in the test as postgres, SECURITY DEFINER, `UPDATE public.supplier SET deposit_rate = 0.5 WHERE code = 'CN1'`. `pg_temp.error_detail(sql TEXT) RETURNS TEXT` is created in the test: it runs the SQL and returns `PG_EXCEPTION_DETAIL`.

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`051_…` statements succeed).
- [ ] **Step 3: Implement** `051_field_write_guard.sql`. Run `cd app && pnpm test:db` and fix the existing tests that now fail for the intended reason (see Files).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): base-table field write guard driven by the request identity"`

---

### Task 5: Request-identity guards (R6) and explicit cascade detection (R7)

**Files:**
- Create: `supabase/migrations/052_guard_request_identity.sql`
- Test: `supabase/tests/database/052_guard_request_identity.test.sql`

**Interfaces:**
- Produces:
  - `private.begin_server_write() RETURNS VOID` sets `moesa.server_write = '1'` transaction-locally. `private.server_write() RETURNS BOOLEAN` reads it. Both are revoked from everyone. A PostgREST caller cannot set a GUC.
  - `private.market_cell_listing_server_only()` and `private.platform_account_api_server_only()` restated from 046. `current_user = 'authenticated'` becomes `auth.role() = 'authenticated' AND NOT private.server_write()`. Keep 046's transfer branch verbatim.
  - `public.amazon_account_disconnect` and `public.listing_begin_submission` (the definer RPCs granted to `authenticated` that write those columns) call `PERFORM private.begin_server_write()` first. Restate their 046 bodies otherwise unchanged.
  - `private.parent_gone(p_table REGCLASS, p_id UUID) RETURNS BOOLEAN`: `VOLATILE` (fresh snapshot inside the RI cascade), SECURITY DEFINER. It returns `NOT EXISTS (SELECT 1 FROM <p_table> WHERE id = p_id)`.
  - Restate the latest versions of `purchase_order_line_guard` (041:969), `purchase_order_child_guard` (030:413), `shipment_purchase_order_guard` (031:414), `shipment_line_guard` (031:478), `incident_child_guard` (035:513) and `market_cell_guard` (041:1158). In each, the depth test (`TG_OP = 'DELETE' AND pg_trigger_depth() > 1`, or `pg_trigger_depth() = 1` in `market_cell_guard`) becomes `private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('<parent>', OLD.<fk>)`, one term per ON DELETE CASCADE parent of the row. Read the parents from `pg_constraint` (`confdeltype = 'c'`) while writing.

- [ ] **Step 1: Write the failing test** (`plan(10)`). Each guard is proven through a temporary INSTEAD OF view that forwards with SECURITY DEFINER owned by a test role. That role is a member of `authenticated` and has base grants, so `current_user` is not `authenticated` and the depth is 2, as through `api` later:

```sql
-- setup as postgres: CREATE ROLE t_fwd NOLOGIN; GRANT authenticated TO t_fwd; GRANT ALL ON public.market_cell, public.customer_platform_account, public.purchase_order_line, … TO t_fwd;
-- CREATE VIEW pg_temp.mc AS SELECT * FROM public.market_cell; INSTEAD OF UPDATE/DELETE trigger fn SECURITY DEFINER OWNER t_fwd; same for pg_temp.pol (purchase_order_line), pg_temp.sl (shipment_line), pg_temp.cpa
-- as koordinator in moesa:
SELECT throws_ok($$ UPDATE pg_temp.mc SET listing_state = 'live' WHERE id = :cell $$, '23514', 'market_cell_listing_server_only', 'R6: listing_state stays server-only through a definer forwarder');
SELECT throws_ok($$ UPDATE pg_temp.cpa SET api_connection = 'connected' WHERE id = :acct $$, '23514', 'platform_account_api_server_only', 'R6: api_connection stays server-only through a definer forwarder');
SELECT lives_ok($$ SELECT public.amazon_account_disconnect(:acct, 'none') $$, 'the allowed definer RPC still writes it');
SELECT throws_ok($$ DELETE FROM pg_temp.pol WHERE id = :line_of_approved_po $$, '23514', NULL, 'R7: a delete through a view is checked like a direct delete');
SELECT throws_ok($$ DELETE FROM pg_temp.sl WHERE id = :line_of_shipped $$, '23514', NULL, 'R7: shipment_line through a view');
SELECT throws_ok($$ DELETE FROM pg_temp.mc WHERE id = :live_cell $$, '23514', 'market_cell_delete_candidate_only', 'R7: market cell through a view');
-- real cascades still pass (as postgres with the rules bypass off):
SELECT lives_ok($$ DELETE FROM public.purchase_order WHERE id = :draft_po $$, 'a parent delete cascades its lines');
SELECT lives_ok($$ DELETE FROM public.tenant WHERE id = :scratch_tenant $$, 'a tenant delete cascades everything');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND prosrc ~ 'current_user\s*=\s*''authenticated'''), 'no guard tests current_user');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND proname LIKE '%guard' AND prosrc ~ 'pg_trigger_depth'), 'no guard detects a cascade by depth');
```

Set `:scratch_tenant` up in the test with a draft PO, lines and a candidate cell.

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL on the R6/R7 view cases.
- [ ] **Step 3: Implement** `052_guard_request_identity.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "fix(security): guards follow the request role and detect cascades explicitly"`

---

### Task 6: `api_owner`, the generator and the product group, with the full attack suite

**Files:**
- Create: `supabase/migrations/053_api_schema.sql`
- Test: `supabase/tests/database/053_api_schema.test.sql`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `CREATE ROLE api_owner NOLOGIN NOBYPASSRLS`, `GRANT authenticated TO api_owner`, `GRANT api_owner TO postgres` (so `postgres` can hand over ownership). **Never** `GRANT api_owner TO authenticator` or to `authenticated`.
  - `CREATE SCHEMA api`, `GRANT USAGE ON SCHEMA api TO authenticated, service_role`, `GRANT USAGE, CREATE ON SCHEMA api TO api_owner`, `ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE ALL ON TABLES FROM anon`.
  - `private.enable_field_security(p_table TEXT) RETURNS VOID` (SECURITY DEFINER, owner `postgres`):
    1. `CREATE OR REPLACE VIEW api.<t> WITH (security_invoker = false) AS SELECT … FROM public.<t> t`, with the columns in `attnum` order. `system`/`open` → `t.<c>`. A sensitive column on a tenant table becomes `CASE WHEN (SELECT private.field_read_all('public.<t>','<c>')) OR t.tenant_id = ANY ((SELECT private.field_read_tenants('public.<t>','<c>'))) THEN t.<c> END AS <c>`. On a tenant-less table it becomes `CASE WHEN (SELECT private.field_can_read(…)) THEN t.<c> END`. A `self_readable` column adds `t.id = auth.uid() OR` in front.
    2. `ALTER VIEW … OWNER TO api_owner`. Grant `SELECT, INSERT, UPDATE, DELETE ON api.<t> TO authenticated`. Where `authenticated` holds only column-level UPDATE on the base (`tenant`, `setting`), grant the same column list on the view instead of table-level UPDATE. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO api_owner`.
    3. `CREATE OR REPLACE TRIGGER api_forward INSTEAD OF INSERT OR UPDATE OR DELETE ON api.<t> FOR EACH ROW EXECUTE FUNCTION private.api_forward()`.
    4. For every FK whose columns include a sensitive field (R4): a forward computed relationship `api.<fk column without _id>(api.<t>) RETURNS SETOF api.<target> ROWS 1 STABLE LANGUAGE sql SECURITY INVOKER` = `SELECT x.* FROM api.<target> x WHERE x.id = $1.<fk column>`. The argument row is already masked, so a hidden link returns nothing. Also a reverse `api.<t>(api.<target>) RETURNS SETOF api.<t>` = `… WHERE x.<fk column> = $1.id`. Grant EXECUTE to `authenticated`. Unmasked FKs stay inferred by PostgREST. When `api.<target>` does not exist yet, skip both functions. The migration that creates the target view re-runs the generator for the tables that point at it (Task 7 for `product`, Task 10 for `customer` and `purchase_order`).
    5. `PERFORM private.enable_field_write_guard(p_table)`.
  - `private.api_forward() RETURNS TRIGGER` (SECURITY DEFINER, **owner `api_owner`**, dynamic SQL as `spike-scripts/25_protoA_definer.sql`, keyed on the base primary key columns from `pg_index.indisprimary`):
    - INSERT forwards the non-generated columns whose NEW value is not NULL.
    - UPDATE forwards the non-generated columns where `to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k`; with none, it does nothing.
    - Both re-read `SELECT v.* INTO NEW FROM api.<t> v WHERE <pk> = …`. When the re-read finds nothing, NEW is returned as the caller sent it.
    - DELETE: `DELETE FROM public.<t> WHERE <pk> = OLD.<pk>`, `RETURN OLD` (OLD is already masked).
  - `private.api_view_drift() RETURNS TABLE (relation TEXT, problem TEXT)`. For each `public` table with an `api` view, it reports: a column name/order mismatch (`'columns'`); a sensitive column whose view expression lacks `field_read_tenants('public.<t>', '<c>')` or `field_can_read(` (`'unmasked <c>'`); a non-sensitive column that is not a plain reference (`'masked <c>'`); an owner other than `api_owner` (`'owner'`); a missing `aa_field_write_guard` where sensitive fields exist (`'guard'`).
  - `private.field_calls_only_in_initplans(p_sql TEXT) RETURNS BOOLEAN` (test support, revoked from everyone). It runs `EXPLAIN (VERBOSE, FORMAT JSON) <p_sql>` and returns TRUE when every plan node whose `Output` or `Filter` mentions `field_read_tenants`, `field_read_all`, `field_can_read`, `field_rights_map` or `hidden_media_ids` is inside a subplan whose `Subplan Name` starts with `InitPlan`. Tasks 6, 12 and 13 use it.
  - Applied here to `product` only.

- [ ] **Step 1: Write the failing test** (`plan(40)`). This is the spike's attack list (`spike-scripts/05_suite.sql`) as pgTAP over `api.product`, plus the role checks. Actors:
  - **restricted** = `elif` with `t_restricted` (product select/update/insert, no fields) in MOESA LTD.
  - **internal** = `akif`.
  - **mixed** = `elif` with `t_cost` in Europe, via `impersonate_scope`.
  - Fixtures: as postgres, insert `SPIKE-SECRET` in MOESA LTD (`purchase_price 12.5`, `notes 'secret note'`, supplier CN1) and `SPIKE-EU` in Europe (`purchase_price 77.7`).

```sql
SELECT ok(NOT (SELECT rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname = 'api_owner'), 'api_owner cannot log in and does not bypass RLS');
SELECT ok(NOT pg_has_role('authenticator','api_owner','MEMBER') AND NOT pg_has_role('authenticated','api_owner','MEMBER') AND NOT pg_has_role('anon','api_owner','MEMBER'), 'api_owner cannot be assumed');
SELECT ok(pg_has_role('api_owner','authenticated','MEMBER'), 'api_owner is a member of authenticated');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is((SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'api.product'::regclass), 'api_owner', 'every api view is owned by api_owner');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'api_forward'), 'api_owner', 'the forwarder is owned by api_owner, not postgres');
-- restricted:
SELECT results_eq($$ SELECT sku FROM api.product WHERE sku = 'SPIKE-SECRET' $$, $$ VALUES ('SPIKE-SECRET') $$, 'T0 row visible');
SELECT results_eq($$ SELECT purchase_price, purchase_currency, landed_cost_eur, target_price_eur, company_price_eur, supplier_id, supplier_product_code, notes FROM api.product WHERE sku = 'SPIKE-SECRET' $$,
   $$ VALUES (NULL::NUMERIC, NULL::CHAR(3), NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::UUID, NULL::TEXT, NULL::TEXT) $$, 'T1 masked columns are NULL');
SELECT is((SELECT to_jsonb(x) ->> 'notes' FROM api.product x WHERE sku = 'SPIKE-SECRET'), NULL, 'T1b whole row masked');
SELECT is((SELECT count(*)::INT FROM api.product WHERE sku = 'SPIKE-SECRET' AND purchase_price > 10), 0, 'T2a filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.product WHERE purchase_price IS NOT NULL), 0, 'T2 IS NULL oracle closed');
SELECT is((SELECT array_agg(sku ORDER BY purchase_price) FILTER (WHERE purchase_price IS NOT NULL) FROM api.product), NULL, 'T2c ORDER BY oracle closed');
SELECT results_eq($$ SELECT count(*) FILTER (WHERE purchase_price IS NOT NULL)::INT, sum(purchase_price), max(landed_cost_eur) FROM api.product $$, $$ VALUES (0, NULL::NUMERIC, NULL::NUMERIC) $$, 'T3 aggregates closed');
SELECT is((SELECT 1 / (purchase_price - 12.5) FROM api.product WHERE sku = 'SPIKE-SECRET'), NULL, 'T6a division oracle closed');
SELECT lives_ok($$ SELECT ('x' || notes)::INT FROM api.product WHERE sku = 'SPIKE-SECRET' AND notes IS NOT NULL $$, 'T6b cast error never sees the value');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 1 WHERE sku = 'SPIKE-SECRET' $$, '42501', 'field_write_forbidden', 'T4 write refused');
SELECT lives_ok($$ UPDATE api.product SET purchase_price = NULL, notes = NULL WHERE sku = 'SPIKE-SECRET' $$, 'T4b wipe is accepted …');
SELECT is((SELECT notes FROM public.product WHERE sku = 'SPIKE-SECRET'), 'secret note', '… and is a no-op (checked as postgres)');
SELECT results_eq($$ UPDATE api.product SET display_name = 'r2' WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price, notes $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T7 RETURNING is masked');
SELECT is((SELECT count(*)::INT FROM (UPDATE api.product SET display_name = 'x' WHERE purchase_price < 100 RETURNING 1) z), 0, 'T8 PATCH filtered on a masked field affects 0 rows');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku, purchase_price) VALUES (:moesa, :tho, 'T5', 3) $$, '42501', 'field_write_forbidden', 'T5 insert with a masked field refused');
SELECT lives_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (:moesa, :tho, 'T5B') $$, 'T5b insert without masked fields works');
SELECT lives_ok($$ DELETE FROM api.product WHERE sku = 'T5B' $$, 'DELETE through the view');
SELECT lives_ok($$ SELECT sku, supplier_id FROM api.product WHERE supplier_id IS NULL $$, 'a masked FK reads as NULL (the R4 embed is tested in Task 7, once api.supplier exists)');
SELECT is((SELECT count(*)::INT FROM api.product WHERE sku = 'SPIKE-EU'), 0, 'T11 another tenant''s rows stay invisible');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (:europe, :eu_customer, 'X') $$, '42501', NULL, 'T11c insert into a tenant without product insert refused');
-- base still granted until the cutover (Task 19 flips this assertion)
-- mixed (impersonate_scope elif, moesa, [moesa, europe]):
SELECT results_eq($$ SELECT sku, purchase_price FROM api.product WHERE sku IN ('SPIKE-SECRET','SPIKE-EU') ORDER BY sku $$,
   $$ VALUES ('SPIKE-EU', 77.7::NUMERIC), ('SPIKE-SECRET', NULL::NUMERIC) $$, 'T9 multi-tenant: Europe row visible, LTD row masked');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 1 WHERE sku = 'SPIKE-SECRET' $$, '42501', 'field_write_forbidden', 'T9 write follows the row tenant');
-- internal:
SELECT is((SELECT purchase_price FROM api.product WHERE sku = 'SPIKE-SECRET'), 12.5::NUMERIC, 'internal reads cost');
SELECT results_eq($$ UPDATE api.product SET purchase_price = 13 WHERE sku = 'SPIKE-SECRET' RETURNING purchase_price $$, $$ VALUES (13::NUMERIC) $$, 'internal writes cost, RETURNING shows it');
-- audit depth through the view (R7): the transaction row names product/INSERT
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t JOIN public.audit_log l ON l.transaction_id = t.id
   WHERE l.operation = 'INSERT' AND l.new_data ->> 'sku' = 'T5B' $$, $$ VALUES ('product','INSERT') $$, 'audit through a view keeps the top-level row (the T5b insert above)');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t JOIN public.audit_log l ON l.transaction_id = t.id
   WHERE l.operation = 'DELETE' AND l.old_data ->> 'sku' = 'T5B' $$, $$ VALUES ('product','DELETE') $$, 'the DELETE through the view is logged as a DELETE, not a cascade');
-- performance shape (R10): the field functions are InitPlans only
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.product ORDER BY created_at DESC LIMIT 50'), 'the field function is an InitPlan, never per row');
```

Fill in the remaining `plan(40)` slots by repeating T1/T2/T7 for `supplier_product_code` and `company_price_eur`.

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`schema api does not exist`).
- [ ] **Step 3: Implement** `053_api_schema.sql`; end it with `SELECT private.enable_field_security('product');`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api schema, view generator and product group"`

---

### Task 7: Customer and supplier group

**Files:**
- Create: `supabase/migrations/054_api_customer_supplier.sql`
- Test: `supabase/tests/database/054_api_customer_supplier.test.sql`

**Interfaces:**
- Consumes: `private.enable_field_security` (Task 6).
- Produces: `api.customer`, `api.customer_brand`, `api.customer_contact`, `api.customer_platform_account`, `api.customer_warehouse`, `api.supplier`, `api.supplier_contact`. Computed relationships `api.contract_document(api.customer)` and `api.customer(api.document)` (`contract_document_id` is sensitive) come from the generator. `api.document` exists only after Task 10, so the generator must skip a relationship whose target view is missing. Task 10 re-runs `enable_field_security('customer')`. The migration ends by re-running `enable_field_security('product')`, so `api.supplier(api.product)` and `api.product(api.supplier)` exist (R4).

- [ ] **Step 1: Write the failing test** (`plan(18)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- portal in moesa:
SELECT results_eq($$ SELECT deposit_rate IS NOT NULL, restricted_drive_url, notes FROM api.customer WHERE code = 'THO' $$, $$ VALUES (TRUE, NULL::TEXT, NULL::TEXT) $$, 'OD2: portal reads contract terms, not the drive URL or notes');
SELECT is((SELECT count(*)::INT FROM api.customer WHERE restricted_drive_url LIKE '%THO%'), 0, 'drive URL filter oracle closed');
SELECT ok((SELECT bool_and(email IS NOT NULL) FROM api.customer_contact c JOIN api.customer cu ON cu.id = c.customer_id WHERE cu.code = 'THO'), 'portal reads contact personal data (R own)');
SELECT is((SELECT count(*)::INT FROM api.supplier), 0, 'portal has no supplier table access');
SELECT is((SELECT notes FROM api.customer_platform_account LIMIT 1), NULL, 'platform account notes masked for portal');
-- koordinator:
SELECT is((SELECT deposit_rate FROM api.supplier WHERE code = 'CN1'), (SELECT deposit_rate FROM public.supplier WHERE code = 'CN1'), 'coordinator reads supplier terms');  -- compare as postgres first into a test setting
SELECT throws_ok($$ UPDATE api.supplier SET payment_terms = 'x' WHERE code = 'CN1' $$, '42501', 'field_write_forbidden', 'coordinator cannot write supplier terms through the view');
SELECT throws_ok($$ UPDATE api.customer SET deposit_rate = 0.2 WHERE code = 'THO' $$, '42501', NULL, 'contract stays guarded (field guard and customer_contract_guard)');
SELECT lives_ok($$ UPDATE api.supplier_contact SET phone = '+86 1' WHERE … $$, 'coordinator writes supplier contacts');
SELECT lives_ok($$ INSERT INTO api.customer_warehouse (customer_id, display_name, type, country) VALUES (:tho, 'W', 'fba', 'DE') $$, 'insert through the view');
SELECT lives_ok($$ DELETE FROM api.customer_warehouse WHERE display_name = 'W' $$, 'delete through the view');
-- R6 through api (not the temp forwarder):
SELECT throws_ok($$ UPDATE api.customer_platform_account SET api_connection = 'connected' WHERE id = :acct $$, '23514', 'platform_account_api_server_only', 'R6 holds through api');
-- embeds used by the app resolve on views (PostgREST infers FKs of plain columns): checked over HTTP in Task 20
-- R4 for product (054 re-runs enable_field_security('product') now that api.supplier exists), as restricted elif:
SELECT is((SELECT count(*)::INT FROM api.product p, api.supplier(p) s WHERE p.sku = 'SPIKE-SECRET'), 0, 'R4: hidden supplier link embeds nothing');
SELECT is((SELECT count(*)::INT FROM api.supplier s, api.product(s) p WHERE p.sku = 'SPIKE-SECRET'), 0, 'R4: reverse embed from supplier is empty');  -- elif given supplier select in the test
-- as koordinator (supplier_identity RW):
SELECT is((SELECT s.code FROM api.product p, api.supplier(p) s WHERE p.sku = 'SPIKE-SECRET'), 'CN1', 'R4: the embed works with the right');
-- T6d: allowed column set from a masked one (restricted elif with customer update, no fields)
SELECT lives_ok($$ UPDATE api.customer SET website = notes WHERE code = 'THO' $$, 'T6d copying a masked column copies NULL');
SELECT is((SELECT website FROM public.customer WHERE code = 'THO') IS DISTINCT FROM 'secret', TRUE, '… and never the hidden value');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`relation api.customer does not exist`).
- [ ] **Step 3: Implement**: one `SELECT private.enable_field_security(t) FROM unnest(ARRAY[…7 tables…]) t;`, then `SELECT private.enable_field_security('product');`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for customers and suppliers"`

---

### Task 8: Purchase order and shipment group

**Files:**
- Create: `supabase/migrations/055_api_orders_shipments.sql`
- Test: `supabase/tests/database/055_api_orders_shipments.test.sql`

**Interfaces:**
- Produces: `api.purchase_order`, `api.purchase_order_line`, `api.purchase_order_payment`, `api.purchase_order_update`, `api.shipment`, `api.shipment_event`, `api.shipment_line`, `api.shipment_purchase_order`. Computed relationships: `api.supplier(api.purchase_order)` (R4; the app's hint `supplier!purchase_order_supplier_fkey` becomes `supplier`, Task 14), `api.purchase_order(api.supplier)`, and `api.pi_document(api.purchase_order)` once `api.document` exists (Task 10 re-runs it).

- [ ] **Step 1: Write the failing test** (`plan(16)`). The restricted actor is `elif` with role `t_po` (purchase_order*/shipment* select/insert/update/delete, no fields):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT results_eq($$ SELECT pi_total, pi_number, deposit_rate, incoterm, supplier_id, notes FROM api.purchase_order WHERE code = 'PO-011' $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC, NULL::TEXT, NULL::UUID, NULL::TEXT) $$, 'PO cost, terms, supplier link and notes masked');
SELECT results_eq($$ SELECT unit_price, line_total, pi_line_total FROM api.purchase_order_line LIMIT 1 $$, $$ VALUES (NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC) $$, 'line prices masked incl. the generated total');
SELECT is((SELECT sum(amount) FROM api.purchase_order_payment), NULL, 'payment amounts masked (finance)');
SELECT is((SELECT count(*)::INT FROM api.purchase_order WHERE supplier_id = (SELECT id FROM api.supplier WHERE code = 'CN1')), 0, 'filter on a masked FK reveals nothing');
SELECT is((SELECT count(*)::INT FROM api.supplier(…PO-011 row…)), 0, 'R4: supplier embed through the masked FK is empty');
SELECT is((SELECT count(*)::INT FROM api.purchase_order(…CN1 row…)), 0, 'R4: reverse embed from supplier is empty');
SELECT lives_ok($$ UPDATE api.purchase_order_line SET quantity = quantity WHERE id = :draft_line $$, 'quantity edits work without cost rights');
SELECT throws_ok($$ UPDATE api.purchase_order_line SET unit_price = 1 WHERE id = :draft_line $$, '42501', 'field_write_forbidden', 'unit price write refused');
SELECT throws_ok($$ DELETE FROM api.purchase_order_line WHERE id = :line_of_approved_po $$, '23514', NULL, 'R7 through api: approved PO line delete refused');
SELECT lives_ok($$ DELETE FROM api.purchase_order WHERE id = :draft_po $$, 'a draft PO deletes through api, lines cascade');
SELECT results_eq($$ SELECT table_name, operation FROM public.audit_transaction ORDER BY created_at DESC LIMIT 1 $$, $$ VALUES ('purchase_order','DELETE') $$, 'audit depth through api names the parent');
SELECT results_eq($$ SELECT incoterm_buy, notes FROM api.shipment WHERE code = 'SHP-009' $$, $$ VALUES (NULL::TEXT, NULL::TEXT) $$, 'shipment terms and notes masked');
SELECT results_eq($$ SELECT from_party, to_party FROM api.shipment_event LIMIT 1 $$, $$ VALUES (NULL::TEXT, NULL::TEXT) $$, 'OD2: event parties masked (supplier_identity)');
SELECT lives_ok($$ INSERT INTO api.purchase_order (… open columns only …) VALUES (…) $$, 'a PO inserts without masked fields; *_set_code fills the code');
SELECT ok((SELECT code FROM api.purchase_order WHERE … ) ~ '^PO-', 'purchase_order_set_code runs through the forwarder');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (8 tables).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for purchase orders and shipments"`

---

### Task 9: Projects, markets, listings, incidents and change requests

**Files:**
- Create: `supabase/migrations/056_api_projects_markets.sql`
- Test: `supabase/tests/database/056_api_projects_markets.test.sql`

**Interfaces:**
- Produces: `api.project`, `api.project_gate`, `api.project_product`, `api.project_task`, `api.market_cell`, `api.listing_submission`, `api.incident`, `api.incident_deadline`, `api.incident_log`, `api.change_request`, `api.change_request_product`.

- [ ] **Step 1: Write the failing test** (`plan(12)`), as portal and as `elif` with a role holding these tables but no fields:

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT results_eq($$ SELECT notes FROM api.project LIMIT 1 $$, $$ VALUES (NULL::TEXT) $$, 'project notes masked');
SELECT results_eq($$ SELECT note FROM api.project_gate WHERE note IS NOT NULL $$, $$ SELECT NULL::TEXT WHERE FALSE $$, 'gate notes masked');
SELECT results_eq($$ SELECT root_cause_note, impact_note, lessons, affected_parties FROM api.incident LIMIT 1 $$, $$ VALUES (NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::public.incident_party[]) $$, 'incident internals and parties masked');
SELECT results_eq($$ SELECT what_happened IS NOT NULL FROM api.incident LIMIT 1 $$, $$ VALUES (TRUE) $$, 'CL §3.9: incident notice fields stay readable');
SELECT is((SELECT count(*)::INT FROM api.incident_log), 0, 'portal has no incident_log table access');
SELECT results_eq($$ SELECT cost_impact, decision_note FROM api.change_request WHERE id = :cr $$, $$ VALUES (:cr_cost_impact::NUMERIC, NULL::TEXT) $$, 'CL §3.8: CR cost impact readable, decision note masked');  -- :cr set up as postgres with cost_impact and decision_note filled
SELECT results_eq($$ SELECT notes FROM api.market_cell LIMIT 1 $$, $$ VALUES (NULL::TEXT) $$, 'market cell notes masked');
SELECT throws_ok($$ UPDATE api.market_cell SET listing_state = 'live' WHERE id = :cell $$, '23514', 'market_cell_listing_server_only', 'R6 through api');
SELECT throws_ok($$ DELETE FROM api.market_cell WHERE id = :live_cell $$, '23514', 'market_cell_delete_candidate_only', 'R7 through api');
SELECT lives_ok($$ SELECT public.pass_gate(:gate, NULL) $$, 'pass_gate still works (it is converted in Task 11; here the base is still granted)');
SELECT throws_ok($$ INSERT INTO api.incident_log (incident_id, note, cost_amount) VALUES (:inc, 'x', 10) $$, '42501', 'field_write_forbidden', 'finance write refused');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (11 tables).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for projects, markets, incidents and change requests"`

---

### Task 10: Core, files and catalog tables, and computed fields

**Files:**
- Create: `supabase/migrations/057_api_core.sql`
- Test: `supabase/tests/database/057_api_core.test.sql`

**Interfaces:**
- Produces:
  - `api.<t>` for `document`, `media`, `media_link`, `transfer`, `setting`, `tenant`, `tenant_user`, `tenant_owner`, `user`, `role`, `user_role`, `role_permission`, `role_field_permission`, `field_class`, `field_group`, `permission`, `module`, `plan`, `plan_limit`, `plan_module`, `platform`, `subscription`, `task_template`, `amazon_product_type_definition` and `code_sequence`. This is every `public` table except `audit_log`/`audit_transaction` (Task 12).
  - Re-run `enable_field_security` for `customer` and `purchase_order` so `api.contract_document`, `api.pi_document` and their reverses exist.
  - Computed fields recreated over the view row types, with the same names the app selects: `api.owned_via(api.user) RETURNS TEXT[]`, `api.managed_in(api.user) RETURNS UUID` and `api.status(api.subscription) RETURNS TEXT`. Each is a SQL wrapper calling the `public` function with the id. They are SECURITY DEFINER owned by `api_owner` where the `public` original reads tables.

- [ ] **Step 1: Write the failing test** (`plan(14)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is_empty($$ SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
   AND c.relname NOT IN ('audit_log','audit_transaction') AND to_regclass('api.' || c.relname) IS NULL $$, 'every business table has an api view');
-- as koordinator: column UPDATE grants carried over (tenant: only the 012 columns; setting: only value)
SELECT ok(NOT has_column_privilege('authenticated', 'api.setting', 'key', 'UPDATE') AND has_column_privilege('authenticated', 'api.setting', 'value', 'UPDATE'), 'setting keeps its column grant on the view');
SELECT ok(NOT has_column_privilege('authenticated', 'api.tenant', 'parent_id', 'UPDATE'), 'tenant keeps its column grant on the view');
-- user personal data (self rule, CL §3.13)
SELECT is((SELECT email FROM api.user WHERE id = auth.uid()), 'koordinator@moesa-panel.test', 'a user reads their own e-mail');
SELECT ok((SELECT email IS NOT NULL FROM api.user WHERE email = 'akif@moesa-panel.test'), 'coordinator reads colleagues (personal_data R on user)');
-- as portal:
SELECT is((SELECT count(*)::INT FROM api.user WHERE id <> auth.uid() AND email IS NOT NULL), 0, 'portal reads only its own e-mail');
SELECT throws_ok($$ UPDATE api.user SET phone = '+1' WHERE id <> auth.uid() $$, '42501', NULL, 'no one writes another user''s phone');
SELECT lives_ok($$ SELECT api.owned_via(u), api.managed_in(u) FROM api.user u $$, 'computed fields owned_via and managed_in resolve on api.user');
SELECT ok(to_regprocedure('api.status(api.subscription)') IS NOT NULL, 'computed field status on api.subscription');
SELECT ok(to_regprocedure('api.pi_document(api.purchase_order)') IS NOT NULL AND to_regprocedure('api.contract_document(api.customer)') IS NOT NULL, 'R4 relationships to documents exist');
-- as koordinator: role editing through views follows role_permission's rules
SELECT throws_ok($$ INSERT INTO api.role_field_permission (role_id, resource_name, field, can_read, can_write) SELECT id, 'public.product', 'purchase_price', TRUE, TRUE FROM public.role WHERE display_name = 'coordinator' $$, '42501', NULL, 'coordinator cannot edit role field rights');
SELECT is((SELECT count(*)::INT FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id WHERE r.tenant_id <> :moesa), 0, 'field rights of other tenants'' roles are invisible');
SELECT lives_ok($$ SELECT * FROM api.field_class $$, 'the catalog is readable');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for core, files and catalog tables"`

---

### Task 11: Derived views, invoker conversion (R8) and the SECURITY DEFINER inventory

**Files:**
- Create: `supabase/migrations/058_api_derived.sql`
- Test: `supabase/tests/database/058_api_derived.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.transfer_field_rights_required`)

**Interfaces:**
- Produces:
  - `api.<view>` for the derived views except `dashboard_notification_feed` (Task 12): `company_subscription`, `dashboard_change_request`, `dashboard_gate_pending`, `dashboard_incident`, `dashboard_market`, `dashboard_product_evidence`, `dashboard_purchase_order`, `dashboard_shipment`, `dashboard_task_due`, `incident_overview`, `market_cell_overview`, `media_library`, `product_evidence`, `product_with_evidence`, `purchase_order_overview`, `shipment_overview` and `tenant_member`.
    - Each is `security_invoker = true`, reads only `api.*` relations, and uses an **explicit column list**. No `t.*` anywhere: replace `p.*`/`po.*`/`cell.*`/`inc.*` with the base view's columns. Grant SELECT to `authenticated`.
    - Masking flows from the `api` views. `shipment_overview.purchase_order_codes`/`psi_missing_po_codes` read `api.purchase_order`, so a caller without PO access gets empty arrays.
  - `private.purchase_order_figures` restated as SECURITY INVOKER over `api.purchase_order_line`. A masked `unit_price` gives `NULL` system totals (CL §2: totals follow `cost`).
  - R8 conversion: `ALTER FUNCTION … SECURITY DEFINER` + `ALTER FUNCTION … OWNER TO api_owner` (bodies unchanged) for `public.import_products`, `save_role`, `set_user_roles`, `pass_gate`, `rollback_gate`, `save_plan`, `set_primary_media` and `gates_for`. `public.register_tenant` stays INVOKER: it is `service_role` only, and the service role keeps base grants. Note it in a comment. `revert_audit_transaction` is Task 12. The five `*_set_code` triggers and the other invoker trigger functions stay invoker: they run as the writer, which is now `api_owner`, `postgres` or `service_role`.
  - Definer inventory (CL §2):
    - `public.transfer_customer`, `transfer_check_files` and `transfer_options` refuse with `transfer_field_rights_required` (`42501`) unless the caller holds read **and** write on every sensitive field of `public.customer`, `customer_*`, `supplier`, `supplier_contact`, `product`, `purchase_order*` and `shipment*` in the source and target tenants. Transfers copy every column, so only someone who may see everything may run one.
    - `amazon_account_connect`, `listing_set_state`, `listing_apply_submission` and `listing_settle_removal` stay `service_role`-only (asserted).
    - `listing_begin_submission` returns `listing_submission` (no sensitive field; asserted).

- [ ] **Step 1: Write the failing test** (`plan(14)`):

```sql
SELECT is_empty($$ SELECT viewname FROM pg_views WHERE schemaname = 'api' AND definition ~ '\.\*' $$, 'no api view selects t.*');
SELECT is_empty($$ SELECT DISTINCT v.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class v ON v.oid = r.ev_class
   JOIN pg_class t ON t.oid = d.refobjid WHERE v.relnamespace = 'api'::regnamespace AND v.relname NOT IN (SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p'))
   AND t.relnamespace = 'public'::regnamespace AND t.relkind IN ('r','p') $$, 'derived api views read only api relations');
-- restricted elif (t_po + product select, no fields):
SELECT results_eq($$ SELECT purchase_price, notes FROM api.product_with_evidence WHERE sku = 'SPIKE-SECRET' $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T8b product_with_evidence is masked');
SELECT results_eq($$ SELECT system_total, supplier_code, pi_total FROM api.purchase_order_overview WHERE code = 'PO-011' $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC) $$, 'PO overview totals follow cost');
SELECT results_eq($$ SELECT system_total, supplier_code FROM api.dashboard_purchase_order LIMIT 1 $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'dashboard PO masked');
SELECT results_eq($$ SELECT notes FROM api.market_cell_overview LIMIT 1 $$, $$ VALUES (NULL::TEXT) $$, 'market cell overview masked');
SELECT results_eq($$ SELECT root_cause_note FROM api.incident_overview LIMIT 1 $$, $$ VALUES (NULL::TEXT) $$, 'incident overview masked');
-- portal:
SELECT is((SELECT count(*)::INT FROM api.shipment_overview WHERE cardinality(purchase_order_codes) > 0), 0, 'shipment overview reveals no PO to the portal');
SELECT is((SELECT count(*)::INT FROM api.tenant_member WHERE email IS NOT NULL AND id <> auth.uid()), 0, 'tenant_member masks colleagues'' personal data for portal');
-- R8:
SELECT is_empty($$ SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('import_products','save_role','set_user_roles','pass_gate','rollback_gate','save_plan','set_primary_media','gates_for')
   AND NOT (prosecdef AND pg_get_userbyid(proowner) = 'api_owner') $$, 'R8: write RPCs are api_owner definers');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"IMP-1","purchase_price":5}]'::JSONB, …) $$, '42501', 'field_write_forbidden', 'import refuses columns the writer cannot write');
-- inventory, table-driven: every public function executable by authenticated whose result type is a row type of a table with sensitive fields
SELECT is_empty($$ SELECT p.proname FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype JOIN pg_class c ON c.oid = t.typrelid
   WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
   AND EXISTS (SELECT 1 FROM public.field_class f WHERE f.resource_name = 'public.' || c.relname AND f.class = 'sensitive') $$,
   'no public function granted to authenticated returns a sensitive value');
SELECT throws_ok($$ SELECT public.transfer_customer(…) $$, '42501', 'transfer_field_rights_required', 'transfer needs every field right');  -- as an owner-less management clone without cost in the test
SELECT ok(NOT has_function_privilege('authenticated', 'public.listing_set_state(uuid, public.listing_state, jsonb, timestamptz, uuid)', 'EXECUTE'), 'listing service RPCs stay service-only');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `058_api_derived.sql`. Copy each `public` view's current definition (from the latest migration that defines it; check with `grep -ln "VIEW public.<name>" supabase/migrations`), swap `public.<table>` for `api.<table>`, and expand `*`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): derived api views, invoker conversion and definer inventory"`

---

### Task 12: Audit masking, actor/reverter and revert refusal (OD4, R8, R9)

**Files:**
- Create: `supabase/migrations/059_api_audit.sql`
- Test: `supabase/tests/database/059_api_audit.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.audit_revert_field_forbidden`, `audit_log.masked` = "changed")

**Interfaces:**
- Produces:
  - `private.mask_audit_data(p_table TEXT, p_tenant UUID, p_data JSONB, p_readable JSONB, p_sensitive JSONB) RETURNS JSONB` (`IMMUTABLE`, `LANGUAGE sql`, jsonb operators only). Every key `k` of `p_data` that is in `p_sensitive -> p_table` and not in `p_readable -> p_tenant::TEXT` (as `'<table>.<k>'`) becomes `'{"masked": true}'::JSONB`. A NULL tenant masks every sensitive key (fail closed).
  - `api.audit_transaction` (owner `api_owner`, plain columns). `api.audit_log` (owner `api_owner`): `old_data`/`new_data` become `private.mask_audit_data(l.table_name, l.tenant_id, l.old_data, (SELECT private.field_rights_map()), (SELECT private.sensitive_fields_map()))`, and likewise for `new_data`. SELECT only, granted to `authenticated`; no writes.
  - `api.actor(api.audit_transaction) RETURNS SETOF api.user ROWS 1` and `api.reverter(api.audit_transaction)` (SECURITY INVOKER over `api.user`). E-mail, phone and `user_metadata` are then masked per `personal_data`.
  - `api.dashboard_notification_feed`: restated from 010 over `api.audit_log`/`api.audit_transaction`/`api.user`, with an explicit column list.
  - `public.revert_audit_transaction(transaction_id UUID)`: restated from 040 as SECURITY DEFINER owned by `api_owner`. Before the loop, it collects every `(table_name, key, tenant_id)` from the transaction's `old_data`/`new_data` that is a sensitive field. If any has `tenant_id <> ALL (private.field_write_tenants('public.' || table_name, key))`, it raises `audit_revert_field_forbidden` (`42501`, DETAIL `<table>.<field>`). The conflict check still compares against base rows (it runs as `api_owner`).

- [ ] **Step 1: Write the failing test** (`plan(12)`). As postgres, `akif` updates `SPIKE-SECRET.purchase_price` and `notes` (the trail). Then `elif` with `t_restricted` + `audit_log`/`audit_transaction` select:

```sql
SELECT is((SELECT new_data -> 'purchase_price' FROM api.audit_log WHERE table_name = 'product' AND record_id = :secret ORDER BY id DESC LIMIT 1), '{"masked": true}'::JSONB, 'OD4: a hidden field shows as changed, without the value');
SELECT is((SELECT new_data ->> 'sku' FROM api.audit_log WHERE table_name = 'product' AND record_id = :secret ORDER BY id DESC LIMIT 1), 'SPIKE-SECRET', 'open keys pass');
SELECT is((SELECT count(*)::INT FROM api.audit_log WHERE (new_data ->> 'purchase_price')::TEXT LIKE '12.5%'), 0, 'T10 audit filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.dashboard_notification_feed WHERE new_data ->> 'notes' = 'secret note'), 0, 'notification feed masked');
SELECT throws_ok($$ SELECT public.revert_audit_transaction(:tx_cost_change) $$, '42501', 'audit_revert_field_forbidden', 'revert refused when a touched field is not writable');
SELECT lives_ok($$ SELECT public.revert_audit_transaction(:tx_display_name_change) $$, 'revert of open fields works');
-- mixed (impersonate_scope elif, moesa, [moesa, europe]) with a Europe product trail:
SELECT ok((SELECT new_data -> 'purchase_price' <> '{"masked": true}' FROM api.audit_log WHERE record_id = :spike_eu ORDER BY id DESC LIMIT 1)
   AND (SELECT new_data -> 'purchase_price' = '{"masked": true}' FROM api.audit_log WHERE record_id = :secret ORDER BY id DESC LIMIT 1), 'audit keys masked per row tenant');
-- actor embed (R9)
SELECT is((SELECT email FROM api.actor((SELECT t FROM api.audit_transaction t WHERE t.record_id = :secret LIMIT 1))), NULL, 'actor e-mail masked for a reader without personal_data');  -- as portal with audit select granted in the test
SELECT ok((SELECT email IS NOT NULL FROM api.actor((SELECT t FROM api.audit_transaction t LIMIT 1))), 'internal readers see the actor');  -- as koordinator
SELECT is(private.mask_audit_data('product', NULL, '{"sku":"A","purchase_price":1}', '{}', private.sensitive_fields_map()), '{"sku":"A","purchase_price":{"masked":true}}'::JSONB, 'a NULL tenant masks every sensitive key (fail closed)');
SELECT is((SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'revert_audit_transaction'), 'api_owner', 'R8: revert runs as api_owner');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.audit_log ORDER BY id DESC LIMIT 50'), 'R9: the rights map is an InitPlan');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `059_api_audit.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): masked audit history and guarded revert"`

---

### Task 13: Files row rule (R3)

**Files:**
- Create: `supabase/migrations/060_file_row_rule.sql`
- Test: `supabase/tests/database/060_file_row_rule.test.sql`

**Interfaces:**
- Consumes: `private.field_group_read_tenants` (Task 3), `private.can_read_media_file` (024).
- Produces:
  - RESTRICTIVE `SELECT` policy `document_field_groups` on `public.document`:

```sql
(type NOT IN ('pi','commercial_invoice') AND NOT (type = 'contract' AND entity_type = 'supplier')
   OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_terms'))))
AND (entity_type NOT IN ('supplier','purchase_order')
   OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))))
```

  - The same second clause as policy `media_link_field_groups` on `public.media_link`.
  - `private.hidden_media_ids() RETURNS UUID[]` (STABLE, SECURITY DEFINER, so it sees links regardless of RLS). It returns the ids of scope media that have a `media_link` to `supplier`/`purchase_order`, or are the `media_id` of a document the first policy would hide, in a tenant outside the matching `field_group_read_tenants`.
  - RESTRICTIVE `SELECT` policy `media_field_groups` on `public.media`: `NOT (id = ANY ((SELECT private.hidden_media_ids())))`.
  - `private.can_read_media_file(object_name)` restated. It also requires `NOT (split_part(object_name, '/', 2)::UUID = ANY (private.hidden_media_ids()))` (path `<tenant>/<media id>/…`; a non-UUID segment → FALSE).
  - The enum has no `price list` or `supplier invoice` value; `pi`, `commercial_invoice` and supplier `contract` stand for them (comment in the migration).

- [ ] **Step 1: Write the failing test** (`plan(8)`). As postgres: PO-011's PI document and its media (story id `5eed0009-…05` or a fixture) and a supplier-linked media:

```sql
-- portal:
SELECT is((SELECT count(*)::INT FROM api.document WHERE type = 'pi'), 0, 'portal user cannot read a PI document');
SELECT is((SELECT count(*)::INT FROM api.media WHERE id = :pi_media), 0, '… its media');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name = :pi_object), 0, '… or its Storage object');
SELECT is((SELECT count(*)::INT FROM api.media_link WHERE entity_type IN ('supplier','purchase_order')), 0, 'supplier/PO media links hidden');
SELECT is((SELECT count(*)::INT FROM api.media_library WHERE id = :pi_media), 0, 'media_library hides it too');
SELECT ok((SELECT count(*) > 0 FROM api.document WHERE type = 'spec_sheet'), 'other documents stay visible');
-- koordinator (supplier_terms R, supplier_identity RW):
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = :pi_doc), 1, 'coordinator reads the PI');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.media ORDER BY created_at DESC LIMIT 50'), 'hidden_media_ids is an InitPlan');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `060_file_row_rule.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): file row rule for supplier and price documents"`

---

### Task 14: App switch to `api` (R11) with CASL field rules and masked rendering

**Files:**
- Modify: `app/package.json:10` (`dev:supabase-types` → `supabase gen types typescript --local --schema public,api > ../supabase/functions/_shared/database.types.ts`)
- Regenerate: `supabase/functions/_shared/database.types.ts`
- Modify: `app/src/lib/supabase.ts`, `app/src/@types/global.d.ts`
- Modify (RPC call sites `supabase.rpc(` → `publicSchema.rpc(`): `app/src/api/access.ts`, `account/memberships.ts`, `admin/index.ts`, `auditLog.ts`, `branch/index.ts`, `media/index.ts`, `product/import.ts`, `project/index.ts`, `role/index.ts`, `transfer/index.ts`, `user/index.ts`
- Modify: `app/src/api/purchaseOrder/index.ts:213` (`supplier!purchase_order_supplier_fkey(…)` → `supplier(…)`), and any other `!<fk>` hint on a masked FK (`grep -rn "supplier!\|pi_document\|contract_document" app/src`)
- Modify: zod row schemas in `app/src/api/*/index.ts` that contain any of the 84 sensitive fields (`.nullable()`)
- Modify: `app/src/plugins/casl/index.ts`, `app/src/api/access.ts`, `app/src/store/auth/index.ts:93`
- Create: `app/src/composables/useFieldAccess.ts`
- Modify: the forms and tables that show sensitive fields: `app/src/views/pages/ops/{product,customer,supplier,purchaseOrder,shipment,incident,project,changeRequest,document}/**` (grep the field names)
- Test: `app/tests/lib/supabase.test.ts` (create), `app/tests/plugins/casl.test.ts`, `app/tests/composables/useFieldAccess.test.ts` (create), `app/tests/api/models.test.ts`

**Interfaces:**
- Consumes: `my_access.fields` (Task 3), the `api` views (Tasks 6–13).
- Produces:
  - `export const supabase = createClient<Db, 'api'>(url, key, { ...supabaseOptions, db: { schema: 'api' } })`.
  - `export const publicSchema = supabase.schema('public')` for every RPC. RPCs live in `public`; tables and views are read through `api`.
  - `global.d.ts`: `type Api = Db['api'] & {}`, `type Tables = { [K in keyof Api['Views']]: { Row: Api['Views'][K]['Row']; Insert: Partial<Api['Views'][K]['Row']>; Update: Partial<Api['Views'][K]['Row']> } }`, `type Views = Api['Views']`. Use the generated `Insert`/`Update` if the generator emits them for the trigger-updatable views; otherwise use this mapped type. Keep `Public` for RPC types.
  - `export type FieldRight = { resource_name: string; field: string; can_read: boolean; can_write: boolean }`; `Access.fields: FieldRight[]` and `Tenant.fields?: FieldRight[]`.
  - `toAbilityRules(permissions: PermissionClaim[] = [], fields: FieldRight[] = [])`. After the permission rules it appends inverted rules: `{ action: 'select', subject, fields: [field], inverted: true }` when `!can_read`, and `{ action: 'update', … }` and `{ action: 'insert', … }` when `!can_write`. `subject` is the table name without `public.`.
  - `useFieldAccess(table: string): { canRead(field: string): boolean; canWrite(field: string): boolean }`, backed by `ability.can`.
  - Forms: a field the user cannot read is not rendered. A readable but unwritable field is rendered `readonly`. Tables: columns whose field is unreadable are dropped from the column list. This is UI only; the database is the boundary.

- [ ] **Step 1: Write the failing tests**

```ts
// app/tests/lib/supabase.test.ts
it('sends table requests with Accept-Profile api', async () => { /* mock fetch; await supabase.from('product').select('id'); expect(headers.get('Accept-Profile')).toBe('api') */ });
it('sends RPCs to the public schema', async () => { /* await publicSchema.rpc('my_access'); expect(headers.get('Content-Profile')).toBe('public') */ });
it('still adds tenant_id to inserts', async () => { /* POST /rest/v1/product body gets tenant_id */ });
// app/tests/plugins/casl.test.ts
it('denies reading a field without can_read', () => {
   const a = createAbility([{ command: 'select', resource_name: 'public.product' }], [{ resource_name: 'public.product', field: 'purchase_price', can_read: false, can_write: false }]);
   expect(a.can('read', 'product', 'purchase_price')).toBe(false);
   expect(a.can('read', 'product', 'sku')).toBe(true);
   expect(a.can('read', 'product')).toBe(true);
});
it('allows read but not update when only can_read', () => { /* can('read'…) true, can('update', 'supplier', 'deposit_rate') false */ });
// app/tests/composables/useFieldAccess.test.ts
it('reflects the active tenant field rights', () => { /* auth store with fields → canRead/canWrite */ });
// app/tests/api/models.test.ts
it.each(SENSITIVE_FIXTURES)('parses a %s row whose sensitive fields are null', (table, row) => { expect(() => schemaOf(table).parse(row)).not.toThrow(); });
```

`createAbility(permissions, fields)` gains the second parameter. `SENSITIVE_FIXTURES` holds one row per zod-parsed table with every sensitive field `null`.

- [ ] **Step 2: Run** `cd app && pnpm vitest run tests/lib/supabase.test.ts tests/plugins/casl.test.ts tests/composables/useFieldAccess.test.ts tests/api/models.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**:
  - Regenerate the types: `cd supabase && supabase db reset`, then `cd app && pnpm dev:supabase-types`.
  - Switch the client, the call sites, the hints, zod, CASL and the forms/tables.
  - `ResourceTable` callers that pass a `table`/view name get column filtering through `useFieldAccess`.
- [ ] **Step 4: Run** `cd app && pnpm test && pnpm typecheck && pnpm lint`. Expected: all PASS, 0 errors.
- [ ] **Step 5: Commit** `git commit -m "feat(app): read tables through api, CASL field rules, masked fields"`

---

### Task 15: Edge Functions on `api` types, projected service reads

**Files:**
- Modify: `supabase/functions/_shared/supabaseClient.ts` (user client: `db: { schema: 'api' }`; RPCs `.schema('public').rpc`)
- Modify: `supabase/functions/_shared/auth.ts:58`, `amazon-auth/index.ts:150`, `amazon-listing/index.ts:303,450` (user-client RPCs → `.schema('public')`)
- Modify: `supabase/functions/amazon-listing/index.ts:150-209,620`, `amazon-listing/listing.ts:441`, `_shared/listingStatus.ts:131-167`, `amazon-poll/poll.ts:84,113` (service-role `select('*')` → explicit column constants)
- Test: `supabase/functions/tests/amazon_listing_test.ts`, `supabase/functions/tests/listing_derived_test.ts`, `supabase/functions/tests/service_role_test.ts`

**Interfaces:**
- Produces:
  - `export const PRODUCT_LISTING_COLUMNS` (in `amazon-listing/listing.ts`): only `id, tenant_id, customer_id, parent_id, sku, display_name, variant_label, brand, gtin, amazon_product_type, amazon_schema_version, listing_attributes` plus the open columns the listing body reads.
  - `export const MARKET_CELL_LISTING_COLUMNS` (in `_shared/listingStatus.ts`): every open column the derivation reads, never `notes`.
  - The admin (service-role) client stays on `public`, because a definer view owned by `api_owner` would apply RLS without a user. Its upsert on `amazon_product_type_definition` stays (R11).
  - The user client reads `api`.

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test('amazon-listing selects no sensitive product or cell column', () => {
   for (const c of ['purchase_price','purchase_currency','purchase_incoterm','landed_cost_eur','landed_cost_on','target_price_eur','company_price_eur','price_list_version','supplier_id','supplier_product_code','manufacturer_art_no','notes'])
      assert(!PRODUCT_LISTING_COLUMNS.split(',').map((s) => s.trim()).includes(c));
   assert(!MARKET_CELL_LISTING_COLUMNS.includes('notes'));
});
Deno.test('amazon-listing response carries no sensitive key', async () => { /* mocked service client returning a full product row incl. purchase_price; assert JSON body has no key from the list */ });
Deno.test('the user client reads the api schema', () => { /* supabaseClient(req) → headers Accept-Profile api */ });
```

- [ ] **Step 2: Run** `cd supabase/functions && deno task test`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes in Files. `deno task check` must also pass on the regenerated types.
- [ ] **Step 4: Run** `cd supabase/functions && deno task check && deno task test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(functions): user clients on api, projected service reads"`

---

### Task 16: Role editor field toggles

**Files:**
- Create: `app/src/components/service-components/select-permissions/SelectFieldPermissions.vue`
- Modify: `app/src/components/service-components/select-permissions/index.ts` (export it)
- Modify: `app/src/api/role/index.ts` (embed, schema, payload), the role form under `app/src/views/pages/branch/role/` (render the component below `SelectPermissions`)
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`component.select_field_permission.*`, `fields.field_group.<id>` for the 9 groups)
- Test: `app/tests/components/SelectFieldPermissions.test.ts` (create), `app/tests/api/role.test.ts` (create or extend)

**Interfaces:**
- Consumes: `api.field_class`, `api.field_group`, `api.role_field_permission`, `public.save_role(…, field_rights)`.
- Produces:
  - `export type FieldRightInput = { resource_name: string; field: string; can_read: boolean; can_write: boolean }`.
  - `RoleWithPermissions.role_field_permission: FieldRightInput[]` (embed `role_field_permission(resource_name, field, can_read, can_write)`).
  - `RoleInput.fieldRights: FieldRightInput[]`, sent as `field_rights`.
  - `roleSchema.field_rights: z.array(z.object({ resource_name: z.string(), field: z.string(), can_read: z.boolean(), can_write: z.boolean() }))`.
  - `SelectFieldPermissions.vue`: `v-model` of `FieldRightInput[]` and a `readonly` attr. It shows one expandable row per resource with sensitive fields (from `useLookup('field_class', { select: 'resource_name,field,group_name' })`, filtered to `class = 'sensitive'`). Inside, it groups by `field_group` in `position` order, with a Read and a Write column. Each group header and each field has a `PermissionCheckbox` using the same `stateOf`/`toggle` tri-state as `SelectPermissions.vue`. Turning write on turns read on; turning read off turns write off.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists product fields grouped by field group', () => { /* rows: cost(6 product fields), sell_price(2), supplier_identity(3), internal_note(1) */ });
it('group read toggle selects every field of the group', async () => { /* click cost/read → model has 6 rows can_read true */ });
it('shows some when part of a group is selected', () => { /* one cost field → state 'some' */ });
it('write implies read and read off clears write', async () => { /* … */ });
it('toRolePayload sends field_rights', () => { expect(toRolePayload(values).fieldRights).toEqual([...]); });
```

- [ ] **Step 2: Run** `cd app && pnpm vitest run tests/components/SelectFieldPermissions.test.ts tests/api/role.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component, the API changes and the form wiring.
- [ ] **Step 4: Run** `cd app && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(app): per-field read/write toggles in the role editor"`

---

### Task 17: Exports, pg_graphql and Realtime

**Files:**
- Create: `supabase/migrations/061_disable_graphql.sql`
- Test: `supabase/tests/database/061_disable_graphql.test.sql`
- Modify: `supabase/config.toml:13` (`schemas = ["public", "api"]`; `graphql_public` removed)
- Modify: `app/src/api/product/csv.ts`, `app/src/views/pages/ops/product/Index.vue` (export/import), `app/src/views/pages/ops/transfer/ResultStep.vue` (only if it shows report values beyond labels)
- Test: `app/tests/api/productCsv.test.ts`

**Interfaces:**
- Produces:
  - `DROP EXTENSION IF EXISTS pg_graphql CASCADE` in 061.
  - `S10_COLUMNS` export: `toCsv(rows, { canRead })` drops each column whose source field `!canRead(field)`. The CSV→field map lives next to `S10_COLUMNS`, e.g. `purchase_price ← alis_fiyati`.
  - Import: `parseCsv(text, { canWrite })` returns an error `csv_column_not_writable` naming the header when a non-empty value sits in a column whose field `!canWrite`. The server guard (Task 4) refuses anyway.
  - Print/PDF (`PrintElementButton`) prints the DOM, which already shows masked fields as empty.

- [ ] **Step 1: Write the failing tests**

```sql
SELECT hasnt_extension('pg_graphql', 'pg_graphql is disabled (T14)');
SELECT is_empty($$ SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname IN ('public','api') $$, 'no business table is in the Realtime publication (T13)');
```

```ts
it('drops columns the reader cannot read from the export', () => { expect(header(toCsv(rows, { canRead: (f) => f !== 'purchase_price' }))).not.toContain(csvNameOf('purchase_price')); });
it('refuses an import that fills a column the writer cannot write', () => { expect(parseCsv(text, { canWrite: (f) => f !== 'purchase_price' }).errors[0].code).toBe('csv_column_not_writable'); });
```

- [ ] **Step 2: Run** `cd app && pnpm test:db` and `cd app && pnpm vitest run tests/api/productCsv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (and add `errors.csv_column_not_writable` in all locales).
- [ ] **Step 4: Run** both commands again, then `cd app && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): field-aware exports, pg_graphql off, realtime check"`

---

### Task 18: Move the existing pgTAP suites to `api`

**Files:**
- Modify: every `supabase/tests/database/0{15..47}_*.test.sql` and `099_seed.test.sql`, for statements that run after `private.impersonate`
- Create: `scripts/pgtap-to-api.mjs` (one-off rewriter, kept for review; deleted in Task 21)

**Interfaces:**
- Produces: the same assertions, run against `api.<table>`/`api.<view>` wherever a statement runs as an impersonated user. Setup and checks run as `postgres` (after `RESET ROLE`) keep `public.<table>`. RPC calls are unchanged.

- [ ] **Step 1:** Write `scripts/pgtap-to-api.mjs`. Within each test file, between `private.impersonate(…)` and the next `RESET ROLE`, it rewrites `public.<name>` to `api.<name>` when `<name>` is a `public` table or view that has an `api` counterpart. It reads the list from `docker exec supabase_db_moesa-panel psql -Atc "SELECT relname FROM pg_class WHERE relnamespace = 'api'::regnamespace AND relkind = 'v'"`.
- [ ] **Step 2:** Run `node scripts/pgtap-to-api.mjs`, then `cd app && pnpm test:db`. Expected: PASS. The base tables are still granted, so a rewrite mistake shows as a behavioural difference, not as 42501.
- [ ] **Step 3:** Review each failure. An expected difference (an error code now raised by the forwarder; a masked value where the old test read a field the actor no longer reads) is fixed in the test with a one-line comment. Anything else is a bug in Tasks 6–13: fix it there.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "test(db): run user-side pgTAP statements through api"`

---

### Task 19: Cutover: close the base tables (R2)

**Files:**
- Create: `supabase/migrations/062_field_security_cutover.sql`
- Test: `supabase/tests/database/062_field_security_cutover.test.sql`
- Modify: `supabase/tests/database/053_api_schema.test.sql` (add T8c: the base table is now refused)
- Modify: `.github/workflows/ci.yml` (staging: set the exposed schemas before `supabase db reset --linked`)
- Modify: `supabase/README.md` (production steps)

**Interfaces:**
- Produces:
  - `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (tables and the 18 `public` views).
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`.
  - `service_role` and `api_owner` keep their grants. Function EXECUTE grants are unchanged.
  - CI step "Expose the api schema on staging", before `supabase db reset --linked`: `curl -fsS -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' "https://api.supabase.com/v1/projects/$STAGING_PROJECT_REF/postgrest" --data '{"db_schema":"public,api"}'`.
  - README "Field-level permissions (062)" section:
    1. Before `supabase db push`, set Dashboard → Settings → API → Exposed schemas to `public, api` (or send the same PATCH).
    2. Push 048–062 in one go.
    3. Deploy the app in the same window. Open tabs must reload; a stale bundle gets 42501.

- [ ] **Step 1: Write the failing test** (`plan(9)`):

```sql
SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated') $$, 'no public relation grants anything to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclrole = 'postgres'::regrole
   AND d.defaclobjtype = 'r' AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=') $$, 'new public tables grant nothing to anon/authenticated');
SELECT ok(has_table_privilege('service_role', 'public.product', 'SELECT,INSERT,UPDATE,DELETE'), 'the service role keeps the base');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- as koordinator:
SELECT throws_ok($$ SELECT 1 FROM public.product LIMIT 1 $$, '42501', NULL, 'T8c direct base table refused');
SELECT throws_ok($$ SELECT 1 FROM public.product_with_evidence LIMIT 1 $$, '42501', NULL, 'old public views refused');
SELECT lives_ok($$ SELECT * FROM api.product_with_evidence LIMIT 1 $$, 'api views work after the cutover');
SELECT lives_ok($$ SELECT public.pass_gate(:gate, NULL) $$, 'converted RPCs work after the cutover');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'media' AND name LIKE current_setting('test.moesa') || '/%') > 0, TRUE, 'Storage reads still work for an internal user');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (the grants are still there).
- [ ] **Step 3: Implement** the migration, the CI step and the README.
- [ ] **Step 4: Run** `cd app && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`, and `cd supabase/functions && deno task test`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): close the base tables; api is the only data path"`

---

### Task 20: HTTP attack suite and performance budget (R10, R12)

**Files:**
- Create: `supabase/functions/http-tests/helpers.ts`, `supabase/functions/http-tests/field_security_http_test.ts`
- Create: `supabase/functions/scripts/field_perf_http.ts`
- Create: `supabase/tests/perf/field_security_perf.sql`, `supabase/tests/perf/field_security_perf_load.sql`, `supabase/tests/perf/http_baseline.json`, `scripts/field-security-perf.mjs`
- Modify: `supabase/functions/deno.json` (tasks `"test:http": "deno test --allow-env --allow-net --allow-read http-tests/"`, `"perf:http": "deno run --allow-env --allow-net scripts/field_perf_http.ts"`)
- Modify: `app/package.json` (`"perf:fields": "node ../scripts/field-security-perf.mjs"`)
- Modify: `.github/workflows/ci.yml` (database job: `denoland/setup-deno@v2`, then `eval "$(supabase status -o env | sed 's/^/export /')"` and `cd supabase/functions && deno task test:http` after `supabase test db`)

**Interfaces:**
- Produces:
  - `helpers.ts`:
    - `signIn(email: string): Promise<string>` (password `Demo1234!`, `POST /auth/v1/token?grant_type=password`).
    - `rest(token: string, path: string, init?: { method?: string; body?: unknown; headers?: Record<string,string>; profile?: 'api' | 'public' }): Promise<{ status: number; body: unknown; headers: Headers }>`.
    - `adminSetup()` / `adminTeardown()`. These use the service key and the GoTrue admin API to create `http-restricted@moesa-panel.test` (MOESA LTD; role `http_restricted`: product/customer/purchase_order select/insert/update, no field rows) and `http-mixed@moesa-panel.test`. The mixed user has `management` field defaults in MOESA LTD and a role without `cost` in MOESA Europe.
  - Env: `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` (from `supabase status -o env`). The suite refuses to run unless `API_URL` is a `127.0.0.1`/`localhost` URL.

- [ ] **Step 1: Write the HTTP tests** (one `Deno.test` each; restricted unless noted):

```ts
'GET /product?select=purchase_price,notes → every value null'
'GET /product?purchase_price=gt.0 → []' ; 'order=purchase_price.desc does not change order vs order=id' ; 'Prefer: count=exact with purchase_price=gt.0 → content-range */0'
'GET /product?select=sku,supplier(code) → supplier null for every row (R4)' ; 'GET /purchase_order?select=*,customer(code),supplier(code)' ; 'every select string used by the app resolves (list from grep in Task 14)'
'PATCH /product?id=eq.X {purchase_price:1} → 403, code 42501, message field_write_forbidden'
'PATCH /product?id=eq.X {display_name:"y"} Prefer return=representation → purchase_price null in the body (T7)'
'PATCH /product?purchase_price=lt.100 {display_name:"z"} → 0 rows affected (T8)'
'POST /product [{…}] Prefer return=representation → masked body' ; 'DELETE /product?id=eq.Y Prefer return=representation → masked body'
'GET /product with Accept-Profile: public → 42501 (base closed)' ; 'GET /graphql/v1 → 404'
'a JWT whose role claim is api_owner is refused (401/403)'   // signed with the local JWT secret from `supabase status`
'mixed-rights user over x-tenant-ids: Europe purchase_price null, LTD visible'
'portal: GET /customer?code=eq.THO → deposit_rate set, restricted_drive_url null; GET /supplier → []; GET /document?type=eq.pi → []'
'audit_log for a restricted reader: purchase_price key is {"masked":true}'
'error bodies never contain a seeded secret value (scan every error response body for "12.5" and "secret note")'
```

- [ ] **Step 2: Run** `supabase start` (if needed), `cd supabase && supabase db reset`, then `cd supabase/functions && deno task test:http`. Expected: PASS. Any failure is a leak: fix it in the owning task's migration and add the missing pgTAP case there.
- [ ] **Step 3: Write the SQL perf script.** `field_security_perf.sql` runs inside `BEGIN … ROLLBACK`:
  - It loads 100 000 products into MOESA LTD and 100 000 into Nova (as `spike-scripts/50_perf_objects.sql`) and runs `ANALYZE`.
  - Per actor (internal `akif`, restricted `elif`/`t_restricted`, mixed via `impersonate_scope`) it times Q1–Q4 from spike §3, plus Q5 `api.product` joined to `api.supplier(…)`/customer (the embed shape) and Q6 `api.purchase_order_overview LIMIT 50`.
  - Each query runs on `api.*` against the same query on `public.*` as baseline (the script runs as postgres and uses `SET LOCAL ROLE authenticated` with a temporary `GRANT SELECT ON public.product, public.customer, public.supplier TO authenticated`; this is local only, inside the rolled-back transaction).
  - It reports the median of 5 after a warm-up. It ends with `DO $$ … RAISE EXCEPTION 'budget' …` when internal > 1.15× or restricted/mixed > 1.40× baseline on any query.
  - `scripts/field-security-perf.mjs` pipes it to `docker exec -i supabase_db_moesa-panel psql -v ON_ERROR_STOP=1`, as `seed-story.mjs` does.
- [ ] **Step 4: Run** `cd app && pnpm perf:fields`. Expected: the script prints the table and exits 0. Paste the table into the commit body.
- [ ] **Step 5: Write and run the HTTP timing** `field_perf_http.ts`. It sends 30 requests per case (product list 50 with `customer(code),supplier(code)`, the PO overview, a `PATCH` with `return=representation`) per actor, against the 100k dataset. The dataset is loaded by `supabase/tests/perf/field_security_perf_load.sql`, which is committed: the script's insert part without `ROLLBACK`; reset afterwards. The baseline is the same request in a branch where 062 is not applied: run once on `HEAD~1` of Task 19, record the medians in `supabase/tests/perf/http_baseline.json`, and compare. Run `cd supabase/functions && deno task perf:http`. Expected: within R10's budget; exit 0.
- [ ] **Step 6: Commit** `git commit -m "test(security): HTTP attack suite and performance budget"`

---

### Task 21: Story seed, full verification and browser walk

**Files:**
- Modify: `supabase/seed_story.sql` (THO's portal user `portal@moesa-panel.test` gets a story line: THO's products have cost and sell prices, its contract and a PI on PO-011, all already present; add a comment block naming what the portal user must and must not see)
- Modify: `supabase/seed_story.check.sql` (checks run as the portal user via `private.impersonate`)
- Delete: `scripts/pgtap-to-api.mjs`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing story checks** (each `SELECT '<name>' WHERE NOT …` returns a row on failure, as the file does today):

```sql
SELECT 'fp.portal_no_cost' WHERE EXISTS (SELECT 1 FROM api.product p JOIN api.customer c ON c.id = p.customer_id WHERE c.code = 'THO' AND p.purchase_price IS NOT NULL);
SELECT 'fp.portal_sell_price' WHERE NOT EXISTS (SELECT 1 FROM api.product p JOIN api.customer c ON c.id = p.customer_id WHERE c.code = 'THO' AND p.company_price_eur IS NOT NULL);
SELECT 'fp.portal_contract' WHERE NOT EXISTS (SELECT 1 FROM api.customer WHERE code = 'THO' AND deposit_rate IS NOT NULL AND restricted_drive_url IS NULL);
SELECT 'fp.portal_no_pi' WHERE EXISTS (SELECT 1 FROM api.document WHERE type = 'pi');
SELECT 'fp.portal_no_supplier' WHERE EXISTS (SELECT 1 FROM api.supplier);
SELECT 'fp.coordinator_terms_readonly' WHERE NOT EXISTS (SELECT 1 FROM api.supplier WHERE payment_terms IS NOT NULL);  -- as koordinator
```

- [ ] **Step 2: Run** `cd supabase && supabase db reset`, then `cd app && pnpm dev:seed-story`. Expected: FAIL only if a check is wrong; otherwise PASS once Step 1's comment block and any missing story values are in.
- [ ] **Step 3: Full verification.** Run, in order:
  - `cd app && pnpm test:db`
  - `cd app && pnpm test`
  - `cd app && pnpm test:scripts`
  - `cd app && pnpm typecheck`
  - `cd app && pnpm lint`
  - `cd app && pnpm build`
  - `cd supabase/functions && deno task check && deno task test && deno task test:http`
  - `cd app && pnpm perf:fields`
  
  Expected: every command exits 0.
- [ ] **Step 4: Browser walk** (`cd app && pnpm dev`, local Supabase with the story seed). Each item is checked in the network tab (requests go to `/rest/v1/` with `Accept-Profile: api`) and on screen:
  - **akif:** product list and form show cost; edit and save `purchase_price`; the audit log shows values; revert a display-name change.
  - **koordinator:** supplier terms are read-only in the supplier form; saving the form does not fail; the PO list shows totals; editing the role editor is not offered.
  - **baris:** role editor → `coordinator` → Product → cost group toggles to `some`/`all`; save; re-open shows the saved state; switch `x-tenant-ids` to MOESA LTD + Europe and see per-tenant masking.
  - **portal:** product list without cost columns; customer THO shows contract terms without the drive URL; no supplier menu; no PI in documents.
  - **Any tab open across a reload after the cutover:** the first request after reload succeeds.
- [ ] **Step 5: Commit** `git commit -m "test(seed): portal story checks; field permissions verified end to end"`

---

## Self-Review

- **Spec coverage:** Goals → Tasks 2 (catalog, schema test), 3 (rights per row tenant), 6–10 (masking, writes, RETURNING), 12 (audit), 20 (budget), 16 (role editor). Architecture → 6. Base tables closed → 19. View owner → 6. Masking/fast path → 3, 6. Writes → 4, 6. Generator → 6. Catalog/defaults → 2. Embeds → 6–10, 14, 20. Side doors: audit → 12; definer functions and views → 11; Edge Functions → 15; exports → 17; pg_graphql/Realtime → 17. App → 14, 16. Rollout and hosted settings → 19. Tests (AC, T1–T10, schema test, perf, vitest, HTTP) → 6–13, 20. Rulings R1 → 2, 3; R2 → 19; R3 → 13; R4 → 6, 8, 10; R5 → 4; R6, R7 → 5 (+ 7, 8, 9 through `api`); R8 → 11, 12; R9 → 12; R10 → 3, 6, 20; R11 → 14, 15; R12 → 20. Non-goal "portal UI" is not built. OD1 → 16; OD2 → 2; OD3 → 2 (defaults); OD4 → 12.
- **Type consistency:** `field_read_tenants`/`field_write_tenants`/`field_read_all`/`field_can_read`/`field_can_write`/`field_group_read_tenants`/`field_rights_map`/`sensitive_fields_map` (Task 3) are used with the same names in Tasks 4, 6, 12 and 13. `FieldRight` (Task 14) and `FieldRightInput` (Task 16) share the same fields. `api_view_drift`, `enable_field_security`, `enable_field_write_guard`, `api_forward` and `impersonate_scope` are consistent.
- **Proportion:** the code blocks are test assertions and the few algorithms the signatures do not determine (mask expression, forwarder, drift, audit mask, row rule).
