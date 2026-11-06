# Development Story Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command after `supabase db reset` fills MOESA LTD with one connected THO/KRN story. Every Section A state of the scenario matrix gets a row, every dashboard box and guide page gets data, and a smoke check fails loudly when a later migration leaves a state empty.

**Architecture:** `scripts/seed-story.mjs` (Node ESM) reads the local keys and refuses to run when customer KRN exists. It uploads the sample files to the `media` bucket at fixed media ids, then pipes `supabase/seed_story.sql` into the DB container's `psql` as one transaction. Each story step in that file is a `DO` block running as a seeded user, with its own audit transaction, backdated into one of the four feed bands. Last, the script pipes `supabase/seed_story.check.sql`, where each query returns rows only when an expectation fails, and exits 1 on any output. The small `seed.sql` and the pgTAP suite stay as they are; `pnpm test:db` resets to the small seed first.

**Tech Stack:** Supabase CLI 2.9.6 (local Docker, Postgres 15, Storage), plpgsql, Node 22 ESM, `@supabase/supabase-js` 2 (resolved from `app/node_modules`), ffmpeg (once, to make the committed sample files).

**Spec:** `docs/superpowers/specs/2026-11-06-dev-story-seed-design.md` (binding), with the scenario matrix `docs/superpowers/specs/2026-11-06-dev-story-seed-matrix.md` (Section A = the checklist, Section B = the row skeleton, Section C = what needs the bypass). Two corrections apply. The matrix's `transfer_files_pending` line is wrong; the spec's "Refused moves" section has the real path. The matrix's Section D is settled by the spec: KRN is copied, not THO; no new users or tenants; no `valid_until`; the script uploads the files; gates pass by the real rules.

## Global Constraints

- **Runs as `postgres`** through `docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres`, role `none`, RLS off. `auth.uid()`, code generation and the audit actor come from `set_config('request.jwt.claims', …, TRUE)` (sub, role `authenticated`) and `set_config('request.headers', …, TRUE)` (`x-tenant-id`, `x-tenant-ids`). **Never `SET ROLE`**, and never `private.impersonate` (it runs `SET ROLE authenticated`, which switches the bypass off).
- **Bypass rules (spec, verbatim intent):** `moesa.rules_bypass = '1'` is for backdated transitions only (PO, shipment). It does not cover:
  - Forced first statuses. Insert, then UPDATE under the flag, and set the server-set fields yourself: `closed_on`, `closed_by`, `company_approved_*`, `pi_checked_*`, `dispute_deadline_at`, `launched_on`, `accepted_on`.
  - Gate passes and rollbacks. They meet the real rules.
  - A change request's past decision date. The only sanctioned `ALTER TABLE public.change_request DISABLE TRIGGER change_request_due` is re-enabled in the same block, as test 038 does.
  - Media rows. They need real Storage objects.
  - The `transfer` row. The real `public.transfer_customer` is called as akif.
- **One transaction, many audit transactions.** The story runs with `psql --single-transaction`, so `set_config(..., TRUE)` values live until the end of the **whole run**. Every step therefore starts with `private.story_begin`, which clears `audit.transaction_id`, `audit.tenant_id` and `moesa.rules_bypass`. A flag set in step 5 never reaches step 8.
- **No new users, tenants, tables, columns or settings.** The cast is `baris@moesa-panel.test` (owner of MOESA LTD and MOESA Trading GmbH), `akif@moesa-panel.test` (management in MOESA LTD and MOESA Europe) and `koordinator@moesa-panel.test` (coordinator in MOESA LTD).
- **Names the tests look up stay unchanged:** THO-MOP40-2P, THO-TIPS-6-50, THO-CONES-100, "Mop ailesi çok ülke pilotu" (stays pending on G1), the five approved suppliers TR1 TR2 CN1 CN2 ID1, the member list of MOESA LTD, MOESA Europe, MOESA Trading GmbH. `seed.sql`, `config.toml` (`sql_paths = ['./seed.sql']`), the pgTAP files and CI are not changed.
- **Dates are relative:** `current_date ± n` for DATE columns, `now() − interval` for timestamps, with margins of at least 2 days around business-day rules. `spec_sheet_required_from` is `2026-12-31`, so no expectation may depend on which side of it today is.
- **Codes are year-dependent** (`PO-THO-<year>-001`). They are never hard-coded in SQL, checks, README or app. Story rows are found by fixed UUID; existing seed rows are found by code, sku or name.
- **Fixed UUIDs:** `5eed00SS-0000-4000-8000-0000000000NN`, where `SS` is the story step (02–10, below) and `NN` the row number within that step.
- **K8 / copy:** tenant-neutral copy, no e-mails or personal data beyond the existing demo accounts. Contact e-mails use `@thometzki.test` / `@kernhaus.test`, as `seed.sql` does. Turkish titles are developer drafts for the owner's review.
- **GTINs for new rows** (check digits verified): 4260696025855, 4260696025862, 4260696025879, 4260696025886, 4260696025893, 4260696025909, 4260696025916, 4260696025923, 4260696025930. Loop over every GTIN with `private.gtin_valid` and raise on a bad one, as `seed.sql` does.
- **Enum values used (verified against migrations 016–045):**
  - `customer_status` lead/onboarding/active/paused/closed
  - `commercial_model` trading_partner/commercial_representative/operations_partner
  - `warehouse_type` own/third_party/fba
  - `platform_access` authorized_user/none
  - `supplier_status` candidate/approved/suspended
  - `product_status` concept/development/approved/ordering/on_sale/paused/archived
  - `compliance_status` none/partial/complete
  - `document_type` (21 values): spec_sheet, tech_pack, sample_report, pi, po, psi_report, test_report, sds, doc_of_conformity, technical_file, label_artwork, packing_list, commercial_invoice, bill_of_lading, customs, delivery_receipt, gate_approval, change_request, contract, certificate, other
  - `document_status` draft/signed/approved/superseded
  - `document_entity` customer/supplier/product/project/project_gate/purchase_order/shipment/incident/market_cell/change_request
  - `project_type` npi/variant/revision/reorder
  - `project_path` a_sourcing/b_private_label
  - `project_status` active/on_hold/closed/cancelled
  - `gate_status` pending/passed/rolled_back
  - `task_status` todo/doing/done/blocked
  - `media_role` primary_image/gallery/evidence_photo/attachment
  - `purchase_order_status` draft/sent/pi_received/pi_approved/deposit_paid/in_production/ready/balance_paid/closed/cancelled
  - `payment_kind` deposit/balance/other
  - `payment_payer` company/customer
  - `shipment_mode` fcl20/fcl40/lcl/road/courier/air
  - `shipment_status` planned/booked/loaded/in_transit/at_customs/delivered/accepted/disputed/cancelled
  - `market_cell_status` candidate/planned/preparing/uploaded/live/suppressed/paused/stopped/removed
  - `market_compliance` green/yellow/red/pending
  - `stock_source` customer_warehouse/3pl/platform/pan_eu
  - `content_status` none/en_master/translated/approved
  - `incident_family` ol/oa/ou/ot/om
  - `incident_severity` s1/s2/s3
  - `incident_status` open/contained/closed
  - `incident_outcome` full_recovery/partial_recovery/loss
  - `incident_root_cause` human_error/document_data/communication/supplier/carrier/platform_regulation/customer
  - `incident_deadline_kind` supplier_damage/carrier_claim/demurrage/supplier_storage/platform_escalation/document_request/other
  - `cost_payer` company/customer/supplier/carrier_insurance
  - `change_request_status` open/approved/rejected/applied
  - `change_request_source` customer/supplier/company/regulation
  - `change_request_urgency` normal/urgent
  - `change_kind` spec/design/packaging/price/deadline/supplier/content
  - `transfer.mode` copy/move, `transfer.path` cheap/copy, `transfer.files_status` pending/done/partial (TEXT CHECKs)
  - Platforms (015): amazon (DE FR IT ES NL PL SE BE GB US), ebay (DE FR IT ES GB US), kaufland (DE AT CZ SK PL), bol (NL BE), otto (DE)
- **Commands:**
  - Small seed only: `cd supabase && supabase db reset`.
  - Story on top: `cd app && pnpm dev:seed-story`.
  - Both plus types: `cd app && pnpm dev:supabase-reset` (from Task 1 on).
  - Ad-hoc SQL: `docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1 < file.sql`.
- **Commits:** conventional (`feat(seed): …`, `docs(seed): …`), one per task, `git add` of the task's files only. Each message ends with a blank line and the Co-Authored-By trailer your session provides.

## Calls made here (spec silent or open)

1. **Single transaction.** psql runs the story with `--single-transaction`. A failed run leaves no rows behind, the KRN guard stays false, and the next run can go again; uploads use `upsert: true`. Every step still gets its own audit transaction, because `story_begin` clears `audit.transaction_id`.
2. **Feed backdating is folded into each step** (no separate task). `private.story_end(age)` closes each step, and each task's check asserts its step's band. Bands: step 02 and step 03 older (40 d / 35 d), step 04 older (25 d), step 05 last_week (5 d), step 06 yesterday (1 d), step 07 last_week (3 d), step 08 today (0), step 09 older (30 d), step 10 (transfer) untouched.
3. **Gate passes that need a PO's PI run in Task 5**, after the orders exist: variant G3, reorder G3, and G3–G5 of "Cones ilk sipariş" (then closed). Task 4 passes only the gates without a PI rule.
4. **Spec documents differ from the matrix where the G2 rule forces it.** G2 needs a signed or approved spec for every project product. So MOP40-3P (variant project) gets a **signed** v1, and CONES-100 ("Cones ilk sipariş" passes G2) gets a **signed** v1. Draft specs go on THO-TIPS-6-50 (the on-sale "unsigned spec sheet") and THO-MOP60-2P. MOP40-4P and BRUSH-1 have no spec.
5. **PO-001 "missing spec" uses THO-MOP40-4P (development), not BRUSH-1.** `private.po_line_needs_spec` is FALSE for a paused product before `2026-12-31`, so BRUSH-1 would show nothing until then. A development product needs a spec on either side of the date.
6. **`transfer_owner_required` is checked through `private.transfer_refusal`.** akif does not belong to Trading, so `transfer_options` never lists it for him. The README reproduces it by calling the RPC directly.
7. **Thumbnails** follow M19: `<tenant>/<media id>/thumb/thumb.webp`. The file is `<tenant>/<media id>/<file name>`.

## Review Focus

