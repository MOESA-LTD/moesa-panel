# Field-level permissions for the Moesa Panel: research

Date: 2026-11-08. Scope: column read/write control per application role on Vue 3 + Supabase (PostgREST) + Postgres RLS. Security comes first.
Branch read: `feat/staging-amazon-sandbox` (efe5b56). Nothing in the repo was changed.

## 0. What exists today (the facts this analysis relies on)

- **Catalog.** `public.permission` holds one row per `(resource_name, command)` (`unique_permission_resource_command`, 003:76-91), with `resource_condition`, `condition`, `bypass`, `throws_error`, `error_message`, `group_name -> module`. Roles are tenant-scoped (`role.tenant_id`) and are joined through `role_permission` and `user_role`. Permissions are table-level only. There is no field concept.
- **Policy generation.** `private.manage_policies()` (004:89-283) fires on `permission` changes and builds one permissive policy per `(table, command)`:
  `CASE WHEN (<resource_condition> AND <permission_check>) THEN true WHEN (<throws_error>) THEN throw_rls_policy_error(<msg>) END`.
  For tables with `tenant_id`, `permission_check` is `tenant_id = ANY((SELECT private.permitted_tenants(res, cmd))::UUID[])`, which checks the row's own tenant and is cached as an initPlan. `public.tenant` has a special case. Every other table gets `(SELECT private.check_permission(res, cmd))`. `bypass` turns the clause into `TRUE`.
  `private.enable_tenant_level_security()` (004:646-689) adds four RESTRICTIVE policies: `tenant_id = ANY((SELECT private.tenant_scope())::UUID[])`.
- **Tenant selection.** `x-tenant-id` sets the active tenant, where inserts go (`private.requested_tenant/tenant_id`, 004:353-380). `x-tenant-ids` sets the read scope (`private.tenant_scope`, 004:385+). Both come from `current_setting('request.headers')`. The JWT only identifies the user (`custom_access_token_hook`). Permissions are read from tables on every request, so a role edit takes effect on the next request.
- **Edge.** `supabase/functions/_shared/auth.ts` builds a CASL ability from `public.my_access` (table-level `[command, table]` pairs). Most functions then do their work with a service-role client (`supabaseAdmin`).
- **App.** `app/src/plugins/casl/index.ts` builds `createMongoAbility<[string,string]>` from the same pairs, and the UI calls `$can(action, table)`. There are no field rules.
- **Field-level precedents already in the codebase:**
  - Column privileges: `REVOKE UPDATE ON public.tenant ... GRANT UPDATE (display_name, ...)` (012:41-43) and `GRANT UPDATE (value) ON public.setting` (015:55-57). These are static and identical for every app role.
  - A write-guard trigger: `private.customer_contract_guard` (023:93-118, restated in 041:602) rejects changes to six contract columns unless the caller has `update` on `public.setting` in the row's tenant. The client mirror is `CONTRACT_FIELDS` in `app/src/views/pages/ops/customer/tabs/General.vue:39-49`. **Reads of those columns are not restricted.** Anyone with `select` on `customer` reads `deposit_rate`, `restricted_drive_url` and the rest.
- **Size of the surface.** 46 migrations, 51 `public` tables, 18 views (23 `security_invoker = TRUE` occurrences), 213 `SECURITY DEFINER` mentions, 21 public SECURITY DEFINER functions (`public.transfer`, `public.tenant`, `public.user`, `public.customer_platform_account`, `public.amazon_account_token`, `public.my_access`, ...). `app/src/api` has 44 files, 51 `.from()` calls over 29 relations (including the views `*_overview`, `media_library` and `company_subscription`), 16 RPCs and about a dozen embeds (`role(*)`, `media(*)`, `permission(id, kind, group_name)`, `plan(display_name)`, `tenant_owner(tenant_id)`, ...). There are 36 pgTAP files under `supabase/tests/database`. Types come from `supabase gen types typescript --local` (app/package.json `dev:supabase-types`). `config.toml` exposes `["public", "graphql_public"]`. No migration adds anything to the `supabase_realtime` publication, so Realtime is not in use today.
- **Known sensitive columns (examples, not a full list):** `product.purchase_price, purchase_currency, purchase_incoterm, landed_cost_eur, landed_cost_on, target_price_eur, company_price_eur, supplier_product_code` (019:54-81, 039); the six customer contract columns; the PO S09 figures in `purchase_order_overview` (`system_subtotal/total/deposit/balance`, computed by `private.purchase_order_figures`); and the internal-notes columns.
- **Spec gap.** M15 (`docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md` ~412) says the customer portal (`customer_viewer`, row condition on `customer_id`) must not see **supplier, cost or internal notes**. K1 (~71) says "no new permission layer is needed". That holds for rows but **not for columns**: a `customer_viewer` with `select` on `product` or `purchase_order` reads every column of every row it can see.

