# Field-Level Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tenant admin sets per role, per resource, per field read/write rights, and the database enforces them on every path (PostgREST tables, embeds, filters, RPCs, views, Edge Functions, exports, audit history, files), with the internal team's lists within the measured budget.

**Architecture:** Spike prototype "A-def". A catalog (`public.field_class`, `public.role_field_permission`) drives a generator, `private.enable_field_security(table)`. For each business table, the generator emits a masking view `api.<table>`, owned by the NOLOGIN, non-BYPASSRLS role `api_owner`. Each sensitive column is wrapped in a `CASE` over once-per-query field-right InitPlans, evaluated per row tenant. The generator also emits:
- INSTEAD OF forwarding triggers that refuse any non-writable field the caller sends and re-read through the view;
- computed relationships for masked FKs;
- a per-table BEFORE write guard on the base table, driven by the request identity, which also refuses tenant moves.

The app and the Edge Functions switch to `api`. In one cutover migration, `anon`/`authenticated` lose every privilege on `public` tables.

**Tech Stack:** Postgres 15 + pgTAP, PostgREST (Supabase CLI 3.x locally), Deno Edge Functions (`npm:@supabase/supabase-js@2.50.3`, `jsr:@std/assert@1`), Vue 3.5 + PrimeVue 4 + TanStack Query + zod + CASL (`@casl/ability`), vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-11-08-field-permissions-design.md` is binding, including "Owner decisions" 1–5 and "Rulings after the builder check" 1–12, cited below as **OD1–OD5** and **R1–R12**. Other inputs:
- Column data: `docs/superpowers/specs/2026-11-08-field-classification.md` (**CL**), as amended by OD2 (Task 2 lists the amendments).
- Evidence: `docs/superpowers/research/field-permissions/` (`research.md` "Attack-test checklist" = **AC**, `spike.md` T0–T12, `spike-scripts/`).
- The pre-flight rulings in `.superpowers/sdd/2026-11-08-field-permissions/progress.md`, cited as **C1–C5, S1–S8, D**.

## Global Constraints

- "`anon` and `authenticated` lose SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every business table in `public`; only the view owner and the service role keep them." TRUNCATE (and REFERENCES, TRIGGER) go in Task 1. Everything else goes in the cutover (Task 19), never earlier.
- View owner: "A dedicated NOLOGIN role `api_owner`, **not** BYPASSRLS, member of `authenticated`, owns every `api` view". Views are `security_invoker = false`. No `security_barrier`, which measured +85–160% for no protection. Never a view or definer function owned by `postgres` that reads a business table for a user. Every `api_owner` definer that returns rows returns them re-read through `api` views (C2).
- Mask form: `CASE WHEN t.tenant_id = ANY((SELECT private.field_read_tenants('<resource>', '<field>'))) THEN t.<field> END`, with R10's fast path in front. "The field function never per row." The function is `STABLE`.
- Writes to a field without the write right fail with SQLSTATE `42501`, message `field_write_forbidden`, DETAIL `<table>.<field>`. Any non-writable field the caller **sends** is refused, whatever the stored value (S1). "`RETURNING` never reveals a hidden value."
- "Rights are evaluated against **each row's tenant**" (T17). For `public.user`, rights are evaluated per member tenant (S5). The active tenant is never used alone.
- `tenant_id` is immutable through the API on every table that has one (S8): `tenant_move_forbidden` (42501). The only exceptions are transfer and system paths.
- R1: roles outside the classification keep read+write on every field of every table they hold the table permission for. The classification defaults apply to `owner`, `management`, `coordinator` and `customer_viewer` only. New roles start from "sensitive denied".
- R10 budget: internal users ≤ +15%; restricted or mixed-rights multi-tenant users ≤ +40%. This covers embeds and `return=representation`, over SQL and HTTP.
- R2 cutover: "the REVOKE and the app's switch to `api` ship together". There is no compatibility window.
- R11: PostgREST upserts on views are not supported. The one service-role upsert (`amazon_product_type_definition`) stays on the base table.
- Migrations are new files `048`–`062`. Files `001`–`047` are never edited.
- Each migration has its own `supabase/tests/database/<nnn>_<name>.test.sql`: `BEGIN; SELECT plan(n); … SELECT * FROM finish(); ROLLBACK;`, with the header comment as in `045_transfer_files.test.sql`.
  - `plan(n)` is **exactly** the number of assertions listed in the task.
  - From Task 3 on, a test starts with `SELECT set_config('test.' || key, value, TRUE) FROM jsonb_each_text(private.field_test_fixtures()); SELECT private.create_test_helpers();` (both from Task 3).
  - In SQL, `:name` is shorthand for `current_setting('test.name')::UUID`, or `::TEXT` where a string is compared. Write it out in full in the file.
  - The actor of a block is named in the comment above it and set with `private.impersonate(user, tenant)` or `private.impersonate_scope(user, active, scope)`. `private.unimpersonate()` returns to postgres with no claims.
  - Before each audited statement whose audit row a test reads, run `SELECT set_config('audit.transaction_id', '', TRUE)`. Audit rows are found by `audit_log.id`, never by `created_at`.
- Every new function: `SET search_path = ''`, schema-qualified names, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, then explicit grants.
- Every `RAISE EXCEPTION '<code>'` has an `errors.<code>` message in all 13 locales under `app/src/plugins/i18n/locales/*/index.json` (`locales.test.ts`). `en` is the source and `tr` is Turkish; the other 11 carry the English text.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The five failure modes most likely to leak data, each pinned to a test:

1. **The definer view runs with more rights than the caller.** A view owned by a BYPASSRLS role, `api_owner` reachable through a JWT `role` claim, or `authenticated` a member of `api_owner` each give a cross-tenant read (spike T11-pitfall). Pinned:
   - Task 6 `api_owner cannot be assumed`;
   - Task 6 `every api view is owned by api_owner`;
   - Task 20 `a JWT whose role claim is api_owner is refused`.
2. **Rights borrowed across tenants.** These are: `x-tenant-ids` fast path; `public.user` personal data via the active tenant (S5); a tenant move (S8). Pinned:
   - Task 3 `field_read_all is false when one scope tenant lacks the right`;
   - Task 3 `S5: a user only in another scope tenant stays masked`;
   - Task 4 `S8: a row cannot move tenant through the API`;
   - Task 6 `T9 multi-tenant: Europe row visible, LTD row masked`;
   - Task 12 `audit keys masked per row tenant`.
3. **Drift after this ships.** A new column, table or view added later without classification, or a stale `api` view, fails open. Pinned:
   - Task 2 `every column of every public table is classified`;
   - Task 6 `api_view_drift() is empty`, re-run in every later DB task;
   - Task 19 `no public relation grants anything to anon or authenticated`.
4. **Write path side effects.** These are: the write-guess oracle (S1); RETURNING the base row; a masked NULL written back; a DELETE through a view treated as a cascade; an audit revert writing a hidden field back. Pinned:
   - Task 6 `S1: a correct guess is refused like a wrong one`;
   - Task 6 `T7 RETURNING is masked`;
   - Task 6 `T4b … and is a no-op`;
   - Task 5 `R7: a delete through a view behaves like a direct delete (purchase_order_line)`;
   - Task 12 `revert refused when a changed field is not writable`.
5. **A side door returning sensitive values outside the views.** These are: RPCs, transfer reports, role-right self-grants (S7), files and Storage, Edge Functions running as the service role. Pinned:
   - Task 11 `no public function granted to authenticated returns a sensitive row type`;
   - Task 11 `C2: converted RPCs return api row types`;
   - Task 3 `S7: no direct insert`;
   - Task 12 `S4: nested sensitive keys in a JSON report are masked`;
   - Task 13 `portal user cannot read a PI document`;
   - Task 15 `amazon-listing response carries no sensitive key`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/048_revoke_unexpected_grants.sql` | TRUNCATE/REFERENCES/TRIGGER revoked from anon/authenticated, default privileges |
| `supabase/migrations/049_field_catalog.sql` | `field_group`, `field_class`, `role_field_permission`, `private.field_default`, classification data, default/backfill functions, module/permissions |
| `supabase/migrations/050_field_rights.sql` | field-right functions, `field_guard_bypassed`, `parent_gone`, `can_grant_field`, S7 trigger, `save_role` field rights, `my_access.fields`, test support (`impersonate_scope`, `unimpersonate`, `field_test_fixtures`, `create_test_helpers`) |
| `supabase/migrations/051_field_write_guard.sql` | `enable_field_write_guard`, guards (fields + tenant move) on every table with `tenant_id` or sensitive fields |
| `supabase/migrations/052_guard_request_identity.sql` | R6 guard rewrite (`server_write`), R7 cascade detection |
| `supabase/migrations/053_api_schema.sql` | `api_owner`, schema `api`, `enable_field_security`, `api_forward`, `api_view_drift`, `api_json_masked`, `field_calls_only_in_initplans`, product group |
| `supabase/migrations/054_api_customer_supplier.sql` … `057_api_core.sql` | the other table groups |
| `supabase/migrations/058_api_derived.sql` | derived `api` views, invoker → `api_owner` definer conversion, RPC re-reads, definer inventory, transfer gate |
| `supabase/migrations/059_api_audit.sql` | audit views, `mask_audit_data`, `mask_json_deep`, `api.transfer` report masking, revert refusal |
| `supabase/migrations/060_file_row_rule.sql` | R3 row rule, `hidden_media_ids`, Storage check |
| `supabase/migrations/061_disable_graphql.sql` | `DROP EXTENSION pg_graphql` |
| `supabase/migrations/062_field_security_cutover.sql` | REVOKE on every `public` table and view, default privileges |
| `supabase/tests/database/048_…`–`062_….test.sql` | pgTAP, one per migration |
| `supabase/tests/perf/*`, `scripts/field-security-perf.mjs` | SQL timing and budget (R10) |
| `supabase/functions/http-tests/{helpers.ts,field_security_http_test.ts}`, `supabase/functions/scripts/field_perf_http.ts` | HTTP attack suite and timing (R10, R12) |
| `supabase/seed.sql`, `supabase/seed_story.sql`, `supabase/seed_story.check.sql` | role field rights, `customer_viewer` role and user, story checks |
| `supabase/config.toml` (Task 6, Task 17), `.github/workflows/ci.yml`, `supabase/README.md` | exposed schemas, CI, production steps |
| `app/src/lib/supabase.ts`, `app/src/@types/global.d.ts`, `app/package.json` | `api` client, `publicSchema` for RPCs, `api` types |
| `app/src/plugins/casl/index.ts`, `app/src/api/access.ts`, `app/src/store/auth/index.ts`, `app/src/composables/useFieldAccess.ts`, `app/src/api/saveRow.ts` | CASL field rules, unwritable fields dropped from writes |
| `app/src/components/service-components/select-permissions/SelectFieldPermissions.vue`, `app/src/api/role/index.ts` | role editor field toggles |
| `app/src/api/product/csv.ts` | export/import by field rights |
| `supabase/functions/_shared/supabaseClient.ts`, `amazon-listing/index.ts`, `_shared/listingStatus.ts`, `user/index.ts` | Edge Functions on `api`, projected service reads |

---

### Task 1: Revoke unexpected grants (quick win)

**Files:**
- Create: `supabase/migrations/048_revoke_unexpected_grants.sql`
- Test: `supabase/tests/database/048_revoke_unexpected_grants.test.sql`

**Interfaces:**
- Produces:
  - No `public` table grants TRUNCATE, REFERENCES or TRIGGER to `anon` or `authenticated`.
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated`.
  - SELECT/INSERT/UPDATE/DELETE stay until Task 19, which flips assertion 4 (C5).

- [ ] **Step 1: Write the failing test** (`plan(4)`; this file predates Task 3's helpers, so the actor is set with `private.impersonate((SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'), (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD'))`)

```sql
SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER') $$, 'no public table grants TRUNCATE/REFERENCES/TRIGGER to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace
   AND d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'r'
   AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=[a-zA-Z]*[Dxt]') $$, 'new tables of postgres do not grant TRUNCATE/REFERENCES/TRIGGER');
-- as koordinator in MOESA LTD:
SELECT throws_ok($$ TRUNCATE public.product CASCADE $$, '42501', NULL, 'a user cannot TRUNCATE');
SELECT ok(has_table_privilege('authenticated', 'public.product', 'SELECT'), 'SELECT is untouched until the cutover (Task 19 flips this)');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL in `048_…` (the grants exist).
- [ ] **Step 3: Implement** the migration:
  - loop over `pg_class` (`relkind IN ('r','p')`, namespace `public`) and issue `REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated`;
  - then alter the default privileges.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add supabase/migrations/048_* supabase/tests/database/048_* && git commit -m "fix(security): revoke truncate, references and trigger from api roles"`

---

### Task 2: Field catalog, classification data and role defaults

**Files:**
- Create: `supabase/migrations/049_field_catalog.sql`
- Test: `supabase/tests/database/049_field_catalog.test.sql`
- Modify: `supabase/seed.sql:89-139` (`seed_roles`, `seed_ops_roles`), the auth-user block at `supabase/seed.sql:14-75` (new user `portal@moesa-panel.test`), `supabase/seed.sql:216-222` (membership)
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_not_sensitive`)

**Interfaces:**
- Produces (SQL, exact):
  - `public.field_group (id TEXT PRIMARY KEY CHECK (id ~ '^[a-z_]+$'), position INT NOT NULL)`. Rows: `cost 10, sell_price 20, supplier_identity 30, supplier_contact 40, supplier_terms 50, contract 60, finance 70, internal_note 80, personal_data 90`.
  - `public.field_class_kind AS ENUM ('system','open','sensitive')`.
  - `public.field_class (resource_name TEXT NOT NULL, field TEXT NOT NULL, class public.field_class_kind NOT NULL, group_name TEXT REFERENCES public.field_group (id), self_readable BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (resource_name, field), CHECK ((class = 'sensitive') = (group_name IS NOT NULL)), CHECK (NOT self_readable OR class = 'sensitive'))`. `resource_name` is spelled like `permission.resource_name` (`'public.product'`).
  - `public.role_field_permission (role_id UUID NOT NULL REFERENCES public.role (id) ON DELETE CASCADE, resource_name TEXT NOT NULL, field TEXT NOT NULL, can_read BOOLEAN NOT NULL, can_write BOOLEAN NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (role_id, resource_name, field), FOREIGN KEY (resource_name, field) REFERENCES public.field_class ON DELETE CASCADE, CHECK (can_read OR NOT can_write))`.
    - A BEFORE INSERT/UPDATE trigger `role_field_permission_sensitive_only` raises `field_not_sensitive` (`check_violation`) unless the field's class is `sensitive`.
    - RLS is on. Its four `public.permission` rows copy those of `public.role_permission` (group, kind, `resource_condition`, `throws_error`) with `resource_name = 'public.role_field_permission'`. Grant them to the owner role, as 024 does for media.
    - Audited with `private.audit_enable`.
    - Field rights never go into `public.permission` (T18). Task 3 restricts writes to `save_role` (S7).
  - `field_class` and `field_group`: RLS on, one `SELECT … TO authenticated USING (TRUE)` policy (as `public.platform`), no write policy.
  - `private.field_default (profile TEXT, group_name TEXT REFERENCES public.field_group, can_read BOOLEAN NOT NULL, can_write BOOLEAN NOT NULL, PRIMARY KEY (profile, group_name))`, rows in the table below.
  - `private.apply_field_defaults(p_role_id UUID, p_profile TEXT) RETURNS VOID`. Upserts one row per sensitive field from `private.field_default`. Fields of `public.user` get `(TRUE, FALSE)` for `management`/`coordinator` and no row for `customer_viewer`.
  - `private.grant_all_fields(p_role_id UUID) RETURNS VOID`. Per sensitive field: `can_read` when the role holds `select` on `resource_name`; `can_write` when it also holds `insert` or `update`.
  - `private.backfill_role_fields() RETURNS VOID`. For every role with `tenant_id IS NOT NULL`: `display_name IN ('management','coordinator','customer_viewer')` → `apply_field_defaults(id, display_name)`; any other → `grant_all_fields(id)` (R1). Runs once at the end of 049.
  - All three are SECURITY DEFINER, revoked from everyone but `postgres`.

`private.field_default` (CL with OD2 applied):

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

Classification data:
1. Insert every existing column of every `public` base table. `system` when the column is `id`, `tenant_id`, `created_at`, `updated_at`, `created_by`, `uploaded_by`, or part of a foreign key; otherwise `open`.
2. One `UPDATE … FROM (VALUES …)` sets the sensitive rows: CL's 81 `**sensitive**` rows, with these OD2 amendments:
   - `product.target_price_eur` → `cost`;
   - `customer.restricted_drive_url` → `internal_note`;
   - add `shipment_event.from_party`, `shipment_event.to_party`, `incident.affected_parties` → `supplier_identity`;
   - `user.user_metadata`, `user.email`, `user.phone` get `self_readable = TRUE`.

Result: **84 sensitive** = cost 18, sell_price 2, supplier_identity 8, supplier_contact 4, supplier_terms 13, contract 5, finance 5, internal_note 21, personal_data 8.

Header comment: "a later migration that adds a column inserts its `field_class` row; `049_field_catalog.test.sql` fails otherwise."

- [ ] **Step 1: Write the failing test** (`plan(18)`, all as postgres). In the test, create role `t_check` in MOESA LTD (no permissions) and role `t_custom` in MOESA LTD holding `public.product` select and update (via `role_permission`), with no field rows.

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
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`relation public.field_class does not exist`).
- [ ] **Step 3: Implement** the migration (Interfaces). Then update `seed.sql`:
  - `seed_roles` ends with `PERFORM private.grant_all_fields(r.id)` for its three roles.
  - `seed_ops_roles` also creates `customer_viewer`, with permissions `select` only on: `public.customer`, `customer_brand`, `customer_contact`, `customer_platform_account`, `customer_warehouse`, `product`, `project`, `project_gate`, `project_product`, `shipment`, `shipment_event`, `shipment_line`, `market_cell`, `incident`, `incident_deadline`, `change_request`, `change_request_product`, `document`, `media`, `media_link`. It then calls `apply_field_defaults` for `management`, `coordinator` and `customer_viewer`.
  - Add the auth user `portal@moesa-panel.test` (demo password as the other demo users) and `seed_member(moesa, portal, 'customer_viewer')`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS. Update `099_seed.test.sql`'s user count by +1 if that is its only failure.
- [ ] **Step 5: Commit** `git commit -m "feat(security): field catalog, classification and role field defaults"` (migration, test, seed.sql, locales).

---

### Task 3: Field-right functions, bypass, S7 write rule, `save_role`, `my_access.fields`, test support

**Files:**
- Create: `supabase/migrations/050_field_rights.sql`
- Test: `supabase/tests/database/050_field_rights.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_grant_exceeds_own`, `errors.role_field_permission_save_role_only`)

**Interfaces:**
- Consumes: Task 2; `private.tenant_scope()`, `private.tenant_id()`, `private.owned_tenants(UUID)`, `private.check_super_admin(UUID)` (004); `private.rules_bypassed()` (040); `private.service_call()` (046).
- Produces (`plpgsql STABLE SECURITY DEFINER`, `search_path = ''` unless stated):
  - `private.field_tenants(p_user UUID, p_tenants UUID[], p_resource TEXT, p_field TEXT, p_write BOOLEAN) RETURNS UUID[]`. Revoked from `authenticated`.
    - Returns `p_tenants` for a super admin, or when the field is not `sensitive`.
    - Otherwise returns `(p_tenants ∩ owned_tenants(p_user))` ∪ the tenants of the user's roles whose `role_field_permission` grants `can_read` (`can_write` when `p_write`).
    - Ownership grants no write on `public.user` fields.
    - Uses two narrow lookups, as `tenants_granting` (004:472) does.
  - `private.field_read_tenants(p_resource TEXT, p_field TEXT) RETURNS UUID[]` = `field_tenants(auth.uid(), private.tenant_scope(), p_resource, p_field, FALSE)`.
  - `private.field_write_tenants(p_resource TEXT, p_field TEXT) RETURNS UUID[]`: the same with `TRUE`.
  - `private.field_read_all(p_resource TEXT, p_field TEXT) RETURNS BOOLEAN`. TRUE when every tenant of `tenant_scope()` is in `field_read_tenants` (R10 fast path).
  - `private.field_user_ids(p_field TEXT, p_write BOOLEAN) RETURNS UUID[]` (S5). The ids of users who are in `tenant_user` or `tenant_owner` of a tenant `T` of `tenant_scope()` where `T ∈ field_tenants(auth.uid(), tenant_scope(), 'public.user', p_field, p_write)`. It never uses the active tenant alone.
  - `private.field_group_read_tenants(p_group TEXT) RETURNS UUID[]`. The intersection of `field_read_tenants` over every sensitive field of the group.
  - `private.field_rights_map() RETURNS JSONB`. `{"<tenant id>": ["<table>.<field>", …]}`: the **readable** sensitive fields per scope tenant (R9).
  - `private.sensitive_fields_map() RETURNS JSONB`. `{"<table>": ["<field>", …]}`.
  - `private.field_rights(p_user UUID, p_tenant UUID) RETURNS TABLE (resource_name TEXT, field TEXT, can_read BOOLEAN, can_write BOOLEAN)`. Every sensitive field, for the app. Revoked from `authenticated`.
  - `private.can_grant_field(p_tenant UUID, p_resource TEXT, p_field TEXT, p_write BOOLEAN) RETURNS BOOLEAN` = `p_tenant = ANY (field_tenants(auth.uid(), ARRAY[p_tenant], …))` (C1). Executable by `authenticated`, and so by `api_owner`.
  - `private.field_guard_bypassed() RETURNS BOOLEAN` (S2, `LANGUAGE sql STABLE`, not definer). Its body:
    - `private.rules_bypassed()`, which includes `private.transferring()`;
    - `OR private.service_call()` (DB role **and** JWT role `service_role`);
    - `OR (nullif(current_setting('request.jwt.claims', TRUE), '') IS NULL AND current_setting('role') = 'none' AND session_user IN ('postgres','supabase_admin','supabase_auth_admin'))`.
    - It never reads `current_user`.
  - `private.parent_gone(p_table REGCLASS, p_id UUID) RETURNS BOOLEAN` (`VOLATILE`, SECURITY DEFINER) = `NOT EXISTS (SELECT 1 FROM <p_table> WHERE id = p_id)`.
  - S7: `CREATE TRIGGER role_field_permission_save_role_only BEFORE INSERT OR UPDATE OR DELETE ON public.role_field_permission FOR EACH ROW`.
    - Passes when `private.field_guard_bypassed()`, or `current_setting('moesa.save_role', TRUE) = '1'`, or (`TG_OP = 'DELETE' AND private.parent_gone('public.role', OLD.role_id)`).
    - Otherwise raises `role_field_permission_save_role_only` (`42501`).
  - `public.save_role(role_data JSONB, permission_ids UUID[] DEFAULT '{}', field_rights JSONB DEFAULT NULL) RETURNS UUID`. `DROP FUNCTION public.save_role (JSONB, UUID[])` first.
    - `field_rights` is `[{resource_name, field, can_read, can_write}]`. NULL leaves the rows unchanged, so a new role gets none (R1).
    - An array is synced: delete missing rows, upsert the given ones, between `set_config('moesa.save_role','1',TRUE)` and `set_config('moesa.save_role','',TRUE)`.
    - Each granted right not passing `private.can_grant_field(role.tenant_id, …)` raises `field_grant_exceeds_own` (`42501`) before any write.
    - Stays SECURITY INVOKER here; Task 11 converts it.
  - `public.my_access(requested UUID)`: restated from 011. The JSONB gains `fields` = `jsonb_agg` of `private.field_rights(auth.uid(), <active tenant>)`.
  - EXECUTE to `authenticated`: `field_read_tenants`, `field_write_tenants`, `field_read_all`, `field_user_ids`, `field_group_read_tenants`, `field_rights_map`, `sensitive_fields_map`, `can_grant_field`, `field_guard_bypassed`. Each reveals only the caller's own rights.
  - Test support. Each is revoked from everyone; `postgres` calls them in tests:
    - `private.impersonate_scope(p_user UUID, p_active UUID, p_scope UUID[]) RETURNS VOID`: as `private.impersonate` (015:233), with `x-tenant-ids` = `array_to_string(p_scope, ',')`.
    - `private.unimpersonate() RETURNS VOID`: `set_config('role','none',TRUE)`, `set_config('request.jwt.claims','',TRUE)`, `set_config('request.headers','',TRUE)`.
    - `private.create_test_helpers() RETURNS VOID` creates schema `t` (inside the test transaction) with `GRANT USAGE ON SCHEMA t TO authenticated, api_owner` (the role exists from Task 6 on; before that, skip it) and:
      - `t.peek(p_table TEXT, p_field TEXT, p_id UUID) RETURNS TEXT` (SECURITY DEFINER, owner postgres: the base value as text);
      - `t.error_of(p_sql TEXT) RETURNS TEXT` (invoker: runs the SQL in a sub-block, undoes it, returns `'ok'` or `SQLSTATE || ':' || SQLERRM`);
      - `t.error_detail(p_sql TEXT) RETURNS TEXT` (invoker: `PG_EXCEPTION_DETAIL`, or NULL);
      - `t.definer_exec(p_sql TEXT) RETURNS VOID` (SECURITY DEFINER, owner postgres).
      - EXECUTE on all four goes to `authenticated`.
    - `private.field_test_fixtures() RETURNS JSONB`. Runs as postgres with `moesa.rules_bypass = '1'`, reset at the end, and returns the ids by key:
      - `moesa`, `europe`, `nova` (tenants MOESA LTD, MOESA Europe, Nova Yazılım).
      - `akif`, `koordinator`, `baris`, `portal`, `elif` (users).
      - `tho` (customer THO): set `deposit_rate 0.4`, `restricted_drive_url 'https://drive.example/THO'`, `notes 'customer secret'`.
      - `tho_contact` (customer_contact of THO, `name 'Ana Buyer'`, `email 'buyer@tho.example'`).
      - `brand` (customer_brand of THO, `name 'Fixture Brand'`).
      - `acct` (customer_platform_account THO/amazon, `account_holder 'Jane Doe'`, `notes 'acct secret'`).
      - `wh` (customer_warehouse of THO, `display_name 'W1'`).
      - `tsp` (supplier `TSP`, country `CN`, `deposit_rate 0.3`, `payment_terms 'net 30'`, `default_incoterm 'FOB'`, `notes 'supplier secret'`).
      - `tsp_contact` (supplier_contact of TSP, `name 'Li Wei'`, `phone '+86 100'`).
      - `secret` (product `SPIKE-SECRET` of THO, supplier TSP, `purchase_price 12.5`, `purchase_currency 'USD'`, `landed_cost_eur 14.25`, `target_price_eur 20`, `company_price_eur 25`, `supplier_product_code 'SPC-1'`, `notes 'secret note'`).
      - `euc` (customer `EUC` in Europe, `commercial_model 'trading_partner'`).
      - `spike_eu` (product `SPIKE-EU` of EUC, `purchase_price 77.7`).
      - `po_draft` (draft PO of THO/TSP, `currency 'USD'`, `incoterm 'FOB'`, `deposit_rate 0.3`, `pi_total 1000`, `pi_number 'PI-T1'`, `notes 'po secret'`), with `line_draft` (SPIKE-SECRET, `quantity 10`, `unit_price 12.5`, `pi_line_total 125`).
      - `po_approved` (same, status `pi_approved`), with `line_approved` (`quantity 5`, `unit_price 12.5`) and `payment` (`kind 'deposit'`, `amount 300`, `currency 'USD'`).
      - `shp` (shipment THO, `mode 'road'`, `delivery_warehouse_id = wh`, `incoterm_buy 'FOB'`, `notes 'shipment secret'`), with `shp_po` (shipment_purchase_order shp↔po_approved), `shp_line` (shp, po_approved, line_approved, `quantity 5`) and `shp_event` (`from_party 'Test Supplier'`, `to_party 'Forwarder X'`, `note 'event secret'`).
      - `project` (THO, `display_name 'T project'`, `type 'npi'`, `notes 'project secret'`) and `gate` (project_gate of project, `code 'G1'`, `position 1`, `needs_customer_approval FALSE`, `note 'gate secret'`).
      - `cell` (market_cell THO/SPIKE-SECRET/amazon/`DE`, candidate, `notes 'cell secret'`) and `live_cell` (amazon/`FR`, status `live`).
      - `inc` (incident THO, `family 'ol'`, `severity 's2'`, `title 'T'`, `what_happened 'visible'`, `root_cause_note 'rc secret'`, `affected_parties '{supplier}'`) and `inc_log` (`note 'log secret'`, `cost_amount 50`, `cost_currency 'EUR'`).
      - `cr` (change_request THO, `title 'T'`, `source 'customer'`, `change_kinds '{price}'`, `current_value 'a'`, `requested_value 'b'`, `reason 'r'`, `cost_impact 99`, `decision_note 'cr secret'`).
      - `pi_media` (media, `storage_path '<moesa>/<pi_media>/pi.pdf'`, `file_name 'pi.pdf'`, `mime_type 'application/pdf'`, `size_bytes 10`) and `pi_object` (its path, also inserted into `storage.objects` with `bucket_id 'media'`).
      - `pi_doc` (document `type 'pi'`, entity `purchase_order`/po_draft, `media_id pi_media`, `notes 'doc secret'`).
      - `po_doc` (document `type 'po'`, entity `project`/project).
      - `spec_doc` (document `type 'spec_sheet'`, entity `product`/secret).
      - `supplier_media` (media linked by `media_link` to `supplier`/TSP).
      - `t_restricted`: role in MOESA LTD holding every permission whose `group_name IN ('customer','supplier','product','purchase_order','shipment','project','incident','change_request','market_matrix','document','media','listing','audit_log')`, with no field rows. `elif` joins MOESA LTD (`tenant_user`, `user_role`).
      - `t_cost`: role in Europe with the same permissions and field rows for every `cost` field (`TRUE, TRUE`) and `public.user` `user_metadata`/`email`/`phone` (`TRUE, FALSE`). `elif` joins Europe.

- [ ] **Step 1: Write the failing test** (`plan(26)`). Before it, as postgres: grant MOESA LTD's `coordinator` the `public.role`, `public.role_permission` and `public.role_field_permission` update/insert/delete permissions (for C1). S5 uses akif (member of both tenants) and koordinator (member of MOESA LTD only).

```sql
-- as koordinator in moesa
SELECT is(private.field_read_tenants('public.supplier','deposit_rate'), ARRAY[:moesa]::UUID[], 'coordinator reads supplier terms');
SELECT is(private.field_write_tenants('public.supplier','deposit_rate'), '{}'::UUID[], 'coordinator cannot write supplier terms');
SELECT is(private.field_read_tenants('public.product','sku'), ARRAY[:moesa]::UUID[], 'open fields pass with the scope');
-- as portal in moesa
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'portal has no cost');
SELECT is(private.field_read_tenants('public.product','company_price_eur'), ARRAY[:moesa]::UUID[], 'portal reads sell price');
-- as baris in moesa
SELECT is(private.field_write_tenants('public.product','purchase_price'), ARRAY[:moesa]::UUID[], 'an owner holds every field');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, europe])
SELECT is(private.field_read_tenants('public.product','purchase_price'), ARRAY[:europe]::UUID[], 'per tenant: cost only in Europe');
SELECT ok(NOT private.field_read_all('public.product','purchase_price'), 'field_read_all is false when one scope tenant lacks the right');
SELECT ok(private.field_read_all('public.product','sku'), 'field_read_all is true for open fields');
SELECT ok((private.field_rights_map() -> :europe::TEXT) ? 'product.purchase_price' AND NOT ((private.field_rights_map() -> :moesa::TEXT) ? 'product.purchase_price'), 'rights map is per tenant');
SELECT is(private.field_group_read_tenants('cost'), ARRAY[:europe]::UUID[], 'group right = every field of the group');
-- as elif, impersonate_scope(elif, europe, ARRAY[europe, moesa]); t_cost grants user e-mail read in Europe only
SELECT ok(:akif = ANY (private.field_user_ids('email', FALSE)), 'S5: a member of the tenant holding the right is readable');
SELECT ok(NOT (:koordinator = ANY (private.field_user_ids('email', FALSE))), 'S5: a user only in another scope tenant stays masked, although the active tenant grants the right');
SELECT ok(NOT (:akif = ANY (private.field_user_ids('email', TRUE))), 'S5: a read right is not a write right');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, nova])
SELECT ok(NOT (:nova = ANY (private.field_read_tenants('public.product','sku'))), 'a tenant the user may not use is dropped from the scope');
-- unimpersonate; DELETE FROM public.role_field_permission WHERE role_id = :t_cost (bypass: postgres, no claims); impersonate_scope(elif, europe, ARRAY[europe])
SELECT is(private.field_read_tenants('public.product','purchase_price'), '{}'::UUID[], 'a revoked right applies to the next statement');
-- as akif in moesa
SELECT is((SELECT count(*)::INT FROM public.role_field_permission WHERE role_id = public.save_role(jsonb_build_object('display_name','t_new','tenant_id',:moesa), '{}'::UUID[])), 0, 'a new role starts from sensitive denied');
SELECT lives_ok($$ SELECT public.save_role(jsonb_build_object('id', :t_restricted, 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = :t_restricted),
   '[{"resource_name":"public.product","field":"notes","can_read":true,"can_write":false}]'::JSONB) $$, 'save_role syncs field rights');
SELECT results_eq($$ SELECT field, can_read, can_write FROM public.role_field_permission WHERE role_id = :t_restricted $$, $$ VALUES ('notes', TRUE, FALSE) $$, '… to exactly the given rows');
SELECT throws_ok($$ INSERT INTO public.role_field_permission (role_id, resource_name, field, can_read, can_write) VALUES (:t_restricted, 'public.product', 'purchase_price', TRUE, TRUE) $$, '42501', 'role_field_permission_save_role_only', 'S7: no direct insert');
SELECT throws_ok($$ UPDATE public.role_field_permission SET can_write = TRUE WHERE role_id = :t_restricted $$, '42501', 'role_field_permission_save_role_only', 'S7: no direct update');
SELECT throws_ok($$ DELETE FROM public.role_field_permission WHERE role_id = :t_restricted $$, '42501', 'role_field_permission_save_role_only', 'S7: no direct delete');
SELECT lives_ok($$ DELETE FROM public.role WHERE display_name = 't_new' AND tenant_id = :moesa $$, 'deleting a role cascades its field rows (S7 lets the cascade through)');
-- as koordinator in moesa (role edit granted above; no write on supplier terms)
SELECT throws_ok($$ SELECT public.save_role(jsonb_build_object('id', :t_restricted, 'display_name', 't_restricted'),
   ARRAY(SELECT permission_id FROM public.role_permission WHERE role_id = :t_restricted),
   '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":true}]'::JSONB) $$,
   '42501', 'field_grant_exceeds_own', 'C1: a grant beyond the caller''s own answers field_grant_exceeds_own');
SELECT ok(public.my_access(:moesa) -> 'fields' @> '[{"resource_name":"public.supplier","field":"deposit_rate","can_read":true,"can_write":false}]'::JSONB, 'my_access lists field rights');
-- as baris in moesa
SELECT is((SELECT count(*)::INT FROM public.role_field_permission rfp JOIN public.role r ON r.id = rfp.role_id
   WHERE r.tenant_id = (public.create_branch(:moesa, '{"display_name":"t_branch"}'::JSONB)).id), 0, 'a new branch seeds no field rows (its owner holds every field)');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`function private.field_test_fixtures does not exist`).
- [ ] **Step 3: Implement** `050_field_rights.sql` (Interfaces).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): per-tenant field rights, save_role-only field grants, test support"`

---

### Task 4: Base-table write guard (R5), bypass paths (S2) and tenant moves (S8)

**Files:**
- Create: `supabase/migrations/051_field_write_guard.sql`
- Test: `supabase/tests/database/051_field_write_guard.test.sql`
- Modify: existing `supabase/tests/database/0{15..47}_*.test.sql` statements that now fail **for the intended reason** (`koordinator` writing a field the coordinator only reads: `supplier_terms`, `contract`, `finance`, `sell_price`). Switch that statement's actor to `akif` and list each file in the commit body.
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.field_write_forbidden`, `errors.tenant_move_forbidden`)

**Interfaces:**
- Consumes: `private.field_write_tenants`, `private.field_user_ids`, `private.field_guard_bypassed` (Task 3).
- Produces:
  - `private.enable_field_write_guard(p_table TEXT) RETURNS VOID` generates `private.<table>_field_write_guard() RETURNS TRIGGER` (SECURITY DEFINER, owner `postgres`) and `CREATE OR REPLACE TRIGGER aa_field_write_guard BEFORE INSERT OR UPDATE ON public.<table> FOR EACH ROW` (`aa_` sorts first). The function body:
    1. `IF private.field_guard_bypassed() THEN RETURN NEW; END IF;`
    2. S8, when the table has `tenant_id`: on UPDATE, `NEW.tenant_id IS DISTINCT FROM OLD.tenant_id` raises `RAISE EXCEPTION 'tenant_move_forbidden' USING ERRCODE = '42501'`.
    3. For each sensitive non-generated column `f`, decide whether it is written:
       - on UPDATE: `NEW.f IS DISTINCT FROM OLD.f`;
       - on INSERT: `NEW.f IS DISTINCT FROM <default>`, where `<default>` is the column default when it is a constant (`pg_get_expr` without a function call), else `NULL`.
    4. A written field passes only with `NEW.tenant_id = ANY (private.field_write_tenants('public.<t>','f'))`. For `public.user` it passes only with `NEW.id = auth.uid() OR NEW.id = ANY (private.field_user_ids('f', TRUE))`. A tenant-less table with sensitive fields other than `public.user` makes the generator raise `field_security_unsupported`.
    5. A failure raises `RAISE EXCEPTION 'field_write_forbidden' USING ERRCODE = '42501', DETAIL = '<table>.<field>'`, never a value.
  - The migration calls it for every `public` table that has `tenant_id` or a sensitive field.
  - The S1 oracle is closed at the view forwarder (Task 6) and at the RPCs (Task 11). This base guard is the second line for definer paths.

- [ ] **Step 1: Write the failing test** (`plan(19)`). As postgres, create `t.supplier_deposit_writer()`, a SECURITY DEFINER function owned by postgres: `UPDATE public.supplier SET deposit_rate = 0.5 WHERE id = <tsp>`.

```sql
-- as koordinator in moesa
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.5 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'T4: coordinator cannot write supplier terms');
SELECT lives_ok($$ UPDATE public.supplier SET city = 'Ningbo' WHERE id = :tsp $$, 'T4c: open fields stay writable');
SELECT throws_ok($$ INSERT INTO public.customer (tenant_id, code, display_name, commercial_model, deposit_rate) VALUES (:moesa, 'TS9', 'x', 'trading_partner', 0.3) $$, '42501', 'field_write_forbidden', 'T5: insert with a field the writer cannot write');
SELECT is(t.error_detail($$ UPDATE public.supplier SET deposit_rate = 0.42 WHERE id = :tsp $$), 'supplier.deposit_rate', 'the error names the field only');
SELECT throws_ok($$ SELECT t.supplier_deposit_writer() $$, '42501', 'field_write_forbidden', 'R5: a postgres-owned definer is guarded by the request identity');
-- as elif in moesa (t_restricted: no field rows)
SELECT lives_ok($$ INSERT INTO public.incident (tenant_id, customer_id, family, severity, title, what_happened) VALUES (:moesa, :tho, 'ol', 's3', 'guard test', 'x') $$, 'a NOT NULL constant default (affected_parties {}) is not a write');
SELECT lives_ok($$ UPDATE public.purchase_order_line SET quantity = 11 WHERE id = :line_draft $$, 'a generated cost column (line_total) is not a write');
-- as akif in moesa (management: personal_data on user is R only)
SELECT throws_ok($$ UPDATE public.user SET phone = '+1' WHERE id = :koordinator $$, '42501', 'field_write_forbidden', 'nobody else writes a user''s phone');
SELECT lives_ok($$ UPDATE public.user SET phone = '+90 1' WHERE id = :akif $$, 'a user writes their own phone (self)');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, europe]) (product and customer_brand update in both tenants)
SELECT throws_ok($$ UPDATE public.product SET tenant_id = :europe, customer_id = :euc WHERE id = :secret $$, '42501', 'tenant_move_forbidden', 'S8: a row cannot move tenant through the API');
SELECT throws_ok($$ UPDATE public.customer_brand SET tenant_id = :europe WHERE id = :brand $$, '42501', 'tenant_move_forbidden', 'S8: also on tables without sensitive fields');
-- S2, one test per path
SELECT private.unimpersonate();
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.31 WHERE id = :tsp $$, 'S2 RESET ROLE: postgres, role none, no claims bypasses (migrations, seed)');
SELECT lives_ok((SELECT command FROM cron.job WHERE jobname = 'audit_maintain'), 'S2 pg_cron: a job command runs under the bypass');
SELECT lives_ok($$ UPDATE auth.users SET phone = '+90 555 0000' WHERE id = :akif $$, 'S2 GoTrue: handle_update_user writes public.user without claims');
SELECT ok(pg_get_functiondef('private.field_guard_bypassed()'::REGPROCEDURE) LIKE '%session_user IN (''postgres'', ''supabase_admin'', ''supabase_auth_admin'')%', 'S2: the no-request bypass is limited to those session users');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', TRUE); SET LOCAL ROLE service_role;
SELECT lives_ok($$ UPDATE public.supplier SET deposit_rate = 0.32 WHERE id = :tsp $$, 'S2 service: DB role and JWT role service_role bypass');
-- as koordinator, then the claim alone is spoofed: private.impersonate(koordinator, moesa); set_config('request.jwt.claims', json_build_object('sub', :koordinator, 'role', 'service_role')::TEXT, TRUE)
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.33 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'S2: a service_role claim without the service DB role is refused');
-- private.impersonate(koordinator, moesa); SET LOCAL ROLE service_role (user claims kept)
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.34 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'S2: the service DB role with a user claim is refused');
-- private.impersonate(koordinator, moesa); set_config('role', 'none', TRUE) (claims kept, as the story seed does)
SELECT throws_ok($$ UPDATE public.supplier SET deposit_rate = 0.35 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'S2: claims without a role switch still apply the guard');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL in `051_…`.
- [ ] **Step 3: Implement** `051_field_write_guard.sql`. Then run `cd app && pnpm test:db` and fix the existing tests that fail for the intended reason (see Files).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): base-table field and tenant-move guard driven by the request identity"`

---

### Task 5: Request-identity guards (R6) and explicit cascade detection (R7)

**Files:**
- Create: `supabase/migrations/052_guard_request_identity.sql`
- Test: `supabase/tests/database/052_guard_request_identity.test.sql`

**Interfaces:**
- Consumes: `private.parent_gone` (Task 3).
- Produces:
  - `private.begin_server_write() RETURNS VOID` sets `moesa.server_write = '1'` transaction-locally. `private.server_write() RETURNS BOOLEAN` reads it. Both are revoked from everyone; a PostgREST caller cannot set a GUC.
  - `private.market_cell_listing_server_only()` and `private.platform_account_api_server_only()`, restated from 046:
    - `current_user = 'authenticated'` becomes `auth.role() = 'authenticated' AND NOT private.server_write()`;
    - 046's transfer branch is kept verbatim.
  - `public.amazon_account_disconnect` and `public.listing_begin_submission` call `PERFORM private.begin_server_write()` first. These are the definer RPCs granted to `authenticated` that write those columns; their bodies are otherwise restated unchanged.
  - The latest `purchase_order_line_guard` (041:969), `purchase_order_child_guard` (030:413), `shipment_purchase_order_guard` (031:414), `shipment_line_guard` (031:478), `incident_child_guard` (035:513) and `market_cell_guard` (041:1158) are restated.
    - The depth test (`TG_OP = 'DELETE' AND pg_trigger_depth() > 1`, or `pg_trigger_depth() = 1` in `market_cell_guard`) becomes `private.parent_gone('public.tenant', OLD.tenant_id) OR private.parent_gone('<parent>', OLD.<fk>)`.
    - There is one term per ON DELETE CASCADE parent (`pg_constraint.confdeltype = 'c'`).

- [ ] **Step 1: Write the failing test** (`plan(14)`).

  Setup as postgres:
  - `CREATE ROLE t_fwd NOLOGIN; GRANT authenticated TO t_fwd; GRANT ALL ON public.market_cell, public.customer_platform_account, public.purchase_order_line, public.purchase_order_payment, public.shipment_line, public.shipment_purchase_order, public.incident_log TO t_fwd`.
  - For each of those tables, a view `t.<table>` (`SELECT * FROM public.<table>`) with an INSTEAD OF UPDATE/DELETE trigger whose function is SECURITY DEFINER, owner `t_fwd`, and applies the statement to the base row by `id`. This makes `current_user` ≠ `authenticated` and the trigger depth 2, as through `api` later.
  - A scratch tenant `T scratch` with customer, supplier, product, a draft PO with one line and a candidate cell, created with the rules bypass on.

```sql
-- as koordinator in moesa
SELECT throws_ok($$ UPDATE t.market_cell SET listing_state = 'live' WHERE id = :cell $$, '23514', 'market_cell_listing_server_only', 'R6: listing_state stays server-only through a definer forwarder');
SELECT throws_ok($$ UPDATE t.customer_platform_account SET api_connection = 'connected' WHERE id = :acct $$, '23514', 'platform_account_api_server_only', 'R6: api_connection stays server-only through a definer forwarder');
-- as akif in moesa
SELECT lives_ok($$ SELECT public.amazon_account_disconnect(:acct, 'none') $$, 'R6: the allowed definer RPC still writes it');
SELECT is(t.error_of($$ DELETE FROM t.purchase_order_line WHERE id = :line_approved $$), '23514:po_locked', 'R7: a delete through a view behaves like a direct delete (purchase_order_line)');
SELECT is(t.error_of($$ DELETE FROM t.purchase_order_payment WHERE id = :payment $$), t.error_of($$ DELETE FROM public.purchase_order_payment WHERE id = :payment $$), 'R7: purchase_order child through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.shipment_line WHERE id = :shp_line $$), t.error_of($$ DELETE FROM public.shipment_line WHERE id = :shp_line $$), 'R7: shipment_line through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.shipment_purchase_order WHERE id = :shp_po $$), t.error_of($$ DELETE FROM public.shipment_purchase_order WHERE id = :shp_po $$), 'R7: shipment_purchase_order through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.incident_log WHERE id = :inc_log $$), t.error_of($$ DELETE FROM public.incident_log WHERE id = :inc_log $$), 'R7: incident child through a view = direct');
SELECT is(t.error_of($$ DELETE FROM t.market_cell WHERE id = :live_cell $$), '23514:market_cell_delete_candidate_only', 'R7: a live market cell through a view is refused');
SELECT is(t.error_of($$ DELETE FROM t.market_cell WHERE id = :live_cell $$), t.error_of($$ DELETE FROM public.market_cell WHERE id = :live_cell $$), 'R7: market cell through a view = direct');
-- unimpersonate (rules bypass off)
SELECT lives_ok($$ DELETE FROM public.purchase_order WHERE id = :po_draft $$, 'a parent delete cascades its lines');
SELECT lives_ok($$ DELETE FROM public.tenant WHERE display_name = 'T scratch' $$, 'a tenant delete cascades everything');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND prosrc ~ 'current_user\s*=\s*''authenticated'''), 'no guard tests current_user');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'private'::regnamespace AND proname LIKE '%guard' AND prosrc ~ 'pg_trigger_depth'), 'no guard detects a cascade by depth');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL on the R6/R7 view cases.
- [ ] **Step 3: Implement** `052_guard_request_identity.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "fix(security): guards follow the request role and detect cascades explicitly"`

---

### Task 6: `api_owner`, the generator and the product group, with the full attack suite

**Files:**
- Create: `supabase/migrations/053_api_schema.sql`
- Test: `supabase/tests/database/053_api_schema.test.sql`
- Modify: `supabase/config.toml:13` (`schemas = ["public", "api", "graphql_public"]`; C4: `api` is exposed from here on, and `graphql_public` goes in Task 17)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - Role and schema:
    - `CREATE ROLE api_owner NOLOGIN NOBYPASSRLS`, `GRANT authenticated TO api_owner`, `GRANT api_owner TO postgres`. **Never** grant `api_owner` to `authenticator`, `authenticated` or `anon`.
    - `CREATE SCHEMA api`, `GRANT USAGE ON SCHEMA api TO authenticated, service_role`, `GRANT USAGE, CREATE ON SCHEMA api TO api_owner`, `ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE ALL ON TABLES FROM anon`.
  - `private.api_json_masked (resource_name TEXT, field TEXT, PRIMARY KEY (resource_name, field))`. Empty here; Task 12 fills it.
  - `private.enable_field_security(p_table TEXT, p_read_only BOOLEAN DEFAULT FALSE) RETURNS VOID` (SECURITY DEFINER, owner `postgres`):
    1. `CREATE OR REPLACE VIEW api.<t> WITH (security_invoker = false) AS SELECT … FROM public.<t> t`, columns in `attnum` order:
       - `system`/`open` → `t.<c>`;
       - sensitive on a tenant table → `CASE WHEN (SELECT private.field_read_all('public.<t>','<c>')) OR t.tenant_id = ANY ((SELECT private.field_read_tenants('public.<t>','<c>'))) THEN t.<c> END AS <c>`;
       - sensitive on `public.user` → `CASE WHEN t.id = auth.uid() OR t.id = ANY ((SELECT private.field_user_ids('<c>', FALSE))) THEN t.<c> END` (S5);
       - a column in `private.api_json_masked` → Task 12's `mask_json_deep` expression.
    2. Ownership and grants:
       - `ALTER VIEW … OWNER TO api_owner`;
       - `GRANT SELECT ON api.<t> TO authenticated`;
       - unless `p_read_only`, also `INSERT, UPDATE, DELETE`, where a column-level UPDATE grant of `authenticated` on the base (`tenant`, `setting`) is copied as the same column list instead of table-level UPDATE;
       - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO api_owner`.
    3. Unless `p_read_only`: `CREATE OR REPLACE TRIGGER api_forward INSTEAD OF INSERT OR UPDATE OR DELETE ON api.<t> FOR EACH ROW EXECUTE FUNCTION private.api_forward()`.
    4. R4, for every FK whose columns include a sensitive field, when `api.<target>` exists (else skipped; the migration creating the target re-runs the generator):
       - forward `api.<fk column without _id>(api.<t>) RETURNS SETOF api.<target> ROWS 1 STABLE LANGUAGE sql SECURITY INVOKER` = `SELECT x.* FROM api.<target> x WHERE x.id = $1.<fk column>` (the argument row is already masked);
       - reverse `api.<t>_by_<fk column without _id>(api.<target>) RETURNS SETOF api.<t>` = `… WHERE x.<fk column> = $1.id`. The `_by_` name never shadows an inferred embed.
       - EXECUTE on both to `authenticated`.
    5. `PERFORM private.enable_field_write_guard(p_table)`.
  - `private.api_forward() RETURNS TRIGGER` (SECURITY DEFINER, **owner `api_owner`**, dynamic SQL keyed on the base primary key from `pg_index.indisprimary`):
    - **UPDATE (S1):** for every non-generated column `k` with `to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k` (OLD is the **masked** view row), when `k` is sensitive and `OLD.tenant_id <> ALL (private.field_write_tenants('public.<t>', k))` (for `public.user`: not self and not in `field_user_ids(k, TRUE)`), raise `field_write_forbidden` (42501, DETAIL `<t>.<k>`). This refuses any sent value differing from what the caller sees (NULL when unreadable), whatever is stored. Only the remaining changed columns are forwarded; with none, nothing is written.
    - **INSERT:** a non-NULL sensitive column not writable in `NEW.tenant_id` raises the same. The non-NULL, non-generated columns are forwarded.
    - **Both** re-read `SELECT v.* INTO NEW FROM api.<t> v WHERE <pk> = …`. When the re-read finds nothing, NEW is returned as the caller sent it.
    - **DELETE:** `DELETE FROM public.<t> WHERE <pk> = OLD.<pk>`, then `RETURN OLD`.
  - `private.api_view_drift() RETURNS TABLE (relation TEXT, problem TEXT)`. For each `public` table with an `api` view, it reports:
    - `'columns'`: a column name or order mismatch;
    - `'unmasked <c>'`: a sensitive column whose view expression lacks `field_read_tenants('public.<t>', '<c>')`, or for `public.user` lacks `field_user_ids('<c>'`;
    - `'masked <c>'`: a non-sensitive column that is not a plain reference, unless listed in `private.api_json_masked` and wrapped in `mask_json_deep(`;
    - `'owner'`: an owner other than `api_owner`;
    - `'guard'`: a missing `aa_field_write_guard` where the table has `tenant_id` or sensitive fields.
  - `private.field_calls_only_in_initplans(p_sql TEXT) RETURNS BOOLEAN` (test support, revoked from everyone). It runs `EXPLAIN (VERBOSE, FORMAT JSON)`. It returns TRUE when every plan node whose `Output` or `Filter` mentions `field_read_tenants`, `field_read_all`, `field_user_ids`, `field_rights_map` or `hidden_media_ids` lies inside a subplan whose `Subplan Name` starts with `InitPlan`.
  - The migration ends with `SELECT private.enable_field_security('product');`.

- [ ] **Step 1: Write the failing test** (`plan(36)`):

```sql
SELECT ok(NOT (SELECT rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname = 'api_owner'), 'api_owner cannot log in and does not bypass RLS');
SELECT ok(NOT pg_has_role('authenticator','api_owner','MEMBER') AND NOT pg_has_role('authenticated','api_owner','MEMBER') AND NOT pg_has_role('anon','api_owner','MEMBER'), 'api_owner cannot be assumed');
SELECT ok(pg_has_role('api_owner','authenticated','MEMBER'), 'api_owner is a member of authenticated');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is((SELECT pg_get_userbyid(relowner)::TEXT FROM pg_class WHERE oid = 'api.product'::REGCLASS), 'api_owner', 'every api view is owned by api_owner');
SELECT is((SELECT pg_get_userbyid(proowner)::TEXT FROM pg_proc WHERE oid = 'private.api_forward()'::REGPROCEDURE), 'api_owner', 'the forwarder is owned by api_owner, not postgres');
SELECT ok(has_table_privilege('authenticated', 'public.product', 'SELECT'), 'base still granted until the cutover (Task 19 flips this)');
-- as elif in moesa (t_restricted: product rights, no field rows)
SELECT results_eq($$ SELECT sku FROM api.product WHERE id = :secret $$, $$ VALUES ('SPIKE-SECRET') $$, 'T0 row visible');
SELECT results_eq($$ SELECT purchase_price, purchase_currency, landed_cost_eur, target_price_eur, company_price_eur, supplier_id, supplier_product_code, notes FROM api.product WHERE id = :secret $$,
   $$ VALUES (NULL::NUMERIC, NULL::CHAR(3), NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC, NULL::UUID, NULL::TEXT, NULL::TEXT) $$, 'T1 masked columns are NULL');
SELECT is((SELECT to_jsonb(x) ->> 'notes' FROM api.product x WHERE id = :secret), NULL, 'T1b whole row masked');
SELECT is((SELECT count(*)::INT FROM api.product WHERE id = :secret AND purchase_price > 10), 0, 'T2a filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.product WHERE purchase_price IS NOT NULL), 0, 'T2 IS NULL oracle closed');
SELECT is((SELECT array_agg(sku ORDER BY purchase_price) FILTER (WHERE purchase_price IS NOT NULL) FROM api.product), NULL, 'T2c ORDER BY oracle closed');
SELECT results_eq($$ SELECT count(*) FILTER (WHERE purchase_price IS NOT NULL)::INT, sum(purchase_price), max(landed_cost_eur) FROM api.product $$, $$ VALUES (0, NULL::NUMERIC, NULL::NUMERIC) $$, 'T3 aggregates closed');
SELECT is((SELECT 1 / (purchase_price - 12.5) FROM api.product WHERE id = :secret), NULL, 'T6a division oracle closed');
SELECT is(t.error_of($$ SELECT ('x' || notes)::INT FROM api.product WHERE id = :secret $$), 'ok', 'T6b a cast never sees the value');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 1 WHERE id = :secret $$, '42501', 'field_write_forbidden', 'T4 a wrong guess is refused');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = :secret $$, '42501', 'field_write_forbidden', 'S1: a correct guess is refused like a wrong one');
SELECT throws_ok($$ UPDATE api.product SET notes = 'secret note' WHERE id = :secret $$, '42501', 'field_write_forbidden', 'S1: a correct text guess is refused');
SELECT lives_ok($$ UPDATE api.product SET purchase_price = NULL, notes = NULL WHERE id = :secret $$, 'T4b wipe is accepted …');
SELECT is(t.peek('product', 'notes', :secret), 'secret note', 'T4b … and is a no-op');
SELECT results_eq($$ UPDATE api.product SET display_name = 'r2' WHERE id = :secret RETURNING purchase_price, notes $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T7 RETURNING is masked');
SELECT is(t.peek('product', 'display_name', :secret), 'r2', 'T4c the allowed column was written');
SELECT is((SELECT count(*)::INT FROM (UPDATE api.product SET display_name = 'x' WHERE purchase_price < 100 RETURNING 1) z), 0, 'T8 an update filtered on a masked field affects 0 rows');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku, purchase_price) VALUES (:moesa, :tho, 'T5', 3) $$, '42501', 'field_write_forbidden', 'T5 insert with a masked field refused');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (:moesa, :tho, 'T5B') $$, 'T5b insert without masked fields works');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ DELETE FROM api.product WHERE sku = 'T5B' $$, 'DELETE through the view');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t WHERE t.id = (SELECT l.transaction_id FROM public.audit_log l WHERE l.operation = 'INSERT' AND l.new_data ->> 'sku' = 'T5B' ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('product','INSERT') $$, 'audit through a view keeps the top-level row');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t WHERE t.id = (SELECT l.transaction_id FROM public.audit_log l WHERE l.operation = 'DELETE' AND l.old_data ->> 'sku' = 'T5B' ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('product','DELETE') $$, 'a DELETE through the view is logged as a DELETE, not a cascade');
SELECT is((SELECT count(*)::INT FROM api.product WHERE id = :spike_eu), 0, 'T11 another tenant''s rows stay invisible');
SELECT throws_ok($$ INSERT INTO api.product (tenant_id, customer_id, sku) VALUES (:nova, :tho, 'T11C') $$, '42501', NULL, 'T11c insert into a tenant without product insert refused');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, europe])
SELECT results_eq($$ SELECT sku, purchase_price FROM api.product WHERE id IN (:secret, :spike_eu) ORDER BY sku $$,
   $$ VALUES ('SPIKE-EU', 77.7::NUMERIC), ('SPIKE-SECRET', NULL::NUMERIC) $$, 'T9 multi-tenant: Europe row visible, LTD row masked');
SELECT throws_ok($$ UPDATE api.product SET purchase_price = 12.5 WHERE id = :secret $$, '42501', 'field_write_forbidden', 'T9 write follows the row tenant');
-- as akif in moesa
SELECT is((SELECT purchase_price FROM api.product WHERE id = :secret), 12.5::NUMERIC, 'internal reads cost');
SELECT results_eq($$ UPDATE api.product SET purchase_price = 13 WHERE id = :secret RETURNING purchase_price $$, $$ VALUES (13::NUMERIC) $$, 'internal writes cost, RETURNING shows it');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.product ORDER BY created_at DESC LIMIT 50'), 'the field function is an InitPlan, never per row');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`schema api does not exist`).
- [ ] **Step 3: Implement** `053_api_schema.sql` and the `config.toml` change. Update Task 3's `create_test_helpers` grant to include `api_owner` now that it exists. That is a `CREATE OR REPLACE` restated in 053, not an edit of 050.
- [ ] **Step 4: Run** `cd app && pnpm test:db`, then `supabase stop && supabase start`, then `curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON_KEY" -H 'Accept-Profile: api' http://127.0.0.1:54321/rest/v1/product?limit=0`. Expected: all PASS; the curl prints `200`.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api schema, view generator with guess-proof forwarder, product group"`

---

### Task 7: Customer and supplier group

**Files:**
- Create: `supabase/migrations/054_api_customer_supplier.sql`
- Test: `supabase/tests/database/054_api_customer_supplier.test.sql`

**Interfaces:**
- Consumes: `private.enable_field_security` (Task 6).
- Produces:
  - Views `api.customer`, `api.customer_brand`, `api.customer_contact`, `api.customer_platform_account`, `api.customer_warehouse`, `api.supplier`, `api.supplier_contact`.
  - The migration then re-runs `enable_field_security('product')`, so `api.supplier(api.product)` and `api.product_by_supplier(api.supplier)` exist (R4).
  - `api.contract_document(api.customer)` comes in Task 10, once `api.document` exists.

- [ ] **Step 1: Write the failing test** (`plan(22)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- as portal in moesa
SELECT results_eq($$ SELECT deposit_rate, restricted_drive_url, notes FROM api.customer WHERE id = :tho $$, $$ VALUES (0.4::NUMERIC, NULL::TEXT, NULL::TEXT) $$, 'OD2: portal reads contract terms, not the drive URL or notes');
SELECT is((SELECT count(*)::INT FROM api.customer WHERE restricted_drive_url LIKE '%THO%'), 0, 'drive URL filter oracle closed');
SELECT is((SELECT email FROM api.customer_contact WHERE id = :tho_contact), 'buyer@tho.example', 'portal reads contact personal data');
SELECT is((SELECT count(*)::INT FROM api.supplier), 0, 'portal has no supplier table access');
SELECT is((SELECT notes FROM api.customer_platform_account WHERE id = :acct), NULL, 'platform account notes masked for portal');
SELECT is((SELECT account_holder FROM api.customer_platform_account WHERE id = :acct), 'Jane Doe', 'account holder readable (personal_data R)');
-- as koordinator in moesa
SELECT is((SELECT deposit_rate FROM api.supplier WHERE id = :tsp), 0.3::NUMERIC, 'coordinator reads supplier terms');
SELECT throws_ok($$ UPDATE api.supplier SET payment_terms = 'net 60' WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'coordinator cannot change supplier terms');
SELECT lives_ok($$ UPDATE api.supplier SET payment_terms = 'net 30', city = 'Shanghai' WHERE id = :tsp $$, 'S1: sending the visible value unchanged is not a write');
SELECT is(t.peek('supplier', 'city', :tsp), 'Shanghai', '… and the open change is forwarded');
SELECT throws_ok($$ UPDATE api.customer SET deposit_rate = 0.2 WHERE id = :tho $$, '42501', 'field_write_forbidden', 'contract stays guarded through the view');
SELECT lives_ok($$ UPDATE api.supplier_contact SET phone = '+86 101' WHERE id = :tsp_contact $$, 'coordinator writes supplier contacts');
SELECT lives_ok($$ INSERT INTO api.customer_warehouse (tenant_id, customer_id, display_name) VALUES (:moesa, :tho, 'W-T') $$, 'insert through the view');
SELECT lives_ok($$ DELETE FROM api.customer_warehouse WHERE display_name = 'W-T' $$, 'delete through the view');
SELECT throws_ok($$ UPDATE api.customer_platform_account SET api_connection = 'connected' WHERE id = :acct $$, '23514', 'platform_account_api_server_only', 'R6 holds through api');
SELECT is((SELECT s.code FROM api.product p, api.supplier(p) s WHERE p.id = :secret), 'TSP', 'R4: the supplier embed works with the right');
-- as elif in moesa (t_restricted)
SELECT throws_ok($$ UPDATE api.supplier SET deposit_rate = 0.3 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'S1: a correct guess on a supplier term is refused');
SELECT throws_ok($$ UPDATE api.supplier SET deposit_rate = 0.9 WHERE id = :tsp $$, '42501', 'field_write_forbidden', 'S1: a wrong guess is refused the same way');
SELECT is((SELECT count(*)::INT FROM api.product p, api.supplier(p) s WHERE p.id = :secret), 0, 'R4: a hidden supplier link embeds nothing');
SELECT is((SELECT count(*)::INT FROM api.supplier s, api.product_by_supplier(s) p WHERE s.id = :tsp), 0, 'R4: the reverse embed from supplier is empty');
SELECT lives_ok($$ UPDATE api.customer SET website = notes WHERE id = :tho $$, 'T6d copying a masked column …');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (`relation api.customer does not exist`).
- [ ] **Step 3: Implement**:
  ```sql
  SELECT private.enable_field_security(t) FROM unnest(ARRAY['customer','customer_brand','customer_contact','customer_platform_account','customer_warehouse','supplier','supplier_contact']) t;
  SELECT private.enable_field_security('product');
  ```
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for customers and suppliers"`

---

### Task 8: Purchase order and shipment group

**Files:**
- Create: `supabase/migrations/055_api_orders_shipments.sql`
- Test: `supabase/tests/database/055_api_orders_shipments.test.sql`

**Interfaces:**
- Produces:
  - Views `api.purchase_order`, `api.purchase_order_line`, `api.purchase_order_payment`, `api.purchase_order_update`, `api.shipment`, `api.shipment_event`, `api.shipment_line`, `api.shipment_purchase_order`.
  - Computed relationships `api.supplier(api.purchase_order)` (the app's `supplier!purchase_order_supplier_fkey` becomes `supplier`, Task 14) and `api.purchase_order_by_supplier(api.supplier)`.
  - `api.pi_document(api.purchase_order)` comes in Task 10.

- [ ] **Step 1: Write the failing test** (`plan(17)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- as elif in moesa (t_restricted)
SELECT results_eq($$ SELECT pi_total, pi_number, deposit_rate, incoterm, supplier_id, notes FROM api.purchase_order WHERE id = :po_draft $$,
   $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC, NULL::TEXT, NULL::UUID, NULL::TEXT) $$, 'PO cost, terms, supplier link and notes masked');
SELECT results_eq($$ SELECT unit_price, line_total, pi_line_total FROM api.purchase_order_line WHERE id = :line_draft $$, $$ VALUES (NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC) $$, 'line prices masked incl. the generated total');
SELECT is((SELECT amount FROM api.purchase_order_payment WHERE id = :payment), NULL, 'payment amount masked (finance)');
SELECT is((SELECT count(*)::INT FROM api.purchase_order WHERE supplier_id = :tsp), 0, 'filter on a masked FK reveals nothing');
SELECT is((SELECT count(*)::INT FROM api.purchase_order po, api.supplier(po) s WHERE po.id = :po_draft), 0, 'R4: supplier embed through the masked FK is empty');
SELECT is((SELECT count(*)::INT FROM api.supplier s, api.purchase_order_by_supplier(s) po WHERE s.id = :tsp), 0, 'R4: reverse embed from supplier is empty');
SELECT lives_ok($$ UPDATE api.purchase_order_line SET quantity = 12 WHERE id = :line_draft $$, 'quantity edits work without cost rights');
SELECT throws_ok($$ UPDATE api.purchase_order_line SET unit_price = 1 WHERE id = :line_draft $$, '42501', 'field_write_forbidden', 'unit price write refused');
SELECT throws_ok($$ UPDATE api.purchase_order_line SET unit_price = 12.5 WHERE id = :line_draft $$, '42501', 'field_write_forbidden', 'S1: a correct unit price guess is refused');
SELECT is(t.error_of($$ DELETE FROM api.purchase_order_line WHERE id = :line_approved $$), '23514:po_locked', 'R7 through api: a locked PO line delete is refused');
SELECT results_eq($$ SELECT incoterm_buy, notes FROM api.shipment WHERE id = :shp $$, $$ VALUES (NULL::TEXT, NULL::TEXT) $$, 'shipment terms and notes masked');
SELECT results_eq($$ SELECT from_party, to_party, note FROM api.shipment_event WHERE id = :shp_event $$, $$ VALUES (NULL::TEXT, NULL::TEXT, NULL::TEXT) $$, 'OD2: event parties masked (supplier_identity)');
SELECT throws_ok($$ INSERT INTO api.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate) VALUES (:moesa, :tho, :tsp, 'USD', 'FOB', 0.3) $$, '42501', 'field_write_forbidden', 'a PO needs supplier and terms write rights');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ DELETE FROM api.purchase_order WHERE id = :po_draft $$, 'a draft PO deletes through api, lines cascade');
SELECT results_eq($$ SELECT t.table_name, t.operation FROM public.audit_transaction t WHERE t.id = (SELECT l.transaction_id FROM public.audit_log l WHERE l.table_name = 'purchase_order' AND l.operation = 'DELETE' AND l.record_id = :po_draft ORDER BY l.id DESC LIMIT 1) $$,
   $$ VALUES ('purchase_order','DELETE') $$, 'audit depth through api names the parent');
-- as akif in moesa
SELECT results_eq($$ INSERT INTO api.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm, deposit_rate) VALUES (:moesa, :tho, :tsp, 'USD', 'FOB', 0.3) RETURNING code ~ '^PO-' $$,
   $$ VALUES (TRUE) $$, 'purchase_order_set_code runs through the forwarder');
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
- Produces: views `api.project`, `api.project_gate`, `api.project_product`, `api.project_task`, `api.market_cell`, `api.listing_submission`, `api.incident`, `api.incident_deadline`, `api.incident_log`, `api.change_request`, `api.change_request_product`.

- [ ] **Step 1: Write the failing test** (`plan(12)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- as portal in moesa
SELECT is((SELECT notes FROM api.project WHERE id = :project), NULL, 'project notes masked');
SELECT is((SELECT note FROM api.project_gate WHERE id = :gate), NULL, 'gate notes masked');
SELECT results_eq($$ SELECT root_cause_note, impact_note, lessons, affected_parties FROM api.incident WHERE id = :inc $$, $$ VALUES (NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::public.incident_party[]) $$, 'incident internals and parties masked');
SELECT is((SELECT what_happened FROM api.incident WHERE id = :inc), 'visible', 'CL §3.9: incident notice fields stay readable');
SELECT is((SELECT count(*)::INT FROM api.incident_log), 0, 'portal has no incident_log table access');
SELECT results_eq($$ SELECT cost_impact, decision_note FROM api.change_request WHERE id = :cr $$, $$ VALUES (99::NUMERIC, NULL::TEXT) $$, 'CL §3.8: CR cost impact readable, decision note masked');
SELECT is((SELECT notes FROM api.market_cell WHERE id = :cell), NULL, 'market cell notes masked');
-- as elif in moesa (t_restricted)
SELECT throws_ok($$ UPDATE api.market_cell SET listing_state = 'live' WHERE id = :cell $$, '23514', 'market_cell_listing_server_only', 'R6 through api');
SELECT is(t.error_of($$ DELETE FROM api.market_cell WHERE id = :live_cell $$), '23514:market_cell_delete_candidate_only', 'R7 through api');
SELECT throws_ok($$ INSERT INTO api.incident_log (tenant_id, incident_id, note, cost_amount) VALUES (:moesa, :inc, 'x', 10) $$, '42501', 'field_write_forbidden', 'internal note and finance write refused');
SELECT throws_ok($$ UPDATE api.project_gate SET note = 'gate secret' WHERE id = :gate $$, '42501', 'field_write_forbidden', 'S1: a correct gate note guess is refused');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration (11 tables).
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for projects, markets, incidents and change requests"`

---

### Task 10: Core, files and catalog tables, personal data (S5) and computed fields

**Files:**
- Create: `supabase/migrations/057_api_core.sql`
- Test: `supabase/tests/database/057_api_core.test.sql`

**Interfaces:**
- Produces:
  - `api.<t>` for `document`, `media`, `media_link`, `transfer`, `setting`, `tenant`, `tenant_user`, `tenant_owner`, `user`, `role`, `user_role`, `role_permission`, `permission`, `module`, `plan`, `plan_limit`, `plan_module`, `platform`, `subscription`, `task_template`, `amazon_product_type_definition`, `code_sequence`.
  - Read-only (`p_read_only => TRUE`, S7): `api.role_field_permission`, `api.field_class`, `api.field_group`.
  - This is every `public` table except `audit_log`/`audit_transaction` (Task 12).
  - Re-runs `enable_field_security` for `customer` and `purchase_order`, so `api.contract_document(api.customer)`, `api.pi_document(api.purchase_order)`, `api.customer_by_contract_document(api.document)` and `api.purchase_order_by_pi_document(api.document)` exist.
  - Computed fields with the names the app selects: `api.owned_via(api.user) RETURNS TEXT[]`, `api.managed_in(api.user) RETURNS UUID`, `api.status(api.subscription) RETURNS TEXT`. Each is a SQL wrapper calling the `public` function with the id, SECURITY DEFINER owned by `api_owner`.

- [ ] **Step 1: Write the failing test** (`plan(17)`):

```sql
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
SELECT is_empty($$ SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
   AND c.relname NOT IN ('audit_log','audit_transaction') AND to_regclass('api.' || c.relname) IS NULL $$, 'every business table has an api view');
SELECT ok(NOT has_column_privilege('authenticated', 'api.setting', 'key', 'UPDATE') AND has_column_privilege('authenticated', 'api.setting', 'value', 'UPDATE'), 'setting keeps its column grant on the view');
SELECT ok(NOT has_column_privilege('authenticated', 'api.tenant', 'parent_id', 'UPDATE'), 'tenant keeps its column grant on the view');
-- as koordinator in moesa
SELECT is((SELECT email FROM api.user WHERE id = :koordinator), 'koordinator@moesa-panel.test', 'a user reads their own e-mail');
SELECT is((SELECT email FROM api.user WHERE id = :akif), 'akif@moesa-panel.test', 'a colleague of a tenant holding the right is readable');
-- as portal in moesa
SELECT is((SELECT count(*)::INT FROM api.user WHERE id <> :portal AND email IS NOT NULL), 0, 'portal reads only its own e-mail');
-- as elif, impersonate_scope(elif, europe, ARRAY[europe, moesa]) (personal_data on user only in Europe via t_cost)
SELECT is((SELECT email FROM api.user WHERE id = :akif), 'akif@moesa-panel.test', 'S5: a member of Europe is readable');
SELECT is((SELECT email FROM api.user WHERE id = :koordinator), NULL, 'S5: a user only in another scope tenant stays masked');
-- as akif in moesa
SELECT throws_ok($$ UPDATE api.user SET phone = '+1' WHERE id = :koordinator $$, '42501', 'field_write_forbidden', 'no one writes another user''s phone');
SELECT lives_ok($$ SELECT api.owned_via(u), api.managed_in(u) FROM api.user u $$, 'computed fields owned_via and managed_in resolve on api.user');
SELECT ok(to_regprocedure('api.status(api.subscription)') IS NOT NULL, 'computed field status on api.subscription');
SELECT ok(to_regprocedure('api.pi_document(api.purchase_order)') IS NOT NULL AND to_regprocedure('api.contract_document(api.customer)') IS NOT NULL, 'R4 relationships to documents exist');
SELECT matches(t.error_of($$ INSERT INTO api.role_field_permission (role_id, resource_name, field, can_read, can_write) VALUES (:t_restricted, 'public.product', 'purchase_price', TRUE, TRUE) $$), '^42501:permission denied for view role_field_permission', 'S7: api.role_field_permission is read-only');
SELECT ok(NOT has_table_privilege('authenticated', 'api.role_field_permission', 'INSERT') AND NOT has_table_privilege('authenticated', 'api.role_field_permission', 'UPDATE') AND NOT has_table_privilege('authenticated', 'api.role_field_permission', 'DELETE'), 'S7: no write grant on the view');
-- as koordinator in moesa
SELECT is((SELECT count(*)::INT FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id WHERE r.tenant_id <> :moesa), 0, 'field rights of other tenants'' roles are invisible');
SELECT ok((SELECT count(*) > 0 FROM api.field_class WHERE class = 'sensitive'), 'the catalog is readable');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): api views for core, files and catalog tables"`

---

### Task 11: Derived views, invoker conversion (R8, C2), RPC checks (S1) and the definer inventory (S3)

**Files:**
- Create: `supabase/migrations/058_api_derived.sql`
- Test: `supabase/tests/database/058_api_derived.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.transfer_field_rights_required`)

**Interfaces:**
- Produces:
  - `api.<view>` for the derived views except `dashboard_notification_feed` (Task 12): `company_subscription`, `dashboard_change_request`, `dashboard_gate_pending`, `dashboard_incident`, `dashboard_market`, `dashboard_product_evidence`, `dashboard_purchase_order`, `dashboard_shipment`, `dashboard_task_due`, `incident_overview`, `market_cell_overview`, `media_library`, `product_evidence`, `product_with_evidence`, `purchase_order_overview`, `shipment_overview`, `tenant_member`.
    - Each is `security_invoker = true`, reads only `api.*` relations, and uses an explicit column list (no `t.*`). SELECT is granted to `authenticated`.
  - `private.purchase_order_figures`, restated as SECURITY INVOKER over `api.purchase_order_line` (masked `unit_price` → NULL totals).
  - R8 conversion: `ALTER FUNCTION … SECURITY DEFINER` + `OWNER TO api_owner` for `public.import_products(JSONB)`, `save_role`, `set_user_roles`, `pass_gate`, `rollback_gate`, `save_plan`, `set_primary_media`.
    - `gates_for` is IMMUTABLE and pure, so it stays.
    - `register_tenant` stays INVOKER: it is `service_role` only, and the service role keeps base grants (comment).
  - C2/S6: every converted definer and `transfer_check_files` returns rows re-read through `api` views. `DROP` + recreate with the same arguments:
    - `pass_gate`/`rollback_gate` → `RETURNS api.project_gate` (body ends `SELECT g.* INTO result FROM api.project_gate g WHERE g.id = gate_id`);
    - `set_primary_media` → `RETURNS api.media_link`;
    - `transfer_check_files` → `RETURNS api.transfer`.
    - Restore the original grants after the recreate.
  - S1 for RPCs: a converted RPC that stores a parameter into a sensitive field checks the write right **before any write**, by presence (non-NULL) not by comparison, and raises `field_write_forbidden`:
    - `pass_gate(note)` → `project_gate.note`;
    - `rollback_gate(reason)` → wherever the body stores it (read 021/032; if it stores into a sensitive field);
    - `import_products(rows)`: every row key mapping to a sensitive `product` field, where `supplier_code` maps to `supplier_id`.
  - S3 transfer gate. `public.transfer_customer`, `transfer_check_files` and `transfer_options` raise `transfer_field_rights_required` (`42501`) unless, for every table listed in `private.transfer_registry` and every sensitive field of `'public.' || table_name` in `public.field_class`, the caller holds read and write in the source and the target tenant (`private.field_tenants`). The gate is derived from the catalog, so a table added to the registry is covered without code changes.

- [ ] **Step 1: Write the failing test** (`plan(18)`). Before it, as postgres:
  - create role `t_no_notes` in MOESA LTD and MOESA Europe: management's permissions, plus `apply_field_defaults(…, 'management')`, then delete its `internal_note` rows;
  - `can@moesa-panel.test` joins both tenants with it.

```sql
SELECT is_empty($$ SELECT viewname FROM pg_views WHERE schemaname = 'api' AND definition ~ '\.\*' $$, 'no api view selects t.*');
SELECT is_empty($$ SELECT DISTINCT v.relname FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid JOIN pg_class v ON v.oid = r.ev_class
   JOIN pg_class t ON t.oid = d.refobjid WHERE v.relnamespace = 'api'::regnamespace
   AND v.relname NOT IN (SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p'))
   AND t.relnamespace = 'public'::regnamespace AND t.relkind IN ('r','p') $$, 'derived api views read only api relations');
-- as elif in moesa (t_restricted)
SELECT results_eq($$ SELECT purchase_price, notes FROM api.product_with_evidence WHERE id = :secret $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT) $$, 'T8b product_with_evidence is masked');
SELECT results_eq($$ SELECT system_total, supplier_code, pi_total FROM api.purchase_order_overview WHERE id = :po_approved $$, $$ VALUES (NULL::NUMERIC, NULL::TEXT, NULL::NUMERIC) $$, 'PO overview totals follow cost');
SELECT is((SELECT count(*)::INT FROM api.dashboard_purchase_order WHERE system_total IS NOT NULL OR supplier_code IS NOT NULL), 0, 'dashboard PO masked');
SELECT is((SELECT count(*)::INT FROM api.market_cell_overview WHERE notes IS NOT NULL), 0, 'market cell overview masked');
SELECT is((SELECT count(*)::INT FROM api.incident_overview WHERE root_cause_note IS NOT NULL), 0, 'incident overview masked');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"IMP-1","customer_code":"THO","purchase_price":5}]'::JSONB) $$, '42501', 'field_write_forbidden', 'import refuses columns the writer cannot write');
SELECT throws_ok($$ SELECT public.import_products('[{"sku":"IMP-2","customer_code":"THO","supplier_code":"TSP"}]'::JSONB) $$, '42501', 'field_write_forbidden', 'import refuses a supplier link the writer cannot write');
SELECT throws_ok($$ SELECT public.pass_gate(:gate, 'gate secret') $$, '42501', 'field_write_forbidden', 'S1: pass_gate refuses a note the caller cannot write, even a correct guess');
-- as portal in moesa
SELECT is((SELECT count(*)::INT FROM api.shipment_overview WHERE cardinality(purchase_order_codes) > 0), 0, 'shipment overview reveals no PO to the portal');
SELECT is((SELECT count(*)::INT FROM api.tenant_member WHERE email IS NOT NULL AND id <> :portal), 0, 'tenant_member masks colleagues'' personal data for portal');
-- as postgres
SELECT is((SELECT count(*)::INT FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef AND pg_get_userbyid(proowner) = 'api_owner'
   AND proname IN ('import_products','save_role','set_user_roles','pass_gate','rollback_gate','save_plan','set_primary_media')), 7, 'R8: the seven write RPCs are api_owner definers');
SELECT results_eq($$ SELECT p.proname::TEXT, pg_get_function_result(p.oid) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('pass_gate','rollback_gate','set_primary_media','transfer_check_files') ORDER BY 1 $$,
   $$ VALUES ('pass_gate','api.project_gate'),('rollback_gate','api.project_gate'),('set_primary_media','api.media_link'),('transfer_check_files','api.transfer') $$, 'C2: converted RPCs return api row types');
SELECT is_empty($$ SELECT p.proname FROM pg_proc p JOIN pg_type ty ON ty.oid = p.prorettype JOIN pg_class c ON c.oid = ty.typrelid
   WHERE p.pronamespace = 'public'::regnamespace AND c.relnamespace = 'public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
   AND EXISTS (SELECT 1 FROM public.field_class f WHERE f.resource_name = 'public.' || c.relname AND f.class = 'sensitive') $$,
   'no public function granted to authenticated returns a sensitive row type');
SELECT ok(NOT has_function_privilege('authenticated', 'public.listing_set_state(uuid, public.listing_state, jsonb, timestamptz, uuid)', 'EXECUTE'), 'listing service RPCs stay service-only');
-- as can in moesa (t_no_notes)
SELECT throws_ok($$ SELECT public.transfer_options(:moesa) $$, '42501', 'transfer_field_rights_required', 'S3: transfer needs every field of every copied table, incl. internal notes');
-- as akif in moesa
SELECT lives_ok($$ SELECT public.transfer_options(:moesa) $$, 'the transfer gate passes with every field right');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `058_api_derived.sql`. Copy each `public` view's current definition (find its latest migration with `grep -ln "VIEW public.<name>" supabase/migrations`), swap `public.<table>` for `api.<table>`, and expand `*`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): derived api views, masked RPC returns, catalog-driven transfer gate"`

---

### Task 12: Audit masking, transfer report masking (S4), actor/reverter and revert refusal (OD4, R8, R9, C3)

**Files:**
- Create: `supabase/migrations/059_api_audit.sql`
- Test: `supabase/tests/database/059_api_audit.test.sql`
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`errors.audit_revert_field_forbidden`, `audit_log.masked` = "changed")

**Interfaces:**
- Produces:
  - `private.mask_json_deep(p_data JSONB, p_tenant UUID, p_readable JSONB, p_sensitive JSONB) RETURNS JSONB` (`IMMUTABLE`, recursive over objects and arrays). A key `k` at any depth is replaced by `'{"masked": true}'::JSONB` when `k` is a sensitive field of some table in `p_sensitive` and at least one `'<table>.<k>'` for those tables is missing from `p_readable -> p_tenant::TEXT`. A NULL tenant masks every such key (fail closed).
  - `private.mask_audit_data(p_table TEXT, p_tenant UUID, p_data JSONB, p_readable JSONB, p_sensitive JSONB) RETURNS JSONB` (`IMMUTABLE`, jsonb operators):
    - a top-level key `k` in `p_sensitive -> p_table` and not in `p_readable -> p_tenant::TEXT` (as `'<table>.<k>'`) becomes `{"masked": true}`;
    - for `p_table = 'transfer'`, the `report` and `decisions` values go through `mask_json_deep`;
    - a NULL tenant masks every sensitive key.
  - `private.api_json_masked` rows `('public.transfer','report')`, `('public.transfer','decisions')`. Then re-run `enable_field_security('transfer')`, so `api.transfer.report` = `private.mask_json_deep(t.report, t.tenant_id, (SELECT private.field_rights_map()), (SELECT private.sensitive_fields_map()))`, likewise `decisions` (S4).
  - `api.audit_transaction` (owner `api_owner`, plain columns) and `api.audit_log` (owner `api_owner`). `old_data`/`new_data` = `private.mask_audit_data(l.table_name, l.tenant_id, l.old_data, (SELECT private.field_rights_map()), (SELECT private.sensitive_fields_map()))`, likewise for `new_data`. SELECT only.
  - `api.actor(api.audit_transaction) RETURNS SETOF api.user ROWS 1` and `api.reverter(…)`, SECURITY INVOKER over `api.user` (personal data masked per S5).
  - `api.dashboard_notification_feed`, restated from 010 over the `api` audit views and `api.user` with an explicit column list.
  - `public.revert_audit_transaction(transaction_id UUID)`, restated from 040 as SECURITY DEFINER owned by `api_owner`.
    - Before the loop it collects the **changed** sensitive keys of the transaction's `audit_log` rows (C3): for UPDATE the keys of `old_data` (UPDATE rows hold only changed keys there); for INSERT the non-NULL keys of `new_data`; for DELETE the non-NULL keys of `old_data`.
    - It raises `audit_revert_field_forbidden` (42501, DETAIL `<table>.<field>`) when `tenant_id <> ALL (private.field_write_tenants('public.' || table_name, key))` for any of them.
    - The conflict check still compares against base rows.

- [ ] **Step 1: Write the failing test** (`plan(17)`). Setup:
  1. As akif in moesa: `set_config('audit.transaction_id','',TRUE)`; `UPDATE api.product SET purchase_price = 13, notes = 'secret note 2' WHERE id = :secret`.
  2. `set_config('audit.transaction_id','',TRUE)`; `UPDATE api.product SET display_name = 'Renamed' WHERE id = :secret`.
  3. As akif with `impersonate_scope(akif, europe, ARRAY[europe])`: reset again; `UPDATE api.product SET purchase_price = 78 WHERE id = :spike_eu`.
  4. `private.unimpersonate()`. Store `test.tx_cost`, `test.tx_name`, `test.tx_eu` from `SELECT l.transaction_id FROM public.audit_log l WHERE l.record_id = <id> AND l.old_data ? '<key>' ORDER BY l.id DESC LIMIT 1` (keys `purchase_price`, `display_name`, `purchase_price`).
  5. Give MOESA LTD's `customer_viewer` `audit_log`/`audit_transaction` select (`role_permission`) for the actor tests.

```sql
-- as elif in moesa (t_restricted: audit read, no field rows)
SELECT is((SELECT new_data -> 'purchase_price' FROM api.audit_log WHERE transaction_id = :tx_cost), '{"masked": true}'::JSONB, 'OD4: a hidden field shows as changed, without the value');
SELECT is((SELECT old_data -> 'notes' FROM api.audit_log WHERE transaction_id = :tx_cost), '{"masked": true}'::JSONB, 'OD4: the old value is masked too');
SELECT is((SELECT new_data ->> 'sku' FROM api.audit_log WHERE transaction_id = :tx_name), 'SPIKE-SECRET', 'open keys pass');
SELECT is((SELECT count(*)::INT FROM api.audit_log WHERE (new_data ->> 'purchase_price') LIKE '13%'), 0, 'T10 audit filter oracle closed');
SELECT is((SELECT count(*)::INT FROM api.dashboard_notification_feed WHERE new_data ->> 'notes' LIKE 'secret%'), 0, 'notification feed masked');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT lives_ok($$ SELECT public.revert_audit_transaction(:tx_name) $$, 'C3: reverting an open-field change works for a restricted user');
SELECT set_config('audit.transaction_id', '', TRUE);
SELECT throws_ok($$ SELECT public.revert_audit_transaction(:tx_cost) $$, '42501', 'audit_revert_field_forbidden', 'revert refused when a changed field is not writable');
-- as elif, impersonate_scope(elif, moesa, ARRAY[moesa, europe]) (t_cost is unchanged here)
SELECT ok((SELECT new_data -> 'purchase_price' <> '{"masked": true}'::JSONB FROM api.audit_log WHERE transaction_id = :tx_eu)
   AND (SELECT new_data -> 'purchase_price' = '{"masked": true}'::JSONB FROM api.audit_log WHERE transaction_id = :tx_cost), 'audit keys masked per row tenant');
-- as portal in moesa
SELECT is((SELECT a.email FROM api.audit_transaction t, api.actor(t) a WHERE t.id = :tx_cost), NULL, 'R9: actor e-mail masked for a reader without personal_data');
-- as koordinator in moesa
SELECT is((SELECT a.email FROM api.audit_transaction t, api.actor(t) a WHERE t.id = :tx_cost), 'akif@moesa-panel.test', 'R9: internal readers see the actor');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.audit_log ORDER BY id DESC LIMIT 50'), 'R9: the rights map is an InitPlan');
-- as postgres (pure functions and catalog)
SELECT is(private.mask_audit_data('product', NULL, '{"sku":"A","purchase_price":1}'::JSONB, '{}'::JSONB, private.sensitive_fields_map()), '{"sku":"A","purchase_price":{"masked":true}}'::JSONB, 'a NULL tenant masks every sensitive key (fail closed)');
SELECT is(private.mask_json_deep('{"rows":[{"table":"product","row":{"sku":"A","purchase_price":5}}]}'::JSONB, :moesa, '{}'::JSONB, private.sensitive_fields_map()),
   '{"rows":[{"table":"product","row":{"sku":"A","purchase_price":{"masked":true}}}]}'::JSONB, 'S4: nested sensitive keys in a JSON report are masked');
SELECT is(private.mask_audit_data('transfer', :moesa, '{"report":{"row":{"purchase_price":5}}}'::JSONB, '{}'::JSONB, private.sensitive_fields_map()),
   '{"report":{"row":{"purchase_price":{"masked":true}}}}'::JSONB, 'S4: audit snapshots of transfer rows mask the report');
SELECT ok(pg_get_viewdef('api.transfer'::REGCLASS) LIKE '%mask_json_deep(t.report%' AND pg_get_viewdef('api.transfer'::REGCLASS) LIKE '%mask_json_deep(t.decisions%', 'S4: api.transfer masks report and decisions');
SELECT is((SELECT pg_get_userbyid(proowner)::TEXT FROM pg_proc WHERE oid = 'public.revert_audit_transaction(uuid)'::REGPROCEDURE), 'api_owner', 'R8: revert runs as api_owner');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `059_api_audit.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): masked audit history and transfer reports, guarded revert"`

---

### Task 13: Files row rule (R3)

**Files:**
- Create: `supabase/migrations/060_file_row_rule.sql`
- Test: `supabase/tests/database/060_file_row_rule.test.sql`

**Interfaces:**
- Consumes: `private.field_group_read_tenants` (Task 3), `private.can_read_media_file` (024).
- Produces:
  - RESTRICTIVE `SELECT` policy `document_field_groups` on `public.document`. Price documents are `pi`, `commercial_invoice`, `po` on any entity, and supplier `contract`:

```sql
(type NOT IN ('pi','commercial_invoice','po') AND NOT (type = 'contract' AND entity_type = 'supplier')
   OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_terms'))))
AND (entity_type NOT IN ('supplier','purchase_order')
   OR tenant_id = ANY ((SELECT private.field_group_read_tenants('supplier_identity'))))
```

  - The same second clause as policy `media_link_field_groups` on `public.media_link`.
  - `private.hidden_media_ids() RETURNS UUID[]` (STABLE, SECURITY DEFINER). The ids of scope media in a tenant outside the matching `field_group_read_tenants` that either have a `media_link` to `supplier`/`purchase_order`, or are the `media_id` of a document the first policy hides.
  - RESTRICTIVE `SELECT` policy `media_field_groups` on `public.media`: `NOT (id = ANY ((SELECT private.hidden_media_ids())))`.
  - `private.can_read_media_file(object_name)` restated. It also requires the second path segment to be a UUID not in `private.hidden_media_ids()`; a non-UUID segment → FALSE.
  - Comment: the enum has no "price list" or "supplier invoice" value; `pi`, `commercial_invoice`, `po` and supplier `contract` stand for them.

- [ ] **Step 1: Write the failing test** (`plan(11)`):

```sql
-- as portal in moesa
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = :pi_doc), 0, 'portal user cannot read a PI document');
SELECT is((SELECT count(*)::INT FROM api.media WHERE id = :pi_media), 0, '… its media');
SELECT is((SELECT count(*)::INT FROM storage.objects WHERE name = :pi_object::TEXT), 0, '… or its Storage object');
SELECT ok(NOT private.can_read_media_file(:pi_object::TEXT), 'the Storage helper refuses it');
SELECT is((SELECT count(*)::INT FROM api.media_link WHERE entity_type IN ('supplier','purchase_order')), 0, 'supplier/PO media links hidden');
SELECT is((SELECT count(*)::INT FROM api.media_library WHERE id = :supplier_media), 0, 'media_library hides supplier media');
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = :po_doc), 0, 'a po-type price document on any entity is hidden');
SELECT is((SELECT count(*)::INT FROM api.document WHERE id = :spec_doc), 1, 'other documents stay visible');
-- as koordinator in moesa (supplier_terms R, supplier_identity RW)
SELECT is((SELECT count(*)::INT FROM api.document WHERE id IN (:pi_doc, :po_doc)), 2, 'coordinator reads PI and PO documents');
SELECT ok(private.can_read_media_file(:pi_object::TEXT), 'coordinator reads the PI file');
SELECT ok(private.field_calls_only_in_initplans('SELECT * FROM api.media ORDER BY created_at DESC LIMIT 50'), 'hidden_media_ids is an InitPlan');
```

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Implement** `060_file_row_rule.sql`.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): file row rule for supplier and price documents"`

---

### Task 14: App switch to `api` (R11) with CASL field rules and masked rendering

**Files:**
- Modify: `app/package.json:10` (`dev:supabase-types` → `supabase gen types typescript --local --schema public,api > ../supabase/functions/_shared/database.types.ts`); regenerate the types file
- Modify: `app/src/lib/supabase.ts`, `app/src/@types/global.d.ts`
- Modify (RPC call sites `supabase.rpc(` → `publicSchema.rpc(`): `app/src/api/access.ts`, `account/memberships.ts`, `admin/index.ts`, `auditLog.ts`, `branch/index.ts`, `media/index.ts`, `product/import.ts`, `project/index.ts`, `role/index.ts`, `transfer/index.ts`, `user/index.ts`
- Modify: `app/src/api/purchaseOrder/index.ts:213` (`supplier!purchase_order_supplier_fkey(…)` → `supplier(…)`)
- Modify: `app/src/api/purchaseOrder/index.ts:453` (`unit_price: required(z.number().min(0))` → `z.number().min(0).nullable()`; the line form requires it only when `canWrite('unit_price')`), and every other zod form schema field that is sensitive (`grep -n` the 84 field names in `app/src/api/*/index.ts`)
- Modify: `app/src/api/saveRow.ts` (drop fields the ability forbids writing), `app/src/plugins/casl/index.ts`, `app/src/api/access.ts`, `app/src/store/auth/index.ts:93`
- Create: `app/src/composables/useFieldAccess.ts`
- Modify: the forms and tables under `app/src/views/pages/ops/{product,customer,supplier,purchaseOrder,shipment,incident,project,changeRequest,document}/` that show sensitive fields
- Test: `app/tests/lib/supabase.test.ts` (create), `app/tests/plugins/casl.test.ts`, `app/tests/composables/useFieldAccess.test.ts` (create), `app/tests/api/saveRow.test.ts`, `app/tests/api/models.test.ts`

**Interfaces:**
- Consumes: `my_access.fields` (Task 3), the `api` views (Tasks 6–13). `api` is already exposed locally (Task 6, C4).
- Produces:
  - `export const supabase = createClient<Db, 'api'>(url, key, { ...supabaseOptions, db: { schema: 'api' } })`.
  - `export const publicSchema = supabase.schema('public')` for every RPC.
  - `global.d.ts`: `type Api = Db['api'] & {}`, `type Views = Api['Views']`, and `type Tables = { [K in keyof Api['Views']]: { Row: Api['Views'][K]['Row']; Insert: Partial<Api['Views'][K]['Row']>; Update: Partial<Api['Views'][K]['Row']> } }`. Use the generated `Insert`/`Update` instead if the generator emits them for the trigger-updatable views. `Public` stays, for RPC types.
  - `export type FieldRight = { resource_name: string; field: string; can_read: boolean; can_write: boolean }`; `Access.fields: FieldRight[]`; `Tenant.fields?: FieldRight[]`.
  - `toAbilityRules(permissions: PermissionClaim[] = [], fields: FieldRight[] = [])` and `createAbility(permissions?, fields?)`. After the permission rules, append inverted rules:
    - `{ action: 'select', subject, fields: [field], inverted: true }` when `!can_read`;
    - `{ action: 'update', … }` and `{ action: 'insert', … }` when `!can_write`.
  - `useFieldAccess(table: string): { canRead(field: string): boolean; canWrite(field: string): boolean }`, backed by `ability.can`.
  - `saveRow`/`updateRow` drop every key `k` with `ability.cannot(id ? 'update' : 'insert', table, k)` before sending. The server enforces anyway.
  - Forms: an unreadable field is not rendered; a readable, unwritable field is `readonly`. Tables: columns whose field is unreadable are dropped.

- [ ] **Step 1: Write the failing tests**

```ts
// app/tests/lib/supabase.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const calls: { url: string; headers: Headers; body?: string }[] = [];
beforeEach(() => {
   setActivePinia(createPinia());
   calls.length = 0;
   vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init.headers), body: init.body as string });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
   }));
});

