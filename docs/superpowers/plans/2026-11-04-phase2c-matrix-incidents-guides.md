# Phase 2c — Market Matrix, Incidents, Change Requests and Page Guides: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 2 with M9 (market matrix), M10 (incidents and change requests), the remaining M6 boxes and the M20 page guides (layer 2), so the spec's last two Phase 2 criteria hold: "THOMETZKI mop ailesi için pazar matrisi dolu; ilk olay kaydı S17 ile tutuldu".

**Architecture:**
- **Records.** A market cell (`market_cell`) is one product × platform (`public.platform`, 015) × country, of the product's customer. An incident (`incident`, S17) belongs to one customer, optionally to one record (project, PO, shipment, product or market cell, polymorphic as documents), with a log (`incident_log`) and deadlines (`incident_deadline`). A change request (`change_request`, S08) belongs to one customer, optionally one project, with products (`change_request_product`), an affected document and the new version that applies it.
- **Codes** come from `public.next_code`: `CR-THO-2026-001` (kind `cr`, already allowed) and `OL-THO-2026-001` (kinds `ol`, `oa`, `ou`, `ot`, `om`, added in Task 5): the Y10 family, the customer, the year and the number (K5 "aile + sıra").
- **Rules** live in `SECURITY DEFINER` `_z_guard` triggers that honour `private.rules_bypassed()` (030) after their immutability rule, as in 030/031. A gate rollback now needs an open incident of the project's customer (K3: "Kapı geri alma yalnızca olay üzerinden yapılır").
- **Lists and dashboard** read `security_invoker` overview views (`market_cell_overview`, `incident_overview`) and three dashboard views (Task 10). The pivot is derived from the cells in the client (`buildMatrix`); the cells are the only source (S05).
- **Page guides** are client-only: a registry (`constants/guide.ts`), a pinia store, a non-modal right `Drawer` mounted once in the dashboard layout, and a "?" button in the layout's page header. Copy is plain i18n text.

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 + Tailwind, TanStack Query 5, zod 4, CASL, vue-i18n, pinia. Supabase (Postgres 15, PostgREST, generated RLS). pgTAP (`pnpm test:db`) and vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`.
- §6: M9, M10, the Phase 2 boxes of M6 ("açık olaylar (S1/S2 öne), açık CR'ler, pazar matrisi özeti (yayında / hazırlanıyor / bastırılmış)"), M20 layer 2, and M5 (project card "olaylar"; gate rollback "hangi olaydan (M10) ve neden").
- K3, K5, K6 (`document_request_days`, `s1_customer_notify_hours`), K8, §7, §8 (`MarketMatrixGrid`), §9 (Phase 2 acceptance), §11.
- Field-level sources (repo-external, `A:\job\e-commerce\moesa\ABOUT MOESA`):
  - `03_SABLONLAR/S05_pazar_matrisi.md`: columns, the nine statuses and their "Sonraki durum", the Kontrol list.
  - `03_SABLONLAR/S17_olay_kaydi.md`: sections A–D. `02_YONERGELER/Y10_olay_ve_kurtarma_planlari.md`: §4 severities and deadlines, §5–§7 the 42 card codes.
  - `03_SABLONLAR/S08_degisiklik_talebi.md`: sections A–F.
- Deferred items carried in: the cross-card "tab route alone throws" follow-up (`.superpowers/sdd/2026-11-04-phase2b-po-shipments/progress.md`, Task 8), resolved in Task 1.

## Global Constraints

- Keep the existing patterns: `defineResource` (`{ table, repository: { get, save }, useOne, useSave }`), `useUpsertForm`, `ResourceTable`, route-dialog, `queryKeys`, `invalidateTables(queryClient, tables)`, `updateRow(table, id, patch)` (`app/src/api/saveRow.ts`) for every status or single-field patch, and `appErrorHandler`.
  - No `router.replace` inside a route dialog. A picker inside a route dialog is a plain PrimeVue `Select`/`MultiSelect`/`Dialog`.
  - One shared form per card (`provide`/`inject`, as `useShipmentForm`). Child rows (log lines, deadlines) use their own route dialogs.
  - `useLookup` supports only `{ select, order (ascending), in }`. Anything else is a small dedicated `useQuery` keyed `queryKeys.list(tenantKey, table, params)`. Filters use the supabase-js builder (`.eq`, `.in`, `.neq`, `.order`); no hand-built filter strings.
  - Embeds name their FK: `table!fkey(...)` (alias form `alias:table!fkey(...)`).
- Migrations `034_…` to `038_…`, each with a pgTAP file of the same number, each opening with a design comment (031 style) that names every rule code it raises (036 its two codes; 038 states that it raises none).
- **Replaced database objects** (`next_code`, `entity_customer`, `product_evidence`, `project_gate_guard`, `rollback_gate`) are written as `CREATE OR REPLACE` with the named migration's body unchanged except the quoted change; the plan never transcribes their bodies.
- **Enum values added to `public.document_entity`** (`market_cell`, `change_request`) are added at the top of 034 with `ALTER TYPE … ADD VALUE IF NOT EXISTS`. A new enum value cannot be used by SQL-level statements of the same transaction, so 034 uses them only inside plpgsql bodies (`private.entity_customer`); 035 onward may use them anywhere.
- Every child→parent FK between tenant tables is composite and includes `tenant_id`; a reference that must stay inside one customer also includes `customer_id` (targets: `product_id_customer_tenant_key`, `project_id_customer_tenant_key`, 029). Non-ownership references, including every `…_customer_fkey`, `…_product_fkey`, `…_project_fkey`, `…_document_fkey` and `market_cell_platform_fkey`, are `ON DELETE RESTRICT`; user references are `ON DELETE SET NULL`.
- Every new table gets: `tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE`; `private.enable_tenant_level_security`; `private.audit_enable`; permission rows (`select` read/`throws_error` FALSE; `insert` create, `update`/`delete` modify, `throws_error` TRUE; `bypass` FALSE); the owner grant (031 block); `set_updated_at` where it has `updated_at`.
- Incidents and change requests are never deleted (`REVOKE DELETE … FROM anon, authenticated`, no delete permission); their children go with them by `ON DELETE CASCADE`, mirrored in `CASCADES`. A market cell is deleted only while `candidate`.
- Modules (`is_core` TRUE): `market_matrix` (190) owns `market_cell`; `incident` (200) owns `incident`, `incident_log`, `incident_deadline`; `change_request` (210) owns `change_request`, `change_request_product`. `private.seed_ops_roles` (`supabase/seed.sql`) gains the three group names; each migration ends with `SELECT private.grant_group_to_product_editors('<group>')` (029).
- `authenticated` has no USAGE on `private`. Guards that read rows the caller may not see, or settings, are `SECURITY DEFINER` and filter on `NEW.tenant_id`. `SECURITY INVOKER` triggers (code triggers) never call `private.*`. A private function used in an invoker view gets `GRANT EXECUTE … TO authenticated`. New pure helpers live in `public` (`public.add_business_days`).
- Guard triggers are named `<table>_z_guard` (they sort after the other BEFORE triggers). Each: (1) its immutability rule, whatever the bypass flag; (2) `IF private.rules_bypassed() THEN RETURN …`; (3) the rules. A delete cascaded from a parent or the tenant (`pg_trigger_depth() > 1`) is not checked.
- **pgTAP preamble.** Every pgTAP file of this plan starts, after `BEGIN; SELECT plan(N);`, with the 033 preamble (`test.moesa`, `test.koordinator`, `test.tho`, `test.tr1`, `test.cn1`, `test.mop`, `test.tips`, `test.cones`, `test.spec_mop`, `test.rosbach`, `test.pilot`) and `private.impersonate(koordinator, moesa)`; Task 5 adds `('akif', (SELECT id FROM public.user WHERE email = 'akif@moesa-panel.test'))` to its own list. Fixtures that need a status a user cannot reach use the 030 sequence (`RESET ROLE; set_config('moesa.rules_bypass', '1', TRUE); …; set_config('moesa.rules_bypass', '', TRUE); impersonate`). Rows a test creates have fixed ids `'00000000-0000-4000-8000-000000NNNxxx'`, where `NNN` is the migration number (`…034011` = `00000000-0000-4000-8000-000000034011`). The other-tenant check impersonates `ayse@moesa-panel.test` in `Atlas Danışmanlık`. `authenticated` cannot reach `private`, so every switch to another user while impersonating starts with `RESET ROLE;` (031/033 practice); the blocks below do so.
- Settings are read through `private.company_setting(tenant_id, key)` (029); used keys: `document_request_days` (5) and `s1_customer_notify_hours` (4), both seeded in 015. No setting is added.
- Each rule violation is `RAISE EXCEPTION '<code>' USING ERRCODE = 'check_violation'` unless stated (`foreign_key_violation` for a missing parent, `insufficient_privilege` for a role rule).
  - Every code gets `errors.<code>` in `en` and `tr` (copy in Tasks 3 and 7) and a `NAMED_ERRORS` entry: with a form `field` where one exists, else field-less (toast-level).
- Times: `current_date`, `now()` and every computed deadline are UTC (known Phase 1 backlog item). Business days are Monday–Friday; there is no holiday calendar.
- K8: no account number, case number or personal contact field anywhere; S17's "Vaka numarası" is not a column (Phase 3 `case_ref`). The free-text `incident.reported_by` ("Kim bildirdi, hangi kanaldan": a role and a channel) and `incident_log.counterparty` are not a sensitive category; their hints say "role and channel, no personal contact details".
- i18n: `en` is the source and `tr` is hand-written; the rest come from `pnpm i18n-sync`. No user-visible literal sits in a component. Process codes (G3, S05, S17, OL-09, L-G1) are the same in every language. Guide copy is plain text with numbered keys (`steps.1`, `steps.2`, …), never arrays or Markdown.
- **Copy tables.** EN/TR copy is given as `key: EN / TR`. TR follows the spec or the named template; a row marked **[owner to confirm]** is the developer's reading. The marker never goes into the JSON. Labels not given are the implementer's choice, in the same style.
- Generated types are refreshed with `pnpm dev:supabase-reset` and committed with every DB task (`supabase/functions/_shared/database.types.ts`).
- Commits are conventional. Each task's commit step names the paths to `git add` and the subject line; the message ends with a blank line and the Co-Authored-By trailer your session provides (never a placeholder, never a hard-coded model name).

## Review Focus

1. **A market cell set live without what live needs**, by the status button or a direct PATCH, or a live cell whose platform ID is later blanked: refused with `market_cell_live_incomplete`; a red-compliance cell cannot be planned or later. Tests: Task 2 pgTAP 7, 8, 12, 14; Task 3 `liveMissing`.
2. **A gate rolled back without an incident, with another customer's incident, or with a closed one** (RPC or direct UPDATE): refused (`gate_rollback_incident_required`, `gate_incident_invalid`); the existing rollback-order and reason rules still answer first. Tests: Task 5 `036` pgTAP 1–3 and the updated `021` cases; Task 8 GatePanel test.
3. **Deadlines across a weekend.** An S2 incident opened on Saturday is due to the customer by the end of Monday; a document request opened on Saturday is due five business days later (Friday), not on the following Thursday. Tests: Task 5 pgTAP 3–6.
4. **S1/S2 handling.** An S1/S2 incident cannot leave `open` without the management notice time; an S1 incident is closed only by a user who may update the company (management); a closed incident's log and deadlines no longer change. Tests: Task 5 pgTAP 15–19.
5. **A change request applied without the new document version**, or approved without the customer's written approval when it touches a passed (M) gate. Tests: Task 6 pgTAP 7–11; Task 7 `changeRequestStatusHints`.

---

## File map

```
supabase/migrations/
  034_market_matrix.sql           document_entity += market_cell, change_request; market enums; market_cell; guards;
                                  market_cell_overview; product_evidence.live_cell_count; entity_customer branch; module
  035_incidents.sql               next_code kinds; incident enums; add_business_days; incident(+log, deadline); triggers;
                                  incident_overview; entity_customer branch; module
  036_gate_rollback_incident.sql  project_gate.rolled_back_incident_id; guard rule; rollback_gate(gate, reason, incident)
  037_change_requests.sql         CR enums; change_request(+product); triggers; entity_customer branch; module
  038_dashboard_matrix_incidents.sql dashboard_market, dashboard_incident, dashboard_change_request
supabase/tests/database/          034…038 test files; 021_projects.test.sql (rollback fixtures); 099_seed.test.sql (+3)
supabase/seed.sql                 seed_ops_roles gains market_matrix, incident, change_request
app/src/router/middlewares/before-each/dialog/{index,dialogRoute}.ts
app/src/api/{marketMatrix,incident,changeRequest}/index.ts, app/src/api/{dashboard/index,glossary,queryKeys,project/index,document/index}.ts
app/src/lib/form/postgrestErrors.ts, app/src/constants/form/field.ts, app/src/constants/guide.ts, app/src/store/guide/index.ts
app/src/router/routes/ops.ts, app/src/layouts/dashboard/Index.vue
app/src/components/service-components/{market-matrix-grid,market-cell-table,incident-table,change-request-table,
  product-multi-select,page-guide}/…, dashboard/CountListCard.vue, gate-panel/GatePanel.vue
app/src/views/pages/ops/{market,incident,change-request}/…, ops/project/{Manage.vue,tabs/Incidents.vue}
app/src/views/pages/dashboard/Index.vue
app/src/constants/format.ts (EMPTY_VALUE), select-platform/SelectPlatform.vue (showClear)
app/tests/router/{dialogRoute,incidentRouteProps,marketCellRouteProps}.test.ts, app/tests/components/SelectPlatform.test.ts, app/tests/api/project.test.ts, app/tests/api/{marketMatrix,incident,changeRequest,dashboard,queryKeys}.test.ts,
app/tests/lib/form/postgrestErrors.test.ts, app/tests/views/{marketMatrix,incidentForm,changeRequestForm}.test.ts,
app/tests/components/{MarketMatrixGrid,GatePanel,CountListCard,PageGuide}.test.ts, app/tests/store/guide.test.ts,
app/tests/plugins/i18n/{glossary,fields,guide}.test.ts
```

---

### Task 1: Dialog guard opens a card for its tab route

**Files:**
- Create: `app/src/router/middlewares/before-each/dialog/dialogRoute.ts`, `app/tests/router/dialogRoute.test.ts`
- Modify: `app/src/router/middlewares/before-each/dialog/index.ts`

**Interfaces:**
- Consumes: `dialogBeforeEach`, `openRouteDialog(dialogs, route, position)`; the card routes' shape in `ops.ts` (`ops-<x>-manage` with `path: ':id?/manage/:tab?'`, `props: true`, children `ops-<x>-manage-<tab>`); each `Manage.vue` reads `props.tab`.
- Produces: `dialogRoute(to: RouteLocationNormalized): RouteLocationNormalized`. When the leaf record's name is `<P>-<tab>` and its parent record's name `P` ends with `-manage`, it returns a copy of `to` whose `matched` drops the leaf, `name` is `P`, `meta` is the parent's and `params` gain `tab`; otherwise `to` unchanged. `fullPath` is kept (the session still reopens the tab URL, which resolves the same way).

- [ ] **Step 1: Write the failing test** (`dialogRoute.test.ts`, records built as plain objects cast to `RouteLocationNormalized`):

```ts
const route = (r: object) => ({ params: {}, query: {}, meta: {}, fullPath: '/', ...r }) as unknown as RouteLocationNormalized;
const ops = { name: 'ops', meta: {}, components: { default: {} } };
const section = { name: 'ops-shipment', meta: {}, components: { default: {} } };
const parent = { name: 'ops-shipment-manage', meta: { label: 'route.label.ops_shipment_manage' }, components: { default: {} } };
const leaf = { name: 'ops-shipment-manage-dates', meta: { label: 'route.label.ops_shipment_dates' }, components: { default: {} } };
const to = route({ name: 'ops-shipment-manage-dates', params: { id: 's1' }, matched: [ops, section, parent, leaf], fullPath: '/ops/shipments/s1/manage/dates?showDialog=center' });
const resolved = dialogRoute(to);
expect(resolved.matched.at(-1)).toBe(parent);
expect(resolved.params).toEqual({ id: 's1', tab: 'dates' });
expect(resolved.name).toBe('ops-shipment-manage');
expect(resolved.fullPath).toBe(to.fullPath);
// not a card tab: unchanged
const line = route({ name: 'ops-shipment-line-edit', matched: [ops, section, { name: 'ops-shipment-line-edit', components: { default: {} } }] });
expect(dialogRoute(line)).toBe(line);
// a child of a non-manage parent is unchanged
const contact = route({ name: 'ops-customer-contact-add', matched: [ops, { name: 'ops-customer' }, { name: 'ops-customer-contact-add', components: { default: {} } }] });
expect(dialogRoute(contact)).toBe(contact);
```

- [ ] **Step 2: Run it and see it fail.** Run (in `app/`): `pnpm test tests/router/dialogRoute.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `dialogRoute`** and call it in `dialogBeforeEach` right after the `showDialog` check: `openRouteDialog(dialogs, dialogRoute(to), position)`, and the back route (page load) is computed from the resolved route's `matched`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check (`pnpm dev:vue`): typing `/ops/shipments/<id>/manage/dates?showDialog=center` in the address bar opens the whole shipment card on Dates (before: "must be inside the card").
- [ ] **Step 5: Commit.** `git add app/src/router/middlewares/before-each/dialog app/tests/router/dialogRoute.test.ts`; message `fix(router): a card's tab route opens the whole card in its dialog`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 2: Market cells (DB)

**Files:**
- Create: `supabase/migrations/034_market_matrix.sql`, `supabase/tests/database/034_market_matrix.test.sql`
- Modify: `supabase/seed.sql` (`seed_ops_roles` list and header comment gain `market_matrix`), `supabase/tests/database/099_seed.test.sql` (plan +1), `supabase/functions/_shared/database.types.ts`, i18n `errors.*` of this task (copy in Task 3); then `pnpm i18n-sync`.

