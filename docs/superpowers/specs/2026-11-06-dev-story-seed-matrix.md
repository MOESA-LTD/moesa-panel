# Seed scenario matrix — MOESA LTD / THOMETZKI (THO)

Read-only research, 2026-11-06, branch `feat/m21-transfer` (d8606fd). Sources: spec
`docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md` §6, `supabase/seed.sql` (349 lines),
`supabase/migrations/015…045`, `supabase/tests/database/*.test.sql`, `app/src/constants/dashboard.ts`,
`app/src/views/pages/dashboard/boxes/*`, `app/src/api/dashboard/index.ts`.

Legend for "today": **yes** = the seed has it, **partial** = some of it, **no** = missing.
"bypass" = `SELECT set_config('moesa.rules_bypass','1',TRUE)` while `current_setting('role') = 'none'`
and session_user is postgres (what `supabase db reset` runs the seed as). It only silences the
**business-rule guards**; code triggers, forced defaults and immutability rules still run (see §C).

Modules covered: M1, M2, M3, M4, M5, M6, M7, M8, M9, M10 (incidents + CRs), M19, M20, M21 — **13
modules**, plus a "core" table (tenants, roles, settings, audit feed). M11–M16 are Phase 3 with no
tables, so they are out of scope.

---

## Section A — per-module state matrix

### Core (tenants, roles, settings, audit feed)

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| Company on Enterprise, writable | MOESA LTD | yes | `subscription` updated last in block 1 so that branches go in while the trial plan allows them |
| Branch of MOESA with ops roles | MOESA Europe (akif = management) | yes | `private.seed_ops_roles` |
| Second company, same owner | MOESA Trading GmbH (baris owner) | yes | cross-company transfer needs owner of both |
| Read-only (expired) company | Eski Ticaret | yes (no business data) | business rows have to be inserted **before** the subscription UPDATE, or the writable check refuses them |
| Owner / management / coordinator users | baris / akif / koordinator | yes | 099 asserts the exact member list of MOESA LTD |
| Setting changed from default | e.g. Trading `media_max_mb` = 5 | no | `setting` row per root tenant (`private.default_settings`); for the oversized-cap edge |
| `management_gates` beyond G1 | default `["G1"]` | yes (default) | read by `private.management_gates` on the root tenant |
| Audit feed: today / yesterday / last_week / older groups | `audit_transaction` + `audit_log` | partial (one transaction, "today") | the whole DO block is **one** audit transaction (`audit.transaction_id` is transaction-local); see §C |
| Feed entry that cannot be reverted (transfer) | transfer's audit transaction | no | `audit_transfer_not_revertable`, comes for free with a real transfer run |

### M1 Customers

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| status `active` | THO | yes | — |
| status `lead` | LEA stub customer (no products) | no | code `^[A-Z]{3}$`, unique per tenant, immutable (`customer_code_immutable`) |
| status `onboarding` | KRN (second customer, see §B) | no | — |
| status `paused` | PAU stub | no | — |
| status `closed` with a project from before closing | CLS + 1 closed project | no | `customer_closed` refuses a new project → insert project first, then close the customer |
| C-G1 accepted (contract date + contract document) | THO `contract_accepted_on`, `contract_document_id` → `contract` doc | no | `customer_contract_guard`: contract fields only for a caller with update on settings (baris/owner OK); doc must exist first (RESTRICT FK both ways, deferrable since 041) |
| C-G1 missing (lead/onboarding) | LEA, KRN | no | — |
| each commercial model | THO trading_partner, KRN commercial_representative, PAU operations_partner | partial | enum `commercial_model` |
| packages multi-select incl. A0, A2, D | THO {A1,B,C,E}; KRN {A0,A2,C}; PAU {D} | partial | free TEXT[] |
| contacts of every role, with and without approval right | THO: Einkauf (can_approve) + Operations + Lager + Buchhaltung (no approve) | partial (1) | — |
| warehouse types own / third_party / fba, default + non-default | THO Rosbach own (default), "Rhenus 3PL" third_party, "FBA DE" fba | partial (own) | enum `warehouse_type` = own, third_party, fba; one default |
| platform accounts: authorized_user and none | THO amazon (authorized), kaufland (none) | partial | `platform_id` FK to `platform`; countries ⊆ platform countries is not enforced here |
| brands registered / pending | OKAEI registered + "OKAEI Pro" pending | partial | — |
| restricted Drive link, EU responsible person | THO fields | no | contract-guarded fields |