describe('supabase client', () => {
   it('sends table requests with Accept-Profile api', async () => {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('product').select('id');
      expect(calls[0].url).toContain('/rest/v1/product');
      expect(calls[0].headers.get('Accept-Profile')).toBe('api');
   });
   it('sends RPCs to the public schema', async () => {
      const { publicSchema } = await import('@/lib/supabase');
      await publicSchema.rpc('my_access', {});
      expect(calls[0].url).toContain('/rest/v1/rpc/my_access');
      expect(calls[0].headers.get('Content-Profile')).toBe('public');
   });
});

// app/tests/plugins/casl.test.ts (added cases)
it('denies reading a field without can_read', () => {
   const a = createAbility(
      [{ command: 'select', resource_name: 'public.product' }],
      [{ resource_name: 'public.product', field: 'purchase_price', can_read: false, can_write: false }]
   );
   expect(a.can('read', 'product', 'purchase_price')).toBe(false);
   expect(a.can('read', 'product', 'sku')).toBe(true);
   expect(a.can('read', 'product')).toBe(true);
});
it('allows reading but not updating with can_read only', () => {
   const a = createAbility(
      [{ command: 'select', resource_name: 'public.supplier' }, { command: 'update', resource_name: 'public.supplier' }],
      [{ resource_name: 'public.supplier', field: 'deposit_rate', can_read: true, can_write: false }]
   );
   expect(a.can('read', 'supplier', 'deposit_rate')).toBe(true);
   expect(a.can('update', 'supplier', 'deposit_rate')).toBe(false);
   expect(a.can('update', 'supplier', 'city')).toBe(true);
});

