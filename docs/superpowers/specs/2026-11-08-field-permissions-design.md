# Field-level permissions — design (2026-11-08)

Owner request: per-role, per-field permission toggles, security first, built now (before the M15 customer portal). Research and measured prototypes: `docs/superpowers/research/field-permissions/` (README, research.md, spike.md). Column classification: `docs/superpowers/specs/2026-11-08-field-classification.md` (645 columns, 81 sensitive, 9 field groups).

## Intent

A tenant admin decides in the role editor which fields each role may read and which it may write, per resource, down to single fields. The database enforces it: a user can never read or write a field outside their rights through any path the app or the API offers — PostgREST tables and embeds, filters and ordering, RPCs, views, Edge Functions, exports, audit history. The internal team's daily work does not slow down measurably.

## Owner decisions (2026-11-08)

1. Granularity: **individual field toggles per role** in the role editor.
2. Sensitive fields: classified by the agent (see the classification document); the owner reviews it. Calls made on the owner's behalf: coordinator may read sell prices (and so the margin) because they run POs and the PI check; `target_price_eur` is internal (`cost` group); portal users may read their own customer's contract terms except `restricted_drive_url` (`internal_note`); free text that can name a supplier (`shipment_event.from_party/to_party`, `incident.affected_parties`) is `supplier_identity`; forwarder, customs broker, carrier and origin country stay readable; change-request cost impact stays readable (the customer approves it).
3. Suppliers: not a legal secret but a commercial one (customers bypassing the company). With per-field toggles it is a role setting: `supplier_identity`, `supplier_contact`, `supplier_terms` default **off** for the portal role, on for internal roles.
4. Audit history: a user without read rights on a field sees **that it changed, without the value**.
5. Timing: now.

## Goals

- Every column of every business table has a class in a catalog: `system` (ids, tenant, timestamps — readable with the row), `open` (readable/writable with the row's table permission), or `sensitive` with a field group. A schema test fails on any unclassified column, so new columns cannot slip through.
- Field rights live in data: per role, per resource, per field: read, write. Defaults per role come from the classification. Tenant admins edit them in the role editor; system roles get the classification defaults by seed.
- Rights are evaluated against **each row's tenant** (multi-tenant reads with `x-tenant-ids` must not borrow another tenant's rights — a measured leak).
- Reads of a field without the read right return `NULL`; filters, ordering, aggregates and error messages on such a field reveal nothing. Writes to a field without the write right fail with 42501 and a clear error code; `RETURNING` never reveals a hidden value.
- Audit snapshots shown to a user mask fields they cannot read with a "changed" marker; reverting a transaction that touches fields the user cannot write is refused.
- The internal team's lists stay within the measured budget (≤ +15% on the spike's queries; the field check is computed once per query, never per row).
- The role editor shows, per resource, the fields grouped by field group with read/write toggles and a group toggle.

## Non-goals

- Field rules inside Edge Functions' own logic beyond "never return or log what the caller may not read" (they read with the user's client now — see the user-credential work — and the views enforce the rest).
- Masking inside stored files (documents/media contents). Access to files stays table/row based.
- The portal UI itself (M15). This work makes the data layer safe for it and adds the `customer_viewer` defaults.
- Realtime subscriptions on sensitive tables (none exist today; they stay out of the publication).

## Anti-goals

- A design where the base tables stay readable by `authenticated` "because the views mask" (measured: everything leaks).
- A view owned by a BYPASSRLS role (`postgres`) — measured cross-tenant leak.
- Calling the field function per row (measured 55× … 250× slower).
- Client-only hiding presented as security.

## Decisions

### Architecture (spike prototype "A-def")