## 1. Threat model

The attacker is an authenticated user with a valid session in a tenant who holds some app roles. They call the raw PostgREST API (curl with their own JWT and any `x-tenant-id(s)` headers) rather than using the UI. Their goal is to read or write a column their role must not see or change. Each path below has to be closed on its own; the UI is not a control.

| # | Path | How it leaks | Notes for this stack |
|---|------|--------------|----------------------|
| T1 | Direct table read | `GET /product?select=purchase_price` | RLS only filters rows. Column privileges are set per Postgres role, and every user runs as `authenticated` ([Supabase CLS](https://supabase.com/docs/guides/database/postgres/column-level-security)). |
| T2 | Embeds | `GET /purchase_order?select=*,product(*)` or the reverse; `!inner` | Each embedded relation is checked with its own privileges and RLS, so a field rule on `product` must hold whenever `product` is reached through any FK ([PostgREST embedding](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html)). Embeds through views use the FKs of the view's base tables ("Foreign Key Joins on Views"). |
| T3 | Views without `security_invoker` | A view with owner rights reads the base table as its owner (postgres), so RLS is bypassed | [PostgREST db_authz, Views](https://docs.postgrest.org/en/stable/explanations/db_authz.html); [CREATE VIEW notes](https://www.postgresql.org/docs/current/sql-createview.html). The existing views are invoker views. Any view that selects `t.*` still re-exports every new sensitive column automatically (for example `product_with_evidence` "selects every product column", 039). |
| T4 | SECURITY DEFINER functions, RPCs and computed relationships | They run as the owner, bypass RLS and column grants, and return JSON or rows | There are 21 public definer functions. Any that returns a row of a sensitive table, or a figure derived from a sensitive column, leaks. `private.purchase_order_figures` feeds an invoker view this way. Derived values count too: `system_total` reveals unit cost times quantity. |
| T5 | Triggers and derived data | Triggers copy values into other tables (notifications, events, `audit_log`, transfer copies, dashboard tables) | The copy is governed by the target table's permission, not the source column's. |
| T6 | `audit_log` JSON | `old_data` and `new_data` hold full row snapshots (010 `audit_statement`) | Anyone with `audit_log` select in the tenant can read them, whatever the field rules say. `revert_audit_transaction` (SECURITY INVOKER, dynamic SQL) can write old values back, which is a write path for hidden fields. |
| T7 | Error messages | Cast errors include their input values; unique violations print `Key (col)=(value)`; `RAISE` texts that interpolate OLD/NEW; `throw_rls_policy_error` messages | [Rules and Privileges 39.5](https://www.postgresql.org/docs/current/rules-privileges.html): "most casting functions include their input values in the error messages". PostgREST returns `message`, `details` and `hint` verbatim. |
| T8 | Filter, order and count as an oracle | `?purchase_price=gt.10`, `order=purchase_price`, `Prefer: count=exact` with a filter, `or=(...)`, `!inner` plus an embedded filter, `PATCH ...?purchase_price=lt.5` (the row count of the update), `on_conflict` | A binary search recovers the exact value in about log2(range) requests without ever selecting it. Each approach below is checked against this. |
| T9 | Leaky functions and planner order | Operators chosen by the user run on rows before the mask or filter applies | This only matters for views that filter rows (`security_barrier`). PostgREST users cannot define functions, but built-in casts in filters still run ([CREATE FUNCTION LEAKPROOF](https://www.postgresql.org/docs/current/sql-createfunction.html)). |
| T10 | Exports, CSV, print and reports | The client builds CSV from whatever the API returned; M13 reports and PDF prints compose data on the server | These are safe only if the data source is already field-filtered. Server-side report generation with the service role falls under T12. |
| T11 | Storage | Documents (supplier invoices, PSI reports, price lists) hold the same facts as the columns | Field rules do not reach `storage.objects`. The storage policies (014, 024 `can_read_media_file`) must map to the same rights. |
| T12 | Edge Functions with the service role | `supabaseAdmin()` bypasses RLS and column grants, and response bodies may echo full rows | `auth.ts` checks table-level CASL only. Any function that returns DB rows must either project them to the caller's field rights or read with the user-scoped client (`supabaseClient(req)`). |
| T13 | Realtime | `postgres_changes` delivers full rows authorized by the subscriber's SELECT privilege and RLS; the `select` option needs column privileges ([Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)) | Not used today. If it is enabled, a table in the publication leaks every column the role can SELECT at the Postgres level. An app-level mask in a view does not help, because Realtime streams tables. |
| T14 | GraphQL (`pg_graphql`) | `graphql_public` is exposed. pg_graphql reflects tables and columns according to Postgres privileges and applies RLS | Same as T1 and T13: a mask that exists only in PostgREST-exposed views does not cover tables pg_graphql can see. Verify this, or disable the extension. |
| T15 | Writes | `PATCH`/`POST`/upsert set a field the role must not set; `return=representation` echoes values back; `Prefer: missing=default`; the bulk import RPC (`import_products`, SECURITY INVOKER) | Write control is separate from read control, and both are needed. |
| T16 | Client cache after a role change | Pinia stores, ResourceTable filters persisted in localStorage, and a CASL ability that stays stale until reload | A downgraded user keeps values that were already loaded, and persisted filters may contain values. Fixing this is defense in depth only; the server must still be correct. |
| T17 | Tenant header confusion | `x-tenant-ids` lists several tenants, and a field right in tenant A must not unmask rows of tenant B | Every field check must use each row's `tenant_id`, as `permitted_tenants` does, and never `check_permission` on the active tenant. |
| T18 | Catalog misuse | A field permission stored as a `permission` row would be picked up by `manage_policies`, which splits `resource_name` on `.` and creates a table policy | Field rules need their own table or an explicit skip in the trigger. |
| T19 | Drift | A new column is added to a "safe" table, or a new view selects `t.*` | Denylist designs fail open, so a schema test is needed (see §3). |

## 2. Approaches

Notation: "masked" means the API returns `NULL` for a field the caller lacks, or leaves the column out.

### (A) An API schema of `security_invoker` views that mask columns with a catalog function; base tables in an unexposed schema; a write-guard trigger

**How it works here.**
- The 51 base tables move from `public` to a schema such as `internal`, which is not listed in `db-schemas`. In `public` (or a new `api` schema) each table gets one view:
  `CREATE VIEW public.product WITH (security_invoker = true) AS SELECT id, tenant_id, display_name, ..., CASE WHEN tenant_id = ANY ((SELECT private.field_tenants('public.product','purchase_price','select'))::uuid[]) THEN purchase_price END AS purchase_price, ... FROM internal.product;`
- `private.field_tenants(resource, field, command) RETURNS uuid[] STABLE SECURITY DEFINER` reads a new catalog table (for example `permission_field(permission_id, field_name, command)` or `role_field_rule(role_id, resource, field, command, effect)`) and works like `permitted_tenants`. Wrapped in `(SELECT ...)`, it becomes an initPlan that runs once per statement ([Supabase RLS performance §2](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).
- Writes: simple views are automatically updatable, but a `CASE` column is not an updatable column ([CREATE VIEW, Updatable Views](https://www.postgresql.org/docs/current/sql-createview.html)), so writing to it raises an error. There are two ways out. One is an `INSTEAD OF` trigger per view, generated from the catalog, which gives up automatic updatability. The other keeps sensitive columns non-updatable in the view and writes them through RPCs. Either way, a generic `BEFORE INSERT/UPDATE` guard on `internal.*` is also needed. It compares `NEW.col IS DISTINCT FROM OLD.col` for every field that has a write rule, as a generalized `customer_contract_guard`.
- Invoker views require the caller to hold privileges on the base tables (CREATE VIEW notes: "the user of a security invoker view must have the relevant permissions on the view and its underlying base relations"). So `authenticated` keeps `SELECT` plus RLS on `internal.*`, and the only thing hiding those tables is that `internal` is not listed in `db-schemas` ([PostgREST schema isolation](https://docs.postgrest.org/en/stable/explanations/schema_isolation.html), [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)).

**What it protects:** T1; T2 (embeds go from view to view, and PostgREST infers FKs from the base tables when the FK columns are in the view); T8 (see below); and T17 if `field_tenants` checks each row's tenant. It is fully dynamic per tenant role, works at any field granularity, and the role editor can toggle any field.

**What it does NOT protect:** T4, T5, T6, T10, T11 and T12, which need separate work in every approach. T13 and T14: `authenticated` can still SELECT `internal.*` at the Postgres level. pg_graphql (if it reflects `internal`) and Realtime (if those tables are ever published) would bypass the mask. Any SECURITY INVOKER function that runs dynamic SQL on a table name (`revert_audit_transaction`) can also reach `internal` directly. The isolation comes from not exposing the tables, not from privileges.

**Filter and order oracle in A.** PostgREST filters and orders on the view column, which is the `CASE` expression. A view without `security_barrier` lets the planner push the condition down, but what gets pushed down is the masked expression. So `?purchase_price=gt.10` compares `NULL > 10` and returns no rows, `order` sorts NULLs, and counts follow the same logic. There is no oracle **as long as the mask is in the view's select list and never in its WHERE clause**. The remaining risks:
- A hand-written view exposes the raw column under another name, or computes something from it without the mask (`purchase_price * qty AS line_cost`).
- A view embeds back into a base table. This cannot happen if the base tables are unexposed.

`PATCH ...?purchase_price=lt.5` against a view also filters on the masked expression, so it is not an oracle either. `security_barrier` is not needed for column masking, and it makes query plans worse ([39.5](https://www.postgresql.org/docs/current/rules-privileges.html)).

**Impact on existing code.** This is the largest change of all the options:
- Every reference to `public.X` in the migrations changes: functions, triggers, policies, the `information_schema.tables` lookup in `manage_policies`, the hard-coded `t_schema := 'public'` in `enable_tenant_level_security`, `audit_enable(regclass)`, the transfer feature (040-045, which copies rows by table name) and the storage helpers.
- All 18 existing views are rebuilt on top of the new views or the base tables, and the 16 RPCs need review.
- All 36 pgTAP files change, because privilege tests now target views.
- Generated types keep their shape, but views produce `Row` types where every column is nullable, and their `Insert/Update` types lose precision for the non-updatable columns.
- App code mostly stays the same (the names don't change), except for writes to masked columns.
- Realtime on views is not supported (Postgres Changes streams tables), so any future Realtime use would need a different design.

**Operational complexity.**
- Views must be regenerated whenever a column is added, which needs a generator function driven by `information_schema.columns` and the catalog.
- The new schema needs `ALTER DEFAULT PRIVILEGES` ([ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)).
- Every table becomes two objects.
- Runtime role edits need no DDL, because the rules are catalog-driven. The surface for mistakes is moderate.

**Performance.** One initPlan per masked column per statement, and the `CASE` is cheap per row. Views are inlined, so filters on unmasked base columns still use indexes. Filters on masked columns cannot use indexes because they target an expression, which is acceptable.

### (B) A Postgres role per app role, column GRANTs, and role switching per request

**How it works.** Create one Postgres role per app role (`app_role_<uuid>`), `GRANT SELECT (cols) / UPDATE (cols)` per field, and switch roles per request. The switch can come from the JWT `role` claim: PostgREST runs `SET LOCAL ROLE <claim>`, which requires `GRANT <role> TO authenticator` ([PostgREST auth](https://docs.postgrest.org/en/stable/references/auth.html)). Alternatively, `db-pre-request` can run `SET LOCAL ROLE` after a lookup ([Transactions, Pre-Request](https://docs.postgrest.org/en/stable/references/transactions.html)).

**What it protects:** T1, T2 and T8, at the strongest level. Referencing a hidden column anywhere raises a privilege error, because SELECT on a column is required to use it in WHERE or ORDER, so filtering, ordering or a PATCH filter on a hidden column fails with 42501. It also covers T13 and T14, because Realtime and pg_graphql obey column privileges.

**What it does NOT protect, and what it breaks:**
- A request runs as **one** Postgres role. Users hold several app roles, and `x-tenant-ids` reads several tenants with different roles at once. Field rights per row tenant (T17) are therefore impossible with a single role. You would need one role per *combination* of roles per tenant set, which grows combinatorially.
- Tenant-scoped custom roles are edited at runtime. That means running `CREATE ROLE` / `GRANT` DDL from app actions (through a SECURITY DEFINER function that owns CREATEROLE), cluster-wide role objects for every tenant role, consequences for migrations and backups, and a re-issued JWT after every role change. Today the JWT carries identity only, by design.
- Supabase features assume `authenticated`: `TO authenticated` appears in all four restrictive policies and every generated policy, and storage policies, `auth.uid()` usage, Realtime authorization and the edge `supabaseClient` rely on it too. Every policy would have to become `TO authenticated, app_role_*`, or the new roles would have to be members of `authenticated`.
- `select=*` fails for restricted roles ([Supabase CLS](https://supabase.com/docs/guides/database/postgres/column-level-security): "Restricted roles cannot use the wildcard"). Every `select('*')` and `*` embed would have to list its columns, and the right list differs by role, so the client would need to know the caller's grants.
- Supabase explicitly does not recommend column privileges for most users (same page).

**Operational complexity:** the highest of all options. The catalog and the grants can drift apart, and DDL runs in the request path. **Performance:** the best at query time, since no functions run, but `db-pre-request` must compute the role set on every request.
**Verdict:** reject for this codebase.

### (C) Split sensitive columns into satellite tables governed by the existing table-level permissions

**How it works here.** Group the sensitive fields by audience and move each group to a 1:1 table keyed by the parent's primary key:
`public.product_cost (product_id uuid PRIMARY KEY REFERENCES product ON DELETE CASCADE, tenant_id uuid NOT NULL, purchase_price, purchase_currency, purchase_incoterm, landed_cost_eur, landed_cost_on, ...)`. The same pattern gives `customer_contract`, `purchase_order_finance`, `*_internal_note` and `product_supplier_ref`.

Each satellite becomes a new resource in the existing catalog, with `permission` rows for `select/insert/update/delete` and a `group_name`. Everything downstream then works unchanged:
- `manage_policies` and `enable_tenant_level_security` generate its RLS.
- `my_access` returns it.
- CASL `$can('read','product_cost')` works on the client and in `auth.ts`.
- The role editor shows it with no new UI concept.

A consistency trigger can enforce `satellite.tenant_id = parent.tenant_id`.

**What it protects:**
- T1.
- T2: the embed `product?select=*,product_cost(*)` returns `null` or `[]` when RLS hides the satellite row.
- T8: filtering an embedded resource only sees visible satellite rows. `product_cost!inner(...)&product_cost.purchase_price=gt.10` returns nothing to a caller without `select` on `product_cost`, so there is no oracle.
- T13 and T14: privileges and RLS are real Postgres controls, so Realtime and pg_graphql obey them.
- T15: insert and update on a satellite need their own permission, so no write-guard trigger is needed.
- T17: the generated policy uses `permitted_tenants` per row.
- T18: the catalog does not change at all.

It also fails closed: a new column added to a satellite is hidden by default from everyone without the satellite permission.

**What it does NOT protect:**
- T4-T7, T10-T12 and T16. These are cross-cutting and the same in every approach.
- T19 for columns added to the *main* table later. This needs the classification test.
- Granularity is per *group*, not per individual field. A role that may see `landed_cost_eur` but not `purchase_price` needs two satellites.

If `select` is denied, RLS hides the satellite row, so the caller cannot even tell whether a cost row exists.

**Impact on existing code.** Each group needs one migration that:
- creates the satellite, copies the data and drops the columns from the parent;
- recreates the views that referenced those columns with a `LEFT JOIN` on the satellite. In an invoker view, RLS on the satellite turns hidden values into `NULL`, so masking comes for free;
- updates the functions that read or write the columns (`import_products` value_columns, `private.purchase_order_figures`, the transfer copy in 043). `customer_contract_guard` becomes unnecessary;
- updates `audit_enable` for the new table;
- adds a new pgTAP file.

In the app, the API modules for the affected resources (product, customer, purchase order: about 6-8 of the 44 files) embed or upsert the satellite, and forms save two resources. Types regenerate normally, and satellites are tables, so they get full `Insert/Update` types. Realtime works per table.

**Operational complexity.** Low, and already understood by the team: it is "one more table under the existing permission model". Runtime role edits need nothing new. The risk lies in schema design (choosing the groups) rather than in machinery.

**Performance.** One primary-key join per embed plus one more RLS policy evaluation, with `permitted_tenants` cached as an initPlan. This is negligible at this data size. Views that aggregate over costs pay a join they already pay today, on the same data under a different table name.

### (D) Client-only CASL field rules (baseline, reject)

**How it works.** CASL supports `can('read','product',['display_name',...])` and `permittedFieldsOf`, and the UI hides inputs and columns accordingly. Today's `CONTRACT_FIELDS` follows this pattern, backed on the server for writes only.
**What it protects:** nothing against T1-T19. The API returns every column, and the browser devtools show it. **Use it only for UX**, layered on a server-side control, and derive the client field rules from the same catalog so the UI and the database agree.

### (E) A variant worth knowing: static column REVOKE plus catalog-masked computed fields

Revoke `SELECT/UPDATE` on the sensitive columns from `authenticated`. PostgREST then returns 42501 for select, filter, order and `PATCH ...?col=`, because SELECT on a column is required to reference it ([PG privileges](https://www.postgresql.org/docs/current/ddl-priv.html)). The value is exposed instead through a PostgREST computed field, `public.purchase_price_v(product) RETURNS numeric STABLE SECURITY DEFINER`, which returns the value only if `field_tenants` allows it. Filtering or ordering on the computed field sees the masked value, so there is no oracle. Writes go through a guard trigger with column UPDATE granted back, or through an RPC.

Pros:
- No schema move.
- Real privileges, so Realtime and pg_graphql are safe.
- Rules can be set per individual field.

Cons:
- `select=*` on the table breaks for everyone (Supabase CLS note). Every `select('*')`, every `*` embed, and every SECURITY INVOKER view or function that selects `t.*` or the column must change. That covers 23 invoker views plus `import_products` and `revert_audit_transaction`.
- A SECURITY DEFINER plpgsql call per row cannot be inlined, which is slow on big lists ([Supabase RLS perf §4 warning](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).
- Computed fields are not in the generated `Row` types by default.

It works as a tactical fix for a single column, not as the system.

### Comparison

| | A views+mask | B PG roles | C satellites | D client | E revoke+computed |
|---|---|---|---|---|---|
| Real Postgres control (Realtime, pg_graphql, invoker functions) | No (relies on not exposing tables) | Yes | Yes | No | Yes |
| Field rights per row tenant (`x-tenant-ids`) | Yes | No | Yes | n/a | Yes |
| Granularity | any field | any field | field group | any | any field |
| Runtime role edits without DDL | Yes | No | Yes | Yes | Yes |
| Filter/order oracle | closed if the mask is only in the select list | closed (42501) | closed (RLS) | open | closed |
| Write control | needs triggers/RPC | grants | table perms | none | trigger/RPC |
| Fails closed for new columns | No (unless generated) | Yes | Yes in a satellite / No in the parent | No | No |
| Change size | very large | very large | small, per group | small | medium, touches many files |

## 3. Recommendation

**Adopt (C), satellite tables, as the field-permission mechanism, together with the cross-cutting fixes below. Keep (D) only as UI, derived from the same permissions. Reject (A) and (B) for now.**

Reasoning:
1. **Security strength.** C relies on the only two controls Postgres enforces everywhere: table privileges and RLS. Every access path obeys them: PostgREST, embeds, filters, Realtime, pg_graphql, invoker functions and the dynamic SQL in `revert_audit_transaction`. A's guarantee depends on nobody reaching `internal.*` by any route other than PostgREST, and that property can erode without anyone noticing.
2. **No new authorization machinery.** The catalog, `manage_policies`, `enable_tenant_level_security`, `permitted_tenants` (per-row tenant, T17), `my_access`, CASL on the edge and the client, and the role editor all work unchanged. K1's promise ("no new permission layer") stays true. What is new is schema, not policy code.
3. **It fails closed** inside satellites. The remaining fail-open risk, a new sensitive column on a parent table, is covered by a schema classification test.
4. **The real requirement is shaped by groups.** M15 names three groups (supplier, cost, internal notes), and the contract guard is a fourth (contract terms). The spec does not ask for toggles on arbitrary individual columns (open question 1). If that need appears later, A can be built on top of C for the remaining columns.
5. **It is incremental.** One group per PR, each shippable and tested on its own. The existing `customer_contract_guard` is the first candidate, and this step retires it.

### Migration path (one PR per step, each with pgTAP)

1. **Inventory and classification (needs owner input).** Create `private.column_class(table, column, class)` with the classes `public | internal | cost | supplier | contract | note | secret`, seeded for all 51 tables. Add the pgTAP test `field_classification.test.sql`. It fails when any column of any `public` table or view is unclassified. It also fails when a column of a non-`public` class sits outside its satellite on a table or view that roles like `customer_viewer` can read. This guards against T19 from day one, before anything moves.
2. **Cross-cutting hardening (independent of the groups):**
   - `audit_log` (T6): add a condition to its read policy that the caller has `select` on the row's `table_name` in the row's tenant. `table_name` is stored, so use `permitted_tenants('public.'||table_name,'select')`. Satellite rows then disappear from history for roles without the satellite. Snapshots of parent rows taken before the split still contain cost keys. Either strip them in a one-off data migration, or mask them through an invoker view over `audit_log` that removes the keys whose `column_class` the caller lacks.
   - SECURITY DEFINER functions (T4): inventory the 21 public ones and every private function granted to `authenticated`. For each, record which columns it returns and add a permission check.
   - Edge functions (T12): adopt the rule "read with `supabaseClient(req)`, write with `supabaseAdmin()` only after authorization, and never return rows read with admin rights unprojected". Add a test for every function that returns DB data.
   - pg_graphql and Realtime (T13, T14): disable `pg_graphql` if it is unused, or add it to the attack tests. Document that a table enters `supabase_realtime` only after a security review.
   - Client cache (T16): when `my_access` or the ability changes, clear the Pinia stores and query caches, and drop persisted ResourceTable filters that reference a resource the user can no longer read.
3. **Group 1: `customer_contract`** (the contract terms from 023). Create the satellite, copy the data and drop the columns. Retire `customer_contract_guard`. Add permission rows with a `group_name` and grant them to the roles that hold `update setting` today, so current behavior is preserved. `General.vue` reads the satellite through an embed.
4. **Group 2: `product_cost`** (`purchase_price, purchase_currency, purchase_incoterm, landed_cost_eur, landed_cost_on`, and probably `target_price_eur`; the owner decides on `company_price_eur`). Update `import_products` and `product_with_evidence`. Also update `market_cell_overview` if it uses prices, the transfer copy (043), and the Amazon listing price sources (046) if they read these columns.
5. **Group 3: `purchase_order_finance`** (unit prices on PO lines, payments, the S09 figures). `private.purchase_order_figures` and `purchase_order_overview` must read from the satellite inside the invoker view. A caller without the satellite then gets `NULL` totals, instead of totals computed by a definer function (T4).
6. **Group 4: supplier references** (`supplier_id` / `supplier_product_code` on product, PO and shipment, for the portal). Either move them to satellites, or take the simpler route: the portal reads through a dedicated allowlist schema whose views select only whitelisted columns, *and* `customer_viewer` gets no permission on the base tables at all. Decide together with open question 3.
7. **Group 5: internal notes** across tables (the `notes` columns). Use `*_internal_note` satellites, or one `internal_note(resource, record_id, tenant_id, body)` table with its own permission.
8. **UI layer.** Derive field visibility from the satellite permissions (`$can('read','product_cost')`), hide the matching sections and columns, and leave them out of CSV export. The UI keeps no field logic of its own.

Effort estimate: about **14 tasks**. That is 1 for classification and its test, 4 for the cross-cutting fixes, about 1.5 per group for 5 groups (migration with tests, then app), 1 for the UI and export, and 1 to consolidate the attack-test suite. A would be 30 or more tasks, with a schema move that touches the objects of all 46 migrations.

### Attack-test checklist (pgTAP, run as `authenticated` with `request.jwt.claims` and `request.headers` set, plus a few HTTP tests against a local PostgREST)

For each satellite `S`, test with a user `U` who has `select` on the parent `P` but not on `S`:
- [ ] `SELECT * FROM S` returns 0 rows, and `SELECT count(*)` returns 0.
- [ ] `P?select=*,S(*)` returns `S: null` for every row, and `S!inner` returns 0 rows.
- [ ] Oracle: `P?select=id,S!inner(col)&S.col=gt.X` and `order=S(col)` (if supported) return nothing or leave the order unchanged. `Prefer: count=exact` with that filter returns 0.
- [ ] `INSERT`, `UPDATE`, `DELETE` and upsert (`on_conflict`) on `S` fail or affect 0 rows, and `PATCH S?col=lt.X` affects 0 rows.
- [ ] Every view that used to expose the columns returns `NULL` for them, and filtering the view on them returns nothing.
- [ ] Multi-tenant: with `select S` in tenant A only and `x-tenant-ids: A,B`, `U` sees A's values and `NULL` for B's rows. A forged `x-tenant-id` naming a foreign tenant returns nothing.
- [ ] Role change: revoke the role in the middle of a session. The next statement no longer sees `S`, with no JWT refresh needed.
- [ ] `audit_log`: `U` cannot read the audit rows of `S`, parent snapshots contain no classified keys, and `revert_audit_transaction` on a transaction that touched `S` fails for `U`.
- [ ] Every public SECURITY DEFINER function and every RPC returns no classified value when `U` calls it (a table-driven test over `column_class`).
- [ ] Triggers and notifications: changing `S` creates no row readable by `U` that contains the value.
- [ ] Error leakage: forced errors on `S` and `P` (bad casts in filters, unique violations, guard exceptions) contain no stored value.
- [ ] Edge functions that return data (Deno tests): the response for `U` contains no classified key.
- [ ] Storage: `U` cannot read files linked to cost or contract documents if those are classified (map them in `can_read_media_file`).
- [ ] pg_graphql: either it is disabled (assert the extension is absent), or the same queries through `graphql.resolve` show no values.
- [ ] Schema drift: the classification test from step 1 fails on any unclassified column, and on any column of a non-public class on a parent table or view.
- [ ] Portal role (`customer_viewer`): an end-to-end test lists every column the role can read across all tables (via `has_column_privilege` and sample rows visible through RLS) and compares the list to an allowlist.

## 4. Open questions for the owner

1. **Granularity:** is access per field group enough (cost, supplier, contract, internal notes, finance)? Or must a tenant admin be able to toggle *individual* fields per role in the role editor? The answer decides between C alone and C plus A.
2. **The complete list of sensitive fields** per table, and which roles may see each (this is the classification in step 1). In particular: is `company_price_eur` (the company's selling price) secret from anyone? What about `target_price_eur` and `supplier_product_code`? Are PO line unit prices treated differently from PO totals?
3. **Portal scope:** should the customer see that a supplier exists (as an anonymous "Supplier 1"), see nothing at all, or see only the country of origin? Should portal users read the base tables at all, or only a read model built for the portal?
4. **Write versus read:** besides the contract terms, are there fields a role may read but not edit? Are there fields a role may edit without reading them (unlikely, but data-entry staff entering purchase prices would be one case)?
5. **Audit history:** may users without cost access still see that a cost changed (the event without its values), or must those audit rows be hidden entirely? Is rewriting old `audit_log` snapshots acceptable?
6. **Derived figures:** do totals derived from hidden fields (PO totals, margins, dashboard sums) follow the same rule as the fields themselves?
7. **Exports and reports (M13):** do the Friday and monthly reports and the PDFs respect the reader's field rights, or are they documents for management only?
8. **Files:** do supplier invoices and price lists stored as media or documents need the same restriction as the cost columns?
9. **pg_graphql and Realtime:** can you confirm neither is planned, so pg_graphql can be disabled and these tables kept out of the Realtime publication?
10. **Timing:** must field rules land before the portal (M15, Phase 3), or is it acceptable for the internal team, who are all trusted, to work without them until then?