// app/tests/composables/useFieldAccess.test.ts
it('reflects the ability', () => {
   ability.update(toAbilityRules(
      [{ command: 'select', resource_name: 'public.product' }, { command: 'update', resource_name: 'public.product' }],
      [{ resource_name: 'public.product', field: 'notes', can_read: true, can_write: false }]
   ));
   const { canRead, canWrite } = useFieldAccess('product');
   expect(canRead('notes')).toBe(true);
   expect(canWrite('notes')).toBe(false);
   expect(canWrite('display_name')).toBe(true);
});

// app/tests/api/saveRow.test.ts (added case; the existing builder mock records calls)
it('drops fields the user may not write', async () => {
   ability.update(toAbilityRules(
      [{ command: 'update', resource_name: 'public.product' }],
      [{ resource_name: 'public.product', field: 'purchase_price', can_read: false, can_write: false }]
   ));
   await saveRow('product', { id: 'p1', display_name: 'A', purchase_price: null });
   expect(calls[0]).toEqual({ method: 'update', args: [{ display_name: 'A' }] });
});

// app/tests/api/models.test.ts (added case)
it('accepts a PO line whose unit price is masked', () => {
   expect(() => purchaseOrderLineSchema.parse({ product_id: 'p1', quantity: 1, unit_price: null })).not.toThrow();
});
```

- [ ] **Step 2: Run** `cd app && pnpm vitest run tests/lib/supabase.test.ts tests/plugins/casl.test.ts tests/composables/useFieldAccess.test.ts tests/api/saveRow.test.ts tests/api/models.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**:
  1. Run `cd supabase && supabase db reset`, then `cd app && pnpm dev:supabase-types`.
  2. Switch the client, the call sites, the hint, zod, CASL, `saveRow` and the forms/tables. `ResourceTable` callers that pass a table or view name get column filtering through `useFieldAccess`.
  3. Add any other sensitive field of a `required(...)` schema to `models.test.ts` the same way.