**Interfaces:**
- Consumes: `public.platform (id, display_name, countries, position)` (015); `product_id_customer_tenant_key`, `project_id_customer_tenant_key` (029); `private.rules_bypassed()` (030); `private.entity_customer` (031 body); `public.product_evidence` (029 definition); `valid_currency_code`; `private.grant_group_to_product_editors(group_name TEXT)` (029).
- Produces (SQL):
  - `ALTER TYPE public.document_entity ADD VALUE IF NOT EXISTS 'market_cell'`, then `… 'change_request'` (first statements of the file).
  - Enums, in this order:
    - `public.market_cell_status`: `candidate`, `planned`, `preparing`, `uploaded`, `live`, `suppressed`, `paused`, `stopped`, `removed` (S05: Aday, Planlandi, Hazirlaniyor, Yuklendi, Yayinda, Askida, Beklemede, Kapatildi, Cikarildi; the spec's names where it has one);
    - `public.market_compliance`: `green`, `yellow`, `red`, `pending` (`public.compliance_status` already exists, 019);
    - `public.stock_source`: `customer_warehouse`, `3pl`, `platform`, `pan_eu`;
    - `public.content_status`: `none`, `en_master`, `translated`, `approved`.
  - Table `public.market_cell`:
    - `id UUID PK`, `tenant_id`, `customer_id UUID NOT NULL` (set by trigger), `product_id UUID NOT NULL`, `project_id UUID`, `platform_id TEXT NOT NULL`, `country TEXT NOT NULL`, `status public.market_cell_status NOT NULL DEFAULT 'candidate'`, `priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3)`, `compliance public.market_compliance NOT NULL DEFAULT 'pending'`, `compliance_note TEXT`, `platform_product_id TEXT`, `platform_sku TEXT`, `price NUMERIC(12,2) CHECK (price >= 0)`, `currency valid_currency_code`, `stock_source public.stock_source`, `content_status public.content_status NOT NULL DEFAULT 'none'`, `target_launch_on DATE`, `launched_on DATE`, `last_checked_on DATE`, `open_issue TEXT`, `notes TEXT`, `created_at`, `updated_at`.
    - Constraints: `unique_market_cell UNIQUE (tenant_id, product_id, platform_id, country)`; `market_cell_id_tenant_id_key UNIQUE (id, tenant_id)`; `market_cell_product_fkey (product_id, customer_id, tenant_id)` → product; `market_cell_project_fkey (project_id, customer_id, tenant_id)` → project; `market_cell_platform_fkey (platform_id)` → `public.platform (id)`; `market_cell_country_format CHECK (country ~ '^[A-Z]{2}$')`; `market_cell_price_currency CHECK (price IS NULL OR currency IS NOT NULL)`.
    - Indexes `(tenant_id, customer_id)`, `(tenant_id, product_id)`, `(tenant_id, status)`.
  - Trigger `market_cell_customer` (BEFORE INSERT OR UPDATE, DEFINER): `NEW.customer_id` := the product's customer in `NEW.tenant_id` (the `purchase_order_line_customer` pattern; a missing product is left to the FK).
  - Trigger `market_cell_z_guard` (BEFORE INSERT OR UPDATE OR DELETE, DEFINER), in this order:
    1. UPDATE: changed `product_id`, `platform_id` or `country` → `market_cell_immutable_field`.
    2. Bypass.
    3. DELETE: `OLD.status <> 'candidate'` → `market_cell_delete_candidate_only` (cascades exempt); return `OLD`.
    4. INSERT: `country` not in the platform's `countries` → `market_cell_country_invalid`.
    5. Status changed: allowed moves (S05 "Sonraki durum", plus `paused` from `candidate` and `planned`, which S05 leaves unreachable): `candidate → planned | paused | removed`; `planned → preparing | paused`; `preparing → uploaded`; `uploaded → live | suppressed`; `live → suppressed | stopped`; `suppressed → live | stopped`; `paused → planned`; `removed → candidate`; `stopped` is final. Else `market_cell_status_order`. On INSERT the status is forced to `candidate`.
    6. `NEW.status = 'live'` (on every write, so a live cell keeps its data): `platform_product_id`, `platform_sku`, `price`, `currency`, `stock_source` all set and `content_status = 'approved'`, else `market_cell_live_incomplete`. Entering `live` sets `launched_on := coalesce(launched_on, current_date)`.
    7. `suppressed` without `open_issue`, or `stopped`/`removed` without `notes` → `market_cell_reason_required`.
    8. `compliance IN ('yellow','red')` without `compliance_note` → `market_cell_compliance_note_required`.
    9. `compliance = 'red'` and status not in (`candidate`, `stopped`, `removed`) → `market_cell_compliance_red`.
  - View `public.market_cell_overview` (`security_invoker`): every `market_cell` column plus `customer_code`, `project_code`, `sku`, `product_name`, `gtin`, `platform_name`, `cell_key` (`platform_id || '_' || country`, S05 `hucre_id`). `GRANT SELECT … TO authenticated`; a `COMMENT` naming the columns.
  - `public.product_evidence`: `CREATE OR REPLACE` with the 029 definition unchanged except: `0::INT AS live_cell_count` becomes `(SELECT count(*)::INT FROM public.market_cell m WHERE m.product_id = p.id AND m.tenant_id = p.tenant_id AND m.status = 'live') AS live_cell_count`; the comment drops "placeholder" for live_cell_count.
  - `private.entity_customer`: `CREATE OR REPLACE` with the 031 body unchanged except one branch added before `ELSE`: `WHEN 'market_cell' THEN RETURN (SELECT m.customer_id FROM public.market_cell m WHERE m.id = entity_customer.entity_id AND m.tenant_id = entity_customer.tenant_id);`.
  - Module `('market_matrix', TRUE, 190)`; permissions `public.market_cell`: select, insert, update, delete; owner grant; `SELECT private.grant_group_to_product_editors('market_matrix')`.
- Produces (seed): `seed_ops_roles` adds `'market_matrix'`.

- [ ] **Step 1: Write `034_market_matrix.test.sql`** — `plan(19)`, the preamble, then:

```sql
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000034001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000034002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000034001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
-- The first cell is sent with another customer: the trigger takes the product's.
INSERT INTO public.market_cell (id, tenant_id, customer_id, product_id, project_id, platform_id, country)
VALUES ('00000000-0000-4000-8000-000000034011', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000034001', current_setting('test.mop')::UUID, current_setting('test.pilot')::UUID, 'amazon', 'DE'),
       ('00000000-0000-4000-8000-000000034012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tips')::UUID, NULL, 'ebay', 'DE');

SELECT is((SELECT status || ':' || (customer_id = current_setting('test.tho')::UUID) FROM public.market_cell WHERE id = '00000000-0000-4000-8000-000000034011'),
          'candidate:true', 'a new cell is a candidate of its product''s customer');
SELECT throws_ok($$ INSERT INTO public.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'DE') $$,
                 '23505', NULL, 'one cell per product, platform and country');
SELECT throws_ok($$ INSERT INTO public.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'TR') $$,
                 '23514', 'market_cell_country_invalid', 'the country is one of the platform''s');
SELECT throws_ok($$ INSERT INTO public.market_cell (tenant_id, product_id, platform_id, country) VALUES (current_setting('test.moesa')::UUID, current_setting('test.mop')::UUID, 'amazon', 'de') $$,
                 '23514', NULL, 'an ISO 3166-1 alpha-2 code');
SELECT throws_ok($$ UPDATE public.market_cell SET project_id = '00000000-0000-4000-8000-000000034002' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23503', NULL, 'not another customer''s project');
SELECT throws_ok($$ UPDATE public.market_cell SET status = 'live' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_status_order', 'statuses move as S05 says');

UPDATE public.market_cell SET status = 'planned' WHERE id = '00000000-0000-4000-8000-000000034011';
UPDATE public.market_cell SET status = 'preparing' WHERE id = '00000000-0000-4000-8000-000000034011';
UPDATE public.market_cell SET status = 'uploaded' WHERE id = '00000000-0000-4000-8000-000000034011';

SELECT throws_ok($$ UPDATE public.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', price = 12.99, currency = 'EUR', stock_source = 'platform', content_status = 'translated'
                    WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'live needs approved content (L-G1)');
SELECT throws_ok($$ UPDATE public.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', stock_source = 'platform', content_status = 'approved'
                    WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'live needs the price');
UPDATE public.market_cell SET status = 'live', platform_product_id = 'B0TEST0001', platform_sku = 'THO-MOP40-2P', price = 12.99, currency = 'EUR', stock_source = 'platform', content_status = 'approved'
WHERE id = '00000000-0000-4000-8000-000000034011';

SELECT is((SELECT status || ':' || launched_on FROM public.market_cell WHERE id = '00000000-0000-4000-8000-000000034011'),
          'live:' || current_date, 'going live dates the launch');
SELECT is((SELECT live_cell_count FROM public.product_evidence WHERE product_id = current_setting('test.mop')::UUID), 1,
          'the product counts its live cells');
SELECT throws_ok($$ UPDATE public.market_cell SET status = 'suppressed' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_reason_required', 'a suppressed cell names its open issue');
SELECT throws_ok($$ UPDATE public.market_cell SET platform_product_id = NULL WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_live_incomplete', 'a live cell keeps its listing data');
SELECT throws_ok($$ UPDATE public.market_cell SET compliance = 'yellow' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_compliance_note_required', 'yellow needs a compliance note');

UPDATE public.market_cell SET status = 'planned' WHERE id = '00000000-0000-4000-8000-000000034012';

SELECT throws_ok($$ UPDATE public.market_cell SET compliance = 'red', compliance_note = 'No EPR registration' WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_compliance_red', 'a red cell is not planned');
SELECT throws_ok($$ UPDATE public.market_cell SET country = 'FR' WHERE id = '00000000-0000-4000-8000-000000034011' $$,
                 '23514', 'market_cell_immutable_field', 'a cell keeps its product, platform and country');
SELECT throws_ok($$ DELETE FROM public.market_cell WHERE id = '00000000-0000-4000-8000-000000034012' $$,
                 '23514', 'market_cell_delete_candidate_only', 'only a candidate is deleted');

INSERT INTO public.market_cell (id, tenant_id, product_id, platform_id, country)
VALUES ('00000000-0000-4000-8000-000000034013', current_setting('test.moesa')::UUID, current_setting('test.cones')::UUID, 'amazon', 'FR');

SELECT lives_ok($$ DELETE FROM public.market_cell WHERE id = '00000000-0000-4000-8000-000000034013' $$, 'a candidate is deleted');
SELECT is((SELECT cell_key || ':' || sku FROM public.market_cell_overview WHERE id = '00000000-0000-4000-8000-000000034011'),
          'amazon_DE:THO-MOP40-2P', 'the overview names the cell and its SKU');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.market_cell), 0, 'another tenant sees none');
```

- [ ] **Step 2: Add to `099_seed.test.sql`** (as `postgres`, plan +1): `SELECT ok(cardinality(private.tenants_permitting((SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'), ARRAY[(SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')], 'public.market_cell', 'insert')) = 1, 'the coordinator opens market cells');`
- [ ] **Step 3: Run it and see it fail.** Run (in `app/`): `pnpm test:db`. Expected: FAIL (`relation "public.market_cell" does not exist`).
- [ ] **Step 4: Write `034_market_matrix.sql`** following the Interfaces. REVOKE ALL on the new private functions from `PUBLIC, anon, authenticated`. Update `seed_ops_roles`; add the `errors.*` keys of this task (Task 3 table); sync.
- [ ] **Step 5: Reset and run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add supabase/migrations/034_market_matrix.sql supabase/tests/database/034_market_matrix.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales`; message `feat(market): market cells per product, platform and country with the S05 status rules`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 3: Market matrix API (app)

**Files:**
- Create: `app/src/api/marketMatrix/index.ts`, `app/tests/api/marketMatrix.test.ts`
- Modify:
  - `app/src/api/queryKeys.ts`, DERIVED: `market_cell: ['market_cell_overview', 'product_evidence', 'product_with_evidence']` (not `dashboard_product_evidence`: 022's view reads `product_evidence` but none of its columns change with cells); `product`, `project`, `customer` each gain `'market_cell_overview'`.
  - `app/src/api/document/index.ts`: `DOCUMENT_ENTITIES` gains `'market_cell'`; i18n `ops.document.entity.market_cell`: Market cell / Pazar hücresi (the one `ops.*` key an API task adds: it labels the constant it extends).
  - `app/src/api/glossary.ts`: `GLOSSARY_ENUMS` gains the four market enums; `app/tests/plugins/i18n/glossary.test.ts`: the expected key list gains them.
  - `app/src/lib/form/postgrestErrors.ts`: the rows below.
  - `app/src/constants/form/field.ts`: `market_cell: { name: 'ops-market-cell-edit' }`.
  - i18n: `fields.market_cell` (Market cell / Pazar hücresi), `fields.market_matrix` (Market matrix / Pazar matrisi), the `errors.*` and `glossary.*` keys below. API tasks own `errors.*` and `glossary.*`; the `ops.market.*` UI keys are Task 4's.
  - `app/tests/plugins/i18n/fields.test.ts`: `OPS_TABLES` gains `market_cell`, `OPS_MODULES` gains `market_matrix`.
  - `app/tests/api/queryKeys.test.ts`, `app/tests/lib/form/postgrestErrors.test.ts`.

**Interfaces:**
- Consumes: Task 2 tables and view; `defineResource`, `updateRow`, `invalidateTables`, `queryKeys`, `useTenantKey`, `useLookup`, `allValues`; `optional`, `required`, `requiredText`, `dateOnly` from `@/lib/form/fields`.
- Produces (`api/marketMatrix/index.ts`):
  - Types: `MarketCellStatus`, `MarketCompliance`, `StockSource`, `ContentStatus` (`Enums[...]`); `MarketCellRow`; `MarketCellOverviewRow = Views['market_cell_overview']['Row']`; `MarketCellCard` (the row with the embeds below).
  - Constants (`allValues`, enum order): `MARKET_CELL_STATUSES`, `MARKET_COMPLIANCES`, `STOCK_SOURCES`, `CONTENT_STATUSES`.
  - `TARGET_STATUSES: readonly MarketCellStatus[] = ['planned', 'preparing', 'uploaded', 'live', 'suppressed', 'paused']` (the spec's "hedef").
  - `MARKET_CELL_STATUS_SEVERITY: Record<MarketCellStatus, 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast'>`: candidate secondary, planned secondary, preparing info, uploaded info, live success, suppressed danger, paused warn, stopped contrast, removed contrast.
  - `nextMarketCellStatuses(status: MarketCellStatus): MarketCellStatus[]`: exactly guard rule 5, in enum order.
  - `LIVE_FIELDS = ['platform_product_id', 'platform_sku', 'price', 'currency', 'stock_source', 'content_status'] as const`; `liveMissing(cell: Pick<MarketCellRow, (typeof LIVE_FIELDS)[number]>): (typeof LIVE_FIELDS)[number][]` (empty or null counts as missing; `content_status` is missing unless `approved`).
  - `cellKey(platformId: string, country: string): string` → `amazon_DE`.
  - `buildMatrix(cells: readonly MarketCellOverviewRow[]): MarketMatrix` where `MarketMatrix = { columns: { key: string; platformId: string; platformName: string; country: string }[]; rows: { productId: string; sku: string; productName: string; cells: Record<string, MarketCellOverviewRow> }[] }`. Columns: one per `cell_key` present, sorted by platform name, then country; rows: one per product, sorted by SKU.
  - `matrixCounts(cells: readonly Pick<MarketCellRow, 'customer_id' | 'status'>[]): Record<string, { live: number; target: number }>` keyed by customer id.
  - `missingCells(existing: readonly Pick<MarketCellRow, 'product_id' | 'platform_id' | 'country'>[], productIds: readonly string[], platformId: string, countries: readonly string[]): { product_id: string; platform_id: string; country: string }[]`: the combinations not in `existing`, products in the given order, then countries.
  - `MARKET_CELL_SELECT = '*, product!market_cell_product_fkey(sku, display_name), project!market_cell_project_fkey(code, display_name), platform!market_cell_platform_fkey(display_name, countries, product_id_label)'`; `marketCellResource = defineResource<'market_cell', MarketCellCard>('market_cell', { select: MARKET_CELL_SELECT })`.
  - `marketCellSchema` (zod): `id` optional; `product_id` `required(z.uuid())`; `project_id` `optional(z.uuid())`; `platform_id` required string; `country` `/^[A-Z]{2}$/`; `priority` int 1–3 (default 2); `compliance` enum; `compliance_note`, `platform_product_id`, `platform_sku`, `open_issue`, `notes` optional text; `price` optional ≥ 0; `currency` optional `/^[A-Z]{3}$/`; `stock_source` optional enum; `content_status` enum; `target_launch_on`, `launched_on`, `last_checked_on` `optional(dateOnly())`. A `superRefine` puts `errors.market_cell_compliance_note_required` on `compliance_note` for yellow/red without a note.
  - `toMarketCellFormValues(cell?: Partial<MarketCellRow>)`; `toMarketCellPayload(values, id?)`: never sends `customer_id`, `status`, `launched_on` unless set by the user, and sends `product_id`, `platform_id`, `country` only without `id`.
  - `useSetMarketCellStatus()`: mutation `({ id, status }) => updateRow('market_cell', id, { status })`, then `invalidateTables(queryClient, ['market_cell'])`.
  - `useMarketCells(filter: MaybeRefOrGetter<{ customerId: string | null; platformId?: string | null }>)`: a `useQuery` over `market_cell_overview` (`.eq('customer_id', …)` when set, `.eq('platform_id', …)` when set), keyed `queryKeys.list(tenantKey, 'market_cell_overview', { view: 'matrix', ...filter })`; returns rows.
  - `useAddMarketCells()`: mutation `(rows: { product_id: string; platform_id: string; country: string; priority: number; project_id: string | null }[]) => supabase.from('market_cell').insert(rows).select('id').throwOnError()`, then `invalidateTables(queryClient, ['market_cell'])`; returns the inserted count.
  - Platforms are not wrapped again: Task 4 uses the existing `usePlatformOptions()` (`api/customer`, `{ id, display_name, countries }`) and `SelectPlatform.vue`; the platform's `product_id_label` comes from the cell embed.

NAMED_ERRORS additions ("—" = toast-level, no `field`; `message` is `errors.<name>` unless given):

| code | name | field |
|---|---|---|
| 23505 | unique_market_cell | country (`errors.market_cell_duplicate`) |
| 23514 | market_cell_country_invalid | country |
| 23514 | market_cell_country_format | country (`errors.market_cell_country_invalid`) |
| 23503 | market_cell_product_fkey | product_id (`errors.market_cell_product_customer`) |
| 23503 | market_cell_project_fkey | project_id (`errors.market_cell_project_customer`) |
| 23514 | market_cell_price_currency | currency |
| 23514 | market_cell_compliance_note_required | compliance_note |
| 23514 | market_cell_compliance_red | compliance |
| 23514 | market_cell_live_incomplete, market_cell_status_order, market_cell_reason_required, market_cell_immutable_field, market_cell_delete_candidate_only | — (one entry each) |

Error copy (`errors.*`, EN / TR):
- market_cell_duplicate: This product already has a cell for this platform and country. / Bu ürünün bu platform ve ülke için zaten bir hücresi var.
- market_cell_country_invalid: Choose one of the platform's countries (ISO code). / Platformun ülkelerinden birini seçin (ISO kodu).
- market_cell_product_customer: The product belongs to another customer. / Ürün başka bir müşteriye ait.
- market_cell_project_customer: The project belongs to another customer. / Proje başka bir müşteriye ait.
- market_cell_price_currency: A price needs its currency. / Fiyatın para birimi olmalı.
- market_cell_compliance_note_required: Yellow and red compliance need a note (S12). / Sarı ve kırmızı uyum not ister (S12).
- market_cell_compliance_red: A red cell cannot be planned or live; remove it with the reason. / Kırmızı hücre planlanamaz ve yayına alınamaz; nedeniyle çıkarın.
- market_cell_live_incomplete: Live needs the platform ID, platform SKU, price, currency, stock source and approved content (L-G1). / Yayın için platform kimliği, platform SKU, fiyat, para birimi, stok kaynağı ve onaylı içerik (L-G1) gerekir.
- market_cell_status_order: The cell cannot move to this status from its current one (S05). / Hücre mevcut durumundan bu duruma geçemez (S05).
- market_cell_reason_required: Write the reason: the open issue when suppressed, a note when closed or removed. / Nedeni yazın: askıdaysa açık sorun, kapatıldı ya da çıkarıldıysa not.
- market_cell_immutable_field: A cell's product, platform and country do not change; open a new cell. / Hücrenin ürünü, platformu ve ülkesi değişmez; yeni hücre açın.
- market_cell_delete_candidate_only: Only a candidate cell can be deleted; remove or close the others. / Yalnızca aday hücre silinebilir; diğerlerini çıkarın ya da kapatın.

Glossary (this task registers `market_cell_status`, `market_compliance`, `stock_source` and `content_status` in `GLOSSARY_ENUMS` in `app/src/api/glossary.ts`, so Task 4 can pass `glossary="…"`; `glossary.test.ts`'s expected sorted key list gains the four; copy `glossary.<enum>.<value>`, exact; **[owner to confirm]** is not copied into the JSON):

| key | en | tr |
|---|---|---|
| market_cell_status.candidate | Being assessed in PL1/P1; no decision yet. | PL1/P1'de değerlendiriliyor; henüz karar yok. |
| market_cell_status.planned | In the L1 plan, approved in writing by the customer, with a date. | L1 planında; müşteri yazılı onayladı; tarih var. |
| market_cell_status.preparing | L2–L3 content and localisation are under way. | L2–L3 içerik ve yerelleştirme sürüyor. |
| market_cell_status.uploaded | L4: uploaded; waiting for the platform's review or activation. | L4: platforma yüklendi; platform incelemesi veya aktifleşme bekleniyor. |
| market_cell_status.live | Active and buyable; the S13 pre-launch check passed. | Aktif ve satın alınabilir; S13 yayın kontrolü geçti. |
| market_cell_status.suppressed | Suppressed, waiting for a category approval or a document request; the open issue is written. | Bastırıldı, kategori onayı bekliyor veya belge talebi var; açık sorun yazılı. |
| market_cell_status.paused | Waiting for a customer decision or a prerequisite (registration, EPR, VAT). | Müşteri kararı veya ön koşul (tescil, EPR kaydı, KDV) bekliyor. |
| market_cell_status.stopped | Taken down for good (decision or platform); the reason is written. | Yayından kalıcı kaldırıldı (karar veya platform); neden yazılı. |
| market_cell_status.removed | Dropped from the plan (compliance red, no demand, customer decision); the reason is written. | Plandan çıkarıldı (uyum kırmızı, talep yok, müşteri kararı); neden yazılı. |
| market_compliance.green | No restriction found. **[owner to confirm]** | Kısıt yok. |
| market_compliance.yellow | Possible with a restriction, document or marking; see the note (S12). | Kısıt, belge veya işaret ihtiyacıyla mümkün; nota bakın (S12). |
| market_compliance.red | Not allowed; the cell is not planned. | Uygun değil; hücre planlanmaz. |
| market_compliance.pending | Not screened yet (PL1/P1). | Henüz taranmadı (PL1/P1). |
| stock_source.customer_warehouse | Shipped from the customer's own warehouse. | Müşterinin kendi deposundan gönderilir. |
| stock_source.3pl | Shipped by a third-party logistics provider. | Üçüncü taraf lojistik firmasından gönderilir. |
| stock_source.platform | Stored and shipped by the platform (e.g. FBA). | Platform deposunda tutulur, platform gönderir (ör. FBA). |
| stock_source.pan_eu | Amazon Pan-European FBA spreads the stock across EU countries. **[owner to confirm]** | Amazon Pan-Avrupa FBA stoğu AB ülkelerine dağıtır. |
| content_status.none | No listing content yet. | Henüz listing içeriği yok. |
| content_status.en_master | The English master set is ready. | İngilizce ana set hazır. |
| content_status.translated | Translated into the market's language. | Pazarın diline çevrildi. |
| content_status.approved | Content approved (L-G1); needed before live. | İçerik onaylandı (L-G1); yayından önce şart. |

UI copy (`ops.market.*`, EN / TR). **Task 4 owns and adds these keys**; they are listed here beside the enums they label:
- `title`: Market matrix / Pazar matrisi
- `status.*` (S05 TR): candidate Candidate / Aday; planned Planned / Planlandı; preparing Preparing / Hazırlanıyor; uploaded Uploaded / Yüklendi; live Live / Yayında; suppressed Suppressed / Askıda; paused On hold / Beklemede; stopped Closed / Kapatıldı; removed Removed / Çıkarıldı
- `compliance.*`: green Green / Yeşil; yellow Yellow / Sarı; red Red / Kırmızı; pending Pending / Bekliyor
- `stock_source.*`: customer_warehouse Customer warehouse / Müşteri deposu; 3pl 3PL / 3PL; platform Platform warehouse / Platform deposu; pan_eu Pan-European / Pan-Avrupa
- `content_status.*`: none None / Yok; en_master EN master / EN ana set; translated Translated / Çevrildi; approved Approved (L-G1) / Onaylandı (L-G1)
- `fields.*` (S05 column names): product Product / Ürün; project Project / Proje; platform Platform / Platform; country Country / Ülke; status Status / Durum; priority Priority / Öncelik; compliance Compliance / Uyum durumu; compliance_note Compliance note / Uyum notu; platform_product_id Platform product ID / Ürün kimliği; platform_sku Platform SKU / Platform SKU; price Price (incl. VAT) / Fiyat (KDV dahil); currency Currency / Para birimi; stock_source Stock source / Stok kaynağı; content_status Content language status / İçerik dil durumu; target_launch_on Target launch / Hedef yayın tarihi; launched_on Launched / Yayın tarihi; last_checked_on Last checked / Son kontrol; open_issue Open issue / Açık sorun; notes Note / Not
- `priority.{1,2,3}` (06 §5 L1): Same account, new country / Aynı hesapta yeni ülke; New platform / Yeni platform; New region / Yeni bölge
- `live_missing`: Missing for live: {fields} / Yayın için eksik: {fields}

- [ ] **Step 1: Write the tests** (`marketMatrix.test.ts`; the queryKeys and postgrestErrors cases go to their files):

```ts
expect(nextMarketCellStatuses('candidate')).toEqual(['planned', 'paused', 'removed']);
expect(nextMarketCellStatuses('uploaded')).toEqual(['live', 'suppressed']);
expect(nextMarketCellStatuses('stopped')).toEqual([]);
expect(nextMarketCellStatuses('removed')).toEqual(['candidate']);
expect(liveMissing({ platform_product_id: 'B0X', platform_sku: 'S', price: 12.99, currency: 'EUR', stock_source: 'platform', content_status: 'translated' })).toEqual(['content_status']);
expect(liveMissing({ platform_product_id: '', platform_sku: null, price: 0, currency: 'EUR', stock_source: 'platform', content_status: 'approved' })).toEqual(['platform_product_id', 'platform_sku']);
const cell = (id: string, product: string, sku: string, platform: string, name: string, country: string) =>
   ({ id, product_id: product, sku, product_name: sku, platform_id: platform, platform_name: name, country, cell_key: `${platform}_${country}` }) as MarketCellOverviewRow;
const m = buildMatrix([cell('c1', 'p2', 'THO-TIPS', 'ebay', 'eBay', 'DE'), cell('c2', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'FR'), cell('c3', 'p1', 'THO-MOP', 'amazon', 'Amazon', 'DE')]);
expect(m.columns.map((c) => c.key)).toEqual(['amazon_DE', 'amazon_FR', 'ebay_DE']);
expect(m.rows.map((r) => r.sku)).toEqual(['THO-MOP', 'THO-TIPS']);
expect(m.rows[0].cells.amazon_DE.id).toBe('c3');
expect(m.rows[1].cells.amazon_DE).toBeUndefined();
expect(matrixCounts([{ customer_id: 'k', status: 'live' }, { customer_id: 'k', status: 'candidate' }, { customer_id: 'k', status: 'paused' }]))
   .toEqual({ k: { live: 1, target: 2 } });
expect(missingCells([{ product_id: 'p1', platform_id: 'amazon', country: 'DE' }], ['p1', 'p2'], 'amazon', ['DE', 'FR']))
   .toEqual([{ product_id: 'p1', platform_id: 'amazon', country: 'FR' }, { product_id: 'p2', platform_id: 'amazon', country: 'DE' }, { product_id: 'p2', platform_id: 'amazon', country: 'FR' }]);
expect(marketCellSchema.safeParse({ ...toMarketCellFormValues({ product_id: P, platform_id: 'amazon', country: 'DE' }), compliance: 'red' }).success).toBe(false);
const payload = toMarketCellPayload(marketCellSchema.parse(toMarketCellFormValues({ product_id: P, platform_id: 'amazon', country: 'DE' })), 'c1');
for (const key of ['product_id', 'platform_id', 'country', 'customer_id', 'status']) expect(payload).not.toHaveProperty(key);
// queryKeys.test.ts
expect(affectedTables(['market_cell'])).toEqual(expect.arrayContaining(['market_cell_overview', 'product_evidence']));
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23505', message: 'duplicate key value violates unique constraint "unique_market_cell"' }, ['country']))
   .toEqual({ country: i18n.t('errors.market_cell_duplicate') });
expect(mapPostgrestError({ code: '23514', message: 'market_cell_live_incomplete' }, ['price'])).toBeNull();
```

  (`P` is `'00000000-0000-4000-8000-000000000001'`.)
- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/api/marketMatrix.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module and the queryKeys, document, NAMED_ERRORS, field.ts and i18n changes; `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add app/src/api/marketMatrix app/src/api/glossary.ts app/src/api/queryKeys.ts app/src/api/document app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests`; message `feat(market): market matrix API with the S05 status flow, live checks and the pivot builder`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 4: Market matrix screens

**Files:**
- Create:
  - `app/src/components/service-components/market-matrix-grid/MarketMatrixGrid.vue`
  - `app/src/components/service-components/market-cell-table/MarketCellTable.vue`
  - `app/src/components/service-components/product-multi-select/ProductMultiSelect.vue`
  - `app/src/views/pages/ops/market/{Index,CellUpsert,CellsAdd}.vue`
  - `app/tests/components/MarketMatrixGrid.test.ts`, `app/tests/views/marketMatrix.test.ts`
- Modify:
  - `app/src/router/routes/ops.ts`: `marketCellProps(route)` (below) and the routes.
  - `app/src/components/service-components/select-platform/SelectPlatform.vue`: an optional `showClear?: boolean` prop passed through to the PrimeVue `Select` (today it has only `v-model`); test `app/tests/components/SelectPlatform.test.ts`.
  - i18n: `route.label.ops_market*`, every `ops.market.*` key (Task 3's UI-copy list and the keys below; this task owns them).
- Create also: `app/src/constants/format.ts` with `EMPTY_VALUE = '—'` (S05's mark for a cell that is not opened), the one place the dash is defined; the grid renders it through `formatEmpty(value?: string | null): string` from the same file.

**Interfaces:**
- Consumes: Task 3; `usePlatformOptions` (`api/customer`), `SelectPlatform`, `SelectCustomer`; `StatusActions` (`current`, `next`, `i18nPrefix`, `glossary?`, `warnings?`, `onChange`); `SelectEnum`; `useCustomerFilter`, `withCustomerFilter`; `useUpsertForm`; `useLookup`.
- Produces:
  - `ProductMultiSelect.vue`: props `{ customerId: string | null }`, `v-model: string[]`; a PrimeVue `MultiSelect` (filter on) over `useLookup('product', { select: 'id, sku, display_name, status', order: 'sku', in: { column: 'customer_id', values: [customerId] } }, () => !!customerId)`, archived products left out unless selected; label `SKU — name`. Reused by Task 9.
  - `MarketMatrixGrid.vue`: props `{ cells: MarketCellOverviewRow[]; canCreate: boolean }`; emits `open: [cellId: string]`, `add: [cell: { productId: string; platformId: string; country: string }]`. A PrimeVue `DataTable` over `buildMatrix(cells).rows`: a frozen first column (SKU and name), then one column per matrix column headed `platformName country`. A cell shows a `Tag` (`MARKET_CELL_STATUS_SEVERITY`, `ops.market.status.<s>`) and, when compliance is red, a `pi-exclamation-triangle` with the tooltip `ops.market.compliance.red`; clicking emits `open`. An empty cell shows `formatEmpty(null)` (`EMPTY_VALUE`, S05's dash) and, when `canCreate`, is a button emitting `add`.
  - `MarketCellTable.vue`: a `ResourceTable` over `market_cell_overview`, following the customer filter. Columns: sku, product_name, platform_name, country, status (Tag + `SelectEnum` filter, `glossary="market_cell_status"`), priority, compliance, content_status, target_launch_on, launched_on, last_checked_on. A row opens `ops-market-cell-edit`.
  - `Index.vue` (route `ops-market-list`): header `ops.market.title`; a `SelectButton` (`ops.market.view.matrix` / `ops.market.view.list`) bound to the route query `view` (`router.replace` on the page itself, not in a dialog; default `matrix`); a `SelectPlatform show-clear` (the new pass-through) for the matrix; per customer of the shown cells a Tag `ops.market.counter` (`{code}: {live} live / {target} target`) from `matrixCounts`; then `MarketMatrixGrid` (cells from `useMarketCells({ customerId, platformId })`) or `MarketCellTable`. `add` opens `ops-market-cell-add` with query `product_id`, `platform_id`, `country`; `open` opens `ops-market-cell-edit`. A toolbar button `ops.market.add_cells` (create `market_cell`) opens `ops-market-cells-add`.
  - `CellUpsert.vue` (route dialog, props `id?`, `product_id?`, `platform_id?`, `country?`):
    - new: product (`ProductSelect` from `views/pages/ops/purchase-order/ProductSelect.vue`, customer from the filter), platform (`SelectPlatform`), country (`Select` over the chosen platform's `countries` from `usePlatformOptions`), priority, project (`ProjectSelect` from the same folder), notes; it never sends `status` (the database makes the cell `candidate`).
    - edit: the identity is read-only; sections Status (`StatusActions` with `nextMarketCellStatuses`, `glossary="market_cell_status"`, `warnings.live` = `ops.market.live_missing` with the labels of `liveMissing(values)` when non-empty), Compliance (compliance, note), Listing (platform product ID labelled by the platform's `product_id_label`, platform SKU, price, currency, stock source, content status), Dates (target, launched, last checked), open issue, notes.
  - `CellsAdd.vue` (route dialog): customer (from the filter, required; `SelectCustomer`), products (`ProductMultiSelect`), project (optional, `ProjectSelect`), platform (`SelectPlatform`), countries (`MultiSelect` over the platform's `countries` from `usePlatformOptions`), priority. Save computes `missingCells(existingCells, …)` from `useMarketCells({ customerId })`, inserts them with `useAddMarketCells`, then toasts `ops.market.cells_added` (`{added} added, {skipped} already existed`) and closes.
  - Routes (parent `path: 'market-matrix'`, name `ops-market`, `PrimeIcons.TABLE`, `requiredPermissions` select `market_cell`, context menu "add" → `ops-market-cells-add` centered; the `ops` section's `anyPermission` gains select `market_cell`):
    - `ops-market-list` (`list`, `visible: false`, `index: -1`), the parent redirects to it;
    - `ops-market-cell-add` (`cell/add`, create `market_cell`, `props: marketCellProps`);
    - `ops-market-cell-edit` (`cell/:id/edit`, modify `market_cell`);
    - `ops-market-cells-add` (`cells/add`, create `market_cell`).
  - `marketCellProps(route: RouteLocationNormalized)` in `ops.ts`, exported for its test: `{ ...route.params, product_id: route.query.product_id ?? null, platform_id: route.query.platform_id ?? null, country: route.query.country ?? null }` (the `purchaseOrderProps` pattern).
- Copy (`ops.market.*`): `view.matrix` Matrix / Matris; `view.list` List / Liste; `counter` {code}: {live} live / {target} target / {code}: {live} yayında / {target} hedef; `add_cells` Add cells / Hücre ekle; `cells_added` {added} added, {skipped} already existed / {added} eklendi, {skipped} zaten vardı; `no_cells` No cells yet. Add cells to start the matrix. / Henüz hücre yok. Matrisi başlatmak için hücre ekleyin.; `sections.{status,compliance,listing,dates}` Status, Compliance, Listing, Dates / Durum, Uyum, Listing, Tarihler. Route labels: `ops_market` Market matrix / Pazar matrisi; `ops_market_list` Matrix / Matris; `ops_market_cell_add` New cell / Yeni hücre; `ops_market_cell_edit` Cell / Hücre; `ops_market_cells_add` Add cells / Hücre ekle.

- [ ] **Step 1: Write the tests** (cells `c1` THO-TIPS/eBay DE, `c2` THO-MOP/Amazon FR, `c3` THO-MOP/Amazon DE, products `p1` = THO-MOP, `p2` = THO-TIPS, as in Task 3).
  - `MarketMatrixGrid.test.ts`:
    - `it('heads one column per platform and country')`: the header texts are `['Amazon DE', 'Amazon FR', 'eBay DE']` after the SKU column.
    - `it('marks a cell that is not opened')`: the THO-TIPS row's Amazon DE cell text is `'—'` (`EMPTY_VALUE`).
    - `it('asks to add an empty cell')`: with `canCreate: true`, clicking it emits `add` with `[{ productId: 'p2', platformId: 'amazon', country: 'DE' }]`; with `canCreate: false` the cell contains no `button`.
    - `it('opens a cell')`: clicking the `c3` Tag emits `open` with `['c3']`; the Tag's text is `i18n.t('ops.market.status.candidate')`.
  - `SelectPlatform.test.ts`: `it('passes showClear to the select')`: mounted with `showClear: true` the PrimeVue `Select` receives `showClear === true`; without it, `false`.
  - `app/tests/router/marketCellRouteProps.test.ts`: `it('reads the new cell from the query')`: `marketCellProps({ params: {}, query: { product_id: 'p1', platform_id: 'amazon', country: 'DE' } })` equals `{ product_id: 'p1', platform_id: 'amazon', country: 'DE' }`.
  - `marketMatrix.test.ts` (`import '../setup/mockMain'` first; `useMarketCells` and `useAddMarketCells` mocked with a hoisted `vi.fn()`):
    - `it('adds only the missing cells')`: `CellsAdd` with existing cell `(p1, amazon, DE)`, products `['p1', 'p2']`, platform `amazon`, countries `['DE']`, priority left at 2, no project: submitting calls the mutate once with `[{ product_id: 'p2', platform_id: 'amazon', country: 'DE', priority: 2, project_id: null }]` and toasts `i18n.t('ops.market.cells_added', { added: 1, skipped: 1 })`.
    - `it('warns what live still needs')`: `CellUpsert` in edit mode for a cell at `uploaded` with every listing field set and `content_status: 'translated'` passes `StatusActions` `next` = `['live', 'suppressed']` and `warnings.live` = `i18n.t('ops.market.live_missing', { fields: i18n.t('ops.market.fields.content_status') })`.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/components/MarketMatrixGrid.test.ts tests/components/SelectPlatform.test.ts tests/router/marketCellRouteProps.test.ts tests/views/marketMatrix.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check as `koordinator@`: with THO selected, "Add cells" for the three THO products on Amazon DE/FR/IT creates nine candidates; the matrix shows them; a second run adds 0 and skips 9.
- [ ] **Step 5: Commit.** `git add app/src/constants/format.ts app/src/components/service-components/market-matrix-grid app/src/components/service-components/market-cell-table app/src/components/service-components/product-multi-select app/src/components/service-components/select-platform app/src/views/pages/ops/market app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests`; message `feat(market): market matrix pivot and list, cell dialog and bulk cell creation`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 5: Incidents and the gate rollback through an incident (DB)

**Files:**
- Create: `supabase/migrations/035_incidents.sql`, `supabase/migrations/036_gate_rollback_incident.sql`, `supabase/tests/database/035_incidents.test.sql`, `supabase/tests/database/036_gate_rollback_incident.test.sql`
- Modify:
  - `supabase/tests/database/021_projects.test.sql`: a fixture incident and the two successful rollbacks cite it (Step 3).
  - `supabase/seed.sql` (`seed_ops_roles` gains `incident`), `supabase/tests/database/099_seed.test.sql` (plan +1), `supabase/functions/_shared/database.types.ts`, i18n `errors.*` of this task (copy in Task 7); sync.

**Interfaces:**
- Consumes: `public.next_code` (015 body), `private.company_setting`, `private.rules_bypassed`, `private.tenants_permitting(user_id, tenant_ids, resource, command)`, `private.entity_customer` (034 body), `private.project_gate_guard` (032 body), `public.rollback_gate` (021 body), `private.grant_group_to_product_editors`.
- Produces (035, SQL):
  - `public.next_code`: `CREATE OR REPLACE` with the 015 body unchanged except: the kind check reads `next_code.kind NOT IN ('project', 'po', 'shp', 'cr', 'ol', 'oa', 'ou', 'ot', 'om')`.
  - `public.add_business_days(start_on DATE, days INT) RETURNS DATE` IMMUTABLE STRICT, `GRANT EXECUTE … TO authenticated`: the `days`-th Monday–Friday after `start_on`; for `days = 0`, the first Monday–Friday on or after `start_on`. (Fri 2026-11-06 + 5 = Fri 2026-11-13; Sat 2026-11-07 + 0 = Mon 2026-11-09; Sat + 1 = Mon 2026-11-09; Wed 2026-11-04 + 0 = 2026-11-04.)
  - Enums, in this order:
    - `public.incident_family`: `ol`, `oa`, `ou`, `ot`, `om` (Y10 §5–§7);
    - `public.incident_severity`: `s1`, `s2`, `s3`;
    - `public.incident_status`: `open`, `contained`, `closed`;
    - `public.incident_party`: `customer`, `supplier`, `forwarder`, `platform`, `warehouse` (S17 B);
    - `public.incident_root_cause`: `human_error`, `document_data`, `communication`, `supplier`, `carrier`, `platform_regulation`, `customer` (S17 D);
    - `public.incident_outcome`: `full_recovery`, `partial_recovery`, `loss` (S17 D);
    - `public.incident_deadline_kind`: `supplier_damage`, `carrier_claim`, `demurrage`, `supplier_storage`, `platform_escalation`, `document_request`, `other` (Y10 §4 table);
    - `public.cost_payer`: `moesa`, `customer`, `supplier`, `carrier_insurance` (S17 D; reused by Task 6).
  - Table `public.incident`:
    - Identity: `id`, `tenant_id`, `customer_id UUID NOT NULL`, `code TEXT` (trigger), `family public.incident_family NOT NULL`, `incident_type TEXT` (the Y10 card, NULL = "sınıflandırılacak"), `severity public.incident_severity NOT NULL`, `status public.incident_status NOT NULL DEFAULT 'open'`, `owner_id UUID DEFAULT auth.uid()`.
    - Opening (S17 A): `title TEXT NOT NULL`, `what_happened TEXT NOT NULL`, `reported_by TEXT`, `current_state TEXT`, `immediate_action TEXT`, `entity_type public.document_entity`, `entity_id UUID`, `opened_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
    - Classification (S17 B): `affected_parties public.incident_party[] NOT NULL DEFAULT '{}'`, `management_notified_at TIMESTAMPTZ`, `customer_notice_due_at TIMESTAMPTZ` (trigger), `customer_notified_at TIMESTAMPTZ`.
    - Closure (S17 D): `outcome public.incident_outcome`, `root_cause public.incident_root_cause`, `root_cause_note TEXT`, `impact_note TEXT`, `lessons TEXT`, `preventive_action TEXT`, `customer_closure_notified_on DATE`, `closed_on DATE`, `closed_by UUID`.
    - `created_at`, `updated_at`.
    - Constraints: `unique_incident_code UNIQUE (tenant_id, code)`; `incident_id_tenant_id_key UNIQUE (id, tenant_id)`; `incident_customer_fkey (customer_id, tenant_id)` → customer; `incident_owner_fkey (owner_id)` → `public.user (id) ON DELETE SET NULL`; `incident_closed_by_fkey (closed_by)` → `public.user (id) ON DELETE SET NULL`; `incident_type_format CHECK (incident_type IS NULL OR incident_type ~ '^(OL|OA|OU|OT|OM)-[0-9]{2}$')`; `incident_entity_pair CHECK ((entity_type IS NULL) = (entity_id IS NULL))`; `incident_entity_kind CHECK (entity_type IS NULL OR entity_type IN ('project', 'purchase_order', 'shipment', 'product', 'market_cell'))`.
    - Indexes `(tenant_id, customer_id)`, `(tenant_id, status)`, `(tenant_id, entity_type, entity_id)`. `REVOKE DELETE … FROM anon, authenticated`.
  - Trigger `incident_set_code` (BEFORE INSERT, invoker, the `shipment_set_code` pattern): customer missing → `incident_customer_missing` (23503); `NEW.code := public.next_code(NEW.family::TEXT, customer.code)` → `OL-THO-2026-001`; `NEW.status := 'open'`.
  - Trigger `incident_notice_due` (BEFORE INSERT OR UPDATE, DEFINER, reads settings): `customer_notice_due_at` is always recomputed: `s1` → `opened_at + company_setting(tenant, 's1_customer_notify_hours')` hours (default 4; a non-numeric setting counts as missing); `s2` → 23:59:59 UTC of `public.add_business_days(opened_at::DATE, 0)` ("aynı iş günü"); `s3` → NULL (weekly summary).
  - Trigger `incident_z_guard` (BEFORE UPDATE OR INSERT, DEFINER), in this order:
    1. UPDATE: changed `code`, `customer_id` or `family` → `incident_immutable_field`.
    2. Bypass.
    3. `incident_type` whose prefix is not `upper(family)` → `incident_type_family`.
    4. `entity_type` set and `private.entity_customer(entity_type, entity_id, tenant_id) IS DISTINCT FROM customer_id` → `incident_entity_invalid` (missing record or another customer's).
    5. Status changed: `open → contained | closed`, `contained → closed`; else `incident_status_order`.
    6. Leaving `open` with severity `s1`/`s2` and no `management_notified_at` → `incident_management_notice_required`.
    7. Entering `closed`: `outcome`, `root_cause` and `preventive_action` (non-blank) required → `incident_closure_incomplete`; severity `s1` and the caller may not update `public.tenant` in `NEW.tenant_id` (`private.tenants_permitting(auth.uid(), ARRAY[NEW.tenant_id], 'public.tenant', 'update')` empty) → `incident_close_management` (`insufficient_privilege`); then `closed_on := current_date`, `closed_by := auth.uid()`.
  - Table `public.incident_log` (S17 C): `id`, `tenant_id`, `incident_id UUID NOT NULL`, `logged_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `author_id UUID DEFAULT auth.uid()` (`incident_log_author_fkey` → user `ON DELETE SET NULL`), `note TEXT NOT NULL`, `counterparty TEXT`, `decision TEXT`, `cost_amount NUMERIC(14,2) CHECK (cost_amount >= 0)`, `cost_currency valid_currency_code`, `cost_payer public.cost_payer`, `customer_approved BOOLEAN NOT NULL DEFAULT FALSE`, `created_at`, `updated_at`; `incident_log_incident_fkey (incident_id, tenant_id)` → incident `ON DELETE CASCADE`; `incident_log_cost_complete CHECK ((cost_amount IS NULL AND cost_currency IS NULL AND cost_payer IS NULL) OR (cost_amount IS NOT NULL AND cost_currency IS NOT NULL AND cost_payer IS NOT NULL))`.
  - Table `public.incident_deadline` (S17 B "süre sınırları"): `id`, `tenant_id`, `incident_id UUID NOT NULL`, `kind public.incident_deadline_kind NOT NULL`, `label TEXT`, `due_at TIMESTAMPTZ NOT NULL`, `met_at TIMESTAMPTZ`, `created_at`, `updated_at`; `incident_deadline_incident_fkey (incident_id, tenant_id)` → incident `ON DELETE CASCADE`.
  - Trigger `incident_deadline_defaults` (BEFORE INSERT OR UPDATE, DEFINER; sorts before `incident_deadline_z_guard`): an empty `due_at` gets, from the incident's `opened_at`: `supplier_damage` +48 h; `carrier_claim` +7 days (CMR, road); `platform_escalation` +48 h; `document_request` 23:59:59 UTC of `public.add_business_days(opened_at::DATE, company_setting(tenant, 'document_request_days'))` (default 5). Other kinds keep NULL, and the NOT NULL refuses them (23502).
  - Triggers `incident_log_z_guard` and `incident_deadline_z_guard`, both running `private.incident_child_guard()` (BEFORE INSERT OR UPDATE OR DELETE, DEFINER; bypass; cascades exempt): reads the incident `FOR SHARE`; `closed` → `incident_closed`.
  - View `public.incident_overview` (`security_invoker`): every `incident` column plus `customer_code`, `entity_label` (project code, PO code, shipment code, product SKU, or `<sku> · <platform>_<country>` for a market cell), `next_deadline_at` (earliest `due_at` of the unmet deadlines), `overdue_deadline_count INT` (unmet, `due_at < now()`), `is_repeat BOOLEAN` (another incident of the same customer and `incident_type` opened in the 90 days before, S17 D "Tekrar mı"). `GRANT SELECT`, `COMMENT`.
  - `private.entity_customer`: `CREATE OR REPLACE` with the 034 body unchanged except one branch added before `ELSE`: `WHEN 'incident' THEN RETURN (SELECT i.customer_id FROM public.incident i WHERE i.id = entity_customer.entity_id AND i.tenant_id = entity_customer.tenant_id);`.
  - Module `('incident', TRUE, 200)`; permissions: `incident` select, insert, update; `incident_log` and `incident_deadline` select, insert, update, delete; owner grant; `SELECT private.grant_group_to_product_editors('incident')`.
- Produces (036, SQL):
  - `public.project_gate`: `rolled_back_incident_id UUID`, `project_gate_rollback_incident_fkey (rolled_back_incident_id, tenant_id)` → `incident (id, tenant_id) ON DELETE RESTRICT`; `GRANT UPDATE (rolled_back_incident_id) ON public.project_gate TO authenticated`.
  - `private.project_gate_guard`: `CREATE OR REPLACE` with the 032 body unchanged except, in the un-passing branch right after the `gate_rollback_order` check and before its `RETURN NEW`: `IF NEW.rolled_back_incident_id IS NULL THEN RAISE EXCEPTION 'gate_rollback_incident_required' USING ERRCODE = 'check_violation'; END IF;` and `IF NOT EXISTS (SELECT 1 FROM public.incident i JOIN public.project p ON p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id WHERE i.id = NEW.rolled_back_incident_id AND i.tenant_id = NEW.tenant_id AND i.customer_id = p.customer_id AND i.status <> 'closed') THEN RAISE EXCEPTION 'gate_incident_invalid' USING ERRCODE = 'check_violation'; END IF;`.
  - `DROP FUNCTION public.rollback_gate (UUID, TEXT)`; then `CREATE OR REPLACE FUNCTION public.rollback_gate (gate_id UUID, reason TEXT, incident_id UUID DEFAULT NULL) RETURNS public.project_gate` SECURITY INVOKER with the 021 body unchanged except: the loop's update reads `SET status = 'rolled_back', rolled_back_reason = rollback_gate.reason, rolled_back_incident_id = rollback_gate.incident_id`. REVOKE from `PUBLIC, anon`, GRANT to `authenticated` with the new argument list (021 block).
  - **Interim behaviour (accepted on the feature branch):** from this task until Task 8, the UI's `useRollbackGate` still sends two arguments; the call reaches the function (`incident_id` defaults to NULL) and is refused with `gate_rollback_incident_required`, a clear toast. Task 8 passes the incident.
- Produces (seed): `seed_ops_roles` adds `'incident'`.

- [ ] **Step 1: Write `035_incidents.test.sql`** — `plan(23)`, the preamble with `akif` added, then:

```sql
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000035001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000035002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
-- An S1 on Friday morning about the pilot, an S2 on Saturday about a document request.
INSERT INTO public.incident (id, tenant_id, customer_id, code, family, severity, title, what_happened, entity_type, entity_id, opened_at)
VALUES ('00000000-0000-4000-8000-000000035011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'X', 'ol', 's1', 'Pallets short at Rosbach',
        'Two pallets fewer than the packing list.', 'project', current_setting('test.pilot')::UUID, '2026-11-06 09:00+00'),
       ('00000000-0000-4000-8000-000000035012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, NULL, 'oa', 's2', 'GPSR document request',
        'Amazon DE asks for the GPSR safety information.', NULL, NULL, '2026-11-07 10:00+00');
INSERT INTO public.incident_deadline (id, tenant_id, incident_id, kind)
VALUES ('00000000-0000-4000-8000-000000035021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035012', 'document_request'),
       ('00000000-0000-4000-8000-000000035022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'supplier_damage');

SELECT is((SELECT code || ':' || status FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          'OL-THO-' || extract(year FROM now())::INT || '-001:open', 'the code is the family, the customer, the year and the number');
SELECT is((SELECT customer_notice_due_at FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          '2026-11-06 13:00+00'::TIMESTAMPTZ, 'S1: the customer within four hours');
SELECT is((SELECT customer_notice_due_at FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035012'),
          '2026-11-09 23:59:59+00'::TIMESTAMPTZ, 'S2 on a Saturday: by the end of Monday');
SELECT is(public.add_business_days('2026-11-06', 5), '2026-11-13'::DATE, 'five business days from a Friday');
SELECT is(public.add_business_days('2026-11-07', 0), '2026-11-09'::DATE, 'a weekend day rolls to Monday');
SELECT is((SELECT due_at FROM public.incident_deadline WHERE id = '00000000-0000-4000-8000-000000035021'),
          '2026-11-13 23:59:59+00'::TIMESTAMPTZ, 'a document request: five business days');
SELECT is((SELECT due_at FROM public.incident_deadline WHERE id = '00000000-0000-4000-8000-000000035022'),
          '2026-11-08 09:00+00'::TIMESTAMPTZ, 'the supplier damage notice: 48 hours');
SELECT throws_ok($$ INSERT INTO public.incident_deadline (tenant_id, incident_id, kind) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'other') $$,
                 '23502', NULL, 'another deadline needs its date');
SELECT is((SELECT entity_label FROM public.incident_overview WHERE id = '00000000-0000-4000-8000-000000035011'),
          (SELECT code FROM public.project WHERE id = current_setting('test.pilot')::UUID), 'the overview names the linked record');
SELECT is((SELECT next_deadline_at FROM public.incident_overview WHERE id = '00000000-0000-4000-8000-000000035012'),
          '2026-11-13 23:59:59+00'::TIMESTAMPTZ, 'the next deadline');
SELECT throws_ok($$ UPDATE public.incident SET incident_type = 'OA-02' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_type_family', 'the Y10 card is of the incident''s family');
SELECT throws_ok($$ UPDATE public.incident SET incident_type = 'OL-1' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', NULL, 'a Y10 card code');
SELECT throws_ok($$ UPDATE public.incident SET family = 'om' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_immutable_field', 'the family is fixed with the code');
SELECT throws_ok($$ UPDATE public.incident SET entity_id = '00000000-0000-4000-8000-000000035002' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_entity_invalid', 'not another customer''s record');
SELECT throws_ok($$ UPDATE public.incident SET status = 'contained' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_management_notice_required', 'S1 leaves open only once management is told');

UPDATE public.incident SET management_notified_at = '2026-11-06 09:30+00', status = 'contained' WHERE id = '00000000-0000-4000-8000-000000035011';

SELECT throws_ok($$ UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_closure_incomplete', 'closing needs the outcome, root cause and preventive action');
SELECT throws_ok($$ UPDATE public.incident SET status = 'closed', outcome = 'partial_recovery', root_cause = 'carrier', preventive_action = 'Y07 §4.3: count pallets at loading (v1.2)'
                    WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '42501', 'incident_close_management', 'management closes an S1');

RESET ROLE;
SELECT private.impersonate(current_setting('test.akif')::UUID, current_setting('test.moesa')::UUID);
UPDATE public.incident SET status = 'closed', outcome = 'partial_recovery', root_cause = 'carrier', preventive_action = 'Y07 §4.3: count pallets at loading (v1.2)'
WHERE id = '00000000-0000-4000-8000-000000035011';

SELECT is((SELECT status || ':' || (closed_on = current_date) FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035011'),
          'closed:true', 'closing dates it');
SELECT throws_ok($$ INSERT INTO public.incident_log (tenant_id, incident_id, note) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035011', 'late note') $$,
                 '23514', 'incident_closed', 'a closed incident''s log no longer changes');
SELECT throws_ok($$ UPDATE public.incident SET status = 'open' WHERE id = '00000000-0000-4000-8000-000000035011' $$,
                 '23514', 'incident_status_order', 'closed is final');
SELECT throws_ok($$ INSERT INTO public.incident_log (tenant_id, incident_id, note, cost_amount) VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000035012', 'storage fee', 100) $$,
                 '23514', NULL, 'a cost names its currency and payer');
SELECT throws_ok($$ DELETE FROM public.incident WHERE id = '00000000-0000-4000-8000-000000035012' $$,
                 '42501', NULL, 'incidents are not deleted');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.incident), 0, 'another tenant sees none');
```

- [ ] **Step 2: Write `036_gate_rollback_incident.test.sql`** — `plan(6)`, the preamble, then:

```sql
-- G1 of the pilot passed the real way (032 pattern).
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000036011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000036011');
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000036001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened)
VALUES ('00000000-0000-4000-8000-000000036021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Brief changed', 'The customer changed the brief after G1.'),
       ('00000000-0000-4000-8000-000000036022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000036001', 'om', 's3', 'Zed brief', 'Another customer''s incident.'),
       ('00000000-0000-4000-8000-000000036023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Old issue', 'Closed long ago.');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000036023';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed') $$,
                 '23514', 'gate_rollback_incident_required', 'a rollback names its incident (K3)');
SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036022') $$,
                 '23514', 'gate_incident_invalid', 'not another customer''s incident');
SELECT throws_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036023') $$,
                 '23514', 'gate_incident_invalid', 'not a closed incident');
SELECT lives_ok($$ SELECT public.rollback_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief changed', '00000000-0000-4000-8000-000000036021') $$,
                'an open incident of the customer rolls the gate back');
SELECT is((SELECT status || ':' || rolled_back_incident_id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'),
          'rolled_back:00000000-0000-4000-8000-000000036021', 'the gate remembers the incident');
SELECT is((SELECT count(*)::INT FROM public.project_gate WHERE rolled_back_incident_id = '00000000-0000-4000-8000-000000036021'), 1,
          'the incident lists the gate it rolled back');
```

- [ ] **Step 3: Update `021_projects.test.sql`** (plan stays 46). After the `project_product` insert, add (as the Atlas owner):

```sql
INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened)
VALUES ('00000000-0000-4000-8000-000000036901', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212',
        'om', 's3', 'Brief changed', 'The customer changed the brief.');
```

  Then the successful `SELECT public.rollback_gate(current_setting('test.g1')::UUID, 'customer changed the brief')` gains the third argument `'00000000-0000-4000-8000-000000036901'`, and the successful `UPDATE public.project_gate SET status = 'rolled_back', rolled_back_reason = 'PSI to be redone'` also sets `rolled_back_incident_id = '00000000-0000-4000-8000-000000036901'`. The failing cases stay as they are: they still fail first on `gate_reason_required`, `gate_not_passed` and `gate_rollback_order`.
- [ ] **Step 4: Add to `099_seed.test.sql`** (as `postgres`, plan +1): `SELECT ok(cardinality(private.tenants_permitting((SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'), ARRAY[(SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')], 'public.incident', 'insert')) = 1, 'the coordinator records incidents');`
- [ ] **Step 5: Run and see them fail.** Run: `pnpm test:db`. Expected: FAIL (`relation "public.incident" does not exist`).
- [ ] **Step 6: Write the two migrations** following the Interfaces; REVOKE ALL on the new private functions; update `seed_ops_roles`; add the `errors.*` keys (Task 7 table); sync.
- [ ] **Step 7: Reset and run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 8: Commit.** `git add supabase/migrations/035_incidents.sql supabase/migrations/036_gate_rollback_incident.sql supabase/tests/database supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales`; message `feat(incident): S17 incidents with log, deadlines and closure; a gate rolls back only through one`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 6: Change requests (DB)

**Files:**
- Create: `supabase/migrations/037_change_requests.sql`, `supabase/tests/database/037_change_requests.test.sql`
- Modify: `supabase/seed.sql` (`seed_ops_roles` gains `change_request`), `supabase/tests/database/099_seed.test.sql` (plan +1), `supabase/functions/_shared/database.types.ts`, i18n `errors.*` (copy in Task 7); sync.

**Interfaces:**
- Consumes: `public.next_code` (kind `cr`), `public.add_business_days` and `public.cost_payer` (Task 5), `private.entity_customer` (035 body), `public.gate_code`, `private.rules_bypassed`, `private.grant_group_to_product_editors`.
- Produces (SQL):
  - Enums: `public.change_request_status`: `open`, `approved`, `rejected`, `applied`; `public.change_request_source`: `customer`, `supplier`, `moesa`, `regulation`; `public.change_request_urgency`: `normal`, `urgent`; `public.change_kind`: `spec`, `design`, `packaging`, `price`, `deadline`, `supplier`, `content` (spec M10 plus S08 §C's supplier and content rows).
  - Table `public.change_request`:
    - Identity (S08 A): `id`, `tenant_id`, `customer_id UUID NOT NULL`, `code TEXT` (trigger), `project_id UUID`, `title TEXT NOT NULL`, `source public.change_request_source NOT NULL`, `urgency public.change_request_urgency NOT NULL DEFAULT 'normal'`, `status public.change_request_status NOT NULL DEFAULT 'open'`, `decision_due_on DATE` (trigger).
    - What changes (S08 B, C): `change_kinds public.change_kind[] NOT NULL`, `current_value TEXT NOT NULL`, `requested_value TEXT NOT NULL`, `reason TEXT NOT NULL`, `affected_gate_code public.gate_code`, `affected_document_id UUID`, `other_documents TEXT`.
    - Impact (S08 D): `cost_impact TEXT`, `cost_payer public.cost_payer`, `delay_days INT CHECK (delay_days >= 0)`, `quality_impact TEXT`, `listing_impact TEXT`.
    - Decision (S08 E, F): `decision_note TEXT`, `moesa_approved_by UUID`, `moesa_approved_on DATE`, `customer_approved_on DATE`, `customer_approval_document_id UUID`, `result_document_id UUID`, `closed_on DATE`.
    - `created_at`, `updated_at`.
    - Constraints: `unique_change_request_code UNIQUE (tenant_id, code)`; `change_request_id_tenant_id_key UNIQUE (id, tenant_id)`; `change_request_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`; `change_request_customer_fkey (customer_id, tenant_id)` → customer; `change_request_project_fkey (project_id, customer_id, tenant_id)` → project; `change_request_affected_document_fkey`, `change_request_approval_document_fkey`, `change_request_result_document_fkey`: `(…_id, tenant_id)` → `document (id, tenant_id)`; `change_request_approver_fkey (moesa_approved_by)` → user `ON DELETE SET NULL`; `change_request_kinds_required CHECK (cardinality(change_kinds) > 0)`.
    - Indexes `(tenant_id, customer_id)`, `(tenant_id, status)`, `(tenant_id, project_id)`. `REVOKE DELETE … FROM anon, authenticated`.
  - Table `public.change_request_product (change_request_id UUID NOT NULL, product_id UUID NOT NULL, tenant_id, customer_id UUID NOT NULL, created_at)`, PK `(change_request_id, product_id)`; `change_request_product_cr_fkey (change_request_id, customer_id, tenant_id)` → change_request `ON DELETE CASCADE`; `change_request_product_product_fkey (product_id, customer_id, tenant_id)` → product. Trigger `change_request_product_customer` (BEFORE INSERT, DEFINER): `customer_id` := the CR's.
  - Trigger `change_request_set_code` (BEFORE INSERT, invoker): customer missing → `change_request_customer_missing` (23503); `NEW.code := public.next_code('cr', customer.code)` → `CR-THO-2026-001`; `NEW.status := 'open'`.
  - Trigger `change_request_due` (BEFORE INSERT OR UPDATE, invoker, no private call): `decision_due_on := CASE urgency WHEN 'urgent' THEN created_at::DATE + 1 ELSE public.add_business_days(created_at::DATE, 5) END` (S08 A "Normal (5 iş günü) / Acil (24 saat)").
  - Trigger `change_request_z_guard` (BEFORE INSERT OR UPDATE, DEFINER), in this order:
    1. UPDATE: changed `code` or `customer_id` → `change_request_immutable_field`.
    2. Bypass.
    3. `affected_document_id` set and its document's `private.entity_customer(entity_type, entity_id, tenant_id)` is not the CR's customer → `change_request_document_invalid`.
    4. `customer_approval_document_id` set and its document is not a `signed`/`approved` document of this CR (`entity_type = 'change_request'`, `entity_id = NEW.id`) → `change_request_approval_document_invalid`.
    5. Status changed: `open → approved | rejected`, `approved → applied`; else `change_request_status_order`.
    6. Entering `approved`: `moesa_approved_on := coalesce(moesa_approved_on, current_date)`, `moesa_approved_by := coalesce(moesa_approved_by, auth.uid())`. When `project_id` and `affected_gate_code` are set and that gate of the project is `passed` with `needs_customer_approval`, `customer_approved_on` and `customer_approval_document_id` are required → `change_request_customer_approval_required` (S08 §4).
    7. Entering `rejected` without a non-blank `decision_note` → `change_request_decision_note_required`.
    8. Entering `applied` with `affected_document_id` set: `result_document_id` must be a document of the same `entity_type`, `entity_id` and `type` with a higher `version` → else `change_request_new_version_required` (M10 "CR applied olunca ilgili belge yeni sürüm alır").
    9. Entering `applied` or `rejected`: `closed_on := current_date`.
  - `private.entity_customer`: `CREATE OR REPLACE` with the 035 body unchanged except one branch added before `ELSE`: `WHEN 'change_request' THEN RETURN (SELECT r.customer_id FROM public.change_request r WHERE r.id = entity_customer.entity_id AND r.tenant_id = entity_customer.tenant_id);`.
  - Module `('change_request', TRUE, 210)`; permissions: `change_request` select, insert, update; `change_request_product` select, insert, delete; owner grant; `SELECT private.grant_group_to_product_editors('change_request')`.
- Produces (seed): `seed_ops_roles` adds `'change_request'`.

- [ ] **Step 1: Write `037_change_requests.test.sql`** — `plan(16)`, the preamble, then:

```sql
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000037001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate',
        (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'gate_approval', 'approved', 'https://example.test/G1.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000037001');
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000037002', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000037003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000037002', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000037004', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000037002', 'customer', '00000000-0000-4000-8000-000000037002', 'contract', 'https://example.test/zed-contract.pdf');
INSERT INTO public.change_request (id, tenant_id, customer_id, code, project_id, title, source, change_kinds, current_value, requested_value, reason, affected_gate_code, affected_document_id)
VALUES ('00000000-0000-4000-8000-000000037011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'X', current_setting('test.pilot')::UUID, 'Tolerance 3 mm', 'supplier',
        ARRAY['spec']::public.change_kind[], 'Tolerance ± 5 mm', 'Tolerance ± 3 mm', 'Sample T02 edge deviation.', 'G1', current_setting('test.spec_mop')::UUID);
INSERT INTO public.change_request (id, tenant_id, customer_id, title, source, urgency, change_kinds, current_value, requested_value, reason)
VALUES ('00000000-0000-4000-8000-000000037012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Ready date +7 days', 'customer', 'urgent',
        ARRAY['deadline']::public.change_kind[], 'Ready 2027-01-10', 'Ready 2027-01-17', 'The customer moved the launch.');

SELECT is((SELECT code || ':' || status FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          'CR-THO-' || extract(year FROM now())::INT || '-001:open', 'CR-<customer>-<year>-<number> (K5, S08)');
SELECT is((SELECT decision_due_on FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          public.add_business_days(current_date, 5), 'a normal request is decided in five business days');
SELECT is((SELECT decision_due_on FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037012'),
          current_date + 1, 'an urgent one in 24 hours');
SELECT throws_ok($$ INSERT INTO public.change_request (tenant_id, customer_id, title, source, change_kinds, current_value, requested_value, reason)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Nothing', 'moesa', ARRAY[]::public.change_kind[], 'a', 'b', 'c') $$,
                 '23514', NULL, 'at least one kind of change');
SELECT throws_ok($$ UPDATE public.change_request SET affected_document_id = '00000000-0000-4000-8000-000000037004' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_document_invalid', 'not another customer''s document');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_status_order', 'approved before applied');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'approved' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_customer_approval_required', 'a passed (M) gate needs the customer''s written approval');
SELECT throws_ok($$ UPDATE public.change_request SET customer_approval_document_id = current_setting('test.spec_mop')::UUID WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_approval_document_invalid', 'the approval is a document of the request');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000037021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'change_request', '00000000-0000-4000-8000-000000037011',
        'change_request', 'approved', 'https://example.test/cr-approval.pdf');
UPDATE public.change_request SET customer_approved_on = current_date, customer_approval_document_id = '00000000-0000-4000-8000-000000037021', status = 'approved'
WHERE id = '00000000-0000-4000-8000-000000037011';

SELECT is((SELECT moesa_approved_on = current_date AND moesa_approved_by = current_setting('test.koordinator')::UUID FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          TRUE, 'approval records MOESA''s date and approver');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_new_version_required', 'applied needs the new version');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000037031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product', current_setting('test.mop')::UUID, 'label_artwork', 'https://example.test/label.pdf');

SELECT throws_ok($$ UPDATE public.change_request SET result_document_id = '00000000-0000-4000-8000-000000037031', status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011' $$,
                 '23514', 'change_request_new_version_required', 'the new version is of the same document');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, version, url)
VALUES ('00000000-0000-4000-8000-000000037032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'product', current_setting('test.mop')::UUID, 'spec_sheet', 3, 'https://example.test/spec-v03.pdf');
UPDATE public.change_request SET result_document_id = '00000000-0000-4000-8000-000000037032', status = 'applied' WHERE id = '00000000-0000-4000-8000-000000037011';

SELECT is((SELECT status || ':' || (closed_on = current_date) FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037011'),
          'applied:true', 'the spec''s new version applies the request');
SELECT throws_ok($$ UPDATE public.change_request SET status = 'rejected' WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '23514', 'change_request_decision_note_required', 'a rejection says why');
SELECT throws_ok($$ INSERT INTO public.change_request_product (change_request_id, product_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000037012', '00000000-0000-4000-8000-000000037003', current_setting('test.moesa')::UUID) $$,
                 '23503', NULL, 'not another customer''s product');
SELECT throws_ok($$ DELETE FROM public.change_request WHERE id = '00000000-0000-4000-8000-000000037012' $$,
                 '42501', NULL, 'change requests are not deleted');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.change_request), 0, 'another tenant sees none');
```

- [ ] **Step 2: Add to `099_seed.test.sql`** (as `postgres`, plan +1): `SELECT ok(cardinality(private.tenants_permitting((SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'), ARRAY[(SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')], 'public.change_request', 'insert')) = 1, 'the coordinator opens change requests');`
- [ ] **Step 3: Run and see it fail.** Run: `pnpm test:db`. Expected: FAIL (`relation "public.change_request" does not exist`).
- [ ] **Step 4: Write `037_change_requests.sql`**; REVOKE ALL on the new private functions; seed; `errors.*` keys; sync.
- [ ] **Step 5: Reset and run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add supabase/migrations/037_change_requests.sql supabase/tests/database supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales`; message `feat(cr): S08 change requests coded per customer, approved with the customer and applied by a new version`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 7: Incident and change request API (app)

**Files:**
- Create: `app/src/api/incident/index.ts`, `app/src/api/changeRequest/index.ts`, `app/tests/api/incident.test.ts`, `app/tests/api/changeRequest.test.ts`
- Modify:
  - `app/src/api/queryKeys.ts`:
    - DERIVED: `incident: ['incident_overview', 'project_gate']`; `incident_log: ['incident']`; `incident_deadline: ['incident', 'incident_overview']`; `change_request_product: ['change_request']`; `project_gate` gains `'incident'` (the card embeds the gates it rolled back); `document` gains `'change_request'` (the CR card embeds its documents); `customer`, `project`, `product`, `purchase_order`, `shipment`, `market_cell` each gain `'incident_overview'` (codes and `entity_label`); `customer`, `project`, `product` gain `'change_request'` (embeds).
    - CASCADES: `incident: ['incident_log', 'incident_deadline']`, `change_request: ['change_request_product']`.
  - `app/src/api/document/index.ts`: `DOCUMENT_ENTITIES` gains `'change_request'`; i18n `ops.document.entity.change_request`: Change request / Değişiklik talebi (labels the constant it extends).
  - `app/src/api/glossary.ts` and `app/tests/plugins/i18n/glossary.test.ts`: the twelve incident and CR enums.
  - `app/src/lib/form/postgrestErrors.ts`, `app/src/constants/form/field.ts` (`incident: { name: 'ops-incident-manage' }`; `incident_log`, `incident_deadline`: `{ name: 'ops-incident-manage', field: 'incident_id' }`; `change_request: { name: 'ops-change-request-manage' }`; `change_request_product: { name: 'ops-change-request-manage', field: 'change_request_id' }`).
  - i18n: `fields.{incident, incident_log, incident_deadline, change_request, change_request_product}`; the `errors.*` and `glossary.*` keys below (the `ops.incident.*` keys are Task 8's, the `ops.change_request.*` keys Task 9's).
  - `app/tests/plugins/i18n/fields.test.ts` (`OPS_TABLES` + the five tables, `OPS_MODULES` + `incident`, `change_request`), `app/tests/api/queryKeys.test.ts`, `app/tests/lib/form/postgrestErrors.test.ts`.

**Interfaces:**
- Consumes: Tasks 5–6; `defineResource`, `updateRow`, `invalidateTables`, `queryKeys`, `useTenantKey`, `useLookup`, `allValues`, form field helpers; `DocumentRow`, `DocumentEntity`.
- Produces (`api/incident/index.ts`):
  - Types (`Enums[...]`): `IncidentStatus`, `IncidentSeverity`, `IncidentFamily`, `IncidentParty`, `IncidentRootCause`, `IncidentOutcome`, `CostPayer`, `IncidentDeadlineKind`; rows `IncidentRow`, `IncidentLogRow`, `IncidentDeadlineRow`, `IncidentOverviewRow`; `IncidentCard` (row + embeds); `IncidentType = (typeof INCIDENT_TYPES)[number]`; `IncidentEntityType = (typeof INCIDENT_ENTITY_TYPES)[number]`.
  - Constants: `INCIDENT_STATUSES`, `INCIDENT_SEVERITIES`, `INCIDENT_FAMILIES`, `INCIDENT_PARTIES`, `INCIDENT_ROOT_CAUSES`, `INCIDENT_OUTCOMES`, `COST_PAYERS`, `INCIDENT_DEADLINE_KINDS` (`allValues`, enum order); `INCIDENT_DEADLINE_DEFAULTS = ['supplier_damage', 'carrier_claim', 'platform_escalation', 'document_request'] as const`; `INCIDENT_ENTITY_TYPES = ['project', 'purchase_order', 'shipment', 'product', 'market_cell'] as const`; `INCIDENT_TYPES`: the 42 Y10 card codes as a literal tuple — `OL-01`…`OL-12`, `OA-01`…`OA-10`, `OU-01`…`OU-06`, `OT-01`…`OT-08`, `OM-01`…`OM-06`; `INCIDENT_SEVERITY_SEVERITY: Record<IncidentSeverity, 'danger' | 'warn' | 'info'>` = s1 danger, s2 warn, s3 info.
  - `incidentTypesOf(family: IncidentFamily): IncidentType[]` (prefix `upper(family) + '-'`).
  - `nextIncidentStatuses(status: IncidentStatus): IncidentStatus[]` = guard rule 5.
  - `incidentStatusHints(incident: Pick<IncidentRow, 'severity' | 'management_notified_at' | 'outcome' | 'root_cause' | 'preventive_action'>, status: IncidentStatus, canCloseS1: boolean): ('incident_management_notice_required' | 'incident_closure_incomplete' | 'incident_close_management')[]` — the rules 6–7 a move to `status` would break.
  - `customerNoticeState(row: Pick<IncidentRow, 'customer_notice_due_at' | 'customer_notified_at'>, now: Date): 'none' | 'done' | 'late' | 'due'`.
  - `INCIDENT_SELECT = '*, customer!incident_customer_fkey(code, display_name), incident_log!incident_log_incident_fkey(*), incident_deadline!incident_deadline_incident_fkey(*), project_gate!project_gate_rollback_incident_fkey(id, code, status, project_id)'`; `incidentResource = defineResource<'incident', IncidentCard>('incident', { select: INCIDENT_SELECT })`.
  - `useIncidentOverview(id: MaybeRefOrGetter<string | null>)`: `useQuery` over `incident_overview`, `.eq('id', id).maybeSingle()`, keyed `queryKeys.detail(tenantKey, 'incident_overview', id)`, enabled while `id` is set.
  - `useIncidentEntityOptions(params: MaybeRefOrGetter<{ entityType: IncidentEntityType | null; customerId: string | null }>)`: a `useQuery` over the type's table (`project`: `code — display_name`; `purchase_order`: `code`; `shipment`: `code`; `product`: `sku — display_name`; `market_cell_overview`: `sku · cell_key`), `.eq('customer_id', customerId)`, keyed `queryKeys.list(tenantKey, <table>, { view: 'incident-options', customerId })`, enabled while both are set; returns `{ value: string; label: string }[]`.
  - `useOpenIncidentOptions(customerId: MaybeRefOrGetter<string | null>)`: `useQuery` over `incident` with `.eq('customer_id', …).neq('status', 'closed').order('opened_at', { ascending: false })`, keyed `queryKeys.list(tenantKey, 'incident', { view: 'open-options', customerId })`; returns `{ value: id, label: 'code — title' }[]`.
  - `incidentSchema` (zod): `id?`; `customer_id` `required(z.uuid())`; `family`, `severity` enums (required); `incident_type` `optional(z.enum(INCIDENT_TYPES))`; `title`, `what_happened` `requiredText()`; `reported_by`, `current_state`, `immediate_action`, `root_cause_note`, `impact_note`, `lessons`, `preventive_action` optional text; `entity_type` `optional(z.enum(INCIDENT_ENTITY_TYPES))`, `entity_id` `optional(z.uuid())` (a `superRefine` puts `errors.incident_entity_invalid` on `entity_id` when only one is set, and `errors.incident_type_family` on `incident_type` when its prefix is not the family's); `owner_id` optional uuid; `affected_parties` array of enum; `opened_at`, `management_notified_at`, `customer_notified_at` `optional(z.date())` sent as ISO strings; `outcome`, `root_cause` optional enums; `customer_closure_notified_on` `optional(dateOnly())`.
  - `toIncidentFormValues(incident?)`; `toIncidentPayload(values, id?)`: never sends `code`, `status`, `customer_notice_due_at`, `closed_on`, `closed_by`; sends `customer_id` and `family` only without `id`.
  - `useSetIncidentStatus()`: `({ id, status }) => updateRow('incident', id, { status })`, then `invalidateTables(queryClient, ['incident'])`.
  - Log: `incidentLogResource = defineResource('incident_log')`; `incidentLogSchema` (`id?`, `incident_id` `z.uuid()`, `logged_at` `z.date()`, `note` `requiredText()`, `counterparty`, `decision`, `cost_amount` optional ≥ 0, `cost_currency` optional, `cost_payer` optional enum, `customer_approved` boolean; a `superRefine` puts `errors.incident_log_cost_incomplete` on `cost_amount` unless all three cost fields are set or none); `toIncidentLogFormValues`, `toIncidentLogPayload` (never sends `author_id`).
  - Deadlines: `incidentDeadlineResource = defineResource('incident_deadline')`; `incidentDeadlineSchema` (`id?`, `incident_id` `z.uuid()`, `kind`, `label` optional text, `due_at` and `met_at` `optional(z.date())` (null and empty accepted); a `superRefine` puts `errors.incident_deadline_due_required` on `due_at` when it is empty and `kind` is not in `INCIDENT_DEADLINE_DEFAULTS`); `toIncidentDeadlineFormValues`, `toIncidentDeadlinePayload` (an empty `due_at` is left out, so the database fills it).
- Produces (`api/changeRequest/index.ts`):
  - Types: `ChangeRequestStatus`, `ChangeRequestSource`, `ChangeRequestUrgency`, `ChangeKind`; `ChangeRequestRow`; `ChangeRequestCard`.
  - Constants: `CHANGE_REQUEST_STATUSES`, `CHANGE_REQUEST_SOURCES`, `CHANGE_REQUEST_URGENCIES`, `CHANGE_KINDS` (`allValues`, enum order).
  - `nextChangeRequestStatuses(status: ChangeRequestStatus): ChangeRequestStatus[]` = guard rule 5.
  - `needsCustomerApproval(cr: Pick<ChangeRequestRow, 'affected_gate_code'>, gates: readonly { code: string; status: string; needs_customer_approval: boolean }[]): boolean` = guard rule 6's condition.
  - `changeRequestStatusHints(cr: Pick<ChangeRequestRow, 'affected_gate_code' | 'customer_approved_on' | 'customer_approval_document_id' | 'decision_note' | 'affected_document_id' | 'result_document_id'>, status: ChangeRequestStatus, gates: readonly { code: string; status: string; needs_customer_approval: boolean }[]): ('change_request_customer_approval_required' | 'change_request_decision_note_required' | 'change_request_new_version_required')[]` (display hints; the database decides the version comparison).
  - `CHANGE_REQUEST_SELECT = '*, customer!change_request_customer_fkey(code, display_name), project!change_request_project_fkey(code, display_name, project_gate!project_gate_project_fkey(code, status, needs_customer_approval)), change_request_product!change_request_product_cr_fkey(product_id, product!change_request_product_product_fkey(sku, display_name)), affected_document:document!change_request_affected_document_fkey(id, entity_type, entity_id, type, version, status), result_document:document!change_request_result_document_fkey(id, type, version, status)'`; `changeRequestResource = defineResource<'change_request', ChangeRequestCard>('change_request', { select: CHANGE_REQUEST_SELECT })`.
  - `changeRequestSchema`: `id?`; `customer_id` `required(z.uuid())`; `project_id` optional uuid; `title`, `current_value`, `requested_value`, `reason` `requiredText()`; `source` enum; `urgency` enum default `normal`; `change_kinds` `z.array(z.enum(CHANGE_KINDS)).min(1)` (message `errors.change_request_kinds_required`); `affected_gate_code` optional gate code; `affected_document_id`, `customer_approval_document_id`, `result_document_id` optional uuid; `other_documents`, `cost_impact`, `quality_impact`, `listing_impact`, `decision_note` optional text; `cost_payer` optional enum; `delay_days` optional int ≥ 0; `customer_approved_on` `optional(dateOnly())`; `product_ids: z.array(z.uuid())` (form only).
  - `toChangeRequestFormValues(cr?: ChangeRequestCard)` (`product_ids` from the embed); `toChangeRequestPayload(values, id?)`: never sends `code`, `status`, `decision_due_on`, `moesa_approved_*`, `closed_on`, `product_ids`; `customer_id` only without `id`.
  - `useSetChangeRequestStatus()`: `updateRow('change_request', id, { status })`, then `invalidateTables(queryClient, ['change_request'])`.
  - `useSetChangeRequestProducts()`: mutation `({ id, before, after }: { id: string; before: string[]; after: string[] })`: inserts `after − before` into `change_request_product` and deletes `before − after` (`.eq('change_request_id', id).in('product_id', removed)`), then invalidates `['change_request_product']`.
  - `useNewerDocumentOptions(document: MaybeRefOrGetter<Pick<DocumentRow, 'entity_type' | 'entity_id' | 'type' | 'version'> | null>)`: `useQuery` over `document` with `.eq` on entity and type, `.gt('version', version)`, `.order('version', { ascending: false })`, keyed `queryKeys.list(tenantKey, 'document', { view: 'newer', ... })`; returns `{ value, label: 'v<NN> — <status label>' }[]`.

NAMED_ERRORS additions:

| code | name | field |
|---|---|---|
| 23503 | incident_customer_missing | customer_id |
| 23514 | incident_type_format | incident_type (`errors.incident_type_invalid`) |
| 23514 | incident_type_family | incident_type |
| 23514 | incident_entity_invalid | entity_id |
| 23514 | incident_entity_kind | entity_type (`errors.incident_entity_invalid`) |
| 23514 | incident_log_cost_complete | cost_amount (`errors.incident_log_cost_incomplete`) |
| 23514, 42501 | incident_immutable_field, incident_status_order, incident_management_notice_required, incident_closure_incomplete, incident_close_management (42501), incident_closed, gate_rollback_incident_required, gate_incident_invalid | — |
| 23503 | change_request_customer_missing | customer_id |
| 23503 | change_request_project_fkey | project_id (`errors.cr_project_customer`) |
| 23503 | change_request_product_product_fkey | product_ids (`errors.cr_product_customer`) |
| 23514 | change_request_kinds_required | change_kinds |
| 23514 | change_request_document_invalid | affected_document_id |
| 23514 | change_request_approval_document_invalid | customer_approval_document_id |
| 23514 | change_request_immutable_field, change_request_status_order, change_request_customer_approval_required, change_request_decision_note_required, change_request_new_version_required | — |

Error copy (`errors.*`, EN / TR):
- incident_customer_missing: The incident's customer was not found. / Olayın müşterisi bulunamadı.
- incident_immutable_field: An incident's code, customer and family cannot change. / Olayın kodu, müşterisi ve ailesi değiştirilemez.
- incident_type_invalid: Choose a Y10 card code (e.g. OL-09). / Bir Y10 kart kodu seçin (ör. OL-09).
- incident_type_family: The Y10 card belongs to another family. / Y10 kartı başka bir aileye ait.
- incident_entity_invalid: Choose a project, order, shipment, product or market cell of this customer. / Bu müşterinin bir projesini, siparişini, sevkiyatını, ürününü ya da pazar hücresini seçin.
- incident_status_order: The incident cannot move to this status from its current one. / Olay mevcut durumundan bu duruma geçemez.
- incident_management_notice_required: S1 and S2 incidents need the time management was told first. / S1 ve S2 olaylarda önce yönetime bildirim zamanı girilmeli.
- incident_closure_incomplete: Fill the outcome, the root cause and the preventive action before closing. / Kapatmadan önce sonucu, kök nedeni ve önlemi doldurun.
- incident_close_management: Only management closes an S1 incident. / S1 olayını yalnızca yönetim kapatır.
- incident_closed: The incident is closed; its log and deadlines no longer change. / Olay kapandı; günlüğü ve süreleri artık değişmez.
- incident_log_cost_incomplete: A cost needs its amount, currency and who pays. / Maliyetin tutarı, para birimi ve ödeyeni olmalı.
- incident_deadline_due_required: Enter the due time; only the 48-hour, 7-day and document-request deadlines are calculated. / Son zamanı girin; yalnızca 48 saat, 7 gün ve belge talebi süreleri hesaplanır.
- gate_rollback_incident_required: A gate is rolled back only through an incident (K3); pick or open one. / Kapı yalnızca olay üzerinden geri alınır (K3); bir olay seçin ya da açın.
- gate_incident_invalid: Pick an open incident of this project's customer. / Bu projenin müşterisinin açık bir olayını seçin.
- change_request_customer_missing: The request's customer was not found. / Talebin müşterisi bulunamadı.
- change_request_immutable_field: A request's code and customer cannot change. / Talebin kodu ve müşterisi değiştirilemez.
- cr_project_customer: The project belongs to another customer. / Proje başka bir müşteriye ait.
- cr_product_customer: A product belongs to another customer. / Ürünlerden biri başka bir müşteriye ait.
- change_request_kinds_required: Choose at least one kind of change. / En az bir değişiklik türü seçin.
- change_request_document_invalid: Choose a document of this customer's records. / Bu müşterinin kayıtlarından bir belge seçin.
- change_request_approval_document_invalid: The customer's approval must be a signed or approved document of this request. / Müşteri onayı bu talebin imzalı ya da onaylı bir belgesi olmalı.
- change_request_status_order: The request cannot move to this status from its current one. / Talep mevcut durumundan bu duruma geçemez.
- change_request_customer_approval_required: It touches a passed (M) gate: add the customer's written approval date and document first (S08). / Geçmiş bir (M) kapıyı etkiliyor: önce müşterinin yazılı onay tarihini ve belgesini ekleyin (S08).
- change_request_decision_note_required: Write why the request is rejected. / Talebin neden reddedildiğini yazın.
- change_request_new_version_required: Pick the new version of the affected document first. / Önce etkilenen belgenin yeni sürümünü seçin.

Glossary (this task registers `incident_family`, `incident_severity`, `incident_status`, `incident_party`, `incident_root_cause`, `incident_outcome`, `incident_deadline_kind`, `cost_payer`, `change_request_status`, `change_request_source`, `change_request_urgency` and `change_kind` in `GLOSSARY_ENUMS`, so Tasks 8 and 9 can pass `glossary="…"`; `glossary.test.ts`'s expected sorted key list gains the twelve; copy exact):

| key | en | tr |
|---|---|---|
| incident_family.ol | Shipment and delivery: trucks, appointments, counts, damage, papers, customs, delays. | Sevkiyat ve teslim: araç, randevu, sayım, hasar, evrak, gümrük, gecikme. |
| incident_family.oa | Platform and Amazon: listings removed or suppressed, document requests, account health. | Platform ve Amazon: kaldırılan ya da bastırılan listing, belge talebi, hesap sağlığı. |
| incident_family.ou | Product and compliance: PSI failures, refusals, recalls, labels, certificates. | Ürün ve uyum: PSI reddi, kabul etmeme, geri çağırma, etiket, sertifika. |
| incident_family.ot | Supplier: unannounced changes, production delays, PI mismatches, silence, price rises. | Tedarik: habersiz değişiklik, üretim gecikmesi, PI tutarsızlığı, sessizlik, fiyat artışı. |
| incident_family.om | Customer: verbal changes, late payments, disputes, no answer. | Müşteri: sözlü değişiklik, geç ödeme, uyuşmazlık, cevapsızlık. |
| incident_severity.s1 | Critical: goods, money or the account at risk; management at once, the customer within 4 hours. | Kritik: mal, para ya da hesap riski; yönetime hemen, müşteriye 4 saat içinde. |
| incident_severity.s2 | Major: a date slips or a cost appears; management the same day, the customer the same business day. | Önemli: tarih kayar ya da maliyet çıkar; yönetime aynı gün, müşteriye aynı iş günü. |
| incident_severity.s3 | Minor: no effect on delivery or cost; reported in the weekly summary. | Küçük: teslim ve maliyet etkilenmez; haftalık özette bildirilir. |
| incident_status.open | Recorded; being classified and handled. | Kayıtlı; sınıflandırılıyor ve ele alınıyor. |
| incident_status.contained | The goods, listing or money are safe; recovery and closure remain. **[owner to confirm]** | Mal, listing ya da para güvende; kurtarma ve kapanış kaldı. |
| incident_status.closed | Closed with its root cause, cost and the measure added to the guideline. | Kök nedeni, maliyeti ve yönergeye eklenen önlemiyle kapandı. |
| incident_party.customer | The customer is affected. | Müşteri etkileniyor. |
| incident_party.supplier | The supplier is involved. | Tedarikçi işin içinde. |
| incident_party.forwarder | The forwarder or customs broker is involved. | Forwarder ya da gümrük müşaviri işin içinde. |
| incident_party.platform | A marketplace is involved. | Bir pazar yeri işin içinde. |
| incident_party.warehouse | A warehouse is involved. | Bir depo işin içinde. |
| incident_root_cause.human_error | Someone made a mistake. | Biri hata yaptı. |
| incident_root_cause.document_data | A document or data was wrong or missing. | Bir belge ya da veri yanlış veya eksikti. |
| incident_root_cause.communication | Information did not reach the right party in time. | Bilgi doğru tarafa zamanında ulaşmadı. |
| incident_root_cause.supplier | The supplier caused it. | Tedarikçi kaynaklı. |
| incident_root_cause.carrier | The carrier or forwarder caused it. | Taşıyıcı ya da forwarder kaynaklı. |
| incident_root_cause.platform_regulation | A platform rule or a regulation caused it. | Platform kuralı ya da mevzuat kaynaklı. |
| incident_root_cause.customer | The customer caused it. | Müşteri kaynaklı. |
| incident_outcome.full_recovery | Everything was recovered. | Her şey kurtarıldı. |
| incident_outcome.partial_recovery | Part was recovered; the impact note says what is left. | Bir kısmı kurtarıldı; etki notu neyin kaldığını söyler. |
| incident_outcome.loss | It could not be recovered. | Kurtarılamadı. |
| incident_deadline_kind.supplier_damage | Damage notice to the supplier: 48 hours under the usual PI terms. | Tedarikçiye hasar bildirimi: olağan PI şartlarında 48 saat. |
| incident_deadline_kind.carrier_claim | Claim to the carrier: 7 days by road (CMR), 3 days by sea per the B/L; 7 days is assumed. **[owner to confirm]** | Taşıyıcıya itiraz: kara yolunda 7 gün (CMR), denizde konşimentoya göre 3 gün; 7 gün varsayılır. |
| incident_deadline_kind.demurrage | The end of the port or detention free days; enter it from the carrier's terms. | Liman ya da detention serbest günlerinin bitişi; taşıyıcı şartlarından girin. |
| incident_deadline_kind.supplier_storage | When the supplier starts charging storage for goods not collected. | Çekilmeyen mal için tedarikçinin depolama ücreti başlattığı tarih. |
| incident_deadline_kind.platform_escalation | Wait 48 hours for a platform case before escalating. | Platform vakasında eskalasyondan önce 48 saat beklenir. |
| incident_deadline_kind.document_request | A platform document request is closed within the business days set by management (5). | Platformun belge talebi yönetimin belirlediği iş günü içinde (5) kapatılır. |
| incident_deadline_kind.other | Any other deadline; enter its date. | Diğer süre sınırları; tarihini girin. |
| cost_payer.moesa | MOESA bears the cost. | Maliyeti MOESA üstlenir. |
| cost_payer.customer | Charged to the customer; needs the customer's written approval. | Müşteriye yansır; müşterinin yazılı onayı gerekir. |
| cost_payer.supplier | Charged to the supplier. | Tedarikçiye yansır. |
| cost_payer.carrier_insurance | Claimed from the carrier or the insurance. | Taşıyıcıdan ya da sigortadan talep edilir. |
| change_request_status.open | Recorded; impact and decision pending. | Kayıtlı; etki ve karar bekliyor. |
| change_request_status.approved | Approved by MOESA (and by the customer when a passed (M) gate is touched); not applied yet. | MOESA onayladı (geçmiş (M) kapı etkileniyorsa müşteri de); henüz uygulanmadı. |
| change_request_status.rejected | Rejected; the decision note says why. | Reddedildi; karar notu nedenini söyler. |
| change_request_status.applied | Applied: the affected document has its new version. | Uygulandı: etkilenen belge yeni sürümünü aldı. |
| change_request_source.customer | The customer asked for it. | Müşteri istedi. |
| change_request_source.supplier | The supplier asked for it or caused it. | Tedarikçi istedi ya da yol açtı. |
| change_request_source.moesa | MOESA proposes it. | MOESA öneriyor. |
| change_request_source.regulation | A regulation or a platform rule requires it. | Mevzuat ya da platform kuralı gerektiriyor. |
| change_request_urgency.normal | Decided within 5 business days. | 5 iş günü içinde karar verilir. |
| change_request_urgency.urgent | Production or safety is at stake; decided within 24 hours. | Üretim ya da güvenlik söz konusu; 24 saat içinde karar verilir. |
| change_kind.spec | Size, material, composition, performance or safety; a new spec version, signed again by the maker. | Ölçü, malzeme, bileşim, performans ya da güvenlik; üreticinin yeniden imzaladığı yeni spec sürümü. |
| change_kind.design | Design or tech pack. | Tasarım ya da tech pack. |
| change_kind.packaging | Packaging, label or artwork; PL-G4 again. | Ambalaj, etiket ya da artwork; PL-G4 yeniden. |
| change_kind.price | Price or quantity; a new PI and PO version, the customer's price approval (G3). | Fiyat ya da adet; yeni PI ve PO sürümü, müşterinin fiyat onayı (G3). |
| change_kind.deadline | Ready date, booking or launch date. | Termin, booking ya da yayın tarihi. |
| change_kind.supplier | Another supplier; a new spec sheet and golden sample. | Başka tedarikçi; yeni spec sheet ve altın numune. |
| change_kind.content | Listing content; L-G1 again. | Listing içeriği; L-G1 yeniden. |

UI copy (`ops.incident.*`, EN / TR). **Task 8 owns and adds these keys**; listed here beside the enums:
- `title`: Incidents / Olaylar
- `status.*`: open Open / Açık; contained Contained / Kontrol altında **[owner to confirm]**; closed Closed / Kapandı
- `severity.*` (Y10 §4): s1 S1 critical / S1 kritik; s2 S2 major / S2 önemli; s3 S3 minor / S3 küçük
- `family.*` (Y10 §5–§7): ol Shipment and delivery (OL) / Sevkiyat ve teslim (OL); oa Platform and Amazon (OA) / Platform ve Amazon (OA); ou Product and compliance (OU) / Ürün ve uyum (OU) **[owner to confirm]**; ot Supplier (OT) / Tedarik (OT); om Customer (OM) / Müşteri (OM)
- `types.<CODE>` for each of the 42 codes: the TR text is the Y10 heading after the code, verbatim, up to its first " (" (e.g. `OL-09`: Sevkiyat gecikmesi; `OA-02`: Belge talebi: GPSR güvenlik bilgisi, SDS, ürün güvenliği görselleri); the EN text is its translation.
- `party.*` (S17 B): customer Customer / Müşteri; supplier Supplier / Tedarikçi; forwarder Forwarder / Forwarder; platform Platform / Platform; warehouse Warehouse / Depo
- `root_cause.*` (S17 D): human_error Human error / İnsan hatası; document_data Document or data / Belge-veri; communication Communication / İletişim; supplier Supplier / Tedarikçi; carrier Carrier / Taşıyıcı; platform_regulation Platform or regulation / Platform-mevzuat; customer Customer / Müşteri
- `outcome.*` (S17 D): full_recovery Full recovery / Tam kurtarma; partial_recovery Partial recovery / Kısmi kurtarma; loss Loss / Kayıp
- `deadline_kind.*` (Y10 §4): supplier_damage Supplier damage notice (48 h) / Tedarikçiye hasar bildirimi (48 saat); carrier_claim Carrier claim (CMR 7 days) / Taşıyıcıya itiraz (CMR 7 gün); demurrage Demurrage / detention free days / Demuraj / detention serbest gün; supplier_storage Supplier storage fee / Tedarikçi depolama ücreti; platform_escalation Platform escalation (48 h) / Platform eskalasyonu (48 saat); document_request Document request (business days) / Belge talebi (iş günü); other Other / Diğer
- `cost_payer.*`: moesa MOESA / MOESA; customer Customer / Müşteri; supplier Supplier / Tedarikçi; carrier_insurance Carrier or insurance / Taşıyıcı-sigorta
- `fields.*` (S17): code Incident no / Olay no; customer Customer / Müşteri; family Family / Aile; incident_type Incident type (Y10) / Olay tipi (Y10); severity Severity / Şiddet; status Status / Durum; owner Owner / Olay sahibi; title Short name / Kısa ad; what_happened What happened / Ne oldu; reported_by Reported by, channel / Kim bildirdi, hangi kanaldan; current_state Where the goods, listing or money are now / Şu an mal/listing/para nerede; immediate_action Done at once / Hemen yapılan; entity Linked record / Bağlı kayıt; opened_at Opened / Açılış; affected_parties Affected parties / Etkilenen taraflar; management_notified_at Management told / Yönetime bildirim; customer_notice_due_at Customer notice due / Müşteriye ilk bildirim hedefi; customer_notified_at Customer told / Müşteriye bildirim (gerçekleşen); outcome Outcome / Sonuç; root_cause Root cause / Kök neden; root_cause_note Root cause note / Kök neden açıklaması; impact_note Total impact / Toplam etki; lessons Lesson learned / Alınan ders; preventive_action Preventive action added / Eklenen önlem; customer_closure_notified_on Customer told of closure / Müşteriye kapanış bildirimi; closed_on Closed on / Kapanış tarihi; is_repeat Repeat within 90 days / 90 gün içinde tekrar
- `log.fields.*` (S17 C): logged_at Date and time / Tarih-saat; author Who / Kim; note What happened or was done / Ne oldu / ne yapıldı; counterparty Counterparty and channel / Karşı taraf ve kanal; decision Decision or approval / Karar / onay; cost_amount Cost / Maliyet; cost_currency Currency / Para birimi; cost_payer Who pays / Kim öder; customer_approved Customer approved / Müşteri onayı var
- `deadline.fields.*`: kind Deadline / Süre sınırı; label Note / Not; due_at Due / Son tarih; met_at Met / Karşılandı

UI copy (`ops.change_request.*`, EN / TR). **Task 9 owns and adds these keys**; listed here beside the enums:
- `title`: Change requests / Değişiklik talepleri
- `status.*`: open Open / Açık; approved Approved / Onaylandı; rejected Rejected / Reddedildi; applied Applied / Uygulandı
- `source.*` (S08 A): customer Customer / Müşteri; supplier Supplier / Tedarikçi; moesa MOESA / MOESA; regulation Regulation or platform / Mevzuat-platform
- `urgency.*` (S08 A): normal Normal (5 business days) / Normal (5 iş günü); urgent Urgent (24 hours) / Acil (24 saat)
- `kind.*` (S08 C): spec Spec / Spec; design Design / Tasarım; packaging Packaging, label, artwork / Ambalaj, etiket, artwork; price Price or quantity / Fiyat / adet; deadline Deadline / Termin; supplier Supplier change / Tedarikçi değişikliği; content Content or listing / İçerik / listing
- `fields.*` (S08): code Request no / Değişiklik talebi no; customer Customer / Müşteri; project Project / Proje; products SKUs / SKU'lar; title Title / Başlık; source Source / Kaynak; urgency Urgency / Aciliyet; status Status / Durum; decision_due_on Decision due / Karar tarihi; change_kinds Kinds of change / Değişikliğin türü; current_value Current (old value) / Mevcut durum (eski değer); requested_value Requested (new value) / İstenen durum (yeni değer); reason Reason / Neden; affected_gate Affected gate / Etkilenen kapı; affected_document Affected document and version / Etkilenen belge ve mevcut sürüm; other_documents Other affected documents / Etkilenen diğer belgeler; cost_impact Cost impact / Maliyet etkisi; cost_payer Who pays / Kim öder; delay_days Delay (days) / Süre etkisi (gün); quality_impact Quality / compliance impact / Kalite / uyum etkisi; listing_impact Stock / listing impact / Stok / listing etkisi; decision_note Decision note / Karar notu; moesa_approved MOESA approval / MOESA onayı; customer_approved_on Customer approved on / Müşteri onay tarihi; customer_approval_document Customer approval document / Müşteri onay belgesi; result_document New version / Yeni sürüm; closed_on Closed on / Kapanış tarihi

- [ ] **Step 1: Write the tests.** `incident.test.ts`:

```ts
const C = '00000000-0000-4000-8000-000000000001';
const I = '00000000-0000-4000-8000-000000000002';
expect(INCIDENT_TYPES).toHaveLength(42);
expect(incidentTypesOf('ot')).toEqual(['OT-01', 'OT-02', 'OT-03', 'OT-04', 'OT-05', 'OT-06', 'OT-07', 'OT-08']);
expect(nextIncidentStatuses('open')).toEqual(['contained', 'closed']);
expect(nextIncidentStatuses('closed')).toEqual([]);
const s1 = { severity: 's1', management_notified_at: null, outcome: null, root_cause: null, preventive_action: null } as const;
expect(incidentStatusHints(s1, 'contained', true)).toEqual(['incident_management_notice_required']);
expect(incidentStatusHints({ ...s1, management_notified_at: '2026-11-06T09:30:00Z', outcome: 'loss', root_cause: 'carrier', preventive_action: 'Y07' }, 'closed', false))
   .toEqual(['incident_close_management']);
expect(incidentStatusHints({ ...s1, severity: 's3' }, 'closed', true)).toEqual(['incident_closure_incomplete']);
const now = new Date('2026-11-06T14:00:00Z');
expect(customerNoticeState({ customer_notice_due_at: '2026-11-06T13:00:00Z', customer_notified_at: null }, now)).toBe('late');
expect(customerNoticeState({ customer_notice_due_at: '2026-11-06T13:00:00Z', customer_notified_at: '2026-11-06T12:00:00Z' }, now)).toBe('done');
expect(customerNoticeState({ customer_notice_due_at: null, customer_notified_at: null }, now)).toBe('none');
const base = toIncidentFormValues({ customer_id: C, family: 'ol', severity: 's2', title: 'Late truck', what_happened: 'The truck is late.' });
expect(incidentSchema.safeParse({ ...base, incident_type: 'OA-02' }).success).toBe(false);
expect(incidentSchema.safeParse({ ...base, entity_type: 'shipment' }).success).toBe(false);
const update = toIncidentPayload(incidentSchema.parse(base), I);
for (const key of ['customer_id', 'family', 'code', 'status', 'customer_notice_due_at', 'closed_on']) expect(update).not.toHaveProperty(key);
expect(incidentDeadlineSchema.safeParse({ incident_id: I, kind: 'other', due_at: null }).success).toBe(false);
expect(incidentDeadlineSchema.safeParse({ incident_id: I, kind: 'document_request', due_at: null }).success).toBe(true);
expect(toIncidentDeadlinePayload(incidentDeadlineSchema.parse({ incident_id: I, kind: 'document_request', due_at: null }))).not.toHaveProperty('due_at');
expect(incidentLogSchema.safeParse({ incident_id: I, logged_at: now, note: 'fee', cost_amount: 100 }).success).toBe(false);
expect(incidentLogSchema.safeParse({ incident_id: I, logged_at: now, note: 'fee', cost_amount: 100, cost_currency: 'EUR', cost_payer: 'customer' }).success).toBe(true);
```

  `changeRequest.test.ts`:

```ts
const C = '00000000-0000-4000-8000-000000000001';
const gates = [{ code: 'G1', status: 'passed', needs_customer_approval: true }, { code: 'G4', status: 'passed', needs_customer_approval: false }];
expect(nextChangeRequestStatuses('open')).toEqual(['approved', 'rejected']);
expect(nextChangeRequestStatuses('approved')).toEqual(['applied']);
expect(needsCustomerApproval({ affected_gate_code: 'G1' }, gates)).toBe(true);
expect(needsCustomerApproval({ affected_gate_code: 'G4' }, gates)).toBe(false);
expect(needsCustomerApproval({ affected_gate_code: null }, gates)).toBe(false);
const cr = { affected_gate_code: 'G1', customer_approved_on: null, customer_approval_document_id: null, decision_note: null, affected_document_id: 'd1', result_document_id: null } as const;
expect(changeRequestStatusHints(cr, 'approved', gates)).toEqual(['change_request_customer_approval_required']);
expect(changeRequestStatusHints(cr, 'rejected', gates)).toEqual(['change_request_decision_note_required']);
expect(changeRequestStatusHints(cr, 'applied', gates)).toEqual(['change_request_new_version_required']);
const values = toChangeRequestFormValues();
expect(changeRequestSchema.safeParse({ ...values, customer_id: C, title: 't', source: 'moesa', change_kinds: [], current_value: 'a', requested_value: 'b', reason: 'c' }).success).toBe(false);
const payload = toChangeRequestPayload(changeRequestSchema.parse({ ...values, customer_id: C, title: 't', source: 'moesa', change_kinds: ['price'], current_value: 'a', requested_value: 'b', reason: 'c', product_ids: [] }), 'r1');
for (const key of ['customer_id', 'code', 'status', 'decision_due_on', 'product_ids', 'moesa_approved_on']) expect(payload).not.toHaveProperty(key);
```

  `queryKeys.test.ts`: `affectedTables(['incident'])` contains `incident_log`, `incident_deadline`, `incident_overview`; `affectedTables(['project_gate'])` contains `incident`. `postgrestErrors.test.ts`: `{ code: '23514', message: 'new row … violates check constraint "incident_log_cost_complete"' }` with `['cost_amount']` maps to `errors.incident_log_cost_incomplete`; `{ code: '42501', message: 'incident_close_management' }` maps to `null`.
- [ ] **Step 2: Run and see them fail.** Run: `pnpm test tests/api/incident.test.ts tests/api/changeRequest.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules and the queryKeys, document, NAMED_ERRORS, field.ts and i18n changes; sync. (`useRollbackGate` changes in Task 8, together with its only caller.)
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add app/src/api/incident app/src/api/changeRequest app/src/api/glossary.ts app/src/api/queryKeys.ts app/src/api/document app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests`; message `feat(incident): incident and change request API with status hints and deadline defaults`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 8: Incident list and card; gate rollback picks an incident

**Files:**
- Create:
  - `app/src/components/service-components/incident-table/IncidentTable.vue`
  - `app/src/views/pages/ops/incident/{Index,Manage,IncidentCard,LogUpsert,DeadlineUpsert}.vue`, `useIncidentForm.ts`
  - `app/src/views/pages/ops/incident/tabs/{General,Log,Deadlines,Closure,Documents,Media}.vue`
  - `app/src/views/pages/ops/project/tabs/Incidents.vue`
  - `app/tests/views/incidentForm.test.ts`, `app/tests/router/incidentRouteProps.test.ts`
- Modify:
  - `app/src/api/project/index.ts`: `useRollbackGate()` mutation input becomes `{ gateId: string; reason: string; incidentId: string }`, calling `rpc('rollback_gate', { gate_id: gateId, reason, incident_id: incidentId })`; `onSuccess` invalidates `[...GATE_TABLES, 'incident']`. Test in `app/tests/api/project.test.ts`.
  - `app/src/components/service-components/gate-panel/GatePanel.vue` and `app/tests/components/GatePanel.test.ts`.
  - `app/src/views/pages/ops/project/Manage.vue` (`TABS` gains `incidents` after `shipments`, `TAB_SUBJECT.incidents = 'incident'`), `app/src/router/routes/ops.ts`.
  - i18n: every `ops.incident.*` key (Task 7's UI-copy list and the keys below; this task owns them).

**Interfaces:**
- Consumes: Task 7; `StatusActions`; `EntityDocuments`, `EntityMedia`; `SelectCustomer`, `SelectEnum`, `useMemberOptions` (`api/project`); `useUpsertForm`; `useCustomerFilter`, `withCustomerFilter`, `equalsFilter`.
- Produces:
  - `IncidentTable.vue` props `{ filters?: { entityType?: IncidentEntityType; entityId?: string } }`: a `ResourceTable` over `incident_overview` following the customer filter; `entityType`/`entityId` map to `entity_type`/`entity_id` with `equalsFilter`. Columns: code, customer_code, severity (Tag `INCIDENT_SEVERITY_SEVERITY` + `SelectEnum` filter, `i18n-prefix="ops.incident.severity"`, `glossary="incident_severity"`), status (Tag + filter, `i18n-prefix="ops.incident.status"`, `glossary="incident_status"`), title, entity_label, opened_at, next_deadline_at (danger Tag when `overdue_deadline_count > 0`), is_repeat (warn Tag `ops.incident.fields.is_repeat`). Default sort `severity` ascending then `opened_at` descending. A row opens `ops-incident-manage`.
  - `Index.vue`: header `ops.incident.title` + `IncidentTable`.
  - `useIncidentForm(id, onSaved?, prefill?: { customer_id?: string | null; entity_type?: string | null; entity_id?: string | null })`: the `useShipmentForm` pattern; prefill from the props, else `customer_id` from the customer filter; `INCIDENT_CARD_TABS = ['general', 'log', 'deadlines', 'closure', 'documents', 'media'] as const`; `tabForField(field): 'general' | 'closure'` (`outcome`, `root_cause`, `root_cause_note`, `impact_note`, `lessons`, `preventive_action`, `customer_closure_notified_on` → `closure`); injection key `INCIDENT_FORM`.
  - `IncidentCard.vue` / `Manage.vue` (ShipmentCard pattern): tabs past `general` open once saved; header `code — title`, severity and status Tags, `StatusActions` (`nextIncidentStatuses`, `i18nPrefix="ops.incident.status"`, `glossary="incident_status"`, `warnings`: `StatusActions.warnings` is `Partial<Record<status, string>>`, so for each `s` in `nextIncidentStatuses(status)` the card computes `incidentStatusHints(values, s, $can('update', 'tenant'))`, translates each code as `errors.<code>` and joins them with `"; "` into one string, leaving out statuses with no hint); it calls `useIncidentOverview(id)` once and provides it as `INCIDENT_OVERVIEW`.
  - `tabs/General.vue`: section Opening (customer on a new incident only; family on a new incident only; Y10 type `Select` over `incidentTypesOf(family)` labelled `CODE — ops.incident.types.CODE`; severity `SelectEnum i18n-prefix="ops.incident.severity" glossary="incident_severity"`; title; what happened; reported by; current state; immediate action; linked record: `SelectEnum` over `INCIDENT_ENTITY_TYPES` (`i18n-prefix="ops.document.entity"`) then a `Select` of `useIncidentEntityOptions`); section Classification (owner `Select` of `useMemberOptions`; affected parties `SelectEnum multiple i18n-prefix="ops.incident.party" glossary="incident_party"`; opened at; management told; customer notice due (read-only, with a Tag from `customerNoticeState`: late danger, due warn, done success); customer told). Below, when the card's `project_gate` embed is not empty: "Gates rolled back by this incident" (`ops.incident.rolled_back_gates`), each `ops.project.gate.<code>` linking to `ops-project-manage` (centered dialog).
  - `tabs/Log.vue`: the embedded log, newest first (logged at, note, counterparty, decision, cost with currency and payer, a warn Tag `ops.incident.log.needs_customer_approval` when `cost_payer = 'customer'` and not `customer_approved`); add/edit open `ops-incident-log-add` / `-edit`, hidden when the incident is closed.
  - `tabs/Deadlines.vue`: the embedded deadlines by `due_at` (kind label, note, due, met; danger Tag `ops.incident.deadline.overdue` when unmet and past); add/edit `ops-incident-deadline-add` / `-edit`, hidden when closed.
  - `tabs/Closure.vue`: outcome, root cause, root-cause note, total impact, lessons, preventive action (hint `ops.incident.preventive_hint`: S17 "Olay, önlem ilgili yönergeye işlenmeden kapanmış sayılmaz."), customer closure notice, closed on (read-only).
  - `tabs/Documents.vue`: `EntityDocuments entityType="incident" :entityId :code :customerId`; `tabs/Media.vue`: `EntityMedia entityType="incident" :entityId :customerId :tenantId`.
  - `LogUpsert.vue`, `DeadlineUpsert.vue`: route dialogs over the Task 7 schemas; DeadlineUpsert shows `ops.incident.deadline.calculated` under an empty due field when the kind is in `INCIDENT_DEADLINE_DEFAULTS`.
  - `incidentProps(route)` in `ops.ts`: `{ ...route.params, customer_id, entity_type, entity_id }` from the query, as `purchaseOrderProps`.
  - Routes (parent `path: 'incidents'`, name `ops-incident`, `PrimeIcons.EXCLAMATION_CIRCLE`, select `incident`, context menu "add" → `ops-incident-manage` centered; `ops` `anyPermission` gains select `incident`): `ops-incident-list`; `ops-incident-manage` (`:id?/manage/:tab?`, props `incidentProps`) with children `ops-incident-manage-{general,log,deadlines,closure,documents,media}`; `ops-incident-log-add` (`:incidentId/log/add`, create `incident_log`); `ops-incident-log-edit` (`log/:id/edit`); `ops-incident-deadline-add` (`:incidentId/deadline/add`); `ops-incident-deadline-edit` (`deadline/:id/edit`); and `ops-project-manage-incidents` under the project card.
  - `project/tabs/Incidents.vue`: `IncidentTable :filters="{ entityType: 'project', entityId: id }"` and a button `ops.incident.new_for_project` (create `incident`) opening `ops-incident-manage` with query `customer_id`, `entity_type=project`, `entity_id`, centered.
  - `useRollbackGate` and `GatePanel.vue` end the interim of Task 5 (until now the two-argument call was refused with `gate_rollback_incident_required`).
  - `GatePanel.vue` rollback dialog: a required `Select` (`ops.project.gate_panel.incident`) over `useOpenIncidentOptions(project.customer_id)`; when it has no options, the hint `ops.project.gate_panel.no_incident` and a link `ops.incident.new_for_project` (same route as above); submit calls `rollbackGate({ gateId, reason, incidentId })`, disabled until both are filled.
- Copy (EN / TR): `ops.incident.tabs.{general,log,deadlines,closure,documents,media}` General, Log, Deadlines, Closure, Documents, Media / Genel, Günlük, Süre sınırları, Kapanış, Belgeler, Ortam; `ops.incident.sections.{opening,classification}` Opening (first 15 minutes), Classification / Açılış (ilk 15 dakika), Sınıflandırma; `rolled_back_gates` Gates rolled back by this incident / Bu olayla geri alınan kapılar; `log.needs_customer_approval` Charged to the customer without approval / Müşteriye yansıyor, onay yok; `deadline.overdue` Overdue / Gecikti; `deadline.calculated` Left empty, it is calculated from the opening time. / Boş bırakılırsa açılış zamanından hesaplanır.; `preventive_hint` An incident is not closed until the measure is written into its guideline (S17). / Önlem ilgili yönergeye işlenmeden olay kapanmış sayılmaz (S17).; `new_for_project` New incident / Yeni olay; `no_rows` No incidents. / Olay yok.; `ops.project.tabs.incidents` Incidents / Olaylar; `ops.project.gate_panel.incident` Incident / Olay; `ops.project.gate_panel.no_incident` There is no open incident of this customer; open one first. / Bu müşterinin açık olayı yok; önce bir olay açın.; route labels `ops_incident` Incidents / Olaylar, `ops_incident_list` List / Liste, `ops_incident_manage` Incident / Olay, `ops_incident_<tab>` = the tab labels, `ops_incident_log_add` / `_edit` Log line / Günlük satırı, `ops_incident_deadline_add` / `_edit` Deadline / Süre sınırı, `ops_project_incidents` Incidents / Olaylar.

- [ ] **Step 1: Write the tests** (`I1 = '00000000-0000-4000-8000-000000000011'`, `G1 = '00000000-0000-4000-8000-000000000021'`).
  - `incidentRouteProps.test.ts`: `it('reads the new incident from the query')`: `incidentProps({ params: { id: undefined }, query: { customer_id: 'c1', entity_type: 'project', entity_id: 'p1' } })` equals `{ id: undefined, customer_id: 'c1', entity_type: 'project', entity_id: 'p1' }`.
  - `incidentForm.test.ts` (`mockMain` first):
    - `it('routes closure fields to the closure tab')`: `tabForField('preventive_action') === 'closure'`, `tabForField('severity') === 'general'`.
    - `it('offers the family's Y10 cards')`: `General.vue` with family `ou` renders a type `Select` whose option values are `['OU-01', 'OU-02', 'OU-03', 'OU-04', 'OU-05', 'OU-06']`.
    - `it('waits for the entity type')`: with `entity_type: null` the linked-record `Select` has `disabled === true`.
    - `it('locks the log of a closed incident')`: `Log.vue` for a `closed` incident renders no add button; for an open one with a line `{ cost_payer: 'customer', customer_approved: false }` it renders the Tag text `i18n.t('ops.incident.log.needs_customer_approval')`.
    - `it('joins the hints of a status')`: the card for `{ severity: 's1', management_notified_at: null, outcome: null, root_cause: null, preventive_action: null, status: 'open' }` with `$can('update','tenant')` false passes `StatusActions` `warnings` equal to `{ contained: i18n.t('errors.incident_management_notice_required'), closed: [i18n.t('errors.incident_management_notice_required'), i18n.t('errors.incident_closure_incomplete'), i18n.t('errors.incident_close_management')].join('; ') }`.
  - `GatePanel.test.ts`: a hoisted mock (`const rollbackGate = vi.hoisted(() => vi.fn().mockResolvedValue({}))`, returned by the mocked `useRollbackGate` as `mutateAsync`; `useOpenIncidentOptions` mocked to `computed(() => [{ value: I1, label: 'OL-THO-2026-001 — Pallets short' }])`):
    - `it('needs an incident to roll back')`: with reason `'brief changed'` and no incident the submit button is `disabled`.
    - `it('rolls back with the incident')`: picking `I1` and submitting calls `rollbackGate` once with `{ gateId: G1, reason: 'brief changed', incidentId: I1 }`.
    - `it('offers to open an incident when there is none')`: with no options it renders `i18n.t('ops.project.gate_panel.no_incident')` and a link to `ops-incident-manage` whose query has `entity_type: 'project'`.
  - `project.test.ts`: `it('rolls a gate back through an incident')`: `useRollbackGate().mutateAsync({ gateId: G1, reason: 'brief changed', incidentId: I1 })` calls the mocked `supabase.rpc` with `('rollback_gate', { gate_id: G1, reason: 'brief changed', incident_id: I1 })`.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/views/incidentForm.test.ts tests/router/incidentRouteProps.test.ts tests/components/GatePanel.test.ts tests/api/project.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes, GatePanel, project tab and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check as `koordinator@`: an S1 incident for THO linked to the pilot gets `OL-THO-<year>-001` and a customer notice due four hours after opening; "Contained" is refused until "Management told" is filled.
- [ ] **Step 5: Commit.** `git add app/src/api/project app/src/components/service-components/incident-table app/src/components/service-components/gate-panel app/src/views/pages/ops/incident app/src/views/pages/ops/project app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests`; message `feat(incident): incident list and card with log, deadlines and closure; gate rollback names its incident`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 9: Change request list and card

**Files:**
- Create:
  - `app/src/components/service-components/change-request-table/ChangeRequestTable.vue`
  - `app/src/views/pages/ops/change-request/{Index,Manage,ChangeRequestCard}.vue`, `useChangeRequestForm.ts`
  - `app/src/views/pages/ops/change-request/tabs/{General,Impact,Decision,Documents}.vue`
  - `app/tests/views/changeRequestForm.test.ts`
- Modify: `app/src/router/routes/ops.ts`; i18n: every `ops.change_request.*` key (Task 7's UI-copy list and the keys below; this task owns them).

**Interfaces:**
- Consumes: Task 7; `ProductMultiSelect` (Task 4); `ProjectSelect` (`views/pages/ops/purchase-order/ProjectSelect.vue`); `useEntityDocumentOptions` (`api/purchaseOrder`); `StatusActions`; `EntityDocuments`; `SelectEnum`, `SelectCustomer`.
- Produces:
  - `ChangeRequestTable.vue`: a `ResourceTable` over `change_request` (select `*, customer!change_request_customer_fkey(code), project!change_request_project_fkey(code)`) following the customer filter. Columns: code, customer, project, title, source, urgency, status (Tag + `SelectEnum` filter `glossary="change_request_status"`), decision_due_on (danger Tag when `open` and past), closed_on. A row opens `ops-change-request-manage`.
  - `useChangeRequestForm(id, onSaved?)`: the shared-form pattern; `CHANGE_REQUEST_CARD_TABS = ['general', 'impact', 'decision', 'documents'] as const`; `tabForField(field): 'general' | 'impact' | 'decision'` (`cost_impact`, `cost_payer`, `delay_days`, `quality_impact`, `listing_impact`, `other_documents` → `impact`; `decision_note`, `customer_approved_on`, `customer_approval_document_id`, `result_document_id` → `decision`); key `CHANGE_REQUEST_FORM`. Saving also runs `useSetChangeRequestProducts` with the embed's ids as `before`.
  - `ChangeRequestCard.vue` / `Manage.vue`: header `code — title`, status Tag, decision-due Tag, `StatusActions` (`nextChangeRequestStatuses`, `i18nPrefix="ops.change_request.status"`, `glossary="change_request_status"`, `warnings` from `changeRequestStatusHints(values, s, card.project?.project_gate ?? [])`).
  - `tabs/General.vue`: customer (new only), project (`ProjectSelect`), products (`ProductMultiSelect`), title, source, urgency, kinds (`SelectEnum multiple glossary="change_kind"`), current value, requested value, reason, affected gate (`Select` over the project's gate codes, `ops.project.gate.<code>`), affected document: an entity `Select` (the project and the chosen products) then `useEntityDocumentOptions({ entityType, entityId })`.
  - `tabs/Impact.vue`: cost impact, who pays, delay days, quality impact, listing impact, other documents.
  - `tabs/Decision.vue`: MOESA approval (read-only: approver name from `useMemberOptions`, date); when `needsCustomerApproval` is true, the hint `ops.change_request.customer_approval_hint` and the customer approval date and document (`useEntityDocumentOptions({ entityType: 'change_request', entityId: id, statuses: ['signed', 'approved'] })`); decision note; result document (`useNewerDocumentOptions(card.affected_document)`, shown when an affected document is set); closed on.
  - `tabs/Documents.vue`: `EntityDocuments entityType="change_request" :entityId :code :customerId`.
  - Routes (parent `path: 'change-requests'`, name `ops-change-request`, `PrimeIcons.SYNC`, select `change_request`, context menu "add"; `ops` `anyPermission` gains select `change_request`): `ops-change-request-list`; `ops-change-request-manage` (`:id?/manage/:tab?`) with children `ops-change-request-manage-{general,impact,decision,documents}`.
- Copy (EN / TR): `ops.change_request.tabs.{general,impact,decision,documents}` Request, Impact, Decision, Documents / Talep, Etki, Karar, Belgeler; `customer_approval_hint` It touches a passed (M) gate: the customer's written approval is required (S08). / Geçmiş bir (M) kapıyı etkiliyor: müşterinin yazılı onayı şart (S08).; `overdue` Decision overdue / Karar gecikti; `no_rows` No change requests. / Değişiklik talebi yok.; route labels `ops_change_request` Change requests / Değişiklik talepleri, `ops_change_request_list` List / Liste, `ops_change_request_manage` Change request / Değişiklik talebi, `ops_change_request_<tab>` = the tab labels.

- [ ] **Step 1: Write the tests** (`changeRequestForm.test.ts`, `mockMain` first; `useSetChangeRequestProducts` mocked with a hoisted `vi.fn()`):
  - `it('routes fields to their tab')`: `tabForField('delay_days') === 'impact'`, `tabForField('result_document_id') === 'decision'`, `tabForField('reason') === 'general'`.
  - `it('asks for the customer approval on a passed (M) gate')`: `Decision.vue` for a card with `affected_gate_code: 'G1'` and `project.project_gate = [{ code: 'G1', status: 'passed', needs_customer_approval: true }]` renders `i18n.t('ops.change_request.customer_approval_hint')` and the inputs labelled `i18n.t('ops.change_request.fields.customer_approved_on')` and `…customer_approval_document`; with `affected_gate_code: null` none of the three is rendered.
  - `it('saves the product changes')`: a card embedding products `['p1', 'p2']` saved with `product_ids: ['p2', 'p3']` calls the mutate once with `{ id: <card id>, before: ['p1', 'p2'], after: ['p2', 'p3'] }`.
- [ ] **Step 2: Run and see them fail.** Run: `pnpm test tests/views/changeRequestForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check: a CR for THO on the pilot gets `CR-THO-<year>-001` and a decision date five business days ahead.
- [ ] **Step 5: Commit.** `git add app/src/components/service-components/change-request-table app/src/views/pages/ops/change-request app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests`; message `feat(cr): change request list and card with impact, approvals and the applying version`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 10: Dashboard boxes for incidents, change requests and the market matrix

**Files:**
- Create: `supabase/migrations/038_dashboard_matrix_incidents.sql`, `supabase/tests/database/038_dashboard_matrix_incidents.test.sql`
- Modify: `app/src/api/dashboard/index.ts`, `app/src/views/pages/dashboard/Index.vue`, `app/src/api/queryKeys.ts`, `app/tests/api/{dashboard,queryKeys}.test.ts`, `supabase/functions/_shared/database.types.ts`, i18n `dashboard.ops.*`.

**Interfaces:**
- Consumes: `market_cell` (Task 2), `incident_overview` (Task 5), `change_request` (Task 6); `useDashboardView`, `CountListCard`, `dayMonth` (Index.vue), `useCustomerFilter`.
- Produces (SQL; `security_invoker`, `GRANT SELECT … TO authenticated`, `COMMENT`, 033 style):
  - `public.dashboard_market`: per customer and tenant over `market_cell`: `customer_id`, `customer_code`, `tenant_id`, `live_count`, `preparing_count` (`preparing` + `uploaded`), `suppressed_count`, `target_count` (`TARGET_STATUSES`), all `INT`.
  - `public.dashboard_incident`: the incidents that are not `closed`, from `incident_overview`: `incident_id`, `code`, `customer_id`, `customer_code`, `tenant_id`, `severity`, `status`, `title`, `opened_at`, `management_notice_missing BOOLEAN` (`s1`/`s2` without `management_notified_at`), `customer_notice_due_at`, `customer_notice_late BOOLEAN` (due passed, not notified), `next_deadline_at`, `overdue_deadline_count`.
  - `public.dashboard_change_request`: the `open` and `approved` requests: `change_request_id`, `code`, `customer_id`, `customer_code`, `tenant_id`, `status`, `urgency`, `title`, `decision_due_on`, `overdue BOOLEAN` (`status = 'open' AND decision_due_on < current_date`).
- Produces (app):
  - Types `DashboardMarketRow`, `DashboardIncidentRow`, `DashboardChangeRequestRow`; the `DashboardView` union gains the three views.
  - `useDashboardMarket()`; `useDashboardIncidents()` (order `severity` ascending: S1 first, spec "S1/S2 öne"); `useDashboardChangeRequests()` (order `decision_due_on` ascending).
  - `marketSummary(rows: readonly DashboardMarketRow[]): { live: number; items: DashboardMarketRow[] }` (rows with `target_count > 0`, most live first).
  - `Index.vue` adds three `CountListCard`s:
    - open incidents: `PrimeIcons.EXCLAMATION_CIRCLE`, danger, `$can('read','incident')`; label `code · title · customer_code`; meta = severity label, then `meta.notice_missing` when `management_notice_missing`, else `meta.deadline` with `next_deadline_at`; links to `ops-incident-manage` (centered).
    - open change requests: `PrimeIcons.SYNC`, warn, `$can('read','change_request')`; meta = status label and `meta.decision_due`; links to `ops-change-request-manage`.
    - market matrix: `PrimeIcons.TABLE`, success, `$can('read','market_cell')`; count = `marketSummary(rows).live`; one item per customer, label `customer_code`, meta `meta.market`; `to: { name: 'ops-market-list' }` with `onSelect` setting the customer filter (the `evidenceBox` pattern).
  - queryKeys DERIVED: `market_cell` gains `'dashboard_market'`; `incident`, `incident_deadline` gain `'dashboard_incident'`; `change_request` gains `'dashboard_change_request'`; `customer` gains the three views (codes).
- Copy (`dashboard.ops.*`, EN / TR): `incidents_open` Open incidents / Açık olaylar (M6); `change_requests_open` Open change requests / Açık CR'ler (M6); `market_summary` Market matrix: live / Pazar matrisi özeti (M6); `meta.notice_missing` management not told / yönetime bildirilmedi; `meta.deadline` deadline {date} / son tarih {date}; `meta.decision_due` decision {date} / karar {date}; `meta.market` {live} live · {preparing} preparing · {suppressed} suppressed / {live} yayında · {preparing} hazırlanıyor · {suppressed} askıda.

- [ ] **Step 1: Write `038_dashboard_matrix_incidents.test.sql`** — `plan(7)`, the preamble, then:

```sql
INSERT INTO public.market_cell (id, tenant_id, product_id, platform_id, country)
SELECT x.id, current_setting('test.moesa')::UUID, x.product, x.platform, x.country
FROM (VALUES ('00000000-0000-4000-8000-000000038011'::UUID, current_setting('test.mop')::UUID, 'amazon', 'DE'),
             ('00000000-0000-4000-8000-000000038012', current_setting('test.mop')::UUID, 'amazon', 'FR'),
             ('00000000-0000-4000-8000-000000038013', current_setting('test.tips')::UUID, 'ebay', 'DE'),
             ('00000000-0000-4000-8000-000000038014', current_setting('test.cones')::UUID, 'amazon', 'IT')) AS x (id, product, platform, country);
INSERT INTO public.incident (id, tenant_id, customer_id, family, severity, title, what_happened, opened_at)
VALUES ('00000000-0000-4000-8000-000000038021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'ol', 's1', 'Truck refused', 'The warehouse refused the truck.', now() - INTERVAL '5 hours'),
       ('00000000-0000-4000-8000-000000038022', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'ot', 's3', 'Late sample', 'The supplier sent the sample late.', now()),
       ('00000000-0000-4000-8000-000000038023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'om', 's3', 'Old', 'Closed.', now());
INSERT INTO public.change_request (id, tenant_id, customer_id, title, source, change_kinds, current_value, requested_value, reason, created_at)
VALUES ('00000000-0000-4000-8000-000000038031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Carton print', 'moesa', ARRAY['packaging']::public.change_kind[],
        'Black print', 'Two-colour print', 'Brand guide v2.', now() - INTERVAL '10 days'),
       ('00000000-0000-4000-8000-000000038032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'Price', 'supplier', ARRAY['price']::public.change_kind[],
        '1.90 USD', '1.95 USD', 'Cotton price.', now());
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.market_cell SET status = x.status::public.market_cell_status
FROM (VALUES ('00000000-0000-4000-8000-000000038011'::UUID, 'live'), ('00000000-0000-4000-8000-000000038012', 'preparing'), ('00000000-0000-4000-8000-000000038013', 'suppressed')) AS x (id, status)
WHERE market_cell.id = x.id;
UPDATE public.incident SET status = 'closed' WHERE id = '00000000-0000-4000-8000-000000038023';
UPDATE public.change_request SET status = 'applied' WHERE id = '00000000-0000-4000-8000-000000038032';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT is((SELECT live_count || ':' || preparing_count || ':' || suppressed_count || ':' || target_count FROM public.dashboard_market WHERE customer_id = current_setting('test.tho')::UUID),
          '1:1:1:3', 'live, preparing and suppressed against the target (candidates are not targets)');
SELECT is((SELECT count(*)::INT FROM public.dashboard_incident WHERE incident_id IN ('00000000-0000-4000-8000-000000038021', '00000000-0000-4000-8000-000000038022', '00000000-0000-4000-8000-000000038023')),
          2, 'open incidents only');
SELECT is((SELECT management_notice_missing FROM public.dashboard_incident WHERE incident_id = '00000000-0000-4000-8000-000000038021'), TRUE,
          'an S1 without the management notice is flagged');
SELECT is((SELECT customer_notice_late FROM public.dashboard_incident WHERE incident_id = '00000000-0000-4000-8000-000000038021'), TRUE,
          'four hours passed without telling the customer');
SELECT is((SELECT overdue FROM public.dashboard_change_request WHERE change_request_id = '00000000-0000-4000-8000-000000038031'), TRUE,
          'a request past its decision date');
SELECT is((SELECT count(*)::INT FROM public.dashboard_change_request WHERE change_request_id = '00000000-0000-4000-8000-000000038032'), 0,
          'applied requests leave the dashboard');

RESET ROLE;
SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.dashboard_market), 0, 'another tenant sees none');
```

- [ ] **Step 2: Extend the app tests.** `dashboard.test.ts` `it('sums the live cells and keeps the customers with a target')`: `marketSummary([{ customer_code: 'THO', live_count: 1, target_count: 3 }, { customer_code: 'ZZZ', live_count: 4, target_count: 4 }, { customer_code: 'NIL', live_count: 0, target_count: 0 }])` gives `live: 5` and items whose `customer_code`s are `['ZZZ', 'THO']`. `queryKeys.test.ts` `it('refreshes the new dashboard boxes')`: `affectedTables(['market_cell'])` contains `'dashboard_market'`, `affectedTables(['incident_deadline'])` contains `'dashboard_incident'`, `affectedTables(['change_request'])` contains `'dashboard_change_request'`.
- [ ] **Step 3: Run and see them fail.** Run: `pnpm test:db && pnpm test tests/api/dashboard.test.ts tests/api/queryKeys.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the migration, hooks, boxes and i18n; sync.
- [ ] **Step 5: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add supabase/migrations/038_dashboard_matrix_incidents.sql supabase/tests/database/038_dashboard_matrix_incidents.test.sql supabase/functions/_shared/database.types.ts app/src/api/dashboard app/src/api/queryKeys.ts app/src/views/pages/dashboard/Index.vue app/src/plugins/i18n/locales app/tests/api`; message `feat(dashboard): open incidents S1 first, open change requests and the market matrix summary`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 11: Glossary label prefixes and wiring check

**Files:**
- Modify: `app/src/api/glossary.ts` (creates `GLOSSARY_LABELS`; it does not exist today), `app/tests/plugins/i18n/glossary.test.ts`; the `SelectEnum`/`StatusActions` call sites of Tasks 4, 8 and 9 (add `glossary` where one is missing).

**Interfaces:**
- Consumes: `GLOSSARY_ENUMS` with the sixteen enums Tasks 3 and 7 registered (their glossary rows are in those tasks).
- Produces: `GLOSSARY_LABELS: Record<GlossaryEnum, string | null>`, created here: the i18n prefix of each enum's value labels (`null` = the value is its own label). `package` null, `project_type` `ops.project.type`, `project_path` `ops.project.path`, `gate_code` `ops.project.gate`, `document_type` `ops.document.type`, `document_status` `ops.document.status`, `supplier_status` `ops.supplier.status`, `customer_status` `ops.customer.status`, `product_status` `ops.product.status`, `task_status` `ops.project.task_status`, `purchase_order_status` `ops.purchase_order.status`, `payment_kind` `ops.purchase_order.payment.kind`, `shipment_status` `ops.shipment.status`, `shipment_mode` `ops.shipment.mode`; `market_cell_status` `ops.market.status`, `market_compliance` `ops.market.compliance`, `stock_source` `ops.market.stock_source`, `content_status` `ops.market.content_status`; `incident_family` `ops.incident.family`, `incident_severity` `ops.incident.severity`, `incident_status` `ops.incident.status`, `incident_party` `ops.incident.party`, `incident_root_cause` `ops.incident.root_cause`, `incident_outcome` `ops.incident.outcome`, `incident_deadline_kind` `ops.incident.deadline_kind`, `cost_payer` `ops.incident.cost_payer`; `change_request_status` `ops.change_request.status`, `change_request_source` `ops.change_request.source`, `change_request_urgency` `ops.change_request.urgency`, `change_kind` `ops.change_request.kind`. Task 12 uses it to list a page's terms.

- [ ] **Step 1: Write the test** in `glossary.test.ts`: `it('labels every value of every glossary enum')` — for each enum whose `GLOSSARY_LABELS` prefix is not null, `en` and `tr` have a non-empty string at `<prefix>.<value>` for every value; the missing list equals `[]`. `it('maps every glossary enum to a label prefix')` — `Object.keys(GLOSSARY_LABELS).sort()` equals `Object.keys(GLOSSARY_ENUMS).sort()`.
- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/plugins/i18n/glossary.test.ts`. Expected: FAIL (`GLOSSARY_LABELS` is not exported).
- [ ] **Step 3: Implement** the map; grep the call sites of Tasks 4, 8 and 9 for `SelectEnum`/`StatusActions` without `glossary` and add it.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add app/src/api/glossary.ts app/src/views/pages/ops app/src/components/service-components app/tests`; message `feat(i18n): label prefixes of every glossary enum, for the page guides`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 12: Page guide panel

**Files:**
- Create:
  - `app/src/constants/guide.ts`, `app/src/store/guide/index.ts`
  - `app/src/components/service-components/page-guide/{PageGuide,PageGuideButton}.vue`
  - `app/tests/store/guide.test.ts`, `app/tests/components/PageGuide.test.ts`, `app/tests/components/CountListCard.test.ts`, `app/tests/plugins/i18n/guide.test.ts`
- Modify: `app/src/layouts/dashboard/Index.vue`, `app/src/components/service-components/dashboard/CountListCard.vue`, `app/src/views/pages/dashboard/Index.vue`, i18n `guide.panel.*`, `guide.actions.*` and `guide.pages.dashboard.*` (Task 13 adds the other pages).

**Interfaces:**
- Consumes: `ability` (`@/plugins/casl`), `GLOSSARY_ENUMS`, `GLOSSARY_LABELS`, `glossaryKey` (Task 11); the router (`useRoute`, `useRouter().resolve`).
- Produces (`constants/guide.ts`):
  - `GUIDE_PAGES = ['dashboard', 'setting', 'customer', 'supplier', 'product', 'project', 'document', 'media', 'purchase_order', 'shipment', 'market_matrix', 'incident', 'change_request'] as const`; `type GuidePage = (typeof GUIDE_PAGES)[number]`.
  - `type GuideTask = { id: string; steps: number; permission: { action: 'read' | 'create' | 'update' | 'delete'; subject: string } }`.
  - `type PageGuide = { route: string; tasks: readonly GuideTask[]; related: readonly string[]; glossary: readonly GlossaryEnum[] }` (`route` and `related` are route names).
  - `PAGE_GUIDES: Record<GuidePage, PageGuide>`: the routes `dashboard`, `ops-setting`, `ops-customer`, `ops-supplier`, `ops-product`, `ops-project`, `ops-document`, `ops-media`, `ops-purchase-order`, `ops-shipment`, `ops-market`, `ops-incident`, `ops-change-request`; tasks, related pages and terms as in Task 13's table (this task fills `dashboard` and leaves the other twelve with their `route` and empty lists).
  - `guideForRoute(matched: readonly { name?: string | symbol }[]): GuidePage | null`: the page whose `route` is the deepest matched name.
  - `visibleTasks(guide: PageGuide, can: (action: string, subject: string) => boolean): GuideTask[]`.
  - `dismissedKey(route: string): string` → `guide.dismissed.<route>`.
- Produces (`store/guide/index.ts`, pinia `useGuideStore`):
  - state `open: boolean`, `page: GuidePage | null`, `focusTask: string | null`;
  - `show(page: GuidePage, task?: string)`, `hide()`;
  - `autoOpen(page: GuidePage)`: when `localStorage` has no `dismissedKey(PAGE_GUIDES[page].route)`, it opens the page and writes the key `'1'` (open once per route, spec M20); storage that throws is ignored and an in-memory set keeps it to once per session (the `customerFilter` try/catch pattern).
- Produces (components):
  - `PageGuide.vue`: one PrimeVue `Drawer` (`position="right"`, `:modal="false"`, `:dismissable="false"`, `:block-scroll="false"`, header `guide.panel.title` + the page's route label) bound to the store. Sections: purpose (`guide.pages.<page>.purpose`); common tasks (`visibleTasks(guide, ability.can)` as an `Accordion` (not Tabs: several tasks stay readable side by side; `project/tabs/Overview.vue` already uses it) whose open value is `focusTask`; each item titled `guide.pages.<page>.tasks.<id>.title`, its steps as an ordered list of `…steps.1`…`steps.<n>`, then `guide.panel.needs` with `{ action: t('guide.actions.<action>'), subject: t('fields.<subject>') }`); an empty list shows `guide.panel.no_tasks`; related pages (route labels, each a `CustomLink` to the route); terms (for each glossary enum, each value's label via `GLOSSARY_LABELS` and its `glossary.<enum>.<value>` line). Mounted once in `layouts/dashboard/Index.vue`.
  - `PageGuideButton.vue`: an outlined icon `Button` (`PrimeIcons.QUESTION_CIRCLE`, `aria-label` and tooltip `guide.panel.open`) placed in the layout's page-header bar before `#page-toolbar`; shown when `guideForRoute($route.matched)` is not null; click `show(page)`. It watches the route (immediate) and calls `autoOpen(page)`.
  - `CountListCard.vue` gains the optional prop `guideTask?: string`: a text `Button` `guide.panel.close_card` under the list that calls `show('dashboard', guideTask)`. `dashboard/Index.vue` passes: gates boxes `close_gates`; task boxes `close_tasks`; unsigned SKUs `sign_spec`; compliance `complete_compliance`; PO boxes `advance_po`; shipment boxes `track_shipment`; incidents `close_incident`; change requests `decide_cr`; market `update_market`.
- Copy (EN / TR): `guide.panel.title` Page guide / Sayfa rehberi; `purpose` What this page is for / Bu sayfa ne için; `tasks` Common tasks / Sık yapılan işler; `related` Related pages / İlgili sayfalar; `terms` Terms on this page / Bu sayfanın terimleri; `needs` Needs: {action} on {subject} / Gerekir: {subject} için {action}; `no_tasks` Your role has no task on this page; you can read it. / Rolünüzün bu sayfada işi yok; okuyabilirsiniz.; `open` How does this page work? / Bu sayfa nasıl çalışır?; `close_card` How do I close this card? / Bu kartı nasıl kapatırım?; `guide.actions.{read,create,update,delete}` read, create, change, delete / okuma, ekleme, değiştirme, silme. The `guide.pages.dashboard.*` copy is in Task 13's table.

- [ ] **Step 1: Write the tests.**
  - `app/tests/store/guide.test.ts` (pinia, `localStorage` stubbed):
    - `it('opens a page once')`: `autoOpen('shipment')` sets `open === true`, `page === 'shipment'` and `localStorage.setItem('guide.dismissed.ops-shipment', '1')`; after `hide()`, a second `autoOpen('shipment')` leaves `open === false`.
    - `it('survives blocked storage')`: with `getItem`/`setItem` throwing, the first `autoOpen('shipment')` opens, the second (after `hide()`) does not.
    - `it('finds the page of a route')`: `guideForRoute([{ name: 'ops' }, { name: 'ops-shipment' }, { name: 'ops-shipment-list' }]) === 'shipment'`; `guideForRoute([{ name: 'account-profile' }]) === null`.
    - `it('filters the tasks by permission')`: `visibleTasks(PAGE_GUIDES.dashboard, (a, s) => a === 'update' && s === 'incident').map((t) => t.id)` equals `['close_incident']`.
  - `PageGuide.test.ts` (store on `dashboard`, ability with only `update incident`):
    - `it('shows only the tasks the role may do')`: the text contains `i18n.t('guide.pages.dashboard.tasks.close_incident.title')`, the three `…close_incident.steps.1`…`3` in that order, and `i18n.t('guide.panel.needs', { action: i18n.t('guide.actions.update'), subject: i18n.t('fields.incident') })`; it does not contain `…tasks.close_gates.title`.
    - `it('opens on the focused task')`: with `focusTask: 'close_incident'` the `Accordion` `value` is `'close_incident'`.
    - `it('does not block the page')`: the `Drawer` props have `modal === false` and `position === 'right'`.
  - `CountListCard.test.ts`: `it('links a box to its guide')`: with `guideTask: 'close_gates'`, clicking the button with text `i18n.t('guide.panel.close_card')` calls the store's `show` with `('dashboard', 'close_gates')`; `it('has no guide link without a task')`: no such button.
  - `app/tests/plugins/i18n/guide.test.ts`: `it.each(['en', 'tr'])('%s has the copy of every guide')`: for every page, `guide.pages.<page>.purpose` is a non-empty string; for every declared task, `title` and `steps.1`…`steps.<steps>` are non-empty strings and `steps.<steps + 1>` is undefined. `it('links only to labelled routes')`: every `related` name is a route (from `@/router/routes/ops`, plus `dashboard`) with a `meta.label`.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/store/guide.test.ts tests/components/PageGuide.test.ts tests/components/CountListCard.test.ts tests/plugins/i18n/guide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the registry (the dashboard entry complete, the other twelve with `route` only), store, components, layout and dashboard wiring; the copy: the panel keys, the dashboard entry and the thirteen `purpose` lines, all from Task 13's table (the i18n test iterates the tasks each page declares, so the empty lists pass); sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check: the first visit to the dashboard opens the panel once; a reload does not; "?" reopens it; the page stays clickable with the panel open; "How do I close this card?" on the incidents box opens the panel on "Close an open incident".
- [ ] **Step 5: Commit.** `git add app/src/constants/guide.ts app/src/store/guide app/src/components/service-components/page-guide app/src/components/service-components/dashboard app/src/layouts/dashboard/Index.vue app/src/views/pages/dashboard/Index.vue app/src/plugins/i18n/locales app/tests`; message `feat(guide): role-aware page guide side panel, opened once per page and from each dashboard box`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 13: Page guide content for every operations page

**Files:**
- Modify: `app/src/constants/guide.ts` (the twelve non-dashboard entries), i18n `guide.pages.*`; sync. Tests: `app/tests/plugins/i18n/guide.test.ts` (already generic) gains one case.

**Interfaces:**
- Consumes: Task 12's registry types; route names of `ops.ts`; `GlossaryEnum`.
- Produces: every `PAGE_GUIDES` entry complete as below. Every task has three steps (`steps: 3`). The developer drafted this copy from `ABOUT MOESA` (06 §1–§2, S05, S08, S12, S14–S17, Y10) and the screens; the spec makes the TR text the owner's to review, so the whole TR column goes to the owner in the final summary. EN is the developer's.

The copy is exact (`guide.pages.<page>.purpose`, `…tasks.<id>.title`, `…tasks.<id>.steps.<n>`):

**dashboard** — route `dashboard`; related `ops-project`, `ops-purchase-order`, `ops-shipment`, `ops-incident`, `ops-market`; terms `gate_code`, `incident_severity`.
- purpose: The single screen of the Monday, Wednesday and Friday meetings. Each box counts what is waiting and lists the first records; a row opens its record. Nothing is entered here. / Pazartesi, Çarşamba ve Cuma toplantılarının tek ekranı. Her kutu bekleyen işleri sayar ve ilk kayıtları listeler; satır kaydı açar. Burada veri girilmez.
- close_gates (update `project_gate`): Close a waiting gate / Bekleyen kapıyı kapat — 1. Open the project from the row; its Overview shows the gate panel. / Satırdan projeyi açın; Genel bakış sekmesinde kapı paneli görünür. 2. Add the evidence the gate asks for; (M) gates also need the customer's approval date and document. / Kapının istediği kanıtı ekleyin; (M) kapılar müşteri onay tarihi ve belgesi de ister. 3. Pass the gate; the project moves on and the row leaves the box. / Kapıyı geçirin; proje ilerler ve satır kutudan çıkar.
- close_tasks (update `project_task`): Clear a late or due task / Geciken ya da yaklaşan görevi kapat — 1. Open the project from the row; the Tasks tab opens. / Satırdan projeyi açın; Görevler sekmesi açılır. 2. Mark the task done, or give it a new due date with a note. / Görevi tamamlandı yapın ya da notla yeni termin verin. 3. A blocking task holds its gate until it is done. / Kapıyı bloke eden görev tamamlanana kadar kapı geçmez.
- sign_spec (create `document`): Get a SKU's spec sheet signed / SKU'nun spec sheet'ini imzalat — 1. Open the customer's row; the product list shows the SKUs without a signed spec sheet. / Müşteri satırını açın; ürün listesi imzalı spec sheet'i olmayan SKU'ları gösterir. 2. On the product's Documents tab, add the spec sheet with its version and date. / Ürünün Belgeler sekmesinde spec sheet'i sürümü ve tarihiyle ekleyin. 3. Mark it signed once it is signed, stamped and came from the official e-mail. / İmzalı, kaşeli ve resmî e-postadan geldiyse imzalı yapın.
- complete_compliance (update `product`): Complete a SKU's compliance / SKU'nun uyumunu tamamla — 1. Open the customer's row; the product list opens. / Müşteri satırını açın; ürün listesi açılır. 2. On the product's General tab, fill the Compliance section and add the documents S12 asks for. / Ürünün Genel sekmesinde Uyum bölümünü doldurun ve S12'nin istediği belgeleri ekleyin. 3. Set the compliance status to complete; the SKU leaves the box. / Uyum durumunu tamamlandı yapın; SKU kutudan çıkar.
- advance_po (update `purchase_order`): Move a purchase order forward / Satın alma siparişini ilerlet — 1. Open the order from the row; its status shows what it waits for. / Satırdan siparişi açın; durumu neyi beklediğini gösterir. 2. Do the step: send it, check the PI (S09), record the payment or the production note. / Adımı yapın: gönderin, PI'ı kontrol edin (S09), ödemeyi ya da üretim notunu kaydedin. 3. Use the status button; a step whose conditions are missing is refused with the reason. / Durum düğmesini kullanın; koşulu eksik adım nedeniyle birlikte reddedilir.
- track_shipment (update `shipment`): Follow a shipment to acceptance / Sevkiyatı kabule kadar izle — 1. Open the shipment from the row; check ETD and ETA on Dates. / Satırdan sevkiyatı açın; Tarihler sekmesinde ETD ve ETA'yı kontrol edin. 2. Log each S15 step on Events; update the ETA when it slips. / Her S15 adımını Olaylar sekmesine yazın; ETA kayınca güncelleyin. 3. A late shipment usually needs an OL-09 incident; open it on the Incidents page. / Geciken sevkiyat genelde OL-09 olayı gerektirir; Olaylar sayfasından açın.
- close_incident (update `incident`): Close an open incident / Açık olayı kapat — 1. Open the incident; S1 and S2 need the management notice time first. / Olayı açın; S1 ve S2'de önce yönetime bildirim zamanı girilir. 2. Keep the log and the deadlines current until the goods, listing or money are safe. / Mal, listing ya da para güvene alınana kadar günlüğü ve süreleri güncel tutun. 3. Fill the closure (outcome, root cause, preventive action) and close; management closes S1. / Kapanışı doldurun (sonuç, kök neden, önlem) ve kapatın; S1'i yönetim kapatır.
- decide_cr (update `change_request`): Decide an open change request / Açık değişiklik talebine karar ver — 1. Open the request; check the old and new values and the impact. / Talebi açın; eski ve yeni değeri ve etkiyi kontrol edin. 2. If it touches a passed (M) gate, add the customer's written approval first. / Geçmiş bir (M) kapıyı etkiliyorsa önce müşterinin yazılı onayını ekleyin. 3. Approve or reject; once the new document version exists, mark it applied. / Onaylayın ya da reddedin; yeni belge sürümü oluşunca uygulandı yapın.
- update_market (update `market_cell`): Move market cells to live / Pazar hücrelerini yayına taşı — 1. Open the customer's row; the market matrix opens for that customer. / Müşteri satırını açın; pazar matrisi o müşteri için açılır. 2. Open a cell and fill what live needs: platform ID, platform SKU, price, currency, stock source. / Hücreyi açın ve yayının istediklerini doldurun: platform kimliği, platform SKU, fiyat, para birimi, stok kaynağı. 3. With the content approved (L-G1), move the cell to live. / İçerik onaylıyken (L-G1) hücreyi yayına alın.

**setting** — route `ops-setting`; related `dashboard`, `ops-purchase-order`, `ops-incident`; terms none.
- purpose: The company numbers the rules read: the default deposit, the spec sheet date, the document request time and the incident notice hours. Only management changes them; every change is logged. / Kuralların okuduğu şirket sayıları: varsayılan depozito, spec sheet tarihi, belge talebi süresi ve olay bildirim saatleri. Yalnızca yönetim değiştirir; her değişiklik kayda geçer.
- change_setting (update `setting`): Change a setting / Bir ayarı değiştir — 1. Find the setting; the row says what it is for. / Ayarı bulun; satır ne işe yaradığını söyler. 2. Enter the new value in the format shown. / Yeni değeri gösterilen biçimde girin. 3. Save; the rules use it from the next write on. / Kaydedin; kurallar bir sonraki kayıttan itibaren kullanır.
- read_setting (read `setting`): Check why a rule fired / Bir kuralın neden çalıştığını kontrol et — 1. Read the setting the message names, e.g. the spec sheet date. / Mesajın andığı ayarı okuyun, ör. spec sheet tarihi. 2. Compare it with the record's date or amount. / Kaydın tarihi ya da tutarıyla karşılaştırın. 3. Ask management if the value itself should change. / Değerin kendisi değişmeliyse yönetime sorun.

**customer** — route `ops-customer`; related `ops-project`, `ops-product`, `ops-market`; terms `customer_status`, `package`.
- purpose: Every customer of MOESA with its contract terms, warehouses, marketplace accounts and brands. Choosing a customer in the top filter narrows every operations list to it. / MOESA'nın her müşterisi; sözleşme şartları, depoları, pazar yeri hesapları ve markalarıyla. Üstteki filtreden müşteri seçmek tüm operasyon listelerini o müşteriye daraltır.
- add_customer (create `customer`): Add a customer / Müşteri ekle — 1. Use Add in the menu; the three-letter code goes into every code of the customer. / Menüden Ekle'yi kullanın; üç harfli kod müşterinin tüm kodlarına girer. 2. Fill the commercial model, the packages and the status (C1–C4). / Ticari modeli, paketleri ve durumu doldurun (C1–C4). 3. Save; the other tabs open. / Kaydedin; diğer sekmeler açılır.
- add_warehouse (create `customer_warehouse`): Add a delivery warehouse / Teslim deposu ekle — 1. Open the customer, then Warehouses. / Müşteriyi, sonra Depolar sekmesini açın. 2. Enter the address, dock hours and appointment rule as on the S14 card. / Adresi, rampa saatlerini ve randevu kuralını S14 kartındaki gibi girin. 3. Shipments take the address from here; it is never typed on a shipment. / Sevkiyatlar adresi buradan alır; sevkiyatta elle yazılmaz.
- add_platform (create `customer_platform_account`): Record a marketplace account / Pazar yeri hesabı kaydet — 1. Open the customer, then Platforms. / Müşteriyi, sonra Platformlar sekmesini açın. 2. Pick the platform and the countries the customer sells in. / Platformu ve müşterinin sattığı ülkeleri seçin. 3. Note our access; account IDs and passwords are never stored (K8). / Erişimimizi not edin; hesap kimliği ve şifre saklanmaz (K8).

**supplier** — route `ops-supplier`; related `ops-purchase-order`, `ops-product`; terms `supplier_status`.
- purpose: The suppliers MOESA buys from, with their terms (Incoterm, deposit, damage notice) and contacts. Purchase orders take their defaults from here. / MOESA'nın satın aldığı tedarikçiler; şartları (Incoterm, depozito, hasar bildirimi) ve kişileriyle. Satın alma siparişleri varsayılanlarını buradan alır.
- add_supplier (create `supplier`): Add a supplier / Tedarikçi ekle — 1. Use Add in the menu; enter the code and the country. / Menüden Ekle'yi kullanın; kodu ve ülkeyi girin. 2. Fill the terms: default Incoterm, deposit %, damage notice hours. / Şartları doldurun: varsayılan Incoterm, depozito %, hasar bildirim saati. 3. Set the status to approved once the supplier has passed the evaluation. / Tedarikçi değerlendirmeyi geçince durumu onaylı yapın.
- add_contact (create `supplier_contact`): Add a contact / Kişi ekle — 1. Open the supplier, then Contacts. / Tedarikçiyi, sonra Kişiler sekmesini açın. 2. Enter the role and the official e-mail. / Rolü ve resmî e-postayı girin. 3. A spec sheet counts as official only when it comes from that e-mail. / Spec sheet yalnızca o e-postadan gelirse resmî sayılır.
- see_orders (read `purchase_order`): See a supplier's orders / Tedarikçinin siparişlerini gör — 1. Open the supplier. / Tedarikçiyi açın. 2. Open the Purchase orders tab. / Satın alma siparişleri sekmesini açın. 3. A row opens the order card. / Satır sipariş kartını açar.

**product** — route `ops-product`; related `ops-document`, `ops-media`, `ops-market`; terms `product_status`, `document_status`.
- purpose: The product master (S10): one row per SKU with its GTIN, supplier, status, compliance and spec sheet. The list shows at a glance which SKUs lack a signed spec sheet. / Ürün ana tablosu (S10): her SKU için bir satır; GTIN, tedarikçi, durum, uyum ve spec sheet ile. Liste hangi SKU'nun imzalı spec sheet'i olmadığını bir bakışta gösterir.
- import_products (create `product`): Import products from a CSV / CSV'den ürün içe aktar — 1. Use Import on the list and choose the S10 CSV. / Listede İçe aktar'ı kullanın ve S10 CSV'sini seçin. 2. Read the report: every row with a problem is listed with its reason. / Raporu okuyun: sorunlu her satır nedeniyle listelenir. 3. Fix those rows and import again; a GTIN used twice is refused. / O satırları düzeltip yeniden aktarın; iki kez kullanılan GTIN reddedilir.
- add_spec (create `document`): Add a spec sheet / Spec sheet ekle — 1. Open the product, then Documents. / Ürünü, sonra Belgeler sekmesini açın. 2. Add the spec sheet with its version and date; a new version supersedes the old one. / Spec sheet'i sürümü ve tarihiyle ekleyin; yeni sürüm eskisinin yerini alır. 3. Mark it signed once it is signed, stamped and from the official e-mail. / İmzalı, kaşeli ve resmî e-postadan geldiyse imzalı yapın.
- add_media (create `media`): Add photos / Fotoğraf ekle — 1. Open the product, then Media. / Ürünü, sonra Ortam sekmesini açın. 2. Drop the files; the first image becomes the primary image. / Dosyaları bırakın; ilk görsel birincil görsel olur. 3. Change a file's role from its menu. / Dosyanın rolünü menüsünden değiştirin.

**project** — route `ops-project`; related `ops-incident`, `ops-purchase-order`, `ops-change-request`; terms `project_type`, `project_path`, `package`, `gate_code`, `task_status`.
- purpose: Projects take a product from brief to delivery and listing. Each gets its gate set from its type, path and packages; a gate passes only with its evidence, and only G2 and G3 block. / Projeler bir ürünü brief'ten teslime ve listing'e taşır. Her birinin kapı seti tipine, yoluna ve paketlerine göre gelir; kapı yalnızca kanıtıyla geçer ve yalnız G2 ile G3 engeller.
- open_project (create `project`): Open a project / Proje aç — 1. Use Add in the menu; pick the customer, type, path and packages. / Menüden Ekle'yi kullanın; müşteriyi, tipi, yolu ve paketleri seçin. 2. Save; the code and the gate set are created. / Kaydedin; kod ve kapı seti oluşur. 3. Add the products on the Products tab. / Ürünleri Ürünler sekmesinde ekleyin.
- pass_gate (update `project_gate`): Pass a gate / Kapıyı geçir — 1. On Overview, open the gate in the phase strip. / Genel bakışta aşama şeridindeki kapıyı açın. 2. Attach the evidence; (M) gates need the customer's approval date and document. / Kanıtı ekleyin; (M) kapılar müşteri onay tarihi ve belgesi ister. 3. Pass it; the phase moves on and the next checklist appears. / Geçirin; aşama ilerler ve sonraki kontrol listesi gelir.
- rollback_gate (update `project_gate`): Roll a gate back / Kapıyı geri al — 1. Open the incident that forces it first, from the project's Incidents tab. / Önce bunu gerektiren olayı projenin Olaylar sekmesinden açın. 2. In the gate panel choose Roll back, pick the incident and write the reason. / Kapı panelinde Geri al'ı seçin, olayı seçin ve sebebi yazın. 3. Later passed gates roll back too; pass them again once the issue is solved. / Sonraki geçmiş kapılar da geri alınır; sorun çözülünce yeniden geçirin.

**document** — route `ops-document`; related `ops-product`, `ops-media`, `ops-change-request`; terms `document_type`, `document_status`.
- purpose: Every document of every record in one list: type, version, status and its link or file. "Is the spec sheet signed?" is answered here, without opening files. / Her kaydın her belgesi tek listede: tür, sürüm, durum ve bağlantı ya da dosya. "Spec sheet imzalı mı?" sorusu dosya açmadan burada cevaplanır.
- find_document (read `document`): Find a document / Belge bul — 1. Filter by type, status or the linked record. / Tür, durum ya da bağlı kayda göre süzün. 2. Open the row to see its file or link. / Dosyasını ya da bağlantısını görmek için satırı açın. 3. Older versions stay as superseded; nothing is deleted. / Eski sürümler geçersiz olarak kalır; hiçbir şey silinmez.
- new_version (create `document`): Add a new version / Yeni sürüm ekle — 1. Add it from the record's Documents tab. / Kaydın Belgeler sekmesinden ekleyin. 2. Upload the file or paste the Drive link. / Dosyayı yükleyin ya da Drive bağlantısını yapıştırın. 3. The previous version becomes superseded by itself. / Önceki sürüm kendiliğinden geçersiz olur.
- set_status (update `document`): Mark a document signed or approved / Belgeyi imzalı ya da onaylı yap — 1. Open the document. / Belgeyi açın. 2. For signed, tick signature, stamp and official e-mail and set the date. / İmzalı için imza, kaşe ve resmî e-postayı işaretleyip tarihi girin. 3. Save; gates and orders read the new status at once. / Kaydedin; kapılar ve siparişler yeni durumu hemen okur.

**media** — route `ops-media`; related `ops-document`, `ops-product`; terms none.
- purpose: The library of photos, images, PDFs and videos. A file is stored once and linked to any record; a document can point to a file instead of a Drive link. / Fotoğraf, görsel, PDF ve video kütüphanesi. Dosya bir kez saklanır ve her kayda bağlanır; belge Drive bağlantısı yerine dosyayı gösterebilir.
- upload (create `media`): Upload files / Dosya yükle — 1. Open the record's Media tab. / Kaydın Ortam sekmesini açın. 2. Drop PNG, JPG, WebP, PDF or MP4 files within the size limit. / Boyut sınırı içinde PNG, JPG, WebP, PDF ya da MP4 dosyası bırakın. 3. Add a title and tags in the library. / Kütüphanede başlık ve etiket ekleyin.
- link (create `media_link`): Use a file on another record / Dosyayı başka kayıtta kullan — 1. Open that record's Media tab. / O kaydın Ortam sekmesini açın. 2. Choose Pick from the library. / Kütüphaneden seç'i kullanın. 3. A customer's file links only to that customer's records. / Müşteriye ait dosya yalnız o müşterinin kayıtlarına bağlanır.
- delete_media (delete `media`): Delete a file / Dosya sil — 1. Unlink it from every record first. / Önce her kayıttan bağlantısını kaldırın. 2. Open it in the library and delete it. / Kütüphanede açıp silin. 3. Only management deletes files. / Dosyaları yalnızca yönetim siler.

**purchase_order** — route `ops-purchase-order`; related `ops-shipment`, `ops-supplier`, `ops-project`; terms `purchase_order_status`, `payment_kind`.
- purpose: Purchase orders to suppliers, from draft to closed: lines with their spec sheet versions, the S09 PI check, payments and production. Lines and terms lock once the PI is approved. / Tedarikçiye satın alma siparişleri, taslaktan kapanışa: spec sheet sürümlü satırlar, S09 PI kontrolü, ödemeler ve üretim. PI onaylanınca satırlar ve şartlar kilitlenir.
- create_po (create `purchase_order`): Open a purchase order / Sipariş aç — 1. Use Add (or New purchase order on a project); pick the customer and the supplier. / Ekle'yi (ya da projede Yeni sipariş'i) kullanın; müşteriyi ve tedarikçiyi seçin. 2. Check the Incoterm and deposit taken from the supplier, and save. / Tedarikçiden gelen Incoterm ve depozitoyu kontrol edip kaydedin. 3. Add the lines, each with a signed or approved spec sheet, then Send. / Satırları her biri imzalı ya da onaylı spec sheet'le ekleyin, sonra Gönder.
- check_pi (update `purchase_order`): Check the PI (S09) / PI'ı kontrol et (S09) — 1. Add the PI document and enter its figures on the PI check tab. / PI belgesini ekleyin ve rakamlarını PI kontrol sekmesine girin. 2. Mark the 30 items; a red difference means asking for a corrected PI. / 30 maddeyi işaretleyin; kırmızı fark düzeltilmiş PI istemek demektir. 3. Approve the PI; the lines and terms lock. / PI'ı onaylayın; satırlar ve şartlar kilitlenir.
- record_payment (create `purchase_order_payment`): Record a payment / Ödeme kaydet — 1. Open Payments and plan the deposit and the balance from the PI. / Ödemeler sekmesini açın; depozitoyu ve bakiyeyi PI'dan planlayın. 2. Enter the paid date when the money leaves. / Para çıkınca ödeme tarihini girin. 3. Pay the balance only after an approved PSI report (G4). / Bakiyeyi yalnızca onaylı PSI raporundan sonra ödeyin (G4).

**shipment** — route `ops-shipment`; related `ops-purchase-order`, `ops-incident`, `ops-customer`; terms `shipment_status`, `shipment_mode`.
- purpose: Shipments of a customer's orders to one of its warehouses, from planned to accepted: dates, the S15 event chain, the S16 acceptance and the document checklist. / Müşterinin siparişlerinin depolarından birine sevkiyatı, planlanandan kabule: tarihler, S15 olay zinciri, S16 teslim kabulü ve belge kontrol listesi.
- plan_shipment (create `shipment`): Plan a shipment / Sevkiyat planla — 1. Use Add; pick the customer, the warehouse and the mode. / Ekle'yi kullanın; müşteriyi, depoyu ve modu seçin. 2. On Orders, link the orders and the quantities of their lines. / Siparişler sekmesinde siparişleri ve satır adetlerini bağlayın. 3. Move it to booked with the booking confirmation date. / Booking teyit tarihiyle booked durumuna alın.
- log_event (create `shipment_event`): Log an S15 step / S15 adımı yaz — 1. Open Events and add an event. / Olaylar sekmesini açıp olay ekleyin. 2. Pick the S15 step, who told whom and the channel. / S15 adımını, kimin kime ve hangi kanaldan bildirdiğini seçin. 3. Keep the dates on Dates in line with the events. / Tarihler sekmesindeki tarihleri olaylarla uyumlu tutun.
- accept (update `shipment`): Accept the delivery (S16) / Teslimi kabul et (S16) — 1. Add the signed delivery receipt on Documents. / İmzalı teslim tutanağını Belgeler sekmesine ekleyin. 2. On Acceptance, record whether the quantities match and any damage. / Kabul sekmesinde adetlerin tutup tutmadığını ve hasarı kaydedin. 3. Accept; a shortage or damage makes it disputed, and an incident follows. / Kabul edin; eksik ya da hasar varsa itirazlı olur ve olay açılır.

**market_matrix** — route `ops-market`; related `ops-product`, `ops-customer`, `ops-incident`; terms `market_cell_status`, `market_compliance`, `content_status`, `stock_source`.
- purpose: Where each product is sold: one cell per product, platform and country, with its status, compliance, content and listing data (S05). The cells are the single source; the matrix view is derived from them. / Her ürünün nerede satıldığı: ürün, platform ve ülke başına bir hücre; durumu, uyumu, içeriği ve listing verisiyle (S05). Hücreler tek kaynaktır; matris görünümü onlardan türetilir.
- add_cells (create `market_cell`): Open cells for a product family / Ürün ailesi için hücre aç — 1. Choose Add cells; pick the customer's products, a platform and its countries. / Hücre ekle'yi seçin; müşterinin ürünlerini, bir platformu ve ülkelerini seçin. 2. Set the priority: 1 same account new country, 2 new platform, 3 new region. / Önceliği girin: 1 aynı hesapta yeni ülke, 2 yeni platform, 3 yeni bölge. 3. Save; existing cells are skipped and new ones start as candidates. / Kaydedin; var olan hücreler atlanır, yeniler aday olarak başlar.
- screen_compliance (update `market_cell`): Screen compliance / Uyum taraması yap — 1. Open a cell from the matrix. / Matristen bir hücre açın. 2. Set green, yellow or red; yellow and red need a note (S12). / Yeşil, sarı ya da kırmızı seçin; sarı ve kırmızı not ister (S12). 3. A red cell is not planned; remove it with the reason. / Kırmızı hücre planlanmaz; nedeniyle çıkarın.
- go_live (update `market_cell`): Take a cell live / Hücreyi yayına al — 1. Move it through planned, preparing and uploaded as the work goes. / İş ilerledikçe planlandı, hazırlanıyor ve yüklendi durumlarından geçirin. 2. Fill the platform ID, platform SKU, price, currency and stock source. / Platform kimliği, platform SKU, fiyat, para birimi ve stok kaynağını doldurun. 3. With the content approved (L-G1), choose Live. / İçerik onaylıyken (L-G1) Yayında'yı seçin.

**incident** — route `ops-incident`; related `ops-shipment`, `ops-project`, `ops-change-request`; terms `incident_severity`, `incident_status`, `incident_family`, `incident_deadline_kind`.
- purpose: Incident records (S17): what happened, where, how serious, who owns it, the log of every contact and cost, the deadlines that must not slip, and the closure with its lesson. A gate is rolled back only through an incident. / Olay kayıtları (S17): ne oldu, nerede, ne kadar ciddi, sahibi kim; her temasın ve maliyetin günlüğü, kaçırılmayacak süre sınırları ve dersiyle kapanış. Kapı yalnızca olay üzerinden geri alınır.
- open_incident (create `incident`): Record an incident in 15 minutes / Olayı 15 dakikada kaydet — 1. Use Add; pick the customer, the family and the severity (Y10 §4). / Ekle'yi kullanın; müşteriyi, aileyi ve şiddeti seçin (Y10 §4). 2. Write what happened in three sentences, where things are now and what was done at once; write "unknown" rather than guess. / Ne olduğunu üç cümleyle, şu an durumun ne olduğunu ve hemen ne yapıldığını yazın; tahmin yerine "bilinmiyor" yazın. 3. Link the record (shipment, order, product, cell or project) and add the first evidence on Media. / Kaydı bağlayın (sevkiyat, sipariş, ürün, hücre ya da proje) ve ilk kanıtı Ortam'a ekleyin.
- keep_log (create `incident_log`): Keep the log and the deadlines / Günlüğü ve süreleri tut — 1. Add one log line per fact, call or decision, with its cost and who pays. / Her olgu, görüşme ya da karar için bir günlük satırı ekleyin; maliyetini ve kimin ödeyeceğini yazın. 2. Add the deadlines that apply; 48-hour, 7-day and document-request dates are calculated. / Geçerli süre sınırlarını ekleyin; 48 saat, 7 gün ve belge talebi tarihleri hesaplanır. 3. Enter when management and the customer were told. / Yönetime ve müşteriye ne zaman bildirildiğini girin.
- close (update `incident`): Close it / Kapat — 1. Fill the outcome, the root cause and the preventive action written into the guideline. / Sonucu, kök nedeni ve yönergeye işlenen önlemi doldurun. 2. Move it to closed; management closes S1 incidents. / Kapandı durumuna alın; S1 olaylarını yönetim kapatır. 3. A closed incident's log and deadlines no longer change. / Kapanan olayın günlüğü ve süreleri artık değişmez.

**change_request** — route `ops-change-request`; related `ops-project`, `ops-document`, `ops-incident`; terms `change_request_status`, `change_request_source`, `change_kind`.
- purpose: Change requests (S08): nothing approved changes without one. Each records the old and new value, why, the impact, the approvals and the new document version it produced. / Değişiklik talepleri (S08): onaylanmış hiçbir şey talep olmadan değişmez. Her talep eski ve yeni değeri, nedenini, etkisini, onayları ve ürettiği yeni belge sürümünü tutar.
- open_cr (create `change_request`): Open a change request / Değişiklik talebi aç — 1. Use Add; pick the customer, the project and the products affected. / Ekle'yi kullanın; müşteriyi, projeyi ve etkilenen ürünleri seçin. 2. Write the old and new values word for word, the reason and the affected gate. / Eski ve yeni değeri birebir, nedeni ve etkilenen kapıyı yazın. 3. Choose the kinds of change and the urgency; the decision date follows. / Değişiklik türlerini ve aciliyeti seçin; karar tarihi buna göre gelir.
- approve_cr (update `change_request`): Approve or reject / Onayla ya da reddet — 1. Fill the impact: cost and who pays, delay, quality and listing. / Etkiyi doldurun: maliyet ve ödeyen, gecikme, kalite ve listing. 2. For a passed (M) gate, add the customer's written approval as a document of the request. / Geçmiş (M) kapı için müşterinin yazılı onayını talebin belgesi olarak ekleyin. 3. Approve, or reject with the decision note. / Onaylayın ya da karar notuyla reddedin.
- apply_cr (update `change_request`): Mark it applied / Uygulandı yap — 1. Add the new version of the affected document on its record. / Etkilenen belgenin yeni sürümünü kendi kaydına ekleyin. 2. Pick that version as the new version on Decision. / Karar sekmesinde o sürümü yeni sürüm olarak seçin. 3. Mark it applied; the request closes. / Uygulandı yapın; talep kapanır.

- [ ] **Step 1: Add the test cases** to `app/tests/plugins/i18n/guide.test.ts`: `it('gives every page at least two tasks')`: `GUIDE_PAGES.filter((p) => PAGE_GUIDES[p].tasks.length < 2)` equals `[]`. `it('labels every needed permission')`: every task's `permission.subject` is a key of `fields` in `en` (missing list `[]`). `it('gives the settings page one task per role')`: `visibleTasks(PAGE_GUIDES.setting, (a) => a === 'read').map((t) => t.id)` equals `['read_setting']`.
- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/plugins/i18n/guide.test.ts`. Expected: FAIL (the twelve pages have no tasks yet).
- [ ] **Step 3: Fill** the registry and the JSON from the table; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Hand check as `koordinator@` and `akif@` on the settings page: the coordinator sees only "Check why a rule fired"; management also sees "Change a setting".
- [ ] **Step 5: Commit.** `git add app/src/constants/guide.ts app/src/plugins/i18n/locales app/tests/plugins/i18n/guide.test.ts`; message `feat(guide): purpose, role-aware tasks, related pages and terms for every operations page`, then a blank line and the Co-Authored-By trailer your session provides.

---

### Task 14: Full verification and the Phase 2 acceptance walk

**Files:**
- None, unless a defect is found; it is fixed in the owning task's files.

- [ ] **Step 1: Run the whole suite.** Run (in `app/`): `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: every step PASSes and `git status` shows no regenerated-type drift.
- [ ] **Step 2: Walk the acceptance scenario** (`pnpm dev:vue`, `koordinator@moesa-panel.test`; spec §9 Phase 2, criteria 3–4):
  1. With THO selected, open the market matrix; "Add cells" for THO-MOP40-2P, THO-TIPS-6-50 and THO-CONES-100 on Amazon DE, FR and IT, priority 1: nine candidates appear. A second run adds none.
  2. Screen compliance: MOP40 on Amazon FR yellow with a note. CONES on Amazon IT: red with a note (allowed while `candidate`); "Planned" is then refused with `market_cell_compliance_red` (the move `candidate → planned` is legal, so the red rule is what answers). Mark it "Removed" with the reason in the note; later "Candidate" again (`removed → candidate`) and "Planned" is refused the same way until compliance is no longer red.
  3. Take MOP40 / Amazon DE through planned, preparing and uploaded. "Live" warns about the missing fields and is refused; after filling the ASIN, platform SKU, 12.99 EUR, platform stock and approved content it goes live, dated today. The product's evidence shows one live cell.
  4. The matrix shows the colours and the counter "THO: 1 live / 1 target" (candidates are not targets); the list view filters by status. The dashboard's market box shows THO with "1 live · 0 preparing · 0 suppressed" and opens the matrix for THO.
  5. Record the first incident (S17): OL, S1, "Two pallets short at Rosbach", linked to the pilot project, affected parties customer and forwarder. It gets `OL-THO-<year>-001`; the customer notice is due four hours after opening; the dashboard lists it first with "management not told".
  6. "Contained" is refused until "Management told" is filled. Add two log lines (one with a 150 EUR cost charged to the customer: the Tag asks for the customer's approval) and a supplier-damage deadline (48 h calculated) and a document-request deadline (five business days, end of day).
  7. On the pilot, pass G1 (approval document, tasks done), then roll it back: the dialog requires an incident; pick `OL-THO-…-001`. The incident's General tab lists G1.
  8. Fill the closure and try to close: the coordinator is refused (`incident_close_management`). As `akif@`, close it; its log no longer accepts lines.
  9. Open a change request on the pilot for MOP40, kind spec, affected gate G1 (passed again first), affected document the spec sheet v02. "Approved" is refused until the customer's approval date and an approved approval document of the request are added. "Applied" is refused until spec sheet v03 is added and picked; then it closes. The dashboard's CR box lists it until applied.
- [ ] **Step 3: Walk the guides and the Review Focus.**
  - First visit to each of the thirteen pages opens its guide once; the page stays usable with the panel open; "?" reopens it. As `koordinator@` the settings guide shows one task, as `akif@` two. In a private window (storage blocked) the panel opens once per session without errors.
  - Each new dashboard box's "How do I close this card?" opens the dashboard guide on its task.
  - Typing `/ops/incidents/<id>/manage/log?showDialog=center` opens the whole incident card on Log.
  - From the browser console, `PATCH /market_cell?id=eq.<live cell>` with `{"platform_product_id":null}` returns `market_cell_live_incomplete`; `rpc/rollback_gate` without `incident_id` returns `gate_rollback_incident_required`.
- [ ] **Step 4: Push and check CI.** Expected: `app`, `functions` and `database` are green. Commit only if Steps 2–3 needed fixes, with the files of the owning task and a `fix(<scope>): …` subject naming what the walk found, then a blank line and the Co-Authored-By trailer your session provides.

---

## Self-review notes

- **Spec coverage**
  - **M9**: the record with every listed field (T2), "ürün + platform + ülke benzersiz" (`unique_market_cell`), "live için platform kimliği ve içerik approved" plus S05's price, currency, stock source and platform SKU (T2 rule 6); pivot + flat list + cell dialog and the per-customer live/target counter (T4, `MarketMatrixGrid` as §8 names it); `product_evidence.live_cell_count` filled (T2).
  - **M10 incident**: code (family + number), customer, linked record (polymorphic), severity, owner, affected parties, opening, management notice, customer notice target/actual, deadlines list, rolled-back gate (`project_gate.rolled_back_incident_id`), status, root cause, measure, closing date (T5); `incident_log` with cost, payer and customer approval (T5); "S1/S2 olayda yönetime bildirim zamanı zorunlu" (rule 6), "Kapı geri alma yalnızca olay üzerinden" (036). Screens in T8, the project card's incidents tab (M5) in T8.
  - **M10 CR**: code `CR-…`, customer, project and products, source, urgency, kinds, reason, impact, approvals (MOESA role and date, customer date and document), the new document version, statuses; "CR applied olunca ilgili belge yeni sürüm alır" (T6 rule 8). Screens in T9.
  - **M6 Phase 2**: open incidents S1/S2 first, open CRs, the market summary live/preparing/suppressed (T10).
  - **M20 layer 2**: "?" on every operations page header (layout-level, T12), right-side non-modal panel, purpose, role-filtered tasks with their permission, related pages, glossary terms from layer 1, first-visit auto-open per route (`guide.dismissed.<route>`), dashboard boxes linked to "how do I close this card" (T12), plain-text EN/TR copy for all pages (T13).
  - **§9**: T14 Step 2 items 1–4 ("pazar matrisi dolu") and 5–8 ("ilk olay S17 ile").
  - **Deferred item**: the cross-card tab route (T1).
- **Rulings (spec gaps)**
  - **M9**: platforms are the existing `public.platform` table, not a new enum (it already holds the S05 list with countries); a cell's country must be one of its platform's (GB, not UK). The status list is S05's nine (the spec's six plus `candidate`, `uploaded`, `removed`), with S05's transitions plus `candidate/planned → paused`; red compliance blocks `planned` and later (S05 Kontrol); suppressed needs the open issue, closed/removed a note; only a candidate is deleted. No CSV import or export: M9 does not ask for one (S05's CSV header is a Phase 3 candidate with M17).
  - **Incidents**: the code is `<FAMILY>-<CUSTOMER>-<YEAR>-<NNN>` (K5 "aile + sıra"; S17's `OLAY-yyyy-nnn` is the folder name); the family is fixed with the code, the Y10 card (`incident_type`) may come later and must match the family. The management notice is required to leave `open`, not to save. S2's "aynı iş günü" is 23:59:59 UTC of that business day. Deadline defaults: 48 h supplier damage, 7 days carrier (CMR road), 48 h platform escalation, `document_request_days` business days for a document request (the "5 iş günü" rule, K6). S1 closure needs the right to update the company (management's mark in the Phase 1 roles, the 027 precedent), since S17 says "S1'de Yönetim". A closed incident is final and its log and deadlines lock.
  - **Gates**: the rollback needs an open (not closed) incident of the project's customer; the RPC keeps its name with a third, defaulted argument, so a two-argument call reaches the new rule instead of failing on the signature.
  - **Change requests**: kinds add S08's supplier and content to the spec's five; the customer's approval is required only when the affected gate of the project is passed and an (M) gate (S08 §4); the decision date is five business days, or the next day when urgent; one affected document per request (the others as text), and "applied" needs a newer version of that same document when one is named.
  - **Guides**: the panel opens by itself once per route and the "?" always reopens it; there is no separate "don't show again" switch, because the first automatic opening already sets `guide.dismissed.<route>`. Guides cover the thirteen operations pages and the dashboard's boxes; account, branch and admin pages get none (M20 says "iş sayfası").
- **[owner to confirm]**: `contained` status name and meaning; OU family label; green compliance and Pan-EU glossary lines; the 7-day carrier claim default; the whole TR guide copy (spec M20: owner reviews TR); S1 closure tied to the company-update right; S2 end-of-day in UTC.
- **Not in this plan**: S05/S08/S17 CSV or PDF exports; the S03 monthly report lines; incident cost totals per currency; `case_ref` (Phase 3, K8); a holiday calendar for business days; auto-opening an incident from a disputed shipment (the walk opens one by hand); reorder-point boxes (Phase 3).
- **Type consistency**
  - `nextMarketCellStatuses`, `liveMissing`, `buildMatrix`, `matrixCounts`, `missingCells`, `TARGET_STATUSES` (T3) are used in T4 and mirrored by `dashboard_market.target_count` (T10).
  - `INCIDENT_TYPES`, `incidentTypesOf`, `nextIncidentStatuses`, `incidentStatusHints(…, canCloseS1)`, `useIncidentEntityOptions`, `useOpenIncidentOptions` (T7) are used in T8; `useRollbackGate({ gateId, reason, incidentId })` changes in T8 with its only caller.
  - `nextChangeRequestStatuses`, `needsCustomerApproval`, `changeRequestStatusHints`, `useSetChangeRequestProducts({ id, before, after })`, `useNewerDocumentOptions` (T7) are used in T9; `ProductMultiSelect` (T4) in T9.
  - FK names used by embeds and `NAMED_ERRORS`: `market_cell_product_fkey`, `market_cell_project_fkey`, `market_cell_platform_fkey`, `incident_customer_fkey`, `incident_log_incident_fkey`, `incident_deadline_incident_fkey`, `project_gate_rollback_incident_fkey`, `change_request_customer_fkey`, `change_request_project_fkey`, `change_request_product_cr_fkey`, `change_request_product_product_fkey`, `change_request_affected_document_fkey`, `change_request_result_document_fkey`, `project_gate_project_fkey` (021).
  - `GLOSSARY_LABELS` (T11) is read by `PageGuide` (T12); `PAGE_GUIDES`, `useGuideStore.show(page, task?)` (T12) are filled by T13 and called by `CountListCard.guideTask` (T12).
- **pgTAP**: every block is runnable SQL on the shared preamble; plan counts T2 19, T5 23 (035) and 6 (036), T6 16, T10 7 match the listed assertions; the 021 file keeps 46; the three `099_seed` additions are concrete `ok(...)` statements. Fixture statuses use the 030 bypass; every switch to `akif` or `ayse` while impersonating is preceded by `RESET ROLE`, so no private function is called as `authenticated`.
- **Pre-flight revision (rulings applied)**: glossary enums are registered by the API task that introduces them (T3, T7), so `GlossaryEnum` holds them before T4/T8/T9 pass `glossary`; T11 only creates `GLOSSARY_LABELS` and checks the wiring. API tasks own `errors.*` and `glossary.*` (plus the `ops.document.entity.*` label of the constant they extend); UI tasks own `ops.*`. `SelectPlatform` gains `showClear` (T4). `StatusActions.warnings` gets one `"; "`-joined string per status (T8). The rollback's missing incident is `gate_rollback_incident_required`; T5–T8 interim stated in both tasks. Ids in zod are `z.uuid()` and the tests use valid UUIDs. Commit steps are one line each.
- **Proportion**: no function bodies are transcribed; replaced objects quote only their changed line or branch. Code fences are about 30% of the lines (from 35.8%): the six concrete pgTAP files, two TS test blocks for the pure helpers and the file map; commit blocks are now one line each. The copy tables are the bulk of the prose, as the spec has the developer draft the guide and glossary text.