- **API schema.** A new schema `api` exposed to PostgREST holds one view per business table with the table's name (`api.product`, …). The app's `.from()` calls go to `api`; RPCs keep living in `public` (the builder chooses how the client addresses each — e.g. a schema-scoped client for RPCs).
- **Base tables closed.** `anon` and `authenticated` lose SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every business table in `public`; only the view owner and the service role keep them. (The TRUNCATE grant `anon`/`authenticated` hold on 66 tables today is revoked in the first task regardless.)
- **View owner.** A dedicated NOLOGIN role `api_owner`, **not** BYPASSRLS, member of `authenticated`, owns every `api` view, so the existing RLS policies still apply to the caller's rows (views are `security_invoker = false`; the base table is reachable only through the owner).
- **Masking.** Each sensitive column is `CASE WHEN t.tenant_id = ANY((SELECT private.field_read_tenants('<resource>', '<field>'))) THEN t.<field> END`. `private.field_read_tenants` is `STABLE`, returns the caller's tenants in which they hold the read right for that field, and is evaluated once per query (InitPlan). Open and system columns pass through. Tenant-less tables use a `private.field_can_read(...)` boolean wrapped the same way.
- **Writes.** Generated `INSTEAD OF INSERT/UPDATE/DELETE` triggers on each view apply the change to the base table after checking, per changed sensitive field, `private.field_write_tenants`; a refused field raises 42501 `field_write_forbidden` naming the field. After the write the trigger re-reads the row through the view so `RETURNING` is masked. Tables' own triggers (guards, audit, codes) keep firing on the base table.
- **Generated, not hand-written.** Views and triggers are produced by `private.enable_field_security('<table>')` from the catalog, like `private.enable_tenant_level_security` produces policies today; re-running it after a column change regenerates them. The schema test also checks that every view matches its table.
- **Catalog.** Field classes and groups live in a table (`public.field_class(resource, field, class, group_name)`); rights in `public.role_field_permission(role_id, resource, field, can_read, can_write)` (or the builder's equivalent that fits the existing `permission` / `role_permission` shape). A role without an explicit field right gets: system and open fields with the table permission; sensitive fields denied. System roles are seeded from the classification defaults.
- **Embeds.** PostgREST embeds through views must keep working; relationships are declared or inferred so `select('*, customer(code)')` resolves across `api` views. Every app embed is exercised in tests.

### Side doors (each closed and tested)

- **Audit.** The audit log is read through an `api` view that rewrites `old_data`/`new_data`: keys of fields the reader cannot read (per row tenant) become the marker `{"masked": true}` (UI: "changed"). `revert_audit_transaction` refuses when the transaction touches a field the caller cannot write. `dashboard_notification_feed` uses the masked view.
- **SECURITY DEFINER functions and views.** Every function/view that returns or computes from sensitive fields (inventory in the classification §2: `purchase_order_figures`, `purchase_order_overview`, `dashboard_purchase_order`, `product_with_evidence` (`p.*`), transfer and listing paths, dashboard views) either becomes `security_invoker`/reads through `api` views, or checks the field right before returning the value. `p.*` views are replaced by explicit column lists.
- **Edge Functions.** Reads for a user go through the user client and `api` views; the remaining service-role reads select only the columns they need and never return or log sensitive values (Amazon: product cost fields are not sent to Amazon).
- **Exports.** CSV/PDF exports read through `api` views (masked values export as empty).
- **pg_graphql** disabled (not used); sensitive tables stay out of the Realtime publication.

### App

- Supabase types are regenerated for the `api` schema; API modules switch to it; zod schemas accept `null` for masked fields.
- The ability builder (CASL) gets field rules from the catalog so forms show a masked field as hidden or read-only (`$can('read', 'product', 'purchase_price')`) — UI only; the database is the boundary.
- Role editor: per resource, fields grouped by field group, read/write toggles per field and per group, the same tri-state group pattern the permission toggles use.

### Rollout

- One generator, applied to all business tables in the same release (a half-migrated state where some tables are still reachable directly is the measured leak). The plan may build and test it table group by table group, but the base-table REVOKE lands for all tables at once with the switch of the app to `api`.
- Hosted projects need `api` in PostgREST's exposed schemas: `config.toml` for local; for staging the CI sets it through the Management API; for production the owner sets it once (README).

## Tests (security first)

- The research's attack checklist (research.md "Attack-test checklist") and the spike's T1–T10 become pgTAP tests over the real views, run as `authenticated` with JWT claims and tenant headers: direct base-table access refused; masked read returns NULL; filter / ORDER BY / `count FILTER` / `IS NULL` oracles; error-message leakage (casts, checks, division); RETURNING; embeds and joins; multi-tenant `x-tenant-ids` with different rights per tenant; write to a masked field refused; audit masking and revert refusal; each SECURITY DEFINER function on the inventory; TRUNCATE refused.
- Schema-classification test: every column of every business table is classified; every `api` view matches its table; no business table grants anything to `anon`/`authenticated`.
- Performance test: EXPLAIN of representative list queries shows the field function as an InitPlan (not per row).
- App: vitest for masked-field rendering and the role editor's field toggles; HTTP smoke tests against local PostgREST for a restricted user.

## Left to the builder

- Exact names of the catalog tables/functions and how they map onto the existing `permission` / `role_permission` / `module` shape.
- How the client addresses `api` for tables and `public` for RPCs.
- Order of tasks and how to batch tables.

## Open for the owner

- Review of the classification document (81 sensitive fields, 9 groups, per-role defaults).
- Production setting: add `api` to the exposed schemas when this ships.
