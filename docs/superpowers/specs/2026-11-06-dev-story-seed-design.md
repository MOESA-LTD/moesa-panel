# Development story seed — design

Owner request (2026-11-06): "kaliteli bir seed" — during development every screen state should be
there after a reset, as one coherent story: order to shipment, incident to change request.

Research behind this document: the scenario matrix (168 states over 13 modules; 19 in today's
seed, 17 partial, 132 missing) and the story skeleton in the controller's scratchpad
(`seed-scenario-matrix.md`). The plan copies the skeleton's rows into its tasks; this document fixes
the decisions.

## Intent

A developer runs one command after `supabase db reset` and gets MOESA LTD filled with a connected
story around the demo customer THOMETZKI (THO): every status of every business table, every
dashboard box non-empty, every guide page with real rows behind it, the edge cases (overdue, late,
unsigned, oversized, pending files, refused transfers) in place, and dates that stay "overdue" on any
reset day. The existing small `seed.sql` stays as it is, because the pgTAP suite asserts its exact
contents.

## Goals

- Every state in the scenario matrix's Section A is represented by at least one row (the plan's
  checklist). Every dashboard box of `DASHBOARD_BOXES` has rows. Every guide page of `PAGE_GUIDES`
  has rows behind it.
- One coherent chain: THO products → projects with gates in several states → purchase orders in
  every status → shipments in every status → market cells in every state → incidents of every
  type/severity → change requests in every status → documents and media of every kind and status
  → feed entries in all four date bands → a completed copy transfer of KRN into MOESA Europe with
  pending files, plus the refused-move situations. THO itself is never transferred by the seed, so
  it stays transferable for development.
- Real rules wherever the rules allow it: rows pass through the real status transitions and the
  real gate rules (approval documents, signed specs, finished tasks, PI evidence), so the seed also
  proves the rules. Bypass is for backdating only.
- Repeatable: fixed UUIDs for story rows, names stable, dates relative to `now()`/`current_date`.
  A smoke check fails loudly when a later migration leaves a state empty.
- A second customer (fictional "Kernhaus Living GmbH", code KRN, Austria) so mixed-customer
  selections, the market box's customer switch and tenant-neutral screens have data. Stub
  customers LEA (lead), PAU (paused), CLS (closed).
- Media rows with real files behind them: sample files are uploaded to the local Storage bucket so
  previews and thumbnails work.

## Non-goals

- Changing `seed.sql`, the pgTAP suite or CI. The story is development-only.
- Loading the story into the staging project (Cloudflare previews). Possible later: the same script
  with staging credentials in the CI `staging` job. Needs a secret and the owner's go.
- Real customer data. KRN and the stubs are fictional; THO keeps only what the small seed already
  says about it.
- New users or tenants. The cast stays as `seed.sql` defines it (this also drops the
  `transfer_source_read_only` situation: reaching it would need a second company owned by selin and
  ops roles in Eski Ticaret, and `seed.sql` has already expired Eski before the story runs).
- New schema. No `valid_until` on documents (an old `issued_on` plays the "expired" certificate); no
  new tables, no new settings.
- Production or demo-presentation polish (copy, photos): the files are placeholders.

## Anti-goals

- A seed that works by switching the rules off wholesale (`DISABLE TRIGGER` everywhere, or raw
  final-status inserts). It would hide broken rules and drift from what the app can produce.
- A story that breaks `pnpm test:db`. Tests must still see the small seed.
- Hard-coded year-dependent codes (`PO-THO-2026-001`) in docs, checks or the app.

## Constraints

- Runs as `postgres` through the local Docker container (`supabase_db_moesa-panel`), like
  `seed.sql`: role `none`, RLS off, `request.jwt.claims` (sub) and `request.headers`
  (`x-tenant-id`) set with `set_config(..., TRUE)` so `auth.uid()`, code generation and the audit
  actor work. Never `SET ROLE authenticated` (it would switch the bypass off).
- `moesa.rules_bypass = '1'` (030/040) silences the business-rule guards for backdated transitions.
  It does not cover: forced first statuses (insert, then UPDATE under the flag and set the
  server-set fields explicitly); gate passes and rollbacks (meet the real rules); `decision_due_on` of a
  change request (`created_at` stays; the only sanctioned `ALTER TABLE … DISABLE TRIGGER change_request_due`, re-enabled
  in the same block, as test 038 does); media rows (need `storage.objects`, hence the real upload);
  the `transfer` row (call the real `public.transfer_customer` as akif); rows of a read-only company
  (insert before the subscription flips).
- One audit transaction per story step: `set_config('audit.transaction_id', '', TRUE)` between
  steps, then backdate `audit_transaction.created_at` into four bands (today, yesterday, last week,
  older).