- [ ] **Step 4: Run** `cd app && pnpm test && pnpm typecheck && pnpm lint`. Expected: all PASS, 0 errors.
- [ ] **Step 5: Commit** `git commit -m "feat(app): read tables through api, CASL field rules, masked fields"`

---

### Task 15: Edge Functions on `api` types, projected service reads (S4c)

**Files:**
- Modify: `supabase/functions/_shared/supabaseClient.ts` (user client `db: { schema: 'api' }`; RPCs `.schema('public').rpc`)
- Modify (user-client RPC call sites → `.schema('public')`): `supabase/functions/_shared/auth.ts:58`, `amazon-auth/index.ts:150`, `amazon-listing/index.ts:303,450`
- Modify (service-role `select('*')` → column constants): `supabase/functions/amazon-listing/index.ts:151-210`, `_shared/listingStatus.ts:132,149`
- Modify: `supabase/functions/user/index.ts:52-59` (`getUser`: read the member through `supabaseClient(req).from('user').select(USER_COLUMNS)` on `api`, not `auth.admin.getUserById`; export `getUser`)
- Test: `supabase/functions/tests/amazon_listing_test.ts`, `supabase/functions/tests/user_test.ts` (create), `supabase/functions/tests/auth_test.ts`

**Interfaces:**
- Produces:
  - `export const PRODUCT_LISTING_COLUMNS = 'id, tenant_id, customer_id, parent_id, sku, display_name, variant_label, brand, gtin, amazon_product_type, amazon_schema_version, listing_attributes'` in `amazon-listing/listing.ts`, plus any further open column the listing body reads.
  - `export const MARKET_CELL_LISTING_COLUMNS` in `_shared/listingStatus.ts`: the open columns the derivation reads, never `notes`.
  - `export const USER_COLUMNS = 'id, email, phone, user_metadata, created_at'` in `user/index.ts`. Values come masked from `api.user`.
  - The admin client stays on `public` with explicit columns; its upsert on `amazon_product_type_definition` stays (R11). `create-account` returns only the registrant's own id/e-mail and the new tenant's id/name (unchanged; asserted).

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/tests/amazon_listing_test.ts (added)
const SENSITIVE = ['purchase_price','purchase_currency','purchase_incoterm','landed_cost_eur','landed_cost_on','target_price_eur',
   'company_price_eur','price_list_version','supplier_id','supplier_product_code','manufacturer_art_no','notes'];