### M2 Suppliers

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| status `approved` | TR1, TR2, CN1, CN2, ID1 | yes | 099 asserts exactly these five approved |
| status `candidate` | CN3 "Ningbo Clean" | no | code unique per tenant; no delete |
| status `suspended`, still referenced by an archived product | TR3 | no | products → supplier RESTRICT |
| damage-notice hours set / NULL | CN1 48 h, others NULL | yes | feeds the shipment dispute deadline (shortest across the orders' suppliers) |
| supplier contacts | 1–2 per supplier | no | `supplier_contact`; transfer copies them (copy_only) |
| supplier documents (certificate, NNN contract) | CN1 certificate, TR1 contract | no | `document.entity_type = 'supplier'` |
| rating 1–5, last audit date, terms (storage, penalty) | TR1 rating 4, CN1 rating 2 | no | — |
| supplier shared by two customers | TR1 used by THO and KRN products | no | needed for transfer "supplier copy/map" demo |

### M3 Products

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| `on_sale` | MOP40-2P, TIPS-6-50, CONES-100 | yes | 099 asserts 3 on_sale THO products |
| `concept` | THO-MOP60-2P | no | GTIN optional; concept counts as not active for evidence |
| `development` | THO-MOP40-3P (variant of MOP40-2P) | no | `parent_id` composite FK to same tenant |
| `approved` | THO-TIPS-6-100 | no | — |
| `ordering` | THO-CONES-200 | no | — |
| `paused` | THO-BRUSH-1 | no | — |
| `archived` reusing an active GTIN | THO-MOP40-2P-OLD with 4260696025800 | no | GTIN unique among non-archived **globally** (partial index): insert as archived, or insert with another GTIN then archive |
| variant tree (parent + 2 variants) | MOP40-2P → MOP40-3P, MOP40-4P | no | — |
| compliance none / partial / complete | each at least once | partial (partial, complete) | enum `compliance_status` |
| signed spec / unsigned spec / no spec | MOP40-2P signed; MOP40-3P draft spec; BRUSH-1 none | partial | `product_evidence` reads the highest signed/approved spec |
| hazmat flag, HS code, origin | TIPS-6-50 hazmat (activated carbon) | no | — |
| full dimensions / pallet data | MOP40-2P | no | — |
| primary image thumbnail in list | MOP40-2P primary image | no | needs media + storage object (M19) |
| product of second customer (mixed selection) | KRN-VASE-01, KRN-VASE-02 | no | SKU unique per customer, GTIN global |

Valid GTIN-13s for new rows (check digit computed): 4260696025855, 4260696025862,
4260696025879, 4260696025886, 4260696025893, 4260696025909, 4260696025916, 4260696025923,
4260696025930. Keep the existing `private.gtin_valid` loop over every GTIN.

### M4 Documents

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| spec_sheet `signed` | MOP40-2P v2 | yes | `document_signed_requires`: signed, stamped, official e-mail, issued_on |
| spec_sheet `superseded` by a newer version | MOP40-2P v1 (insert v1 first, then v2) | no | `document_supersede` supersedes older versions of the same record+type on insert; `document_superseded_sticky` |
| spec_sheet `draft` (unsigned) | MOP40-3P v1 draft, TIPS-6-50 v1 draft | no | — |
| spec_sheet `approved` | TIPS-6-100 v1 | no | approved spec needs the same four signed fields (023) |
| every one of the 21 types at least once | see §B | partial (1 type) | entity check (`document_check_entity`) per entity_type; versions unique per tenant+record+type |
| document backed by media (`media_id`) / Drive only / both | PI as PDF media; spec via Drive; certificate both | no | `document_has_file` (url or media_id); `document_check_media`: customer's file only on that customer's document |
| document on each entity kind | customer, supplier, product, project, project_gate, purchase_order, shipment, incident, market_cell, change_request | partial (product) | `market_cell` / `change_request` enum values added in 034 |
| "expired" document (certificate past validity) | — | no | **no validity column exists** → see §D |
| signed without official e-mail (refused) | — | n/a | cannot be seeded; error-state only |

### M5 Projects, phases, gates, tasks

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| npi / a_sourcing / A1 (G1→G5) waiting on G1 (management box) | "Mop ailesi çok ülke pilotu" | yes | 099 asserts the pilot waits on G1; G1 ∈ `management_gates` |
| npi / b_private_label / A2 (G1→PL_G1…PL_G4→G3…) mid-way | "OKAEI fırça private label" | no | gates from `public.gates_for`; can't insert gates |
| variant (G2→G5) | "MOP40 3'lü varyant" | no | — |
| revision | "CONES-100 ambalaj revizyonu" (from the applied CR) | no | — |
| reorder (G3→G5) | "Karbon filtre tekrar siparişi" | no | G3 needs an approved PI of a project PO |
| only A0 (PL_G1→PL_G2) | KRN "Konsept vazo" | no | — |
| only B (G5) | "THO lojistik Q1" | no | — |
| package C add-on (L_G1, L_G2) | pilot (has C) | yes (pending) | — |
| gate `passed` with approval + evidence | private-label G1, PL_G1; reorder G3 | no | `project_gate_guard` (no bypass!): order, (M) needs `customer_approved_on` + `gate_approval` doc of that gate, G2 signed specs, G3 PI, blocking tasks done (`gate_evidence_blocking` = true) |
| gate `rolled_back` via incident | variant G3 rolled back by OT-04 | no | needs an **open** incident of the customer at rollback time; reason required; later gates not passed |
| waiting on a customer gate (customer box) | variant waiting on G3 (M) | no | `needs_customer_approval` |
| waiting on G4 (team box: the only non-(M) gate) | reorder waiting on G4 | no | — |
| waiting N days (old project / old passed_at) | reorder G3 passed 12 days ago | no | `waiting_days` from previous `passed_at` or `project.created_at`; `passed_at` keeps a given value (`coalesce`) |
| project status on_hold / closed / cancelled | 3 projects | no | `project_not_active` for passes; set after passes |
| phase `closed` (all gates passed) | "Cones ilk sipariş" closed | no | each pass via the guard |
| tasks todo / doing / done / blocked | checklist rows | no | tasks come from `task_template` when phases are entered; update them |
| task overdue, due within 5 days | due_on = current_date − 3, + 2 | no | `dashboard_task_due` (current_date UTC) |
| blocking task not done (gate refused) | pilot G1 blocking task todo | partial (templates) | — |
| unassigned task / non-member assignee | assignee NULL / akif in Europe | no | — |

### M6 Dashboard (15 boxes, `DASHBOARD_BOXES`)

| Box id | Feed | Non-empty needs | Today |
|---|---|---|---|
| gates_team | `dashboard_gate_pending`, not management, not customer | an active project waiting on G4 | no |
| gates_management | same, `needs_management` | pilot on G1 | yes |
| gates_customer | same, `needs_customer_approval` | variant on G3 | no |
| tasks_overdue | `dashboard_task_due.overdue` | task due in the past, project active | no |
| tasks_due_soon | same, not overdue | task due ≤ 5 days | no |
| unsigned_skus | `dashboard_product_evidence.unsigned_sku_count` | active SKU w/o signed spec | yes (2) |
| incomplete_compliance | active − compliance_complete | active SKU without complete compliance | yes (2) |
| po_action | `dashboard_purchase_order` sent / pi_received / pi_approved | 3 POs | no |
| po_production | deposit_paid / in_production / ready / balance_paid | 4 POs, balance date past | no |
| shipments_in_transit | `dashboard_shipment` loaded / in_transit / at_customs | 3 shipments | no |
| shipments_late | `overdue` = ETA < today and not delivered | in_transit with ETA −4 | no |
| incidents_open | `dashboard_incident` not closed; urgent = s1/s2 without management notice | open s1 unreported | no |
| change_requests_open | `dashboard_change_request` open + approved, late flag | 2–3 CRs | no |
| market_summary | `dashboard_market` per customer, target ≥ 1 | THO + KRN cells | no |
| notifications | `dashboard_notification_feed` grouped by `since` | backdated audit transactions | partial |

Empty-box state ("Yok") is shown by any user of a tenant without data (e.g. Europe before the transfer, or Atlas).

### M7 Purchase orders

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| draft (a line without spec → "missing spec") | PO-…-001 | no | code trigger forces `status = 'draft'` on insert (ignores bypass) |
| sent | PO-…-002 | no | lines required; spec per line when `po_line_needs_spec` (new SKU, or any SKU from `spec_sheet_required_from` = 2026-12-31) |
| pi_received with PI figures that **differ** (diff shown) | PO-…-003 | no | PI doc (type `pi`, entity this PO) + total; arithmetic checked only at pi_approved |
| pi_approved | PO-…-004 | no | 30 S09 items "ok" + arithmetic; locks terms/lines from here |
| deposit_paid | PO-…-005 | no | paid deposit payment |
| in_production with production updates + photos | PO-…-006 | no | `purchase_order_update`; photos = media_link `evidence_photo` |
| ready with **overdue balance** (balance planned −10 d, unpaid) | PO-…-007 | no | — |
| balance_paid, **partially received** (one shipment accepted, one planned) | PO-…-008 | no | `shipment_quantity_exceeds_po` cap: floor(qty × (1 + tolerance)) |
| closed | PO-…-009 | no | closed orders' payments/updates frozen (`po_closed`) |
| cancelled | PO-…-010 | no | — |
| deposit rate 0 (pi_approved → in_production, no deposit step) | PO-…-011 | no | — |
| PSI missing before balance (warning) | PO-…-007 no approved psi_report | no | warning only (`psi_missing_po_codes`) |
| paid by customer vs company | balance of 008 paid_by customer | no | `payment_payer` = company / customer |
| PO of second customer | PO-KRN-…-001 | no | lines' products must be the order's customer |

All statuses past draft need bypass (or a full legitimate walk: 30 checklist keys, PI doc, payments). Bypass is the realistic route.

### M8 Shipments

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| planned | SHP-…-001 | no | code trigger forces `planned` |
| booked | SHP-…-002 | no | ≥1 PO (pi_approved…balance_paid) + `booking_confirmed_on` |
| loaded | SHP-…-003 | no | ≥1 line; locks POs/lines from here |
| in_transit, ETA in the future | SHP-…-004 (fcl40, ETA +9) | no | ETD + ETA |
| in_transit, **ETA passed** (late box) | SHP-…-005 (ETA −4) | no | `overdue` in `dashboard_shipment` |
| at_customs | SHP-…-006 | no | — |
| delivered, dispute deadline running | SHP-…-007 | no | entering delivered fills `dispute_deadline_at` = delivered_at + min supplier damage hours (CN1: 48 h) — with bypass, fill it yourself |
| accepted (G5 evidence) | SHP-…-008 (part of PO-008) | no | signed/approved `delivery_receipt`, quantities match, no damage |
| disputed (damage) + OL-05 incident | SHP-…-009 | no | — |
| cancelled | SHP-…-010 | no | only from planned/booked |
| events (S15 log) | 3–5 `shipment_event` rows on 004/005 | no | — |
| each mode | fcl20, fcl40, lcl, road, courier, air spread across rows | no | enum `shipment_mode` |
| warehouse of another customer (refused) | — | n/a | FK includes customer_id |

### M9 Market matrix

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| candidate | CONES-100 amazon PL | no | insert forces candidate; only candidates are deleted |
| planned | TIPS-6-50 amazon ES | no | — |
| preparing | MOP40-2P amazon IT | no | — |
| uploaded | MOP40-2P amazon ES | no | counted as "preparing" in the box |
| live (several markets) | MOP40-2P amazon DE, FR; TIPS-6-50 kaufland DE | no | platform product id, platform SKU, price + currency, stock source, content `approved` (L-G1) |
| suppressed | MOP40-2P amazon NL (open issue OA-06) | no | `open_issue` required |
| paused | CONES-100 ebay DE | no | — |
| stopped | TIPS-6-50 amazon IT (note) | no | note required; final |
| removed | CONES-100 otto DE (note) | no | note required |
| compliance red (only candidate/stopped/removed) | CONES-100 amazon PL red + note | no | `market_cell_compliance_red` |
| compliance yellow / pending | with note / without | no | yellow/red need a note |
| country outside the platform's list (refused) | — | n/a | `market_cell_country_invalid` |
| second customer's cells | KRN bol NL live, KRN kaufland AT planned | no | market box needs ≥2 customers to show the customer switch |

### M10 Incidents

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| family ol / oa / ou / ot / om | one each at least | no | code `<FAM>-THO-YYYY-NNN` from trigger; `incident_type` ~ `^(OL|OA|OU|OT|OM)-[0-9]{2}$` of the same family |
| unclassified (`incident_type` NULL) | OM unclassified | no | — |
| s1 open, **not reported to management** | OL-02 truck refused, opened −5 h | no | open s1 allowed without notice; leaving open needs `management_notified_at` |
| s1 with customer notice **overdue** | same (due = opened + 4 h) | no | `customer_notice_due_at` recomputed on every write from `opened_at` |
| s2 contained (management told) | OT-04 PI mismatch (rolls back variant G3) | no | — |
| s3 open | OA-02 document request | no | customer notice NULL (weekly summary) |
| closed (outcome, root cause, preventive action) | OU-01 PSI deviation, closed s1 by management | no | `closed_on`/`closed_by` set by the guard — with bypass set them yourself |
| deadline **past due** | supplier_damage on OL-05, opened −4 d (48 h default) | no | `incident_deadline_defaults` computes due from opened_at |
| repeat within 90 days ("Tekrar mı") | two OL-09 within 90 days | no | `incident_overview` |
| linked to project / PO / shipment / product / market cell | spread across the rows | no | `incident_entity_kind` + same-customer check |
| log with cost (payer, customer approval) | OL-05 log, 350 EUR carrier_insurance | no | `incident_log_cost_complete` |
| incident cited by a gate rollback | OT-04 | no | RESTRICT FK from `project_gate.rolled_back_incident_id` |

### M10 Change requests

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| open, normal, decision date ahead | CR-…-001 carton print | no | `decision_due_on` = created + 5 business days |
| open, urgent, **decision date passed** | CR-…-002 | no | `created_at` forced to now() on insert and immutable → `ALTER TABLE … DISABLE TRIGGER change_request_due` (the 038 test pattern) |
| approved after a passed (M) gate (customer approval doc) | CR-…-003 on private-label PL_G1 | no | needs signed/approved document of this CR + `customer_approved_on` |
| rejected (decision note) | CR-…-004 supplier price rise | no | `closed_on` set by the guard |
| applied (result document = new version) | CR-…-005 CONES-100 packaging, label_artwork v1 → v2 | no | result doc same record and type, higher version |
| each source customer / supplier / company / regulation | across 001–005 | no | — |
| each change kind | spec, design, packaging, price, deadline, supplier, content | no | ≥1 kind |
| CR products (several) | CR-…-001 → MOP40-2P + MOP40-3P | no | same customer |

### M19 Media

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| image png/jpg/webp, pdf, mp4 | 5 files | no | `media_check_file` needs a `storage.objects` row (bucket `media`, path `<tenant>/<media id>/<file>`, metadata `mimetype`, `size`) |
| with thumbnail / without | — | no | thumbnail also needs an object |
| primary image + gallery on a product | MOP40-2P | no | one primary per record (index + demote trigger); primary must be an image |
| evidence_photo on PO / shipment | PO-006 production photo, SHP-009 damage photo | no | update right on the record |
| attachment | CR-005 artwork PDF | no | — |
| shared file (customer NULL) on two customers' products | "OKAEI/KRN ortak katalog fotoğrafı" | no | transfer copies it, keeps source |
| unlinked file (deletable by management only) | orphan PNG | no | `media_in_use` otherwise |
| file cited by a document | PI PDF | no | `media_customer_locked` |
| **oversized-cap edge**: file allowed in MOESA (≤ 25 MB) but above Trading's lowered cap | 12 MB THO PDF; Trading `media_max_mb` = 5 | no | transfer into Trading refuses `media_too_large` (044 test does this) |

### M20 Guide and glossary

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| glossary for every enum value shown | needs at least one row per enum value on screen | partial | static i18n; the seed only has to make the values appear |
| page guide per business page | every list page non-empty | partial | localStorage `guide.dismissed`; nothing to seed |
| "Bu kartı nasıl kapatırım?" per box | every box non-empty (M6) | partial | — |
| system guide page | — | yes (static) | — |

### M21 Transfer

| State / edge case | Row(s) | Today | Constraints / triggers |
|---|---|---|---|
| source + branch target, management in both | MOESA LTD → MOESA Europe (akif) | yes (tenants) | — |
| cross-company target (owner of both only) | MOESA Trading GmbH (baris) | yes (tenants) | akif sees `transfer_owner_required` in `transfer_options` |
| read-only source (copy only, move refused) | Eski Ticaret with a customer | no | data before the subscription expires (§C) |
| **completed copy into Europe with pending files** | `transfer` row mode copy, path copy, files_status pending | no | only `public.transfer_customer` writes `transfer` (users have no insert); call it from the seed as akif (rehearse, then run with the hash and decisions) |
| transfer partial (missing files after check) | call `transfer_check_files` | no | — |
| `transfer_files_pending` refusal | follows from the pending transfer above | no | blocks every later transfer into that target customer |
| **refused move**: product-only move of a product used by a left-behind project / PO line / cell / CR | THO-CONES-100 (on a project and a PO) | partial (MOP40-2P is on the pilot) | `transfer_product_in_use` at run time; the rehearsal lists it under left_behind |
| GTIN conflict in target / code conflict | Europe already holding a GTIN | no | decisions `clear_gtin`, `new_code`, `map`, `skip` |
| mixed-customer product selection disabled | THO + KRN products in the list | no | UI `open_disabled_mixed` |
| target over its media cap | Trading `media_max_mb` = 5 | no | see M19 |

---

## Section B — the story skeleton

One timeline, all dates relative to the reset (`T` = `now()`, `D` = `current_date`, UTC).

**0. Cast.** baris (owner), akif (management, also in Europe), koordinator (coordinator). Keep the
existing users, emails and tenant names: the tests look them up by name.

**1. Customers.**
- THO (active, contract accepted D−300 with `contract` document, packages A1 B C E): adds
  Operations/Lager/Buchhaltung contacts, Rhenus third_party and FBA DE warehouses, a kaufland
  account with access `none`, a second brand "OKAEI Pro" (pending).
- **KRN "Kernhaus Living GmbH"** (Austria, commercial_representative, onboarding, packages A0 A2 C,
  no contract yet): the second customer for mixed selections and the market box's customer switch;
  two products (KRN-VASE-01 on_sale with TR1 as supplier, KRN-VASE-02 concept), one A0-only project,
  one PO, bol NL live and kaufland AT planned cells.
- Stubs: LEA (lead), PAU (paused, operations_partner, package D), CLS (closed; its only project
  closed, inserted before the customer was closed).
- Tenant-neutral screens: suppliers (shared by THO and KRN), shared media (customer NULL),
  settings, guide.

**2. Suppliers.** The five approved kept as-is; plus CN3 candidate and TR3 suspended (supplier of
the archived product), contacts on TR1/CN1, CN1 certificate, TR1 NNN contract, ratings.

**3. Products (THO).** Existing three (on_sale) kept. Add MOP40-3P (development, variant, draft spec),
MOP40-4P (development variant, no spec), MOP60-2P (concept), TIPS-6-100 (approved, approved spec,
compliance none), CONES-200 (ordering), BRUSH-1 (paused), MOP40-2P-OLD (archived, reuses
4260696025800). Mop documents: spec v1 (superseded) → v2 (signed, existing); TIPS-6-50 draft spec
(the "unsigned spec sheet"); SDS + DoC + test_report for TIPS-6-50 (compliance complete); a
certificate for CONES-100 dated D−400 (the would-be "expired" one, §D).

**4. Projects and gates.**
| Project | Type / path / packages | Gate state | Box |
|---|---|---|---|
| Mop ailesi çok ülke pilotu (existing) | npi a A1 B C | all pending, waits on G1 | gates_management |
| OKAEI fırça private label | npi b A2 C | G1, PL_G1 passed (approval docs, passed_at T−20 d, T−9 d); PL_G2 pending | gates_customer |
| MOP40 3'lü varyant | variant | G2 passed; G3 **rolled back** by OT-04 (open at the time); waits on G3 | gates_customer |
| Karbon filtre tekrar siparişi | reorder | G3 passed T−12 d (evidence: PO-004 PI); waits on G4 | gates_team |
| CONES-100 ambalaj revizyonu | revision | pending G2; status on_hold | (not shown: on hold) |
| Cones ilk sipariş | npi a A1 | all gates passed, phase closed, status closed | — |
| Mop 60 iptal | npi a A1 | cancelled | — |
| THO lojistik Q1 | B only | G5 pending | gates_customer |
| KRN Konsept vazo | A0 only | PL_G1 pending | gates_customer |
Tasks: on the variant and reorder projects, one task overdue (D−3), one due in 2 days, one blocked,
one done; pilot keeps its blocking G1 task todo (so "pass G1" shows `gate_blocked_by_task`).

**5. Purchase orders (THO, supplier per product).** PO-001 draft (BRUSH-1, no spec → "missing
spec") · 002 sent · 003 pi_received with a PI total 12.40 off · 004 pi_approved (reorder project,
G3 evidence) · 005 deposit_paid · 006 in_production (two production updates, a photo) · 007 ready,
balance planned D−10 unpaid, no PSI (**overdue payment**, PSI warning) · 008 balance_paid,
balance paid by the customer, **partially received** (SHP-008 accepted 600 of 1 000, SHP-001
planned with the rest) · 009 closed · 010 cancelled · 011 deposit 0 % in_production · PO-KRN-001
sent.

**6. Shipments (THO).** SHP-001 planned (rest of PO-008) · 002 booked · 003 loaded · 004 in_transit
ETA D+9 · 005 in_transit ETA D−4 (**late**) with S15 events · 006 at_customs (OL-08) · 007 delivered
T−1 d, dispute deadline T+1 d · 008 accepted (signed delivery receipt; G5 evidence) · 009 disputed,
damage, photo, OL-05 · 010 cancelled. Modes spread across fcl20/fcl40/lcl/road/courier/air.

**7. Market matrix.** THO: MOP40-2P amazon DE live, FR live, IT preparing, ES uploaded, NL
suppressed (OA-06 open issue); TIPS-6-50 amazon ES planned, IT stopped, kaufland DE live; CONES-100
amazon PL candidate (red + note), ebay DE paused, otto DE removed; compliance yellow (with note) on
amazon FR, pending on IT. KRN: bol NL live, kaufland AT planned.

**8. Incidents.** OL-THO-001 (OL-02, s1, open T−5 h, **no management notice**, customer notice
overdue, linked SHP-002) · OL-002 (OL-05, s2, contained, linked SHP-009, supplier_damage deadline
**past**, log with cost) · OL-003 and OL-004 (OL-09 twice within 90 days: repeat) · OT-001 (OT-04,
s2, contained, linked PO-003; the rollback of the variant's G3) · OA-001 (OA-02, s3, open,
document_request deadline 5 business days) · OU-001 (OU-01, s1, closed by akif with outcome, root
cause and preventive action) · OM-001 (unclassified, s3, open; linked to the pilot project).

**9. Change requests.** CR-001 open normal (packaging + design, two products, due ahead) · CR-002
open urgent, **decision date passed** · CR-003 approved after PL_G1 with the customer's approval
document · CR-004 rejected (supplier price rise, decision note) · CR-005 applied, CONES-100
label_artwork v1 → v2 (opens the revision project).

**10. Documents and media of every kind.** All 21 document types appear once at least (spec_sheet,
tech_pack, sample_report, pi, po, psi_report (approved on 006, draft on 007), test_report, sds,
doc_of_conformity, technical_file, label_artwork, packing_list, commercial_invoice, bill_of_lading,
customs, delivery_receipt, gate_approval, change_request, contract, certificate, other), all four
statuses, on every entity kind, Drive-only / media-only / both. Media: primary + gallery on MOP40-2P,
production photo (PO-006), damage photo (SHP-009), PI PDF cited by a document, an mp4, an unlinked
PNG, a shared catalogue photo (customer NULL) on THO and KRN products, and a 12 MB PDF (the
**oversized-cap** edge for a transfer into Trading, whose `media_max_mb` is lowered to 5).

**11. Notifications / feed.** One audit transaction per story step instead of one for the whole
block, backdated in four bands: today (incident OL-001, CR-002), yesterday (SHP-007 delivered),
last week (PO-007 ready, CR-005 applied), older (customer and product creation).

**12. Transfers.**
- **Completed copy THO → MOESA Europe** run as akif via `public.transfer_customer` (rehearsal, then
  run with `report_hash`, decisions `clear_gtin` on every active GTIN): `transfer` row with mode
  copy, files listed, `files_status = 'pending'`. Its audit entry shows "cannot be reverted" in the
  feed.
- **Refused move situations** (left as situations, nothing to store): product-only move of
  THO-CONES-100 (on project "Cones ilk sipariş", PO-009 and cells) → `transfer_product_in_use`; any
  further THO transfer into Europe → `transfer_files_pending`; akif → Trading →
  `transfer_owner_required`; a move out of Eski Ticaret (a stub customer there) →
  `transfer_source_read_only`; baris copying THO into Trading → refused on the 12 MB file
  (`media_too_large`).

---

## Section C — what needs a bypass, and dates

**What the current seed does.** No bypass at all. It runs as postgres (role `none`, so RLS is
skipped) and sets `request.jwt.claims` (sub = baris) and `request.headers` (x-tenant-id = MOESA)
with `set_config(..., TRUE)` so that `auth.uid()`, `public.next_code` (project code) and the audit
actor work. Helpers `private.seed_user`, `seed_tenant`, `seed_roles`, `seed_ops_roles`,
`seed_member`, `seed_owner` are created and dropped at the end. It does not use
`private.impersonate` — that one also runs `SET ROLE authenticated`, which would switch the bypass
off and turn RLS on.

**Bypass flag `moesa.rules_bypass = '1'`** (030, widened in 040 to "or a running transfer"): true
only with `role = 'none'` and session_user postgres/supabase_admin, which holds in the seed. It
silences: PO status/line/child guards, shipment guard + link/line guards, market cell guard (not its
immutability part), incident guard + log/deadline guards (not immutability), CR guard (not
immutability). It does **not** silence:

| Cannot be done with the flag | Why | How |
|---|---|---|
| Insert a PO / shipment / cell / incident / CR directly in its final status | code triggers force draft / planned / candidate / open | insert, then UPDATE status under the flag |
| Server-set fields when the guard is skipped (`closed_on`, `closed_by`, `company_approved_*`, `pi_checked_*`, `dispute_deadline_at`, `launched_on`, `accepted_on`) | the guard sets them, and it returned early | set them explicitly in the same UPDATE |
| Gate passes and rollbacks | `project_gate_guard` ignores the flag (it honours only a transfer) | satisfy the rules for real: `gate_approval` doc on the gate + `customer_approved_on`, signed specs for G2, the PI of a pi_approved PO for G3, blocking tasks done, an **open** incident for a rollback; pass in order. Or `ALTER TABLE public.project_gate DISABLE TRIGGER project_gate_guard` (the advance trigger must stay on so the phase moves) |
| A CR with a past decision date | `change_request_due` forces `created_at = now()`; created_at is immutable | `ALTER TABLE public.change_request DISABLE TRIGGER change_request_due`, set `decision_due_on`, re-enable (the 038 test does exactly this) |
| Media rows | `media_check_file` needs a `storage.objects` row with `metadata.mimetype` and `size` | INSERT into `storage.objects` first (tests 024/044 do). The file itself is not there: thumbnails and previews 404 (§D) |
| The `transfer` row | only `transfer_customer` writes it; `transferring()` needs a row of the same transaction | call the real RPC with the jwt/headers of akif and without SET ROLE; forging the flag is possible as postgres, but don't |
| Business rows in Eski Ticaret | read-only subscription | insert them in block 1 before the subscription UPDATE |
| Feed entries spread over days | one transaction = one `audit_transaction` (`audit.transaction_id` is transaction-local); `created_at = now()` | between steps `set_config('audit.transaction_id', '', TRUE)`; afterwards UPDATE `audit_transaction.created_at` **and** the matching `audit_log.created_at` together (the feed joins on equal created_at; audit_log is partitioned by it, old dates land in the default partition) |

**Dates.** Every date is relative: `current_date ± n` for DATE columns, `now() − interval` for
timestamps (`opened_at`, `passed_at`, `delivered_at`, `management_notified_at`). The views use
`now()` / `current_date` (UTC), so "overdue" stays overdue on any reset day. Watch:
- `spec_sheet_required_from` is a fixed date (2026-12-31). After it, every PO line needs a spec to
  leave draft, so PO-002… only seed without the flag if every line cites a signed spec. Cite specs
  everywhere, or keep the flag on.
- Incident notice due is recomputed from `opened_at` on every write; S2 "end of business day" and
  CR "5 business days" skip weekends: an "ahead" date can fall on a different weekday per reset;
  keep margins of ≥ 2 days.
- Codes take the current year (`PO-THO-2026-001` today, `…-2027-…` after New Year). Do not
  hard-code codes in docs or tests.
- `dashboard_gate_pending.waiting_days` uses the previous gate's `passed_at` or
  `project.created_at`; set both in the past for a "waiting 12 days" row.

**Test coupling (blocking).** pgTAP reads the seed and asserts its exact state; enriching THO or
Europe breaks at least:
- `099_seed`: exactly 3 on_sale THO products, `product_evidence` = three named SKUs,
  `dashboard_product_evidence` = `THO:3:1` (single row), exactly five approved suppliers.
- `038_dashboard_matrix_incidents`: THO market counts `1:1:1:3` (assumes THO has no cells).
- `042_transfer_rehearsal`: no transfer rows, Europe with 0 customers, satellite counts
  (`media: 3, document: 3…`), "five conflicts".
- `043_transfer_copy`, `044_transfer_cheap_path` ("Europe has no THO and no TR1"),
  `045_transfer_files` (a pending transfer into THO blocks rehearsals).
- 023, 025, 026, 029–037, 041 look up `THO-MOP40-2P`, `THO-TIPS-6-50`, `THO-CONES-100`,
  "Mop ailesi çok ülke pilotu" by name: keep those names and keep the pilot pending on G1.
Tests use fixed UUIDs for their own rows, so extra rows elsewhere are mostly harmless; counts and
"Europe is empty" are what break.

---

## Section D — questions only the owner can answer

1. The current pgTAP suite reads the seed and asserts its exact contents (099, 038, 042–045 expect
   THO with 3 products and no cells, and an empty MOESA Europe). Should the full story go into
   `seed.sql` (tests rewritten to build their own fixtures), or into a second seed file
   (`seed_story.sql`, loaded for development only) and the tests keep the small seed?
2. Should the completed copy into MOESA Europe be seeded by calling the real `transfer_customer`
   (realistic, but it locks THO in Europe behind `transfer_files_pending` until the files are
   checked), or should a different customer (KRN) be the one copied, so THO stays transferable?
3. "Expired document": `document` has no validity/expiry column. Add one (e.g. `valid_until` for
   certificates and test reports, with a "expired" badge), or is an old `issued_on` plus OU-05 enough?
4. Media rows need objects in Storage. Should the seed upload a few real sample files (png, pdf,
   mp4) to the local bucket, e.g. by a script after `db reset`, or are DB-only rows with broken
   previews acceptable?
5. The second customer: is a fictional "Kernhaus Living GmbH (KRN)" acceptable, or should it be a
   real MOESA customer (with its real code, packages and markets)?
6. Should the seed pass gates by meeting the real rules (approval and evidence documents, tasks
   done), which proves the rules, or switch the gate guard off during the seed?