- Dates: `current_date ± n` and `now() − interval`; margins ≥ 2 days around business-day rules;
  `spec_sheet_required_from` (2026-12-31) means every PO line cites a signed spec or is seeded under
  the flag.
- Names the tests look up stay unchanged: the three THO products, the pilot project (pending on G1),
  the five approved suppliers, the member list of MOESA LTD, MOESA Europe / Trading GmbH.
- Local Supabase CLI 2.9.6; `supabase db reset` loads only `sql_paths = ['./seed.sql']`.
- Tenant-neutral copy; no e-mails or personal data beyond the existing demo accounts (K8).

## Decisions

**Where it lives.** `supabase/seed_story.sql` (one file, sections per story step, each a `DO`
block that is its own audit transaction) plus `supabase/seed_files/` (small sample files: PNG
photos, a PDF, a short MP4) plus `scripts/seed-story.mjs` (Node, uses `@supabase/supabase-js`
from `app/`). `config.toml` is not changed.

**How it runs.**
- `pnpm dev:seed-story` (from `app/`): the script reads the local keys from
  `supabase status -o json`, refuses to run when customer KRN already exists (checked before any
  upload), looks up the tenant ids of MOESA LTD and KRN's tenant from the database (they are
  `gen_random_uuid()` in `seed.sql`), uploads the sample files and their thumbnails to the media
  bucket at the paths the SQL expects (`<tenant id>/<media id>/…`, thumbnails under the same tenant
  folder as 024 requires; the media ids are fixed UUIDs shared by script and SQL; a generated 12 MB
  PDF is uploaded but not committed), then runs `seed_story.sql` through `docker exec -i supabase_db_moesa-panel psql
  -v ON_ERROR_STOP=1`, then runs the smoke check.
- `pnpm dev:supabase-reset` becomes `supabase db reset && pnpm dev:seed-story && pnpm
  dev:supabase-types`.
- `pnpm test:db` becomes `supabase db reset && supabase test db` so local DB tests always run on
  the small seed, whatever the developer loaded before. Cost: one reset per DB test run.
- The story refuses to run twice: the script exits before uploading when customer KRN exists, and
  the SQL repeats the same guard.

**Smoke check.** `supabase/seed_story.check.sql`: one query per expectation (each matrix state,
each dashboard box, each guide page) that returns zero rows when satisfied; the script fails on any
output. It is the regression net when later migrations change rules.

**Order inside the SQL.** Customers and suppliers → products, specs and documents → projects,
tasks, gate approvals and passes (real rules) → purchase orders through their transitions (flag on
for backdating) → shipments → market cells → incidents (with the one G3 rollback) → change requests
(with the CR `decision_due_on` exception) → media rows and remaining documents → feed backdating → the
copy transfer of KRN into MOESA Europe as akif (rehearsal, then run with `report_hash`, `clear_gtin`
decisions), left with `files_status = 'pending'` because no client copies the files.

**Refused moves are situations, not rows.** The data makes them reproducible in the UI; nothing is
stored. The README and the smoke check name the real reproduction path of each:
- `transfer_product_in_use`: a product-only move of THO-CONES-100 (on a closed project, a closed PO
  and market cells).
- `transfer_files_pending`: the check matches the transfer's target tenant and target customer, so
  it fires when Europe's copy of KRN is transferred onward (for example to Trading), not on a second
  MOESA LTD → Europe copy. A second copy of KRN into Europe instead shows the GTIN/code conflicts.
- `transfer_owner_required`: akif (management, not owner) transferring into Trading.
- `media_too_large`: baris copying THO into Trading, whose `media_max_mb` setting is 5 (the cap is
  read from the root company, so the setting sits on Trading, never on a branch).

**The 12 MB file.** Generated by the script (padding bytes), uploaded, referenced by one media row
of THO; it is the oversized-cap edge for a copy into Trading and the only file above a few hundred
KB.

**Documentation.** A short section in `supabase/README.md` (create if missing): what the story
contains per user (baris/akif/koordinator), the two commands, how to add a state when a module
grows (matrix row → SQL → check query).

## Left to the builder

- The exact rows (codes, names, quantities, dates) — the skeleton in the matrix is the starting
  point; keep its intent (which state each row represents), adjust details to what the triggers
  accept.
- Helper functions inside the SQL (`private.story_*`, dropped at the end) to keep the file
  readable.
- Which sample files; keep each under 500 KB and license-free (generated or own).
- How the script finds `docker` and `supabase` on Windows and Linux (Git Bash and PowerShell both
  run it).

## Open for the owner

- Whether the story should also load into staging for Cloudflare previews (non-goal here).
- Review of the Turkish names and texts in the story (project titles, incident descriptions) once
  written; they are developer drafts.