Deno.test('amazon-listing selects no sensitive product or cell column', () => {
   const product = PRODUCT_LISTING_COLUMNS.split(',').map((s) => s.trim());
   const cell = MARKET_CELL_LISTING_COLUMNS.split(',').map((s) => s.trim());
   for (const c of SENSITIVE) assert(!product.includes(c), c);
   assert(!cell.includes('notes'));
});
Deno.test('amazon-listing response carries no sensitive key', async () => {
   const fullRow = { id: 'p1', sku: 'S', purchase_price: 12.5, notes: 'secret note', supplier_id: 's1' };
   const res = await runCheckWithServiceRows({ product: fullRow }); // the existing test harness of this file, returning the Response
   const body = JSON.stringify(await res.json());
   for (const c of SENSITIVE) assert(!body.includes(`"${c}"`), c);
   assert(!body.includes('secret note'));
});
// supabase/functions/tests/auth_test.ts (added)
Deno.test('the user client reads the api schema', async () => {
   const seen: Headers[] = [];
   const restore = stubFetch((_url, init) => { seen.push(new Headers(init?.headers)); return new Response('[]'); });
   try { await supabaseClient(new Request('http://x', { headers: { Authorization: 'Bearer t' } })).from('product').select('id'); }
   finally { restore(); }
   assertEquals(seen[0].get('Accept-Profile'), 'api');
});
// supabase/functions/tests/user_test.ts
Deno.test('getUser reads the member through api and never through the admin API', async () => {
   const urls: string[] = [];
   const restore = stubFetch((url) => { urls.push(String(url));
      return new Response(JSON.stringify({ id: 'u2', email: null, phone: null, user_metadata: null, created_at: 'x' }), { headers: { 'Content-Type': 'application/json' } }); });
   try {
      const res = await getUser(authorizedRequest(['select', 'user']), 'u2');
      const body = await res.json();
      assertEquals(body.email, null);
   } finally { restore(); }
   assert(!urls.some((u) => u.includes('/auth/v1/admin/users/')));
   assert(urls.some((u) => u.includes('/rest/v1/user')));
});
```

`stubFetch` and `authorizedRequest` are the helpers the existing tests use for mocked fetch and for a caller with permissions (`tests/auth_test.ts`). If `runCheckWithServiceRows` does not exist under that name, it is the file's existing call into the `check` action with a mocked service client: rename to match.

- [ ] **Step 2: Run** `cd supabase/functions && deno task test`. Expected: FAIL.
- [ ] **Step 3: Implement** the changes in Files.
- [ ] **Step 4: Run** `cd supabase/functions && deno task check && deno task test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(functions): user clients on api, projected service reads"`