1. **Reset on a Saturday, a Sunday or late at night (UTC).** Business-day deadlines (CR normal = 5 business days, document_request = 5 business days, s2 = end of business day) land on other weekdays. Every "ahead" row must stay ahead and every "late" row late. Pinned in Task 8, Step 1 (seven-weekday assertion). Checks assert the views' flags, never a date.
2. **Running the story twice, or again after a failed run.** The second run must refuse before any upload. A failed run must leave nothing behind, so a fresh run succeeds. Pinned in Task 1, Steps 7–9.
3. **A later migration adds an enum value or an enum-typed column.** The check must fail and name what is now empty or unlisted. Coverage reads `enum_range` live, and a meta query fails on any enum column that is not classified. Pinned in Task 1, Step 4 and Task 1, Step 10.
4. **`spec_sheet_required_from` passes (after 2026-12-31).** The story must still load and every check stay green. Pinned in Task 5, Step 6, which reruns the story with the setting at `"2020-01-01"`.
5. **Windows shells.** Git Bash and PowerShell both run `pnpm dev:seed-story`. No host path goes to docker, `supabase` is spawned through a shell only on win32, and Turkish text arrives unmangled. Pinned in Task 1, Step 11 and the encoding check `core.encoding` (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/seed-story.mjs` (create) | The pipeline: keys, KRN guard, tenant lookup, uploads, SQL run, check run. Holds `MEDIA`, the media-id constants block. |
| `supabase/seed_story.sql` (create) | The story: guard, `private.story_*` helpers, one `DO` block per step, `DROP FUNCTION` of the helpers at the end. |
| `supabase/seed_story.check.sql` (create) | `BEGIN;` … `ROLLBACK;`, `pg_temp` helpers, the enum classification, then one section per task of zero-row-when-satisfied queries. |
| `supabase/seed_files/` (create) | `photo-1.png`, `photo-2.png`, `photo-3.png`, `thumb-1.webp`, `thumb-2.webp`, `thumb-3.webp`, `sample.pdf`, `sample.mp4`, each < 500 KB. |
| `supabase/README.md` (create) | What the story holds per user, the commands, how to add a state. |
| `app/package.json` (modify, scripts block lines 11 and 23) | `dev:seed-story`, `dev:supabase-reset`, `test:db`. |

### Story steps (SQL sections) and their tasks

| Step `SS` | Section | Actor / tenant | Band | Task |
|---|---|---|---|---|
| 01 | guard + helpers | — | — | 1 |
| 02 | customers, suppliers, settings | baris / MOESA LTD (+ Trading sub-step) | older 40 d | 2 |
| 03 | products, specs, product documents | baris / MOESA LTD | older 35 d | 3 |
| 04 | projects, tasks, passes without PI | koordinator / MOESA LTD (CLS close: baris) | older 25 d | 4 |
| 05 | purchase orders, PI-gate passes | baris / MOESA LTD | last_week 5 d | 5 |
| 06 | shipments | koordinator / MOESA LTD | yesterday 1 d | 6 |
| 07 | market cells | koordinator / MOESA LTD | last_week 3 d | 7 |
| 08 | incidents + rollback, change requests | akif / MOESA LTD | today 0 | 8 |
| 09 | media, remaining documents | baris / MOESA LTD | older 30 d | 9 |
| 10 | KRN copy into MOESA Europe | akif / MOESA LTD | untouched | 10 |

---

### Task 1: Pipeline skeleton (script, sample files, guard, check runner)

**Files:**
- Create: `scripts/seed-story.mjs`, `supabase/seed_story.sql`, `supabase/seed_story.check.sql`, `supabase/seed_files/*` (8 files)
- Modify: `app/package.json` (scripts)

**Interfaces:**
- Produces, in `seed-story.mjs`:
  - `const CONTAINER = 'supabase_db_moesa-panel'`
  - `const ROOT` = the repo root (from `import.meta.url`)
  - `run(cmd: string, args: string[], opts?: { input?: string | Buffer }) => string`. `spawnSync` with `cwd: ROOT` and `shell: process.platform === 'win32' && cmd === 'supabase'`. It throws with stderr on a non-zero exit.
  - `psql(sql: string, { singleTransaction?: boolean }) => string`. Runs `docker exec -i -e PGCLIENTENCODING=UTF8 supabase_db_moesa-panel psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1 [--single-transaction]`, with the SQL on **stdin**. It never takes a host path.
  - `localKeys() => { apiUrl: string, serviceRoleKey: string }`. Reads `API_URL` and `SERVICE_ROLE_KEY` from `supabase status -o json` (parse from the first `{`; CLI 2.x may print a line before the JSON).
  - `const MEDIA: ReadonlyArray<{ id: string, file: string, upload: string, mime: string, thumb?: string }>`. This is the constants block (filled in Task 9). `upload` is the published file name; `file` is the source under `supabase/seed_files/`, or `'<generated:12MB>'`.
  - `bigPdf() => Buffer`. `sample.pdf` plus `%` comment padding after `%%EOF`, to exactly `12 * 1024 * 1024` bytes.
  - `main()`. In order:
    1. Read the keys.
    2. Run the guard (`SELECT count(*) FROM public.customer WHERE code = 'KRN'` > 0 → print `seed-story: already loaded (customer KRN exists). Run "supabase db reset" first.` and exit 1, before any upload).
    3. Assert each seed file < 500 KB.
    4. Assert every `MEDIA` id occurs in `seed_story.sql`.
    5. Look up `MOESA LTD`'s id.
    6. Upload, then run the story SQL with `singleTransaction: true`.
    7. Run the check, print every row as `FAIL <id> <detail>`, and exit 1 if there is one; else print `seed-story: ok (<n> checks)`.
- Produces, in `seed_story.sql`:
  - The guard block (raises `seed_story: already loaded (customer KRN exists)`).
  - `private.story_begin(actor_email TEXT, tenant_name TEXT) RETURNS UUID`. Sets the claims and headers, clears `audit.transaction_id`, `audit.tenant_id` and `moesa.rules_bypass`, and returns the tenant id. It raises `story: unknown user/tenant %` when either is missing, and raises if `private.rules_bypassed()` is still TRUE afterwards.
  - `private.story_bypass(enabled BOOLEAN) RETURNS VOID`. Sets or clears `moesa.rules_bypass` (local) and raises unless `private.rules_bypassed() = enabled`.
  - `private.story_end(age INTERVAL) RETURNS VOID`. With `tx := nullif(current_setting('audit.transaction_id', TRUE), '')::UUID`, it raises `story: step wrote nothing` when tx is NULL. Otherwise it runs `UPDATE public.audit_log SET created_at = created_at - age WHERE transaction_id = tx`, then the same on `public.audit_transaction WHERE id = tx` (both together; the feed joins on equal `created_at`), then clears `audit.transaction_id`.
  - The trailing `DROP FUNCTION` list (each task adds its helper there).
- Produces, in `seed_story.check.sql`:
  - `pg_temp.tenant(name TEXT) RETURNS UUID`.
  - `pg_temp.moesa() RETURNS UUID` (= `pg_temp.tenant('MOESA LTD')`).
  - `pg_temp.act_as(email TEXT, tenant_name TEXT) RETURNS VOID` (claims + headers, local, no SET ROLE).
  - `pg_temp.error_of(sql TEXT) RETURNS TEXT`. `EXECUTE sql`, then `RAISE EXCEPTION 'story_check_succeeded'`; the handler `WHEN OTHERS` returns `SQLERRM`. The block's exception undoes any write.
  - `pg_temp.enum_gaps(tbl TEXT, col TEXT) RETURNS SETOF TEXT`. Reads the column's type (element type for arrays) from `pg_attribute`, then returns each `enum_range` value with no row `WHERE tenant_id = pg_temp.moesa()` that holds it (`=` or `= ANY` for arrays).
  - The temp table `story_enum_column(tbl TEXT, col TEXT, rule TEXT CHECK (rule IN ('all','pending','exempt')), note TEXT)`.

- [ ] **Step 1: Make the sample files** (once, committed; ffmpeg is on the dev machine)

```bash
cd supabase/seed_files
ffmpeg -f lavfi -i testsrc2=size=480x360 -frames:v 1 photo-1.png
ffmpeg -f lavfi -i smptebars=size=480x360 -frames:v 1 photo-2.png
ffmpeg -f lavfi -i mandelbrot=size=480x360 -frames:v 1 photo-3.png
for i in 1 2 3; do ffmpeg -i photo-$i.png -vf scale=160:-1 thumb-$i.webp; done
ffmpeg -f lavfi -i testsrc2=size=320x240:rate=15 -t 2 -c:v libx264 -pix_fmt yuv420p -movflags +faststart sample.mp4
```

`sample.pdf` is a one-page PDF with the text "MOESA seed sample" and a correct xref table (byte offsets computed). It is written once by a throwaway Node snippet and is under 2 KB. Expected: `ls -l` shows 8 files, each < 500 KB.

- [ ] **Step 2: Write the failing check skeleton** `supabase/seed_story.check.sql`

It opens with `BEGIN;` and the `pg_temp` helpers above. Then the classification table, filled with **every** enum-typed column of every public base table:
- Rule `pending` for each column of the `all` list below. Each later task flips its own rows to `all`.
- Rule `exempt` with a note for every other column found by the Step 4 meta query (e.g. `project_gate.code`, `project.current_phase`, `project_task.phase`, `task_template.*`, `incident.outcome`, `incident.root_cause`, `incident.affected_parties`, `incident_deadline.kind`, `incident_log.cost_payer`, `change_request.cost_payer`, `change_request.affected_gate_code`, `media_link.entity_type`, `permission.*`).

The `all` list (owner task in brackets):
- [2] `customer.commercial_model`, `customer_warehouse.type`, `customer_platform_account.access`, `supplier.status`
- [3] `product.status`, `product.compliance_status`
- [4] `customer.status`, `project.type`, `project.path`, `project.status`, `project_task.status`
- [5] `purchase_order.status`, `purchase_order_payment.kind`, `purchase_order_payment.paid_by`
- [6] `shipment.status`, `shipment.mode`
- [7] `market_cell.status`, `market_cell.compliance`, `market_cell.stock_source`, `market_cell.content_status`
- [8] `project_gate.status`, `incident.family`, `incident.severity`, `incident.status`, `change_request.status`, `change_request.source`, `change_request.urgency`, `change_request.change_kinds`
- [9] `document.type`, `document.status`, `document.entity_type`, `media_link.role`

Then the queries:

```sql
-- core.cast: the tenants and users the story runs as
SELECT 'core.cast', n FROM unnest(ARRAY['MOESA LTD', 'MOESA Europe', 'MOESA Trading GmbH']) n WHERE pg_temp.tenant(n) IS NULL;
-- enum.unlisted: an enum column nobody classified (a later migration added it)
SELECT 'enum.unlisted', a.attrelid::regclass || '.' || a.attname
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace s ON s.oid = c.relnamespace
JOIN pg_type t ON t.oid = a.atttypid LEFT JOIN pg_type e ON e.oid = t.typelem
WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
  AND (t.typtype = 'e' OR e.typtype = 'e')
  AND NOT EXISTS (SELECT 1 FROM story_enum_column x WHERE x.tbl = c.relname AND x.col = a.attname);
-- enum.gap: a value of a covered column with no row in MOESA LTD
SELECT 'enum.gap', x.tbl || '.' || x.col || '=' || g FROM story_enum_column x, pg_temp.enum_gaps(x.tbl, x.col) g WHERE x.rule = 'all';
SELECT 'pipeline.red', 'remove me';   -- temporary, proves the runner fails
```

It ends with `ROLLBACK;`.

- [ ] **Step 3: Write `scripts/seed-story.mjs`, the empty `seed_story.sql` (guard + the three helpers + their DROP) and the package scripts**

`app/package.json`:
- `"dev:seed-story": "node ../scripts/seed-story.mjs"`
- `"dev:supabase-reset": "supabase db reset && pnpm dev:seed-story && pnpm dev:supabase-types"`
- `"test:db": "cd ../supabase && supabase db reset && supabase test db"`

supabase-js is loaded with `createRequire(path.join(ROOT, 'app', 'package.json'))('@supabase/supabase-js')`. Uploads use `{ contentType: mime, upsert: true }`.

- [ ] **Step 4: Run the pipeline red**

Run: `cd supabase && supabase db reset && cd ../app && pnpm dev:seed-story`
Expected: exit 1. The output is exactly one `FAIL pipeline.red remove me`, no `enum.unlisted` and no `enum.gap` (every covered column is still `pending`). If `enum.unlisted` rows appear, classify them (`exempt` + note) and rerun.

- [ ] **Step 5: Remove the `pipeline.red` line and run green**

Run: `cd supabase && supabase db reset && cd ../app && pnpm dev:seed-story`
Expected: exit 0, `seed-story: ok (…)`.

- [ ] **Step 6: Verify `story_end` refuses a step that wrote nothing**

Run this ad-hoc SQL:
```sql
DO $$ BEGIN PERFORM private.story_begin('baris@moesa-panel.test', 'MOESA LTD'); PERFORM private.story_end('1 day'); END $$;
```
Pipe it after creating the helpers (copy the helper section of `seed_story.sql` into the ad-hoc file, wrapped in `BEGIN; … ROLLBACK;`). Expected: `ERROR: story: step wrote nothing`.

- [ ] **Step 7: Test the script guard (refuses before uploading)**

Run:
```bash
docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.customer (tenant_id, code, display_name, country, commercial_model, status)
SELECT id, 'KRN', 'guard probe', 'Austria', 'trading_partner', 'lead' FROM public.tenant WHERE display_name = 'MOESA LTD';
SQL
cd app && pnpm dev:seed-story; echo "exit=$?"
docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -At -c "SELECT count(*) FROM storage.objects WHERE bucket_id = 'media'"
```
Expected: the `already loaded` message, `exit=1`, and an object count of 0 (on the small seed).

- [ ] **Step 8: Test the SQL guard**

Run (KRN still present): `docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 --single-transaction < supabase/seed_story.sql`
Expected: `ERROR:  seed_story: already loaded (customer KRN exists)`. Then `cd supabase && supabase db reset`.

- [ ] **Step 9: Test that a failed run leaves nothing and a rerun succeeds**

Temporarily append `DO $$ BEGIN RAISE EXCEPTION 'story probe'; END $$;` before the DROP list. Run `pnpm dev:seed-story`.
Expected: exit 1 with `story probe`. Then `SELECT count(*) FROM pg_proc WHERE proname LIKE 'story\_%'` returns 0 (the helpers were rolled back too). Remove the probe and run `pnpm dev:seed-story` again **without** a reset. Expected: exit 0.

- [ ] **Step 10: Pin the enum meta query**

Delete the `shipment.mode` row from the classification VALUES, then run the check alone: `docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1 < supabase/seed_story.check.sql`.
Expected: `enum.unlisted|shipment.mode`. Restore the row.

- [ ] **Step 11: Run from both shells**

Run `cd supabase && supabase db reset && cd ../app && pnpm dev:seed-story` once in Git Bash and once in PowerShell (`cd supabase; supabase db reset; cd ../app; pnpm dev:seed-story`). Expected: exit 0 in both.

- [ ] **Step 12: Commit**

```bash
git add scripts/seed-story.mjs supabase/seed_story.sql supabase/seed_story.check.sql supabase/seed_files app/package.json
git commit -m "feat(seed): story pipeline with guard, uploads and smoke check"
```

---

### Task 2: Customers, suppliers, settings (step 02)

**Files:**
- Modify: `supabase/seed_story.sql` (step 02 block, helper `story_doc` + its DROP), `supabase/seed_story.check.sql` (section "Task 2"; flip the [2] rows to `all`)

**Interfaces:**
- Consumes: `story_begin`, `story_end` (Task 1).
- Produces:
  - `private.story_doc(id UUID, entity_type public.document_entity, entity_id UUID, customer_id UUID, type public.document_type, version INT, status public.document_status, issued_on DATE, url TEXT DEFAULT NULL, media_id UUID DEFAULT NULL) RETURNS UUID`. Tenant comes from the request header. `is_signed`, `is_stamped` and `sent_from_official_email` are TRUE when status is signed/approved/superseded. `file_name` = `<type>_v<version>`. `url` defaults to `https://drive.google.com/example/<id>` unless `media_id` is given and url is NULL. The caller passes `customer_id` NULL for supplier documents.
  - Ids: KRN `5eed0002-…-01`, LEA `-02`, PAU `-03`, CLS `-04`, CN3 `-05`, TR3 `-06`, THO contract doc `-07`, CN1 certificate `-08`, TR1 NNN contract `-09`.

- [ ] **Step 1: Write the failing checks** (section "Task 2")

```sql
SELECT 'm1.tho_contract' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.document d ON d.id = c.contract_document_id AND d.type = 'contract'
  WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on <= current_date - 2 AND c.restricted_drive_url IS NOT NULL AND c.eu_responsible_person IS NOT NULL);
SELECT 'm1.contract_missing', k FROM unnest(ARRAY['LEA', 'KRN']) k WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.code = k AND c.tenant_id = pg_temp.moesa() AND c.contract_accepted_on IS NULL);
SELECT 'm1.packages', p FROM unnest(ARRAY['A0', 'A2', 'D']) p WHERE NOT EXISTS (SELECT 1 FROM public.customer c WHERE c.tenant_id = pg_temp.moesa() AND p = ANY (c.packages));
SELECT 'm1.contacts' WHERE (SELECT count(*) FROM public.customer_contact x JOIN public.customer c ON c.id = x.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT x.can_approve) < 3;
SELECT 'm1.default_warehouse' WHERE NOT EXISTS (SELECT 1 FROM public.customer_warehouse w JOIN public.customer c ON c.id = w.customer_id WHERE c.code = 'THO' AND c.tenant_id = pg_temp.moesa() AND NOT w.is_default);
SELECT 'm1.brand_pending' WHERE NOT EXISTS (SELECT 1 FROM public.customer_brand WHERE tenant_id = pg_temp.moesa() AND name = 'OKAEI Pro' AND registration_status = 'pending');
SELECT 'm2.contacts', s FROM unnest(ARRAY['TR1', 'CN1']) s WHERE NOT EXISTS (SELECT 1 FROM public.supplier_contact x JOIN public.supplier p ON p.id = x.supplier_id WHERE p.code = s AND p.tenant_id = pg_temp.moesa());
SELECT 'm2.documents' WHERE (SELECT count(DISTINCT d.type) FROM public.document d WHERE d.tenant_id = pg_temp.moesa() AND d.entity_type = 'supplier' AND d.type IN ('certificate', 'contract')) < 2;
SELECT 'm2.rating' WHERE NOT EXISTS (SELECT 1 FROM public.supplier WHERE tenant_id = pg_temp.moesa() AND code = 'CN1' AND rating = 2 AND last_audit_on IS NOT NULL);
SELECT 'core.trading_media_cap' WHERE (SELECT value FROM public.setting WHERE tenant_id = pg_temp.tenant('MOESA Trading GmbH') AND key = 'media_max_mb') IS DISTINCT FROM '5'::JSONB;
SELECT 'feed.step02_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'customer' AND now()::DATE - created_at::DATE > 7);
```

Flip the [2] rows to `all`. `customer.status` belongs to [4]: CLS only closes there.

- [ ] **Step 2: Run red**

Run: `cd supabase && supabase db reset && cd ../app && pnpm dev:seed-story`
Expected: exit 1, with every Task 2 id and the four `enum.gap` lines (`customer.commercial_model=operations_partner`, `customer_warehouse.type=third_party`/`fba`, `customer_platform_account.access=none`, `supplier.status=candidate`/`suspended`) failing.

- [ ] **Step 3: Implement step 02** (matrix §A M1/M2/Core, §B.1–2)

Begin as baris / MOESA LTD. Rows:
- **THO** (UPDATE): `contract_accepted_on = current_date - 300` and `contract_document_id` = doc `-07` (contract, entity customer, signed, issued `current_date - 300`; insert the doc first). Also `eu_responsible_person`, `restricted_drive_url`. Contacts Operations, Lager, Buchhaltung (`can_approve` FALSE). Warehouses "Rhenus 3PL" `third_party` and "FBA DE" `fba` (`is_default` FALSE). Platform account kaufland `{DE}` access `none`. Brand "OKAEI Pro" `registration_status 'pending'`.
- **KRN** "Kernhaus Living GmbH": Austria, `commercial_representative`, `onboarding`, packages `{A0,A2,C}`, no contract. One contact, warehouse "Wien" `own` default, accounts bol `{NL}` and kaufland `{AT}` (`authorized_user`).
- **LEA** `lead` (trading_partner). **PAU** `paused`, `operations_partner`, `{D}`. **CLS** `active` for now (closed in Task 4).
- **Suppliers:**
  - New: CN3 "Ningbo Clean" `candidate` (China); TR3 "Demir Tekstil" `suspended` (Türkiye).
  - Contacts on TR1 and CN1.
  - Ratings: TR1 4 with `last_audit_on = current_date - 90`, `storage_fee_rule`, `late_payment_penalty`; CN1 2 with `last_audit_on = current_date - 200`.
  - Documents: CN1 certificate `-08` (signed, issued `current_date - 400`), TR1 NNN contract `-09` (signed).
- `PERFORM private.story_end('40 days')`.
- **Trading sub-step:** `story_begin('baris@moesa-panel.test', 'MOESA Trading GmbH')`, then `UPDATE public.setting SET value = '5' WHERE tenant_id = <trading> AND key = 'media_max_mb'`. Raise unless exactly one row changed. Then `story_end('40 days')`.

- [ ] **Step 4: Run green**

Run: `cd supabase && supabase db reset && cd ../app && pnpm dev:seed-story`
Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story customers, suppliers and the Trading media cap`

---

### Task 3: Products, specs, product documents (step 03)

**Files:**
- Modify: `supabase/seed_story.sql` (step 03), `supabase/seed_story.check.sql` (section "Task 3"; flip the [3] rows)

**Interfaces:**
- Consumes: `story_doc`, KRN id `5eed0002-…-01`, TR3 id `-06` (Task 2).
- Produces product ids `5eed0003-…`:

| NN | sku | customer | status | GTIN | supplier | compliance | spec |
|---|---|---|---|---|---|---|---|
| 01 | THO-MOP40-3P (parent MOP40-2P, variant_label "3'lü") | THO | development | 4260696025855 | TR1 | partial | v1 signed |
| 02 | THO-MOP40-4P (parent MOP40-2P) | THO | development | 4260696025862 | TR1 | none | — |
| 03 | THO-MOP60-2P | THO | concept | 4260696025879 | TR1 | none | v1 draft |
| 04 | THO-TIPS-6-100 | THO | approved | 4260696025886 | CN1 | none | v1 approved |
| 05 | THO-CONES-200 | THO | ordering | 4260696025893 | ID1 | partial | — |
| 06 | THO-BRUSH-1 | THO | paused | 4260696025909 | CN2 | partial | — |
| 07 | THO-MOP40-2P-OLD | THO | archived | 4260696025800 (reused) | TR3 | none | — |
| 08 | KRN-VASE-01 | KRN | on_sale | 4260696025916 | TR1 | complete | v1 signed |
| 09 | KRN-VASE-02 | KRN | concept | 4260696025923 | TR1 | none | — |

- Product document ids `5eed0003-…`: `21` MOP40-2P spec v1 (superseded), `22` MOP40-3P spec v1, `23` TIPS-6-50 spec v1 draft, `24` TIPS-6-100 spec v1, `25` CONES-100 spec v1 signed, `26` CONES-100 certificate (issued `current_date - 400`), `27` TIPS-6-50 sds, `28` TIPS-6-50 doc_of_conformity, `29` TIPS-6-50 test_report, `30` CONES-100 label_artwork v1 (approved), `31` MOP60-2P spec v1 draft, `32` KRN-VASE-01 spec v1 signed.

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'm3.variant_tree' WHERE (SELECT count(*) FROM public.product c JOIN public.product p ON p.id = c.parent_id WHERE p.sku = 'THO-MOP40-2P' AND p.tenant_id = pg_temp.moesa()) < 2;
SELECT 'm3.archived_reuses_gtin' WHERE (SELECT count(*) FROM public.product WHERE gtin = '4260696025800' AND tenant_id = pg_temp.moesa()) < 2;
SELECT 'm3.hazmat' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE sku = 'THO-TIPS-6-50' AND tenant_id = pg_temp.moesa() AND is_hazmat AND hs_code IS NOT NULL AND origin_country IS NOT NULL);
SELECT 'm3.dimensions' WHERE NOT EXISTS (SELECT 1 FROM public.product WHERE sku = 'THO-MOP40-2P' AND tenant_id = pg_temp.moesa() AND unit_dims_mm IS NOT NULL AND carton_dims_mm IS NOT NULL AND pallet_carton_qty IS NOT NULL);
SELECT 'm3.second_customer' WHERE (SELECT count(*) FROM public.product p JOIN public.customer c ON c.id = p.customer_id WHERE c.code = 'KRN' AND c.tenant_id = pg_temp.moesa()) < 2;
SELECT 'm4.spec_superseded' WHERE NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet' AND d.version = 1 AND d.status = 'superseded')
   OR NOT EXISTS (SELECT 1 FROM public.document d JOIN public.product p ON p.id = d.entity_id WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet' AND d.version = 2 AND d.status = 'signed');
SELECT 'm3.evidence_mix' WHERE NOT EXISTS (SELECT 1 FROM public.product_evidence e JOIN public.product p ON p.id = e.product_id WHERE p.sku = 'THO-TIPS-6-50' AND NOT e.has_signed_spec)
   OR NOT EXISTS (SELECT 1 FROM public.product_evidence e JOIN public.product p ON p.id = e.product_id WHERE p.sku = 'THO-MOP40-3P' AND e.has_signed_spec);
SELECT 'box.unsigned_skus' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_product_evidence WHERE tenant_id = pg_temp.moesa() AND unsigned_sku_count > 0);
SELECT 'box.incomplete_compliance' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_product_evidence WHERE tenant_id = pg_temp.moesa() AND active_sku_count > compliance_complete_count);
SELECT 'feed.step03_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'product' AND now()::DATE - created_at::DATE > 7);
```

- [ ] **Step 2: Run red** — same command as in Task 2. Expected: exit 1, with the Task 3 ids and `enum.gap` for `product.status` (concept, development, approved, ordering, paused, archived) and `compliance_status=none`.

- [ ] **Step 3: Implement step 03**

Begin as baris / MOESA LTD and run the GTIN loop. Insert the products in table order; insert MOP40-2P-OLD directly as `archived`, because the partial unique index ignores archived rows. UPDATE MOP40-2P with dims, pallet and carton data. UPDATE TIPS-6-50 with `is_hazmat`, `hs_code '8421.39'`, `origin_country 'China'`.

Then the documents (signed/approved ones need the four fields, which `story_doc` fills):
- `21` is inserted with status `superseded` directly. It is older than v2, so `document_supersede` does not touch v2.
- The TIPS-6-50 sds, doc_of_conformity and test_report are `approved`.

`story_end('35 days')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story products, variants and spec documents`

---

### Task 4: Projects, tasks, gates without a PI rule (step 04)

**Files:**
- Modify: `supabase/seed_story.sql` (step 04, helper `story_pass_gate` + DROP), `supabase/seed_story.check.sql` (section "Task 4"; flip the [4] rows and `customer.status`)

**Interfaces:**
- Consumes: product ids (Task 3), CLS `5eed0002-…-04`.
- Produces:
  - `private.story_pass_gate(project_id UUID, gate public.gate_code, passed_at TIMESTAMPTZ, evidence UUID[] DEFAULT '{}') RETURNS VOID`. In order:
    1. Set every `blocks_gate` task of the project with `phase <= public.phase_before(gate)` and status ≠ done to `done`.
    2. If the gate `needs_customer_approval`: insert a signed `gate_approval` doc (entity `project_gate`, entity_id = gate id, issued `passed_at::DATE`) via `story_doc`, and set `customer_approved_on = passed_at::DATE`, `approval_document_id`.
    3. `UPDATE public.project_gate SET status = 'passed', passed_at = passed_at, evidence_document_ids = evidence` (one gate per statement; the real guard runs).
    4. Raise `story: % not passed` when the row is not passed afterwards.
  - Project ids `5eed0004-…`:

| NN | display_name | customer | type / path / packages | products | target state after Task 4 |
|---|---|---|---|---|---|
| 01 | OKAEI fırça private label | THO | npi / b_private_label / {A2,C} | THO-BRUSH-1 | G1 passed `now() - 20 days`, PL_G1 passed `now() - 9 days`, waits on PL_G2 |
| 02 | MOP40 3'lü varyant | THO | variant / a_sourcing / {A1} | THO-MOP40-3P | G2 passed `now() - 15 days` (G3 in Task 5) |
| 03 | Karbon filtre tekrar siparişi | THO | reorder / a_sourcing / {A1} | THO-TIPS-6-50 | nothing passed (G3 in Task 5) |
| 04 | CONES-100 ambalaj revizyonu | THO | revision / a_sourcing / {A1} | THO-CONES-100 | status on_hold |
| 05 | Cones ilk sipariş | THO | npi / a_sourcing / {A1} | THO-CONES-100 | G1 `now() - 120 days`, G2 `now() - 100 days` (rest in Task 5) |
| 06 | Mop 60 iptal | THO | npi / a_sourcing / {A1} | THO-MOP60-2P | status cancelled |
| 07 | THO lojistik Q1 | THO | npi / a_sourcing / {B} | — | G5 pending |
| 08 | KRN Konsept vazo | KRN | npi / b_private_label / {A0} | KRN-VASE-02 | PL_G1 pending |
| 09 | CLS eski proje | CLS | npi / a_sourcing / {A1} | — | status closed, then CLS `closed` |

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'core.encoding' WHERE NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000001' AND display_name = U&'OKAEI f\0131r\00E7a private label');
SELECT 'm5.pilot_on_g1' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending g WHERE g.project_display_name = 'Mop ailesi çok ülke pilotu' AND g.gate_code = 'G1' AND g.needs_management);
SELECT 'm5.pilot_blocking_task' WHERE NOT EXISTS (SELECT 1 FROM public.project_task t JOIN public.project p ON p.id = t.project_id WHERE p.display_name = 'Mop ailesi çok ülke pilotu' AND t.blocks_gate AND t.status <> 'done' AND t.phase <= public.phase_before('G1'));
SELECT 'm5.pl_passed_with_approval' WHERE (SELECT count(*) FROM public.project_gate g WHERE g.project_id = '5eed0004-0000-4000-8000-000000000001' AND g.status = 'passed' AND (NOT g.needs_customer_approval OR g.approval_document_id IS NOT NULL)) < 2;
SELECT 'm5.task_states', s FROM unnest(ARRAY['todo', 'doing', 'done', 'blocked']::public.task_status[]) s WHERE NOT EXISTS (SELECT 1 FROM public.project_task WHERE tenant_id = pg_temp.moesa() AND status = s);
SELECT 'm5.task_unassigned' WHERE NOT EXISTS (SELECT 1 FROM public.project_task t JOIN public.project p ON p.id = t.project_id AND p.status = 'active' WHERE t.tenant_id = pg_temp.moesa() AND t.assignee_id IS NULL AND t.status <> 'done');
SELECT 'box.tasks_overdue' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_task_due WHERE tenant_id = pg_temp.moesa() AND overdue);
SELECT 'box.tasks_due_soon' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_task_due WHERE tenant_id = pg_temp.moesa() AND NOT overdue AND days_left BETWEEN 0 AND 5);
SELECT 'box.gates_management' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND needs_management);
SELECT 'box.gates_customer' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND NOT needs_management AND needs_customer_approval);
SELECT 'm1.closed_with_project' WHERE NOT EXISTS (SELECT 1 FROM public.customer c JOIN public.project p ON p.customer_id = c.id WHERE c.code = 'CLS' AND c.status = 'closed' AND p.status = 'closed');
SELECT 'm5.a0_only' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000008' AND code = 'PL_G1' AND status = 'pending');
SELECT 'feed.step04_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'project' AND now()::DATE - created_at::DATE > 7);
```

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 4 ids and `enum.gap` lines for project type/path/status, task status and `customer.status=closed`. (`project_gate.status` stays `pending` until Task 8 brings `rolled_back`.)

- [ ] **Step 3: Implement step 04**

Begin as koordinator / MOESA LTD and insert projects 01–09 with their `project_product` rows (`coordinator_id` = koordinator). Pass the gates in the table through `story_pass_gate`, oldest first. If a guard raises, read its code (`gate_order`, `gate_spec_sheet_required`, `gate_blocked_by_task`) and fix the data; never disable the trigger.

Set the task states on projects 02 and 03 (UPDATE their template tasks):
- one task `due_on = current_date - 3` (overdue)
- one task `due_on = current_date + 2`
- one `blocked`
- one `doing` with `assignee_id` NULL
- one `done`

Leave the pilot untouched. Then:
- `UPDATE project SET status = 'on_hold'` on 04 and `'cancelled'` on 06.
- On 09: `status = 'closed'`.
- As baris: `UPDATE customer SET status = 'closed' WHERE id = CLS`.

`story_end('25 days')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story projects, tasks and gate passes by the real rules`

---

### Task 5: Purchase orders and the PI-gate passes (step 05)

**Files:**
- Modify: `supabase/seed_story.sql` (step 05), `supabase/seed_story.check.sql` (section "Task 5"; flip the [5] rows)

**Interfaces:**
- Consumes: `story_bypass`, `story_pass_gate`, `story_doc`; project ids 02/03/05; product ids.
- Produces PO ids `5eed0005-…-NN` (codes come from the trigger, in insert order 001–011, then KRN 001). PI document ids `5eed0005-…-2NN` are written as `…-0000000002NN`.

| NN | status | product (supplier) | qty | project | specifics |
|---|---|---|---|---|---|
| 01 | draft | THO-MOP40-4P (TR1) | 500 | — | line without `spec_document_id` |
| 02 | sent | THO-TIPS-6-100 (CN1) | 1000 | — | line cites spec `5eed0003-…-24` |
| 03 | pi_received | THO-MOP40-2P (TR1) | 2000 | — | PI doc (draft); `pi_total` = system total + 12.40 |
| 04 | pi_approved | THO-TIPS-6-50 (CN1) | 5000 | 03 | PI doc approved; `pi_check` = keys '1'..'30' → "ok"; `pi_checked_by` baris, `pi_checked_at now() - 13 days` |
| 05 | deposit_paid | THO-MOP40-3P (TR1) | 800 | 02 | PI approved; deposit paid `current_date - 8`, `paid_by 'company'` |
| 06 | in_production | THO-TIPS-6-50 (CN1) | 3000 | — | two `purchase_order_update` rows (`happened_on current_date - 6`, `- 2`); psi_report approved |
| 07 | ready | THO-CONES-100 (ID1) | 4000 | — | `ready_on current_date - 5`; balance `planned_on current_date - 10`, unpaid; psi_report **draft** only |
| 08 | balance_paid | THO-MOP40-2P (TR1) | 1000 | — | deposit paid; balance paid `current_date - 12`, `paid_by 'customer'`; one `other` payment (freight) |
| 09 | closed | THO-CONES-100 (ID1) | 2000 | 05 | PI approved; all payments paid |
| 10 | cancelled | THO-CONES-200 (ID1) | 1000 | — | — |
| 11 | in_production | THO-MOP40-2P (TR1) | 1500 | — | `deposit_rate 0`, no deposit payment |
| 12 | sent | KRN-VASE-01 (TR1) | 300 | — | KRN order |

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'm7.missing_spec' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000001' AND status = 'draft' AND cardinality(spec_missing_line_ids) > 0);
SELECT 'm7.pi_differs' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000003' AND pi_total IS DISTINCT FROM system_total);
SELECT 'm7.balance_overdue' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000007' AND balance_planned_on < current_date);
SELECT 'm7.psi_missing' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_overview WHERE id = '5eed0005-0000-4000-8000-000000000007' AND NOT has_approved_psi);
SELECT 'm7.deposit_zero' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order WHERE id = '5eed0005-0000-4000-8000-000000000011' AND deposit_rate = 0 AND status = 'in_production');
SELECT 'm7.production_updates' WHERE (SELECT count(*) FROM public.purchase_order_update WHERE purchase_order_id = '5eed0005-0000-4000-8000-000000000006') < 2;
SELECT 'm7.second_customer' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order o JOIN public.customer c ON c.id = o.customer_id WHERE c.code = 'KRN' AND o.status = 'sent');
SELECT 'box.po_action', s FROM unnest(ARRAY['sent', 'pi_received', 'pi_approved']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'box.po_production', s FROM unnest(ARRAY['deposit_paid', 'in_production', 'ready', 'balance_paid']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_purchase_order WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'm5.reorder_on_g4' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000003' AND gate_code = 'G4' AND waiting_days >= 10);
SELECT 'box.gates_team' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE tenant_id = pg_temp.moesa() AND NOT needs_management AND NOT needs_customer_approval);
SELECT 'm5.closed_project' WHERE NOT EXISTS (SELECT 1 FROM public.project WHERE id = '5eed0004-0000-4000-8000-000000000005' AND status = 'closed' AND current_phase = 'closed');
SELECT 'm5.variant_g3_passed' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND code = 'G3' AND status = 'passed');
SELECT 'core.bypass_off' WHERE private.rules_bypassed();
SELECT 'feed.step05_last_week' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'purchase_order' AND now()::DATE - created_at::DATE BETWEEN 2 AND 7);
```

`m5.variant_g3_passed` is replaced in Task 8 by the rollback check (delete it there).

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 5 ids and the PO/payment `enum.gap` lines.

- [ ] **Step 3: Implement step 05**

Begin as baris / MOESA LTD. For each PO:
1. Insert it in draft (the code trigger forces draft) with its line(s) and payments (`planned_on` relative).
2. Insert its PI document (entity `purchase_order`; draft for 03, approved for 04/05/09; `pi` type) and set `pi_document_id`, `pi_number`, `pi_total`.
3. `story_bypass(TRUE)`, set the target status in **one** UPDATE together with the server-set fields (`pi_check`, `pi_checked_by`, `pi_checked_at` for pi_approved and later), then `story_bypass(FALSE)`.

PSI documents: `psi_report` approved on 06, draft on 07.

After the orders, with the flag **off**:
- `story_pass_gate(variant 02, 'G3', now() - 6 days, ARRAY[pi of 05])`
- `story_pass_gate(reorder 03, 'G3', now() - 12 days, ARRAY[pi of 04])`
- on 05: G3 `now() - 80 days` with the pi of 09, then G4 `now() - 70 days`, G5 `now() - 60 days`; then `UPDATE project SET status = 'closed'`

`story_end('5 days')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Direct assertion that `story_begin` clears a leaked flag**

`core.bypass_off` runs in a separate session, so it only guards the check itself. The real pin is that `story_begin` clears the flag within the single transaction. Run this ad-hoc (helpers pasted in):
```sql
BEGIN; <helpers>; SELECT set_config('moesa.rules_bypass', '1', TRUE); SELECT private.story_begin('akif@moesa-panel.test', 'MOESA LTD'); SELECT private.rules_bypassed(); ROLLBACK;
```
Expected: `f`.

- [ ] **Step 6: Pin `spec_sheet_required_from` passing**

Run:
```bash
cd supabase && supabase db reset
docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
UPDATE public.setting SET value = '"2020-01-01"' WHERE key = 'spec_sheet_required_from' AND tenant_id = (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD');
SQL
cd ../app && pnpm dev:seed-story
```
Expected: exit 0 (every check green, `m7.missing_spec` included). Then `cd ../supabase && supabase db reset`.

- [ ] **Step 7: Commit** — `feat(seed): story purchase orders through their statuses and the PI gates`

---

### Task 6: Shipments (step 06)

**Files:**
- Modify: `supabase/seed_story.sql` (step 06), `supabase/seed_story.check.sql` (section "Task 6"; flip the [6] rows)

**Interfaces:**
- Consumes: PO ids, `story_bypass`, `story_doc`; THO warehouse Rosbach (looked up by name).
- Produces shipment ids `5eed0006-…-NN` (codes from the trigger, insert order 001–010). Each shipment is linked through `shipment_purchase_order`, with lines in `shipment_line`.

| NN | status | mode | PO (line qty) | dates / fields |
|---|---|---|---|---|
| 01 | planned | road | PO 08 (400) | — |
| 02 | booked | fcl20 | PO 11 (no line yet) | `booking_confirmed_on current_date - 2`, etd `+5`, eta `+30` |
| 03 | loaded | lcl | PO 06 (1000) | etd `current_date + 1`, eta `+28` |
| 04 | in_transit | fcl40 | PO 07 (4000) | etd `-5`, eta `current_date + 9` |
| 05 | in_transit | fcl40 | PO 05 (800) | etd `-30`, eta `current_date - 4`; 4 `shipment_event` rows (steps 1–4, `happened_at now() - 30/20/10/5 days`) |
| 06 | at_customs | fcl20 | PO 06 (1000) | eta `-2` |
| 07 | delivered | road | PO 06 (1000) | `delivered_at now() - 1 day`, `dispute_deadline_at` = delivered_at + 48 h (CN1) |
| 08 | accepted | courier | PO 08 (600) | `delivered_at now() - 5 days`, `accepted_on current_date - 3`, `accepted_by` baris, `quantity_matches` TRUE, `has_damage` FALSE; signed `delivery_receipt` doc |
| 09 | disputed | air | PO 09 (2000) | `delivered_at now() - 4 days`, `has_damage` TRUE, `dispute_deadline_at` set |
| 10 | cancelled | lcl | — | — |

Documents of step 06 (`5eed0006-…-2NN`): packing_list (04, draft), commercial_invoice (04, signed), bill_of_lading (05, signed), customs (06, draft), delivery_receipt (08, signed).

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'box.shipments_in_transit', s FROM unnest(ARRAY['loaded', 'in_transit', 'at_customs']) s WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE tenant_id = pg_temp.moesa() AND status::TEXT = s);
SELECT 'box.shipments_late' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE shipment_id = '5eed0006-0000-4000-8000-000000000005' AND overdue);
SELECT 'm8.eta_ahead' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_shipment WHERE shipment_id = '5eed0006-0000-4000-8000-000000000004' AND NOT overdue);
SELECT 'm8.dispute_running' WHERE NOT EXISTS (SELECT 1 FROM public.shipment WHERE id = '5eed0006-0000-4000-8000-000000000007' AND dispute_deadline_at > now());
SELECT 'm8.events' WHERE (SELECT count(*) FROM public.shipment_event WHERE shipment_id = '5eed0006-0000-4000-8000-000000000005') < 3;
SELECT 'm7.partially_received' WHERE NOT EXISTS (SELECT 1 FROM public.purchase_order_line l WHERE l.purchase_order_id = '5eed0005-0000-4000-8000-000000000008'
   AND (SELECT sum(sl.quantity) FROM public.shipment_line sl JOIN public.shipment s ON s.id = sl.shipment_id AND s.status = 'accepted' WHERE sl.purchase_order_line_id = l.id) < l.quantity);
SELECT 'feed.step06_yesterday' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND table_name = 'shipment' AND since = 'yesterday');
```

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 6 ids and the shipment `enum.gap` lines.

- [ ] **Step 3: Implement step 06**

Begin as koordinator / MOESA LTD. For each shipment:
1. Insert it (planned is forced).
2. Add the PO link and the lines **while the shipment is planned**. Each line stays within the cap `floor(qty × (1 + tolerance_pct/100))`, summed over shipments.
3. Under `story_bypass(TRUE)`, one UPDATE per shipment to the target status, with the fields of the table. Then `story_bypass(FALSE)`.

The events and documents follow. `story_end('1 day')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story shipments in every status`

---

### Task 7: Market cells (step 07)

**Files:**
- Modify: `supabase/seed_story.sql` (step 07, helper `story_cell` + DROP), `supabase/seed_story.check.sql` (section "Task 7"; flip the [7] rows)

**Interfaces:**
- Produces:
  - `private.story_cell(id UUID, sku TEXT, platform TEXT, country TEXT, path public.market_cell_status[], fields JSONB DEFAULT '{}') RETURNS VOID`.
    - It inserts the cell (forced candidate) with `fields` applied through `jsonb_populate_record`. `fields` carries:
      - the live fields `platform_product_id`, `platform_sku`, `price`, `currency`, `stock_source`, `content_status`
      - `open_issue` for suppressed
      - `notes` for stopped/removed
      - `compliance`, `compliance_note` for yellow/red
    - It then runs one UPDATE per element of `path`, in order, **without** the flag. The real S05 order: candidate → planned → preparing → uploaded → live → suppressed/stopped; candidate → paused/removed.
  - Cell ids `5eed0007-…-NN`:

| NN | sku | platform/country | path (after candidate) | compliance | other |
|---|---|---|---|---|---|
| 01 | THO-MOP40-2P | amazon DE | planned, preparing, uploaded, live | green | stock `customer_warehouse` |
| 02 | THO-MOP40-2P | amazon FR | … live | yellow + note | stock `pan_eu` |
| 03 | THO-MOP40-2P | amazon IT | planned, preparing | pending | content `translated` |
| 04 | THO-MOP40-2P | amazon ES | planned, preparing, uploaded | green | — |
| 05 | THO-MOP40-2P | amazon NL | … uploaded, live, suppressed | green | `open_issue` "OA-06 …" |
| 06 | THO-TIPS-6-50 | amazon ES | planned | green | content `en_master` |
| 07 | THO-TIPS-6-50 | amazon IT | … live, stopped | green | note |
| 08 | THO-TIPS-6-50 | kaufland DE | … live | green | stock `3pl` |
| 09 | THO-CONES-100 | amazon PL | (none) | red + note | content `none` |
| 10 | THO-CONES-100 | ebay DE | paused | green | — |
| 11 | THO-CONES-100 | otto DE | removed | green | note |
| 12 | KRN-VASE-01 | bol NL | … live | green | stock `platform` |
| 13 | KRN-VASE-01 | kaufland AT | planned | green | — |

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'box.market_summary', c FROM unnest(ARRAY['THO', 'KRN']) c WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_market WHERE tenant_id = pg_temp.moesa() AND customer_code = c AND target_count >= 1);
SELECT 'm9.red_candidate' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE id = '5eed0007-0000-4000-8000-000000000009' AND status = 'candidate' AND compliance = 'red' AND compliance_note IS NOT NULL);
SELECT 'm9.suppressed_issue' WHERE NOT EXISTS (SELECT 1 FROM public.market_cell WHERE tenant_id = pg_temp.moesa() AND status = 'suppressed' AND open_issue IS NOT NULL);
SELECT 'feed.step07_last_week' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND table_name = 'market_cell' AND since = 'last_week');
```

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 7 ids and the cell `enum.gap` lines.

- [ ] **Step 3: Implement step 07**

Begin as koordinator / MOESA LTD and call `story_cell` for rows 01–13. `launched_on` is set by the guard (today); that is accepted, so no flag is needed. `story_end('3 days')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story market cells across every status`

---

### Task 8: Incidents (with the G3 rollback) and change requests (step 08)

**Files:**
- Modify: `supabase/seed_story.sql` (step 08), `supabase/seed_story.check.sql` (section "Task 8"; flip the [8] rows and `project_gate.status`; delete `m5.variant_g3_passed`)

**Interfaces:**
- Consumes: shipment, PO, project, product and cell ids; `story_doc`; label_artwork v1 `5eed0003-…-30`.
- Produces incident ids `5eed0008-…-0N` and CR ids `5eed0008-…-1N`. Everything below runs through the **real** guards as akif: flag off, `opened_at` given on insert, statuses walked open → contained → closed, one per UPDATE.

| NN | family / type | sev | final status | opened_at | entity | specifics |
|---|---|---|---|---|---|---|
| 01 | ol / OL-02 | s1 | open | `now() - 5 hours` | shipment 02 | no `management_notified_at`, no `customer_notified_at` (notice due = opened + 4 h → late) |
| 02 | ol / OL-05 | s2 | contained | `now() - 4 days` | shipment 09 | management told `now() - 4 days + 1 hour`, customer told; `incident_deadline` kind `supplier_damage` (due from defaults: opened + 48 h → past); `incident_log` with `cost_amount 350`, `cost_currency 'EUR'`, `cost_payer 'carrier_insurance'`, `customer_approved` TRUE |
| 03 | ol / OL-09 | s3 | closed | `now() - 60 days` | shipment 06 | outcome `full_recovery`, root_cause `carrier`, preventive_action |
| 04 | ol / OL-09 | s3 | open | `now() - 10 days` | shipment 07 | repeat of 03 within 90 days |
| 05 | ot / OT-04 | s2 | contained | `now() - 3 days` | purchase_order 03 | management and customer told; the rollback incident |
| 06 | oa / OA-02 | s3 | open | `now() - 1 day` | market_cell 05 | `incident_deadline` kind `document_request` (due from defaults) |
| 07 | ou / OU-01 | s1 | closed | `now() - 20 days` | product THO-TIPS-6-50 | management told; closed by akif with outcome `partial_recovery`, root_cause `supplier`, preventive_action |
| 08 | om / NULL | s3 | open | `now() - 2 days` | project pilot | unclassified |

| NN | source | urgency | final status | kinds | project / gate | specifics |
|---|---|---|---|---|---|---|
| 11 | customer | normal | open | {packaging, design} | — | products MOP40-2P + MOP40-3P |
| 12 | company | urgent | open | {deadline} | — | `decision_due_on = current_date - 2` with `change_request_due` disabled for that UPDATE only |
| 13 | customer | normal | approved | {spec, content} | project 01 / `PL_G1` | `customer_approved_on current_date - 3`; signed `change_request` doc on this CR as `customer_approval_document_id` |
| 14 | supplier | normal | rejected | {price, supplier} | — | `decision_note` |
| 15 | regulation | normal | applied | {packaging} | project 04 | `affected_document_id` = label_artwork v1; `result_document_id` = new label_artwork v2 of CONES-100 (signed) |

- [ ] **Step 1: Write the failing weekday assertion and checks**

Weekday assertion (in the check file; it pins Review Focus 1). For any reset day `d` of a week, the offsets used keep their sense:

```sql
SELECT 'dates.weekday', d::TEXT FROM generate_series(current_date, current_date + 6, INTERVAL '1 day') AS g (d)
WHERE NOT (public.add_business_days(d::DATE - 1, 5) >= d::DATE + 2       -- document_request opened D-1 stays ahead
       AND public.add_business_days(d::DATE, 5) >= d::DATE + 2            -- CR normal stays ahead
       AND (public.add_business_days(d::DATE, 0) + TIME '23:59:59') > d::DATE - 2); -- s2 notice due never before the story's past dates
```

Checks:

```sql
SELECT 'box.incidents_open' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE tenant_id = pg_temp.moesa() AND management_notice_missing);
SELECT 'm10.notice_late' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE incident_id = '5eed0008-0000-4000-8000-000000000001' AND customer_notice_late);
SELECT 'm10.deadline_past' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_incident WHERE incident_id = '5eed0008-0000-4000-8000-000000000002' AND overdue_deadline_count > 0);
SELECT 'm10.doc_request_ahead' WHERE NOT EXISTS (SELECT 1 FROM public.incident_deadline WHERE incident_id = '5eed0008-0000-4000-8000-000000000006' AND kind = 'document_request' AND due_at > now());
SELECT 'm10.repeat' WHERE (SELECT count(*) FROM public.incident WHERE tenant_id = pg_temp.moesa() AND incident_type = 'OL-09' AND opened_at > now() - INTERVAL '90 days') < 2;
SELECT 'm10.unclassified' WHERE NOT EXISTS (SELECT 1 FROM public.incident WHERE id = '5eed0008-0000-4000-8000-000000000008' AND family = 'om' AND incident_type IS NULL);
SELECT 'm10.cost_log' WHERE NOT EXISTS (SELECT 1 FROM public.incident_log WHERE incident_id = '5eed0008-0000-4000-8000-000000000002' AND cost_payer = 'carrier_insurance');
SELECT 'm10.entity_kinds', k FROM unnest(ARRAY['project', 'purchase_order', 'shipment', 'product', 'market_cell']) k WHERE NOT EXISTS (SELECT 1 FROM public.incident WHERE tenant_id = pg_temp.moesa() AND entity_type = k);
SELECT 'm10.closed_by_management' WHERE NOT EXISTS (SELECT 1 FROM public.incident i JOIN public.user u ON u.id = i.closed_by AND u.email = 'akif@moesa-panel.test' WHERE i.id = '5eed0008-0000-4000-8000-000000000007' AND i.closed_on IS NOT NULL);
SELECT 'm5.rolled_back' WHERE NOT EXISTS (SELECT 1 FROM public.project_gate WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND code = 'G3' AND status = 'rolled_back' AND rolled_back_incident_id = '5eed0008-0000-4000-8000-000000000005');
SELECT 'm5.variant_waits_customer' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_gate_pending WHERE project_id = '5eed0004-0000-4000-8000-000000000002' AND gate_code = 'G3' AND needs_customer_approval);
SELECT 'box.change_requests_open' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE tenant_id = pg_temp.moesa() AND overdue)
   OR NOT EXISTS (SELECT 1 FROM public.dashboard_change_request WHERE tenant_id = pg_temp.moesa() AND NOT overdue);
SELECT 'm10.cr_applied_version' WHERE NOT EXISTS (SELECT 1 FROM public.change_request r JOIN public.document a ON a.id = r.affected_document_id JOIN public.document b ON b.id = r.result_document_id
   WHERE r.id = '5eed0008-0000-4000-8000-000000000015' AND r.status = 'applied' AND b.version > a.version AND b.type = a.type AND b.entity_id = a.entity_id);
SELECT 'm10.cr_trigger_on' WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'change_request_due' AND tgenabled = 'O');
SELECT 'feed.step08_today' WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND since = 'today' AND table_name IN ('incident', 'change_request'));
```

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 8 ids (`dates.weekday` is green already) and the incident/CR `enum.gap` lines plus `project_gate.status=rolled_back`.

- [ ] **Step 3: Implement step 08**

Begin as akif / MOESA LTD and insert incidents 01–08 (codes from the trigger), then walk their statuses. Then:
- `PERFORM public.rollback_gate(<variant G3 id>, 'PI tutarsızlığı (OT-04)', '5eed0008-…-05')`, while incident 05 is contained (not closed).
- The CRs: insert open, then UPDATE to approved/rejected; for 15, approved, then insert the v2 label_artwork, then applied.
- For 12: `ALTER TABLE public.change_request DISABLE TRIGGER change_request_due; UPDATE … SET decision_due_on = current_date - 2 …; ALTER TABLE public.change_request ENABLE TRIGGER change_request_due;` all inside this block.

`story_end('0')`.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story incidents, the G3 rollback and change requests`

---

### Task 9: Media rows, remaining documents, the 12 MB edge (step 09)

**Files:**
- Modify: `scripts/seed-story.mjs` (fill `MEDIA`, upload the generated PDF), `supabase/seed_story.sql` (step 09, helper `story_media` + DROP), `supabase/seed_story.check.sql` (section "Task 9"; flip the [9] rows)

**Interfaces:**
- Produces:
  - `private.story_media(id UUID, customer_id UUID, title TEXT) RETURNS UUID`. Inserts `public.media` with `storage_path` = the one object under `<tenant>/<id>/` that is not in `thumb/`, and `thumbnail_path` = `<tenant>/<id>/thumb/thumb.webp` when that object exists, else NULL. It raises `story: media % not uploaded` when no object is found.
  - `MEDIA` (script) and the matching ids in SQL, `5eed0009-…-NN`:

| NN | source file → upload name | thumb | customer | used as |
|---|---|---|---|---|
| 01 | photo-1.png → mop-primary.png | thumb-1.webp | THO | `primary_image` on THO-MOP40-2P |
| 02 | photo-2.png → mop-gallery.png | — | THO | `gallery` on THO-MOP40-2P |
| 03 | photo-3.png → production.png | thumb-3.webp | THO | `evidence_photo` on PO 06 |
| 04 | photo-2.png → damage.png | thumb-2.webp | THO | `evidence_photo` on shipment 09 |
| 05 | sample.pdf → pi.pdf | — | THO | cited by a `pi` doc (v2, approved, url + media) on PO 11 |
| 06 | sample.pdf → artwork.pdf | — | THO | `attachment` on CR 15 |
| 07 | sample.mp4 → demo.mp4 | — | THO | `gallery` on THO-TIPS-6-50 |
| 08 | photo-3.png → orphan.png | — | THO | unlinked |
| 09 | photo-1.png → catalogue.png | thumb-1.webp | NULL (shared) | `gallery` on THO-CONES-100 and KRN-VASE-01 |
| 10 | photo-2.png → vase.png | thumb-2.webp | KRN | `primary_image` on KRN-VASE-01 |
| 11 | `<generated:12MB>` → big-catalogue.pdf | — | THO | `attachment` on THO-MOP60-2P |

  - Remaining documents `5eed0009-…-2NN`. Every type and status the earlier steps did not produce:
    - tech_pack (product MOP40-3P, draft, media 06 + url = "both")
    - sample_report (product CONES-200, approved)
    - po (PO 02, signed)
    - technical_file (product TIPS-6-50, approved)
    - other (incident 02, draft)
    - certificate on CN1 with media 05 ("both"; supplier doc, customer NULL; skip media there if `media_customer_locked` refuses a THO file on a supplier, and use url only)
    - a document on `market_cell` 05 (other, draft)
    - a document on `project` 03 (other, signed)
    - packing_list v1 on shipment 08 backed by media 06 only (`url` NULL, approved): the "media only" kind

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'm19.objects', m.id::TEXT FROM public.media m WHERE m.tenant_id = pg_temp.moesa()
  AND (NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = m.storage_path)
       OR (m.thumbnail_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'media' AND o.name = m.thumbnail_path)));
SELECT 'm19.kinds', k FROM unnest(ARRAY['image/png', 'application/pdf', 'video/mp4']) k WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND mime_type = k);
SELECT 'm19.thumb_and_none' WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND thumbnail_path IS NULL AND mime_type LIKE 'image/%')
   OR NOT EXISTS (SELECT 1 FROM public.media WHERE tenant_id = pg_temp.moesa() AND thumbnail_path IS NOT NULL);
SELECT 'm19.shared_two_customers' WHERE NOT EXISTS (SELECT 1 FROM public.media m WHERE m.id = '5eed0009-0000-4000-8000-000000000009' AND m.customer_id IS NULL AND (SELECT count(*) FROM public.media_link l WHERE l.media_id = m.id) >= 2);
SELECT 'm19.unlinked' WHERE NOT EXISTS (SELECT 1 FROM public.media m WHERE m.id = '5eed0009-0000-4000-8000-000000000008' AND NOT EXISTS (SELECT 1 FROM public.media_link l WHERE l.media_id = m.id));
SELECT 'm19.cited_by_document' WHERE NOT EXISTS (SELECT 1 FROM public.document WHERE media_id = '5eed0009-0000-4000-8000-000000000005');
SELECT 'm19.oversized_edge' WHERE NOT EXISTS (SELECT 1 FROM public.media WHERE id = '5eed0009-0000-4000-8000-000000000011' AND size_bytes > 5 * 1024 * 1024 AND size_bytes <= 25 * 1024 * 1024);
SELECT 'm4.file_kinds', k FROM unnest(ARRAY['drive', 'media', 'both']) k
   WHERE NOT EXISTS (SELECT 1 FROM public.document d WHERE d.tenant_id = pg_temp.moesa() AND CASE k WHEN 'drive' THEN d.url IS NOT NULL AND d.media_id IS NULL WHEN 'media' THEN d.url IS NULL AND d.media_id IS NOT NULL ELSE d.url IS NOT NULL AND d.media_id IS NOT NULL END);
SELECT 'feed.step09_older' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction WHERE tenant_id = pg_temp.moesa() AND table_name = 'media' AND now()::DATE - created_at::DATE > 7);
```

The `media` kind comes from the media-only packing_list on shipment 08 in the list above.

- [ ] **Step 2: Run red** — Expected: exit 1, with the Task 9 ids and the document/media_link `enum.gap` lines (every document type, status and entity kind not produced yet).

- [ ] **Step 3: Fill `MEDIA`, upload thumbnails to `<tenant>/<id>/thumb/thumb.webp` and the generated PDF, then implement step 09**

Begin as baris / MOESA LTD: `story_media` for 01–11, the links, then the documents. `story_end('30 days')`.

- [ ] **Step 4: Run green** — Expected: exit 0, and a signed URL of media 01 shows the PNG in the browser (Media page).

- [ ] **Step 5: Commit** — `feat(seed): story media with real files and every document kind`

---

### Task 10: KRN copy into MOESA Europe, refused-move situations (step 10)

**Files:**
- Modify: `supabase/seed_story.sql` (step 10), `supabase/seed_story.check.sql` (section "Task 10")

**Interfaces:**
- Consumes: KRN (`5eed0002-…-01`) with its products, project 08, PO 12, cells 12–13, media 09–10; Trading `media_max_mb = 5`; media 11.
- Produces: one `public.transfer` row in MOESA Europe (`customer_id` = KRN, mode `copy`, path `copy`, `files_status = 'pending'`). In the check file, `pg_temp.decide(source UUID, target UUID, customer UUID, mode TEXT, product_ids UUID[] DEFAULT NULL) RETURNS JSONB`: the decision loop below, so the step and the checks share one rule.

- [ ] **Step 1: Write the failing checks**

```sql
SELECT 'm21.copy_pending' WHERE NOT EXISTS (SELECT 1 FROM public.transfer t JOIN public.customer c ON c.id = t.customer_id AND c.code = 'KRN'
   WHERE t.tenant_id = pg_temp.tenant('MOESA Europe') AND t.mode = 'copy' AND t.path = 'copy' AND t.files_status = 'pending' AND jsonb_array_length(t.files) > 0);
SELECT 'm21.not_revertable' WHERE NOT EXISTS (SELECT 1 FROM public.audit_transaction a WHERE a.tenant_id IN (pg_temp.moesa(), pg_temp.tenant('MOESA Europe')) AND public.audit_transfer_locked(a.id));
SELECT 'm21.tho_transferable' WHERE EXISTS (SELECT 1 FROM public.transfer t JOIN public.customer c ON c.id = t.customer_id WHERE c.code = 'THO');
-- situations (as the user who meets them)
SELECT 'm21.files_pending' WHERE (SELECT pg_temp.act_as('akif@moesa-panel.test', 'MOESA Europe')) IS NULL
   AND private.transfer_refusal(pg_temp.tenant('MOESA Europe'), pg_temp.moesa(), 'copy', (SELECT t.target_customer_id FROM public.transfer t WHERE t.tenant_id = pg_temp.tenant('MOESA Europe'))) IS DISTINCT FROM 'transfer_files_pending';
SELECT 'm21.owner_required' WHERE (SELECT pg_temp.act_as('akif@moesa-panel.test', 'MOESA LTD')) IS NULL
   AND private.transfer_refusal(pg_temp.moesa(), pg_temp.tenant('MOESA Trading GmbH'), 'copy', (SELECT id FROM public.customer WHERE code = 'THO' AND tenant_id = pg_temp.moesa())) IS DISTINCT FROM 'transfer_owner_required';
SELECT 'm21.product_in_use' WHERE (SELECT pg_temp.act_as('akif@moesa-panel.test', 'MOESA LTD')) IS NULL
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.transfer_customer(pg_temp.moesa(), pg_temp.tenant('MOESA Europe'), (SELECT id FROM public.customer WHERE code = 'THO' AND tenant_id = pg_temp.moesa()), 'move',
                     product_ids => ARRAY[(SELECT id FROM public.product WHERE sku = 'THO-CONES-100' AND tenant_id = pg_temp.moesa())]) -> 'left_behind') b);
SELECT 'm21.media_too_large', e FROM pg_temp.copy_error('baris@moesa-panel.test', 'MOESA LTD', 'MOESA Trading GmbH', 'THO') e
   WHERE e NOT LIKE '%media_too_large%';
```

`act_as` returns VOID, so `(SELECT …) IS NULL` is TRUE and only sequences the call. `pg_temp.copy_error(email TEXT, source_name TEXT, target_name TEXT, customer_code TEXT) RETURNS TEXT` does the following:
1. `act_as(email, source_name)`.
2. `d := pg_temp.decide(source, target, customer, 'copy')`.
3. `h :=` the dry run's `report_hash` with `d`.
4. Return `pg_temp.error_of(format('SELECT public.transfer_customer(%L::UUID, %L::UUID, %L::UUID, %L, decisions => %L::JSONB, dry_run => FALSE, report_hash => %L)', source, target, customer, 'copy', d, h))`.

- [ ] **Step 2: Run red** — Expected: exit 1, with all `m21.*` ids except `m21.tho_transferable` failing.

- [ ] **Step 3: Implement step 10**

Begin as akif / MOESA LTD. Build the decisions like `pg_temp.decide_all` in `043_transfer_copy.test.sql`: rehearse, then for every conflict whose `actions` do not already hold a decision map its `key`:
- `gtin` → `{"action": "clear_gtin"}`
- `code` → `{"action": "new_code"}`
- `media_link` → `{"action": "demote"}`
- else `{"action": "map", "target_id": existing_id}`

Repeat until a rehearsal adds nothing (at most 5 rounds, else raise). Then `report_hash := (rehearsal with the decisions) ->> 'report_hash'` and `PERFORM public.transfer_customer(moesa, europe, krn, 'copy', decisions => d, dry_run => FALSE, report_hash => report_hash)`.

No `story_end`: the transfer's audit transactions stay at now() and stay locked. Then the trailing `DROP FUNCTION` list.

- [ ] **Step 4: Run green** — Expected: exit 0.

- [ ] **Step 5: Commit** — `feat(seed): story copy of KRN into MOESA Europe with pending files`

---

### Task 11: README, guide-page coverage, full verification

**Files:**
- Create: `supabase/README.md`
- Modify: `supabase/seed_story.check.sql` (section "Task 11")

- [ ] **Step 1: Write the final checks**

```sql
SELECT 'enum.pending', tbl || '.' || col FROM story_enum_column WHERE rule = 'pending';
SELECT 'feed.bands', b FROM unnest(ARRAY['today', 'yesterday', 'last_week', 'older']) b WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_notification_feed WHERE tenant_id = pg_temp.moesa() AND since = b);
-- guide pages (PAGE_GUIDES in app/src/constants/guide.ts): every business page has rows in MOESA LTD
SELECT 'guide.page', p FROM (VALUES ('setting', 'setting'), ('customer', 'customer'), ('supplier', 'supplier'), ('product', 'product'), ('project', 'project'),
   ('document', 'document'), ('media', 'media'), ('purchase_order', 'purchase_order'), ('shipment', 'shipment'), ('market_matrix', 'market_cell'),
   ('incident', 'incident'), ('change_request', 'change_request')) v (p, tbl)
   WHERE NOT pg_temp.has_rows(tbl);
```

`pg_temp.has_rows(tbl TEXT) RETURNS BOOLEAN` is dynamic `EXISTS (SELECT 1 FROM public.%I WHERE tenant_id = pg_temp.moesa())`; add it to the helpers. The `dashboard` guide page is covered by the 15 `box.*` checks (gates ×3, tasks ×2, evidence ×2, PO ×2, shipments ×2, incidents, change requests, market, notifications = `feed.bands`).

Add a check that **each** `DASHBOARD_BOXES` id has a query. The ids are gates_team, gates_management, gates_customer, tasks_overdue, tasks_due_soon, unsigned_skus, incomplete_compliance, po_action, po_production, shipments_in_transit, shipments_late, incidents_open, change_requests_open, market_summary, notifications. Grep the check file for `'box.<id>'`, with `box.notifications` mapped to `feed.bands`. Do this as Step 3 below, not in SQL.

- [ ] **Step 2: Write `supabase/README.md`** (new; English, short)

Sections:
1. **Two seeds.** `seed.sql` is small, asserted by pgTAP and loaded by `supabase db reset`. The story is `seed_story.sql`, loaded by `pnpm dev:seed-story`.
2. **Commands.** `pnpm dev:supabase-reset` (reset + story + types), `pnpm dev:seed-story`, `pnpm test:db` (resets to the small seed first). A failed or partial story run: `supabase db reset`.
3. **What each user sees.**
   - baris: owner, every box, Trading's 5 MB cap.
   - akif: management, the incidents he closed, the KRN copy in Europe, the transfer refusals.
   - koordinator: projects, tasks, cells, shipments.
4. **Refused-move situations and how to reproduce them.**
   - `transfer_product_in_use`: a product-only move of THO-CONES-100.
   - `transfer_files_pending`: transfer Europe's copy of KRN onward; a second MOESA LTD → Europe copy of KRN shows GTIN/code conflicts instead.
   - `transfer_owner_required`: akif calling `transfer_customer` into Trading; the picker never lists Trading for him.
   - `media_too_large`: baris copying THO into Trading.
5. **Adding a state when a module grows.** Matrix row → step block in `seed_story.sql` → check query (and a `story_enum_column` row for a new enum column) → `pnpm dev:supabase-reset`. Codes are never written down; ids follow `5eed00SS-…`.
6. **Sample files.** Where they are, the ffmpeg commands of Task 1 Step 1, < 500 KB each; the 12 MB PDF is generated.

- [ ] **Step 3: Verify the box list against the code**

Run: `node -e "const s=require('fs').readFileSync('supabase/seed_story.check.sql','utf8');for(const id of ['gates_team','gates_management','gates_customer','tasks_overdue','tasks_due_soon','unsigned_skus','incomplete_compliance','po_action','po_production','shipments_in_transit','shipments_late','incidents_open','change_requests_open','market_summary'])if(!s.includes(\"'box.\"+id+\"'\"))console.log('missing',id)"`. Also `grep -c "id: '" app/src/constants/dashboard.ts`.
Expected: no `missing` line, and `15`.

- [ ] **Step 4: Full run**

Run: `cd app && pnpm dev:supabase-reset`
Expected: exit 0, `seed-story: ok (…)`, types regenerated with no diff (`git diff --stat supabase/functions/_shared/database.types.ts` is empty).

- [ ] **Step 5: Run twice**

Run: `cd app && pnpm dev:seed-story; echo "exit=$?"`
Expected: `already loaded`, `exit=1`.

- [ ] **Step 6: The pgTAP suite still sees the small seed**

Run: `cd app && pnpm test:db`
Expected: the reset, then every test file `ok` (099, 038, 042–045 included).

- [ ] **Step 7: Browser walk** (`pnpm dev`, then sign in with `Demo1234!`)

| User | Where | Expected |
|---|---|---|
| baris | Dashboard | all 15 boxes non-empty; customer switch on the market box shows THO and KRN; notifications grouped today / yesterday / last week / older |
| baris | Products | MOP40-2P thumbnail; THO + KRN selection disables the transfer button (`open_disabled_mixed`) |
| baris | Media | previews of PNG, PDF and MP4; the orphan PNG deletable |
| baris | Transfer THO → MOESA Trading GmbH | run refused with the media-too-large message |
| akif | Transfer THO-CONES-100 only, move → MOESA Europe | the rehearsal lists it under left behind; the run is refused (`transfer_product_in_use`) |
| akif | MOESA Europe → Transfer KRN → MOESA LTD | refused, files pending |
| akif | MOESA Europe → Customers | KRN copy present; transfer detail shows files pending |
| akif | Feed | the transfer entry shows "cannot be reverted" |
| koordinator | Projects → pilot → pass G1 | refused, blocked by task |
| koordinator | Every guide page (13) | the page has rows; the guide card opens |

- [ ] **Step 8: Commit** — `docs(seed): README for the development story and the smoke check`

---

## Self-review notes

- **Spec coverage:**
  - Intent and goals → Tasks 2–10.
  - Constraints → Global Constraints.
  - "How it runs" → Task 1 (script, guard, keys, uploads, docker psql) and Task 11 (package scripts verified).
  - Smoke check → Task 1 skeleton plus each task's section.
  - Order inside the SQL → the step table (with Call 3 moving the PI-gate passes after the POs).
  - Refused moves → Task 10 checks, README §4 and the browser walk.
  - 12 MB file → Tasks 9 and 10.
  - Documentation → Task 11.
  - Non-goals respected: no change to `seed.sql`, CI, `config.toml` or schema.
- **Matrix Section A states marked n/a** ("signed without official e-mail", "warehouse of another customer", "country outside the platform's list") are error states and are not seeded. `transfer_source_read_only` is dropped by the spec. "Transfer partial after check" is not seeded: `transfer_check_files` would turn pending into partial and remove the pending situation.