---

### Task 16: Role editor field toggles

**Files:**
- Create: `app/src/components/service-components/select-permissions/SelectFieldPermissions.vue`
- Modify: `app/src/components/service-components/select-permissions/index.ts` (export it)
- Modify: `app/src/api/role/index.ts` (embed, schema, payload) and the role form under `app/src/views/pages/branch/role/` (render it below `SelectPermissions`)
- Modify: `app/src/plugins/i18n/locales/*/index.json` (`component.select_field_permission.{read,write,all}`, `fields.field_group.<id>` for the 9 groups)
- Test: `app/tests/components/SelectFieldPermissions.test.ts` (create), `app/tests/api/role.test.ts` (create)

**Interfaces:**
- Consumes: `api.field_class`, `api.field_group`, `api.role_field_permission` (read-only), `public.save_role(…, field_rights)`.
- Produces:
  - `export type FieldRightInput = { resource_name: string; field: string; can_read: boolean; can_write: boolean }`.
  - `RoleWithPermissions.role_field_permission: FieldRightInput[]` (embed `role_field_permission(resource_name, field, can_read, can_write)`).
  - `RoleInput.fieldRights: FieldRightInput[]`, sent as `field_rights`.
  - `roleSchema.field_rights: z.array(z.object({ resource_name: z.string(), field: z.string(), can_read: z.boolean(), can_write: z.boolean() }))`.
  - `SelectFieldPermissions.vue`:
    - `v-model` of `FieldRightInput[]` and a `readonly` attribute; data from `useLookup('field_class', { select: 'resource_name,field,class,group_name' })`, filtered to `class === 'sensitive'`.
    - One expandable row per resource. Inside, the fields are grouped by group in `field_group.position` order, with Read and Write columns.
    - Each checkbox is a `PermissionCheckbox` with the `stateOf`/`toggle` tri-state of `SelectPermissions.vue`. Test ids: `data-test="field-group-<resource>-<group>-<read|write>"` and `data-test="field-<resource>-<field>-<read|write>"`.
    - Write on implies read on; read off clears write.

- [ ] **Step 1: Write the failing tests** (mount as `tests/components/SelectPermissions.test.ts` does, with `useLookup` mocked to return the product rows below)

```ts
const FIELDS = [
   { resource_name: 'public.product', field: 'purchase_price', class: 'sensitive', group_name: 'cost' },
   { resource_name: 'public.product', field: 'landed_cost_eur', class: 'sensitive', group_name: 'cost' },
   { resource_name: 'public.product', field: 'company_price_eur', class: 'sensitive', group_name: 'sell_price' },
   { resource_name: 'public.product', field: 'notes', class: 'sensitive', group_name: 'internal_note' },
   { resource_name: 'public.product', field: 'sku', class: 'open', group_name: null }
];
it('lists only sensitive product fields, grouped', async () => {
   const w = await mountWith([]);
   expect(w.find('[data-test="field-group-public.product-cost-read"]').exists()).toBe(true);
   expect(w.find('[data-test="field-public.product-sku-read"]').exists()).toBe(false);
});
it('group read toggle selects every field of the group', async () => {
   const w = await mountWith([]);
   await w.find('[data-test="field-group-public.product-cost-read"]').trigger('click');
   expect(model.value).toEqual([
      { resource_name: 'public.product', field: 'purchase_price', can_read: true, can_write: false },
      { resource_name: 'public.product', field: 'landed_cost_eur', can_read: true, can_write: false }
   ]);
});
it('shows some when part of a group is selected', async () => {
   const w = await mountWith([{ resource_name: 'public.product', field: 'purchase_price', can_read: true, can_write: false }]);
   expect(w.find('[data-test="field-group-public.product-cost-read"]').attributes('data-state')).toBe('some');
});
it('write implies read, and read off clears write', async () => {
   const w = await mountWith([]);
   await w.find('[data-test="field-public.product-notes-write"]').trigger('click');
   expect(model.value).toEqual([{ resource_name: 'public.product', field: 'notes', can_read: true, can_write: true }]);
   await w.find('[data-test="field-public.product-notes-read"]').trigger('click');
   expect(model.value).toEqual([]);
});
// app/tests/api/role.test.ts
it('toRolePayload sends field rights', () => {
   const payload = toRolePayload({ id: 'r1', display_name: 'R', permission: [{ id: 'p1' }],
      field_rights: [{ resource_name: 'public.product', field: 'notes', can_read: true, can_write: false }] });
   expect(payload.fieldRights).toEqual([{ resource_name: 'public.product', field: 'notes', can_read: true, can_write: false }]);
});
```

`mountWith(initial)` mounts the component with `v-model` bound to the `model` ref, as `SelectPermissions.test.ts` does. `PermissionCheckbox` exposes its state as `data-state` (`all`/`some`/`none`); add that attribute if it is missing.

- [ ] **Step 2: Run** `cd app && pnpm vitest run tests/components/SelectFieldPermissions.test.ts tests/api/role.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component, the API changes and the form wiring.
- [ ] **Step 4: Run** `cd app && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(app): per-field read/write toggles in the role editor"`

---

### Task 17: Exports, pg_graphql and Realtime

**Files:**
- Create: `supabase/migrations/061_disable_graphql.sql`
- Test: `supabase/tests/database/061_disable_graphql.test.sql`
- Modify: `supabase/config.toml:13` (`schemas = ["public", "api"]`, dropping `graphql_public`)
- Modify: `app/src/api/product/csv.ts`, `app/src/views/pages/ops/product/Index.vue`
- Test: `app/tests/api/productCsv.test.ts`

**Interfaces:**
- Produces:
  - `DROP EXTENSION IF EXISTS pg_graphql CASCADE`.
  - `S10_FIELD_OF: Record<(typeof S10_COLUMNS)[number], string | null>` next to `S10_COLUMNS`: the CSV header → product field (`tedarikci_kodu` → `supplier_id`, `tedarikci_urun_kodu` → `supplier_product_code`, `art_no` → `manufacturer_art_no`, and the price headers to their fields; `null` for headers without a field).
  - `toCsv(rows, { canRead }: { canRead(field: string): boolean })` drops the headers whose field `!canRead`.
  - `parseCsv(text, { canWrite }: { canWrite(field: string): boolean })` returns `errors: [{ row: 0, field: <header>, code: 'csv_column_not_writable' }]` when a non-empty value sits in a column whose field `!canWrite`. The server refuses anyway (Task 11).

- [ ] **Step 1: Write the failing tests**

```sql
SELECT plan(2);
SELECT hasnt_extension('pg_graphql', 'pg_graphql is disabled (T14)');
SELECT is_empty($$ SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname IN ('public','api') $$, 'no business table is in the Realtime publication (T13)');
```

```ts
const ROW = { sku: 'S1', display_name: 'A', supplier_product_code: 'SPC-1', purchase_price: 12.5 };
it('drops columns the reader cannot read from the export', () => {
   const header = toCsv([ROW], { canRead: (f) => !['purchase_price', 'supplier_product_code'].includes(f) }).split('\n')[0];
   expect(header).not.toContain('tedarikci_urun_kodu');
   expect(header).toContain('sku');
});
it('refuses an import that fills a column the writer cannot write', () => {
   const text = `${S10_COLUMNS.join(',')}\n` + S10_COLUMNS.map((c) => (c === 'sku' ? 'S1' : c === 'tedarikci_urun_kodu' ? 'SPC-9' : '')).join(',');
   const result = parseCsv(text, { canWrite: (f) => f !== 'supplier_product_code' });
   expect(result.errors).toContainEqual({ row: 0, field: 'tedarikci_urun_kodu', code: 'csv_column_not_writable' });
});
it('accepts the same import with the right', () => {
   const text = `${S10_COLUMNS.join(',')}\n` + S10_COLUMNS.map((c) => (c === 'sku' ? 'S1' : '')).join(',');
   expect(parseCsv(text, { canWrite: () => true }).errors).toEqual([]);
});
```

- [ ] **Step 2: Run** `cd app && pnpm test:db` and `cd app && pnpm vitest run tests/api/productCsv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, including `errors.csv_column_not_writable` in all locales. Existing `toCsv`/`parseCsv` callers pass `useFieldAccess('product')`.
- [ ] **Step 4: Run** both commands, then `cd app && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): field-aware exports, pg_graphql off, realtime check"`

---

### Task 18: Move the user-side pgTAP statements to `api`

**Files:**
- Modify: every `supabase/tests/database/*.test.sql` **except** `048`, `050`, `051`, `052` and `053`. Those test base-table or forwarder behaviour on purpose and are updated in Task 19 (C5).
- Create: `scripts/pgtap-to-api.mjs` (one-off rewriter, deleted in Task 21)

**Interfaces:**
- Produces: the same assertions, run against `api.<table>`/`api.<view>` wherever a statement runs as an impersonated user. Setup and checks run as postgres (after `RESET ROLE` or `private.unimpersonate()`) keep `public.<table>`; `t.peek` stays.

- [ ] **Step 1:** Write `scripts/pgtap-to-api.mjs`.
  - It reads the view list with `docker exec supabase_db_moesa-panel psql -U postgres -Atc "SELECT relname FROM pg_class WHERE relnamespace = 'api'::regnamespace AND relkind = 'v'"`.
  - In each test file outside the excluded five, for statements between `private.impersonate(` / `private.impersonate_scope(` and the next `RESET ROLE` / `private.unimpersonate()`, it rewrites `public.<name>` to `api.<name>` when `<name>` is in that list.
  - It prints each changed file with its count of replacements.
- [ ] **Step 2:** Run `node scripts/pgtap-to-api.mjs`, then `cd app && pnpm test:db`. Expected: PASS (the base tables are still granted, so a rewrite mistake shows as a behaviour difference).
- [ ] **Step 3:** Review each failure:
  - An expected difference gets a one-line comment in the test: an error code now raised by the forwarder, or a masked value where the old test read a field the actor no longer reads.
  - Anything else is a bug in Tasks 6–13: fix it there with a new assertion in that task's test.
- [ ] **Step 4: Run** `cd app && pnpm test:db`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "test(db): run user-side pgTAP statements through api"`

---

### Task 19: Cutover: close the base tables (R2)

**Files:**
- Create: `supabase/migrations/062_field_security_cutover.sql`
- Test: `supabase/tests/database/062_field_security_cutover.test.sql`
- Modify (C5):
  - `048_…test.sql`: assertion 4 becomes `ok(NOT has_table_privilege('authenticated', 'public.product', 'SELECT'), 'the cutover closed SELECT')`.
  - `050_…test.sql`: the four S7 direct-write assertions run after `SET LOCAL ROLE api_owner`, the role a definer path writes as.
  - `051_…test.sql`: every user statement on `public.*` runs after `SET LOCAL ROLE api_owner`, which keeps the user's claims and has base grants. The guard is request-identity driven, so the expected results are unchanged.
  - `053_…test.sql`: assertion 7 becomes `ok(NOT has_table_privilege('authenticated', 'public.product', 'SELECT'), 'base closed after the cutover')`, plus T8c below. `plan(36)` becomes `plan(37)`.
  - `052` needs no change: its temporary forwarders hold their own grants.
- Modify: `.github/workflows/ci.yml` (staging: expose `api` before `supabase db reset --linked`), `supabase/README.md` (production steps)

**Interfaces:**
- Produces:
  - `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (tables and the 18 `public` views).
  - `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`.
  - `service_role` and `api_owner` keep their grants. Function EXECUTE grants are unchanged.
  - CI step "Expose the api schema on staging": `curl -fsS -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json' "https://api.supabase.com/v1/projects/$STAGING_PROJECT_REF/postgrest" --data '{"db_schema":"public,api"}'`.
  - README "Field-level permissions (062)":
    1. before `supabase db push`, set Dashboard → Settings → API → Exposed schemas to `public, api` (or the same PATCH);
    2. push 048–062 in one go;
    3. deploy the app in the same window; open tabs must reload (a stale bundle gets 42501).

- [ ] **Step 1: Write the failing tests.** `062_field_security_cutover.test.sql` (`plan(9)`):

```sql
SELECT is_empty($$ SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon','authenticated') $$, 'no public relation grants anything to anon or authenticated');
SELECT is_empty($$ SELECT 1 FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclrole = 'postgres'::regrole
   AND d.defaclobjtype = 'r' AND EXISTS (SELECT 1 FROM unnest(d.defaclacl) a WHERE a::TEXT ~ '^(anon|authenticated)=') $$, 'new public tables grant nothing to anon/authenticated');
SELECT ok(has_table_privilege('service_role', 'public.product', 'SELECT') AND has_table_privilege('service_role', 'public.product', 'UPDATE'), 'the service role keeps the base');
SELECT is_empty($$ SELECT * FROM private.api_view_drift() $$, 'api_view_drift() is empty');
-- as koordinator in moesa
SELECT matches(t.error_of($$ SELECT 1 FROM public.product LIMIT 1 $$), '^42501:permission denied for table product', 'T8c direct base table refused');
SELECT matches(t.error_of($$ SELECT 1 FROM public.product_with_evidence LIMIT 1 $$), '^42501:permission denied for view product_with_evidence', 'old public views refused');
SELECT lives_ok($$ SELECT * FROM api.product_with_evidence LIMIT 1 $$, 'api views work after the cutover');
SELECT is((SELECT note FROM public.pass_gate(:gate, NULL)), 'gate secret', 'converted RPCs work after the cutover and return what the caller may read');
SELECT ok(private.can_read_media_file(:pi_object::TEXT), 'Storage reads still work for an internal user');
```

  Add T8c to `053` (as elif): `SELECT matches(t.error_of($$ SELECT purchase_price FROM public.product LIMIT 1 $$), '^42501:permission denied for table product', 'T8c the base table is refused');`.

- [ ] **Step 2: Run** `cd app && pnpm test:db`. Expected: FAIL (the grants are still there).
- [ ] **Step 3: Implement** the migration, the test edits, the CI step and the README.
- [ ] **Step 4: Run** `cd app && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint` and `cd supabase/functions && deno task test`. Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(security): close the base tables; api is the only data path"`

---

### Task 20: HTTP attack suite and performance budget (R10, R12)

**Files:**
- Create: `supabase/functions/http-tests/helpers.ts`, `supabase/functions/http-tests/field_security_http_test.ts`, `supabase/functions/scripts/field_perf_http.ts`
- Create: `supabase/tests/perf/field_security_perf.sql`, `supabase/tests/perf/field_security_perf_load.sql`, `supabase/tests/perf/http_baseline.json`, `scripts/field-security-perf.mjs`
- Modify: `supabase/functions/deno.json` (`"test:http": "deno test --allow-env --allow-net --allow-read http-tests/"`, `"perf:http": "deno run --allow-env --allow-net --allow-read scripts/field_perf_http.ts"`)
- Modify: `app/package.json` (`"perf:fields": "node ../scripts/field-security-perf.mjs"`)
- Modify: `.github/workflows/ci.yml` (database job: `denoland/setup-deno@v2`, then after `supabase test db`: `eval "$(supabase status -o env | sed 's/^/export /')"` and `cd supabase/functions && deno task test:http`)

**Interfaces:**
- Produces (`helpers.ts`):
  - `signIn(email: string): Promise<string>` (demo password, `POST /auth/v1/token?grant_type=password`).
  - `rest(token: string, path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; profile?: 'api' | 'public' }): Promise<{ status: number; body: any; headers: Headers }>`. It sets `Accept-Profile` (and `Content-Profile` on writes) from `profile`, default `api`.
  - `admin(path, init)`: the same with the service key.
  - `adminSetup(): Promise<Fixture>` / `adminTeardown(f: Fixture)`. These use the service key and the GoTrue admin API.
    - `http-restricted@moesa-panel.test` joins MOESA LTD with role `http_restricted`: product/customer/purchase_order select/insert/update, no field rows.
    - `http-mixed@moesa-panel.test` joins MOESA LTD with `management` and MOESA Europe with role `http_no_cost` (management permissions; `apply_field_defaults(…, 'management')` minus `cost` rows), via `save_role` as the owner `baris` or by service inserts.
    - Products `HTTP-SECRET` (MOESA LTD, `purchase_price 12.5`, `notes 'secret note'`, supplier set) and `HTTP-EU` (Europe, `purchase_price 77.7`).
  - `Fixture = { restricted: string; mixed: string; portal: string; secretId: string; euId: string; moesa: string; europe: string }` (tokens and ids).
  - Env: `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` (`supabase status -o env`). The suite throws at load unless `API_URL` starts with `http://127.0.0.1` or `http://localhost`.

- [ ] **Step 1: Write the HTTP tests**

```ts
let f: Fixture;
Deno.test({ name: 'setup', fn: async () => { f = await adminSetup(); } });
const h = (t: string) => ({ 'x-tenant-id': f.moesa });

Deno.test('masked read returns null', async () => {
   const r = await rest(f.restricted, `product?id=eq.${f.secretId}&select=purchase_price,notes`, { headers: h('') });
   assertEquals(r.body, [{ purchase_price: null, notes: null }]);
});
Deno.test('filter oracle returns nothing', async () => {
   const r = await rest(f.restricted, `product?id=eq.${f.secretId}&purchase_price=gt.0`, { headers: h('') });
   assertEquals(r.body, []);
});
Deno.test('order by a masked field does not reorder', async () => {
   const a = await rest(f.restricted, 'product?select=id&order=purchase_price.desc,id', { headers: h('') });
   const b = await rest(f.restricted, 'product?select=id&order=id', { headers: h('') });
   assertEquals(a.body, b.body);
});
Deno.test('count with a masked filter is zero', async () => {
   const r = await rest(f.restricted, 'product?purchase_price=gt.0&select=id', { headers: { ...h(''), Prefer: 'count=exact' } });
   assertEquals(r.headers.get('content-range'), '*/0');
});
Deno.test('R4 supplier embed is null', async () => {
   const r = await rest(f.restricted, `product?id=eq.${f.secretId}&select=sku,supplier(code)`, { headers: h('') });
   assertEquals(r.body, [{ sku: 'HTTP-SECRET', supplier: null }]);
});
Deno.test('every app select string resolves', async () => {
   for (const [path, select] of APP_SELECTS) { // the select strings used by app/src (grep list, Task 14)
      const r = await rest(f.restricted, `${path}?select=${encodeURIComponent(select)}&limit=1`, { headers: h('') });
      assertEquals(r.status, 200, `${path} ${select}`);
   }
});
Deno.test('write to a masked field is refused (wrong and correct guess)', async () => {
   for (const v of [1, 12.5]) {
      const r = await rest(f.restricted, `product?id=eq.${f.secretId}`, { method: 'PATCH', body: { purchase_price: v }, headers: h('') });
      assertEquals(r.status, 403);
      assertEquals(r.body.code, '42501');
      assertEquals(r.body.message, 'field_write_forbidden');
   }
});
Deno.test('return=representation is masked', async () => {
   const r = await rest(f.restricted, `product?id=eq.${f.secretId}`, { method: 'PATCH', body: { display_name: 'y' }, headers: { ...h(''), Prefer: 'return=representation' } });
   assertEquals(r.body[0].purchase_price, null);
   assertEquals(r.body[0].notes, null);
});
Deno.test('PATCH filtered on a masked field affects nothing', async () => {
   const r = await rest(f.restricted, 'product?purchase_price=lt.100', { method: 'PATCH', body: { display_name: 'z' }, headers: { ...h(''), Prefer: 'return=representation' } });
   assertEquals(r.body, []);
});
Deno.test('POST and DELETE with representation are masked', async () => {
   const p = await rest(f.restricted, 'product', { method: 'POST', body: { customer_id: f.thoId, sku: 'HTTP-NEW' }, headers: { ...h(''), Prefer: 'return=representation' } });
   assertEquals(p.body[0].purchase_price, null);
   const d = await rest(f.restricted, `product?id=eq.${p.body[0].id}`, { method: 'DELETE', headers: { ...h(''), Prefer: 'return=representation' } });
   assertEquals(d.body[0].sku, 'HTTP-NEW');
   assertEquals(d.body[0].notes, null);
});
Deno.test('the base table is closed', async () => {
   const r = await rest(f.restricted, 'product?select=id&limit=1', { profile: 'public', headers: h('') });
   assertEquals(r.body.code, '42501');
});
Deno.test('graphql is gone', async () => {
   const r = await fetch(`${Deno.env.get('API_URL')}/graphql/v1`, { method: 'POST', headers: { apikey: Deno.env.get('ANON_KEY')! } });
   assert([404, 406].includes(r.status));
   await r.body?.cancel();
});
Deno.test('a JWT whose role claim is api_owner is refused', async () => {
   const token = await signJwt({ sub: crypto.randomUUID(), role: 'api_owner', exp: Math.floor(Date.now() / 1000) + 60 }, Deno.env.get('JWT_SECRET')!);
   const r = await rest(token, 'product?select=id&limit=1');
   assert([401, 403].includes(r.status));
});
Deno.test('mixed-rights user over x-tenant-ids', async () => {
   const r = await rest(f.mixed, `product?id=in.(${f.secretId},${f.euId})&select=sku,purchase_price&order=sku`, { headers: { 'x-tenant-id': f.moesa, 'x-tenant-ids': `${f.moesa},${f.europe}` } });
   assertEquals(r.body, [{ sku: 'HTTP-EU', purchase_price: null }, { sku: 'HTTP-SECRET', purchase_price: 12.5 }]);
});
Deno.test('portal reads contract terms but not the drive URL, suppliers or PIs', async () => {
   const c = await rest(f.portal, 'customer?code=eq.THO&select=deposit_rate,restricted_drive_url', { headers: h('') });
   assert(c.body[0].deposit_rate !== null);
   assertEquals(c.body[0].restricted_drive_url, null);
   assertEquals((await rest(f.portal, 'supplier?select=id', { headers: h('') })).body, []);
   assertEquals((await rest(f.portal, 'document?type=eq.pi&select=id', { headers: h('') })).body, []);
});
Deno.test('audit keys are masked for a restricted reader', async () => {
   const r = await rest(f.restricted, `audit_log?record_id=eq.${f.secretId}&select=new_data&order=id.desc&limit=1`, { headers: h('') });
   assertEquals(r.body[0].new_data.purchase_price, { masked: true });
});
Deno.test('error bodies never contain a seeded secret', async () => {
   for (const path of [`product?id=eq.${f.secretId}&purchase_price=eq.abc`, `product?id=eq.${f.secretId}&notes=gt.%5B`]) {
      const r = await rest(f.restricted, path, { headers: h('') });
      const text = JSON.stringify(r.body);
      assert(!text.includes('12.5') && !text.includes('secret note'), path);
   }
});
Deno.test({ name: 'teardown', fn: async () => { await adminTeardown(f); } });
```

`signJwt` is `djwt`'s HS256 `create` (`jsr:@zaubrik/djwt@3`). `APP_SELECTS` is a `[path, select][]` constant in `helpers.ts`, copied from the app's select strings: `product`/`*, customer(code, display_name), supplier(code)`, `purchase_order`/`*, customer(code), supplier(code, display_name, default_incoterm, deposit_rate)`, `project`/`*, customer(code, display_name), project_gate(id, code, position, status)`, `change_request`/`*, customer!change_request_customer_fkey(code), project!change_request_project_fkey(code)`, `document`/`*, customer!document_customer_fkey(code), media!document_media_fkey(id, storage_path, file_name)`, `role`/`*, permission(id, kind, group_name, resource_name)`, `user`/`*, role(*), tenant_owner(tenant_id), owned_via, tenant_id:managed_in`, `plan`/`*, plan_module(module_id), plan_limit(limit_key, value)`, `subscription`/`*, status, plan(display_name)`, `audit_transaction`/`*, actor(*), reverter(*)`, `shipment_line`/`quantity, shipment_id, shipment!shipment_line_shipment_fkey(status)`, `role`/`*, role_field_permission(resource_name, field, can_read, can_write)`. `f.thoId` is added to `Fixture`.

- [ ] **Step 2: Run** `supabase start` (if needed), `cd supabase && supabase db reset`, then `cd supabase/functions && deno task test:http`. Expected: PASS. A failure is a leak: fix it in the owning task's migration and add the missing pgTAP assertion there.
- [ ] **Step 3: Write the SQL perf script.** `field_security_perf.sql`:
  - **Load:** `\i field_security_perf_load.sql` loads 100 000 products into MOESA LTD and 100 000 into Nova, as `spike-scripts/50_perf_objects.sql` does, then `ANALYZE`.
  - **Baseline access:** a temporary `GRANT SELECT ON public.product, public.customer, public.supplier, public.purchase_order, public.purchase_order_line TO authenticated`.
  - **Cases:** for actors internal (`akif`), restricted (`elif` with `t_restricted`) and mixed (`elif`, `impersonate_scope(elif, moesa, ARRAY[moesa, europe])`), time Q1–Q4 from spike §3, Q5 (`api.product` with `api.supplier(p)` and the customer join, the embed shape) and Q6 (`api.purchase_order_overview LIMIT 50`). Each runs against the same query on `public.*`, as the median of 5 after one warm-up.
  - **Budget:** it ends with `DO $$ … RAISE EXCEPTION 'budget: %', <case> … $$` when an internal ratio is > 1.15 or a restricted/mixed ratio is > 1.40.
  - **Isolation:** all of it runs inside `BEGIN … ROLLBACK`.

  `scripts/field-security-perf.mjs` pipes it to `docker exec -i supabase_db_moesa-panel psql -U postgres -v ON_ERROR_STOP=1`, as `seed-story.mjs` does, and refuses any container other than the local one.
- [ ] **Step 4: Run** `cd app && pnpm perf:fields`. Expected: the table prints and the exit code is 0. Paste the table into the commit body.
- [ ] **Step 5: Write and run the HTTP timing.**
  - **Load:** `field_perf_http.ts` loads `field_security_perf_load.sql` (committed, without `ROLLBACK`).
  - **Requests:** 30 per case per actor: the product list (50, with `customer(code),supplier(code)`), the PO overview, and a `PATCH` with `return=representation`.
  - **Baseline:** it compares medians with `supabase/tests/perf/http_baseline.json`. Record that file once on the commit before Task 19, the same requests against `public` while it is still granted, and commit it.
  - **Run:** `cd supabase/functions && deno task perf:http`, then `cd supabase && supabase db reset`. Expected: within R10's budget; exit 0.
- [ ] **Step 6: Commit** `git commit -m "test(security): HTTP attack suite and performance budget"`

---

### Task 21: Story seed, full verification and browser walk

**Files:**
- Modify: `supabase/seed_story.sql`: a comment block for THO's portal user `portal@moesa-panel.test`, saying what it must and must not see. THO's products already carry cost and sell prices, and its contract and PO-011's PI already exist.
- Modify: `supabase/seed_story.check.sql` (checks run as the portal user and koordinator via `private.impersonate`, then `private.unimpersonate()`)
- Delete: `scripts/pgtap-to-api.mjs`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the story checks.** Each `SELECT '<name>' WHERE …` returns a row on failure, as the file does today.

```sql
-- as portal in MOESA LTD
SELECT 'fp.portal_no_cost' WHERE EXISTS (SELECT 1 FROM api.product p JOIN api.customer c ON c.id = p.customer_id WHERE c.code = 'THO' AND p.purchase_price IS NOT NULL);
SELECT 'fp.portal_sell_price' WHERE NOT EXISTS (SELECT 1 FROM api.product p JOIN api.customer c ON c.id = p.customer_id WHERE c.code = 'THO' AND p.company_price_eur IS NOT NULL);
SELECT 'fp.portal_contract' WHERE NOT EXISTS (SELECT 1 FROM api.customer WHERE code = 'THO' AND deposit_rate IS NOT NULL AND restricted_drive_url IS NULL);
SELECT 'fp.portal_no_pi' WHERE EXISTS (SELECT 1 FROM api.document WHERE type = 'pi');
SELECT 'fp.portal_no_supplier' WHERE EXISTS (SELECT 1 FROM api.supplier);
-- as koordinator in MOESA LTD
SELECT 'fp.coordinator_reads_terms' WHERE NOT EXISTS (SELECT 1 FROM api.supplier WHERE payment_terms IS NOT NULL);
SELECT 'fp.coordinator_terms_readonly' WHERE NOT EXISTS (SELECT 1 FROM api.role_field_permission rfp JOIN api.role r ON r.id = rfp.role_id
   WHERE r.display_name = 'coordinator' AND rfp.resource_name = 'public.supplier' AND rfp.field = 'payment_terms' AND rfp.can_read AND NOT rfp.can_write);
```

- [ ] **Step 2: Run** `cd supabase && supabase db reset`, then `cd app && pnpm dev:seed-story`. Expected: PASS (no check row returned).
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
- [ ] **Step 4: Browser walk** (`cd app && pnpm dev`, local Supabase with the story seed). Check each item in the network tab (requests to `/rest/v1/` carry `Accept-Profile: api`) and on screen:
  - **akif:**
    - product form shows cost; edit and save `purchase_price`;
    - the audit log shows values;
    - revert a display-name change.
  - **koordinator:**
    - supplier terms are read-only; saving the supplier form succeeds;
    - the PO list shows totals;
    - the role editor is not offered.
  - **baris:**
    - role editor → `coordinator` → Product → the cost group toggles through `some`/`all`; save; re-open shows the saved state;
    - scope MOESA LTD + Europe shows per-tenant masking.
  - **portal:**
    - product list without cost columns;
    - THO shows contract terms without the drive URL;
    - no supplier menu; no PI in documents.
  - **A tab open across a reload after the cutover:** the first request after reload succeeds.
- [ ] **Step 5: Commit** `git commit -m "test(seed): portal story checks; field permissions verified end to end"`

---

## Self-Review

- **Spec coverage:**
  - Goals: catalog and schema test → 2; per-row-tenant rights → 3; masking, writes and RETURNING → 6–10; audit → 12; budget → 20; role editor → 16.
  - Design: architecture and view owner → 6; base tables closed → 19; masking and fast path → 3, 6; generator → 6; catalog and defaults → 2; embeds → 6–10, 14, 20.
  - Side doors: audit and transfer report → 12; definer RPCs and views → 11; Edge Functions → 15; exports → 17; pg_graphql and Realtime → 17. App → 14, 16. Rollout → 6 (local exposure), 19.
  - Rulings: R1 → 2, 3; R2 → 19; R3 → 13; R4 → 6, 7, 8, 10; R5 → 4; R6, R7 → 5 (+ 7, 8, 9); R8 → 11, 12; R9 → 12; R10 → 3, 6, 20; R11 → 14, 15; R12 → 20.
  - Owner decisions: OD1 → 16; OD2, OD3 → 2; OD4 → 12.
  - Pre-flight:
    - C1 → 3 (`can_grant_field`); C2/S6 → 11; C3 → 12; C4 → 6; C5 → 1, 6, 18, 19.
    - S1 → 6 (forwarder) and 11 (RPCs), tested with correct and wrong guesses in 6, 7, 8, 9, 11, 20.
    - S2 → 3, 4 (one test per path); S3 → 11; S4 → 12, 11 (`transfer_check_files`), 15; S5 → 3, 6, 10; S7 → 3, 10; S8 → 4.
    - D → every test block is written out with exact `plan()` counts, audit resets and id ordering.
    - Minor → 13 (`po`), 15 (line refs).
- **Type consistency:** these names agree everywhere they appear: `field_read_tenants`, `field_write_tenants`, `field_read_all`, `field_user_ids`, `field_group_read_tenants`, `field_rights_map`, `sensitive_fields_map`, `can_grant_field`, `field_guard_bypassed`, `parent_gone` (Task 3) and `api_json_masked`, `mask_json_deep`, `api_view_drift`, `field_calls_only_in_initplans`, `t.peek`, `t.error_of`. `FieldRight` and `FieldRightInput` share their fields. Reverse relationships are `<t>_by_<fk>` in Tasks 6, 7, 8 and 10.
- **Proportion:** the code blocks are test assertions plus the few rules the signatures leave open: mask, forwarder, drift, guard, audit mask and row rule.
