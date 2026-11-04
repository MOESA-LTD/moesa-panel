# Phase 2b — Purchase Orders and Shipments: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add M7 purchase orders and M8 shipments end to end. That covers the database rules, the API, list pages and cards with documents and media, the links to the project gates, and the Phase 2 dashboard boxes. The work must meet the spec's Phase 2 criteria: "ilk yeni PO panelde açıldı ve PI aritmetik kontrolü yapıldı; ilk sevkiyat ETD'den teslime panelden izlendi".

**Architecture:**
- **Records.** A purchase order (`purchase_order`) belongs to one customer and one supplier, and optionally to one project. It has lines, payments and production updates. A shipment (`shipment`) belongs to one customer and is delivered to one of that customer's warehouses. It carries purchase orders (`shipment_purchase_order`), quantities of their lines (`shipment_line`) and the S15 event chain (`shipment_event`).
- **Codes** come from `public.next_code` (`PO-THO-2026-001`, `SHP-THO-2026-001`).
- **Integrity.** Composite foreign keys that include `customer_id` keep every reference inside one customer.
- **Rules.** Status flows, the spec-sheet rule (K3 rule 2), the S09 PI arithmetic, the acceptance rule and the G3 PI rule live in `SECURITY DEFINER` triggers, as the gate rules do (021). The database is authoritative.
- **Client.** It mirrors the status flows and the PI arithmetic in pure, tested functions. It shows the spec-sheet and acceptance rules only as display hints, read from the overview views and the document checklist.
- **Lists and dashboard.** Lists read two `security_invoker` overview views. Those views expose arrays (product ids, PO ids), so list filters do not depend on embedding through a view; this follows the 025 `media_library` precedent. The dashboard reads two more such views (022 pattern).

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 + Tailwind, TanStack Query 5, zod 4, CASL, vue-i18n. Supabase (Postgres 15, PostgREST, generated RLS). pgTAP (`pnpm test:db`) and vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`.
- §6: M7, M8, the Phase 2 additions of M6, and M5 (G3/G4/G5 evidence; "yalnızca G2 ve G3'te engel"; the project card's PO and shipment tabs). Also M2 (supplier terms, PO history), M3 (PO/shipment history, `product_evidence.last_po_code`) and M4 (document types).
- K3 rule 2, K5, K8, §7, §8, §9 (Phase 2 acceptance) and §11 decision 5.
- Field-level sources:
  - `ABOUT MOESA/03_SABLONLAR/S09_PI_kontrol_listesi.md`: the 30 PI check items and the arithmetic ("toplam yaklaşık kabul edilmez").
  - `S15_sevkiyat_bildirim_zinciri.md`: the 20 event steps.
  - `S16_teslim_kabul_formu.md`: the acceptance decision.

## Global Constraints

- Keep the existing patterns as they are: `defineResource` (`{ table, repository: { get, save }, useOne, useSave }`), `useUpsertForm`, `ResourceTable`, route-dialog, `queryKeys`, `invalidateTables(queryClient, tables)` and `appErrorHandler`.
  - There is no `router.replace` inside a route dialog. A picker inside a route dialog is a plain PrimeVue `Dialog`.
  - When several tabs edit the same record, they share one form (`provide`/`inject`, as ProductCard does). Child rows (lines, payments, events) use their own route dialogs.
  - `useLookup` only supports `{ select, order (ascending), in }`. Anything else is a small dedicated `useQuery` keyed by `queryKeys.list(tenantKey, table, params)`.
- Migrations: numbers `029_…` to `033_…`; migration 028 (account refactor, in flight) is not touched.
  - Each migration has a pgTAP file with the same number.
  - Each opens with a design comment (021/024 style) that names its rule codes.
- Every child→parent FK between tenant tables is composite and includes `tenant_id`. A reference that must stay inside one customer also includes `customer_id`. Non-ownership references are `ON DELETE RESTRICT`.
- Every new table gets:
  - `tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE`;
  - `private.enable_tenant_level_security`, and `private.audit_enable`;
  - permission rows (`select` read/`throws_error` FALSE; `insert` create, `update`/`delete` modify, `throws_error` TRUE; `bypass` FALSE);
  - the owner grant (021 block);
  - `set_updated_at` where the table has `updated_at`.
- Users never delete purchase orders or shipments (`REVOKE DELETE … FROM anon, authenticated`, no delete permission); they are `cancelled`.
  - Child rows go with their parent through `ON DELETE CASCADE`, which in practice happens only when a tenant is removed.
  - `CASCADES` in `queryKeys.ts` mirrors those foreign keys, as the existing `customer` entry does for another table that is never deleted.
- Modules:
  - `purchase_order` (`is_core` TRUE, position 170) owns `purchase_order`, `purchase_order_line`, `purchase_order_payment` and `purchase_order_update`.
  - `shipment` (`is_core` TRUE, position 180) owns `shipment`, `shipment_purchase_order`, `shipment_line` and `shipment_event`.
  - `private.seed_ops_roles` gives both modules to management and coordinator. The migrations grant them to existing roles that hold `public.product` update (027 pattern).
- `authenticated` has no USAGE on `private`.
  - Trigger functions that read settings, or rows the caller may not see, are `SECURITY DEFINER` and filter on `NEW.tenant_id` themselves.
  - `SECURITY INVOKER` triggers and RPCs never call `private.*`.
  - A private function used in an invoker view gets `GRANT EXECUTE … TO authenticated` (022 `management_gates` precedent).
  - pgTAP keeps ids in `set_config('test.…')` and never calls private functions while impersonating.
- **Test fixture bypass (defined in Task 2, not in the repo yet).** `private.rules_bypassed() RETURNS BOOLEAN` STABLE is
  `current_setting('moesa.rules_bypass', TRUE) = '1' AND current_setting('role') = 'none'`. The flag is honoured only in a
  session that has not switched role: a migration, a test running as `postgres` or the SQL editor. PostgREST always runs
  `SET ROLE authenticated`, and inside a `SECURITY DEFINER` function `current_setting('role')` still reports the caller's
  `SET ROLE`. The guards of Tasks 2 and 6 (`purchase_order_guard`, `purchase_order_line_guard`,
  `purchase_order_child_guard`, `shipment_guard`, `shipment_purchase_order_guard`, `shipment_line_guard`) return at once
  when it is TRUE. The code and immutability triggers ignore it. Task 2's pgTAP proves an impersonated user cannot use
  it. pgTAP seeds a passed state with this transaction-local sequence (021 uses the same transaction-local
  `set_config` technique for `moesa.gate_pass_*`); no test uses `session_replication_role`:

```sql
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE …;   -- the fixture writes
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
```

- **pgTAP preamble.** Every pgTAP file of this plan starts, after `BEGIN; SELECT plan(N);`, with:

```sql
SELECT set_config('test.' || x.k, x.v::TEXT, TRUE)
FROM (VALUES
    ('moesa', (SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')),
    ('koordinator', (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test')),
    ('tho', (SELECT id FROM public.customer WHERE code = 'THO')),
    ('tr1', (SELECT id FROM public.supplier WHERE code = 'TR1')),
    ('cn1', (SELECT id FROM public.supplier WHERE code = 'CN1')),
    ('mop', (SELECT id FROM public.product WHERE sku = 'THO-MOP40-2P')),
    ('tips', (SELECT id FROM public.product WHERE sku = 'THO-TIPS-6-50')),
    ('cones', (SELECT id FROM public.product WHERE sku = 'THO-CONES-100')),
    ('spec_mop', (SELECT d.id FROM public.document d JOIN public.product p ON p.id = d.entity_id
                  WHERE p.sku = 'THO-MOP40-2P' AND d.type = 'spec_sheet')),
    ('rosbach', (SELECT id FROM public.customer_warehouse WHERE display_name = 'Rosbach')),
    ('pilot', (SELECT id FROM public.project WHERE display_name = 'Mop ailesi çok ülke pilotu'))
) AS x (k, v);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
```

  Rows a test creates have fixed ids `'00000000-0000-4000-8000-0000000NNNxx'`, where `NNN` is the migration number.
- Settings are per company, read through `private.company_setting` (Task 1), which walks `parent_id` as `private.management_gates` does. The existing keys `spec_sheet_required_from` (`"2026-12-31"`) and `deposit_rate_default` (`30`) are used; no setting is added.
- Each rule violation is `RAISE EXCEPTION '<code>' USING ERRCODE = 'check_violation'` (`foreign_key_violation` for a missing parent).
  - Every code gets `errors.<code>` in `en` and `tr`, and a `NAMED_ERRORS` entry.
  - The entry has a form `field` only where such a field exists. A code that only a status action or RPC can raise is a field-less, toast-level entry (Task 3 makes `field` optional).
  - The copy is in Task 3's table (PO), Task 7's table (shipment) and Task 9 (gate). Each DB task adds the keys it raises, from those tables.
- Money: `NUMERIC(12,4)` unit prices and `NUMERIC(14,2)` amounts.
  - The database rounds with `round(x, 2)` (half away from zero) in one place, `private.purchase_order_figures`.
  - The client parses decimal strings into integer units (`toUnits`) and never multiplies floats.
- Incoterms are the eleven Incoterms 2020 codes `EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP` (S09 item 12).
- K8: there is no bank, tax or account field. The S09 item "Ödeme yöntemi ve banka" is a check mark only.
- `current_date` and `next_code`'s year are UTC (a known Phase 1 backlog item).
- i18n: `en` is the source and `tr` is hand-written; the rest come from `pnpm i18n-sync`. No user-visible literal (Turkish or English) sits in a component. Process codes (G3, S09) are the same in every language.
- Generated types are refreshed with `pnpm dev:supabase-reset` and committed with every DB task (`supabase/functions/_shared/database.types.ts`).
- Commits are conventional. Each message ends with a blank line and the Co-Authored-By trailer the implementer's session provides.

## Review Focus

1. **A PI whose totals are off by a cent, or by an S09-style slip** (a line `1000 × 2,00 = 2.500`). The recalculation is exact (no float drift: `3 × 1.90 = 5.70`). Any difference blocks approval (`po_pi_mismatch`), and the PI tab marks the row that differs. Tests: Task 2 pgTAP; Task 3 `toUnits` / `purchaseOrderFigures` / `piDifferences`.
2. **The spec-sheet date boundary.** On `spec_sheet_required_from`, every line needs a spec sheet. The day before, only new SKUs need one (status `concept`, `development` or `approved`). A spec sheet of another product never counts. The "missing" hint follows the same rule. Tests: Task 2 pgTAP with the setting at today and tomorrow; Task 4 Lines test.
3. **Shipping more than ordered across two shipments.** The cap is the line quantity × (1 + tolerance %), and a cancelled shipment frees its quantity. A project or product with no shipments shows none, not all. Tests: Task 6 pgTAP; Task 8 `ShipmentTable` empty-filter test.
4. **One customer's record reaching another's.** A line with another customer's product, a PO on another customer's project, a shipment to another customer's warehouse, and a shipment carrying another customer's PO are each refused by a composite FK and shown as a field message. Tests: Task 1 and Task 6 pgTAP; Tasks 3 and 7 `NAMED_ERRORS` tests.
5. **Changing a PO after PI approval** (line price or quantity, currency, deposit), even by direct PATCH. Each is refused with `po_locked`. Payments and production notes on a closed or cancelled PO are refused with `po_closed`. Status skips by PATCH (`draft → pi_approved`) are refused with `po_status_order`. Tests: Task 2 pgTAP; Task 3 locked payload; Task 4 disabled inputs.

---

## File map

```
supabase/migrations/
  029_purchase_orders.sql      enums, company_setting, incoterm_valid, pi_check_valid, purchase_order(+line, payment,
                               update), defaults/code/immutable triggers, customer keys, entity_customer branch,
                               product_evidence.last_po_code, module, permissions, grant_group_to_product_editors
  030_purchase_order_rules.sql rules_bypassed, po_line_needs_spec, purchase_order_figures, guards, purchase_order_overview
  031_shipments.sql            enums, shipment(+purchase_order link, line, event), warehouse customer key, triggers,
                               entity_customer branch, shipment_overview, module, permissions
  032_gate_links.sql           gate evidence from the project's PO/shipment documents; G3 needs an approved PI
  033_dashboard_operations.sql dashboard_purchase_order, dashboard_shipment
supabase/tests/database/       029…033 test files; 021_projects.test.sql (G3 fixture); 099_seed.test.sql (+2)
supabase/seed.sql              seed_ops_roles gains purchase_order and shipment
app/src/api/purchaseOrder/{index,figures}.ts, app/src/api/shipment/index.ts
app/src/api/{dashboard/index,glossary,queryKeys,project/index,saveRow}.ts
app/src/lib/form/postgrestErrors.ts, app/src/constants/form/field.ts, app/src/router/routes/ops.ts
app/src/components/service-components/{purchase-order-table,shipment-table,pi-arithmetic,status-actions}/…, gate-panel/GatePanel.vue
app/src/views/pages/ops/purchase-order/…, app/src/views/pages/ops/shipment/…, ops/{project,supplier,product}/tabs/…
app/src/views/pages/dashboard/Index.vue
app/tests/api/{purchaseOrder,shipment,dashboard,queryKeys,saveRow}.test.ts,
app/tests/lib/form/postgrestErrors.test.ts, app/tests/views/{purchaseOrderForm,shipmentForm}.test.ts,
app/tests/components/{PiArithmeticTable,StatusActions,GatePanel}.test.ts, app/tests/plugins/i18n/{glossary,fields}.test.ts
```

---

### Task 1: Purchase order tables, codes and defaults (DB)

**Files:**
- Create: `supabase/migrations/029_purchase_orders.sql`, `supabase/tests/database/029_purchase_orders.test.sql`
- Modify:
  - `supabase/seed.sql`: `seed_ops_roles` group list and header comment gain `purchase_order`.
  - `supabase/tests/database/099_seed.test.sql`: plan +1.
  - i18n `errors.{purchase_order_customer_missing, purchase_order_immutable_field, incoterm_invalid, po_line_product_customer, po_project_customer, po_line_product_duplicate, pi_check_invalid}` (copy in Task 3); then `pnpm i18n-sync`.

**Interfaces:**
- Consumes:
  - `public.next_code(kind, scope)`: kind `'po'` gives `PO-<SCOPE>-<YYYY>-<NNN>`.
  - `private.default_settings` keys.
  - `private.entity_customer` (025).
  - `public.product_evidence` (019).
- Produces (SQL):
  - Enums, in flow order:
    - `public.purchase_order_status`: `draft`, `sent`, `pi_received`, `pi_approved`, `deposit_paid`, `in_production`, `ready`, `balance_paid`, `closed`, `cancelled`;
    - `public.payment_kind`: `deposit`, `balance`, `other`;
    - `public.payment_payer`: `moesa`, `customer`.
  - `private.company_setting(tenant_id UUID, key TEXT) RETURNS JSONB` STABLE SECURITY DEFINER:
    - returns the root tenant's value, or NULL when it is missing or JSON `null`;
    - not granted to `authenticated`.
  - CHECK helpers (`IMMUTABLE STRICT`, `GRANT EXECUTE … TO authenticated`, like `gtin_valid`):
    - `private.incoterm_valid(code TEXT) RETURNS BOOLEAN`: one of the eleven codes.
    - `private.pi_check_valid(p_check JSONB) RETURNS BOOLEAN`: an object whose keys are all `'1'`…`'30'` and whose values are all `"ok"`, `"error"` or `"missing"`.
  - New keys on existing tables:
    - `public.project`: `project_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
    - `public.product`: `product_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
  - Table `public.purchase_order`, columns:
    - Identity: `id UUID PK`, `tenant_id`, `customer_id UUID NOT NULL`, `supplier_id UUID NOT NULL`, `project_id UUID`, `code TEXT`, `status public.purchase_order_status NOT NULL DEFAULT 'draft'`.
    - Terms:
      - `currency valid_currency_code NOT NULL`;
      - `incoterm TEXT NOT NULL`, `incoterm_place TEXT`;
      - `deposit_rate NUMERIC(5,2) NOT NULL CHECK (deposit_rate BETWEEN 0 AND 100)`;
      - `ready_on DATE`;
      - `tolerance_pct NUMERIC(5,2) CHECK (tolerance_pct BETWEEN 0 AND 100)`;
      - `penalty_rule TEXT`;
      - `packing_instruction_document_id UUID`.
    - PI:
      - `pi_document_id UUID`, `pi_number TEXT`;
      - `pi_subtotal`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount`: all `NUMERIC(14,2)`, nullable;
      - `pi_extra_amount NUMERIC(14,2) NOT NULL DEFAULT 0`;
      - `pi_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (pi_discount_amount >= 0)`;
      - `pi_check JSONB NOT NULL DEFAULT '{}'`;
      - `pi_checked_by UUID REFERENCES public.user (id) ON DELETE SET NULL`, `pi_checked_at TIMESTAMPTZ`.
    - Also: `notes TEXT`, `created_at`, `updated_at`.
  - `purchase_order` constraints (all references RESTRICT):
    - `unique_purchase_order_code UNIQUE (tenant_id, code)`;
    - `purchase_order_id_tenant_id_key UNIQUE (id, tenant_id)`;
    - `purchase_order_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`;
    - `purchase_order_customer_fkey (customer_id, tenant_id)` → customer;
    - `purchase_order_supplier_fkey (supplier_id, tenant_id)` → supplier;
    - `purchase_order_project_fkey (project_id, customer_id, tenant_id)` → `project (id, customer_id, tenant_id)` (MATCH SIMPLE: a NULL project passes);
    - `purchase_order_pi_document_fkey`, `purchase_order_packing_document_fkey`: `(…_id, tenant_id)` → document;
    - `purchase_order_incoterm_valid CHECK (private.incoterm_valid(incoterm))`;
    - `purchase_order_pi_check_valid CHECK (private.pi_check_valid(pi_check))`.
  - `purchase_order` indexes: `(tenant_id, customer_id)`, `(tenant_id, supplier_id)`, `(tenant_id, project_id)`, `(tenant_id, status)`.
  - `REVOKE DELETE ON public.purchase_order FROM anon, authenticated`.
  - Trigger `purchase_order_defaults` (BEFORE INSERT, SECURITY DEFINER, reads the supplier in `NEW.tenant_id`):
    - `NEW.incoterm IS NULL` → `supplier.default_incoterm`, only when `private.incoterm_valid` accepts it.
    - `NEW.deposit_rate IS NULL` → `coalesce(supplier.deposit_rate, (company_setting(tenant,'deposit_rate_default') #>> '{}')::NUMERIC, 30)`. A non-numeric setting counts as missing.
  - Trigger `purchase_order_set_code` (BEFORE INSERT, invoker, the `project_set_code` pattern; it runs after `purchase_order_defaults` by name):
    - reads the customer through RLS; a customer the caller cannot see raises `purchase_order_customer_missing` (23503);
    - `NEW.code := public.next_code('po', customer.code)`, `NEW.status := 'draft'`.
  - Trigger `purchase_order_immutable` (BEFORE UPDATE, invoker): a changed `code`, `customer_id` or `supplier_id` raises `purchase_order_immutable_field`.
  - Table `public.purchase_order_line`:
    - Columns: `id`, `tenant_id`, `purchase_order_id UUID NOT NULL`, `customer_id UUID NOT NULL`, `position INT NOT NULL DEFAULT 0`, `product_id UUID NOT NULL`, `quantity INT NOT NULL CHECK (quantity > 0)`, `unit_price NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0)`, `line_total NUMERIC(16,4) GENERATED ALWAYS AS (quantity * unit_price) STORED`, `pi_line_total NUMERIC(14,2)`, `spec_document_id UUID`, `notes TEXT`, `created_at`, `updated_at`.
    - Constraints:
      - `purchase_order_line_id_po_tenant_key UNIQUE (id, purchase_order_id, tenant_id)`;
      - `unique_purchase_order_line_product UNIQUE (purchase_order_id, product_id)`;
      - `purchase_order_line_po_fkey (purchase_order_id, customer_id, tenant_id)` → `purchase_order (id, customer_id, tenant_id) ON DELETE CASCADE`;
      - `purchase_order_line_product_fkey (product_id, customer_id, tenant_id)` → `product (id, customer_id, tenant_id)`;
      - `purchase_order_line_spec_fkey (spec_document_id, tenant_id)` → document.
  - Trigger `purchase_order_line_customer` (BEFORE INSERT OR UPDATE, DEFINER): sets `NEW.customer_id` to the PO's customer, whatever the client sent. A missing PO is left to the FK.
  - Table `public.purchase_order_payment(id, tenant_id, purchase_order_id UUID NOT NULL, kind public.payment_kind NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK (amount > 0), currency valid_currency_code NOT NULL, planned_on DATE, paid_on DATE, paid_by public.payment_payer NOT NULL DEFAULT 'moesa', notes TEXT, created_at, updated_at)`. FK `purchase_order_payment_po_fkey (purchase_order_id, tenant_id)` → purchase_order `ON DELETE CASCADE`.
  - Table `public.purchase_order_update(id, tenant_id, purchase_order_id UUID NOT NULL, happened_on DATE NOT NULL DEFAULT current_date, note TEXT NOT NULL, created_by UUID DEFAULT auth.uid(), created_at, updated_at)`:
    - FK `purchase_order_update_po_fkey`, as for payments;
    - production photos go to the PO's Media tab (`evidence_photo`).
  - `private.entity_customer`: `CREATE OR REPLACE` with 025's body unchanged, plus `WHEN 'purchase_order' THEN` the PO's `customer_id`.
  - `public.product_evidence`: `CREATE OR REPLACE` with 019's definition unchanged, except `last_po_code`. It becomes the `code` of the newest (`created_at`) non-cancelled purchase order that has a line for the product. Update the view comment.
  - Module `('purchase_order', TRUE, 170)`. Permissions:
    - `purchase_order`: select, insert, update;
    - `purchase_order_line`, `purchase_order_payment`, `purchase_order_update`: select, insert, update, delete;
    - plus the owner grant.
  - `private.grant_group_to_product_editors(group_name TEXT) RETURNS VOID`: 027's grant made generic, without the media-delete exception. REVOKE from `PUBLIC, anon, authenticated`. The migration ends with `SELECT private.grant_group_to_product_editors('purchase_order')`.
- Produces (seed): `seed_ops_roles` adds `'purchase_order'` to `p.group_name IN (…)`.

- [ ] **Step 1: Write `029_purchase_orders.test.sql`** — `plan(14)`, the preamble, then:

```sql
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000029001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000029002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029001', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.project (id, tenant_id, customer_id, display_name, type, path, packages)
VALUES ('00000000-0000-4000-8000-000000029003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029001', 'Zed lamp', 'npi', 'a_sourcing', ARRAY['A1']);
INSERT INTO public.supplier (id, tenant_id, code, display_name, country, default_incoterm, status)
VALUES ('00000000-0000-4000-8000-000000029004', current_setting('test.moesa')::UUID, 'TR9', 'Dokuz', 'Türkiye', 'Ex Works', 'approved');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, code)
VALUES ('00000000-0000-4000-8000-000000029011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 'X');

SELECT is((SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'),
          'PO-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT is((SELECT incoterm || ':' || deposit_rate FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'),
          'EXW:30.00', 'incoterm and deposit come from the supplier');

RESET ROLE;
UPDATE public.setting SET value = '25' WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'deposit_rate_default';
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm)
VALUES ('00000000-0000-4000-8000-000000029012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, '00000000-0000-4000-8000-000000029004', 'USD', 'FOB');

SELECT is((SELECT deposit_rate FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029012'), 25.00::NUMERIC(5,2),
          'without a supplier deposit, the company setting');
SELECT throws_ok($$ INSERT INTO public.purchase_order (tenant_id, customer_id, supplier_id, currency)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, '00000000-0000-4000-8000-000000029004', 'USD') $$,
                 '23502', NULL, 'an invalid supplier incoterm is not copied; incoterm stays required');
SELECT throws_ok($$ INSERT INTO public.purchase_order (tenant_id, customer_id, supplier_id, currency, incoterm)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 'XYZ') $$,
                 '23514', NULL, 'only Incoterms 2020 codes');
SELECT throws_ok($$ UPDATE public.purchase_order SET code = 'PO-X' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', 'purchase_order_immutable_field', 'the code is fixed');
SELECT throws_ok($$ UPDATE public.purchase_order SET supplier_id = current_setting('test.cn1')::UUID WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', 'purchase_order_immutable_field', 'the supplier is fixed');

INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, customer_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000029021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', '00000000-0000-4000-8000-000000029001', current_setting('test.mop')::UUID, 3, 1.9);

SELECT is((SELECT line_total::TEXT || ':' || (customer_id = current_setting('test.tho')::UUID) FROM public.purchase_order_line WHERE id = '00000000-0000-4000-8000-000000029021'),
          '5.7000:true', 'the line total is computed; the line takes the order''s customer');
SELECT throws_ok($$ INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', '00000000-0000-4000-8000-000000029002', 1, 1) $$,
                 '23503', NULL, 'not another customer''s product');
SELECT throws_ok($$ INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000029011', current_setting('test.mop')::UUID, 1, 1) $$,
                 '23505', NULL, 'a product once per order');
SELECT throws_ok($$ UPDATE public.purchase_order SET project_id = '00000000-0000-4000-8000-000000029003' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23503', NULL, 'not another customer''s project');
SELECT throws_ok($$ UPDATE public.purchase_order SET pi_check = '{"31":"ok"}' WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '23514', NULL, 'only the 30 S09 items');
SELECT throws_ok($$ DELETE FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011' $$,
                 '42501', NULL, 'purchase orders are not deleted');
SELECT is((SELECT last_po_code FROM public.product_evidence WHERE product_id = current_setting('test.mop')::UUID),
          (SELECT code FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000029011'), 'the product shows its last order');
```

- [ ] **Step 2: Add to `099_seed.test.sql`** (as `postgres`):

```sql
SELECT ok(cardinality(private.tenants_permitting(
    (SELECT id FROM public.user WHERE email = 'koordinator@moesa-panel.test'),
    ARRAY[(SELECT id FROM public.tenant WHERE display_name = 'MOESA LTD')], 'public.purchase_order', 'insert')) = 1,
    'the coordinator creates purchase orders');
```

- [ ] **Step 3: Run it and see it fail.** Run: `cd app && pnpm test:db`. Expected: FAIL (`relation "public.purchase_order" does not exist`).
- [ ] **Step 4: Write `029_purchase_orders.sql`** following the Interfaces.
  - REVOKE all on every new private function from `PUBLIC, anon, authenticated`, then grant the two CHECK helpers back.
  - Update `seed_ops_roles`, add the `errors.*` keys and sync.
- [ ] **Step 5: Reset and run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/029_purchase_orders.sql supabase/tests/database/029_purchase_orders.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -F - <<'EOF'
feat(po): purchase orders with lines, payments and updates, coded per customer

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 2: Purchase order rules and overview (DB)

**Files:**
- Create: `supabase/migrations/030_purchase_order_rules.sql`, `supabase/tests/database/030_purchase_order_rules.test.sql`
- Modify: i18n `errors.{po_status_order, po_lines_required, po_spec_sheet_required, po_line_spec_invalid, po_pi_document_invalid, po_pi_required, po_pi_checklist_incomplete, po_pi_mismatch, po_deposit_unpaid, po_balance_unpaid, po_locked, po_closed}` (copy in Task 3); sync.

**Interfaces:**
- Consumes: Task 1 tables, `private.company_setting`, `public.document`.
- Produces (SQL):
  - `private.rules_bypassed() RETURNS BOOLEAN` STABLE: `current_setting('moesa.rules_bypass', TRUE) = '1' AND current_setting('role') = 'none'` (see Global Constraints). REVOKE from `PUBLIC, anon, authenticated`. Every guard below starts with `IF private.rules_bypassed() THEN RETURN coalesce(NEW, OLD); END IF;`.
  - `private.po_line_needs_spec(product_id UUID, tenant_id UUID) RETURNS BOOLEAN` STABLE SECURITY DEFINER, `GRANT EXECUTE … TO authenticated` (used by the overview). It is TRUE when:
    - `current_date >= (company_setting(tenant,'spec_sheet_required_from') #>> '{}')::DATE` (a missing or unparsable setting counts as reached); or
    - the product is a new SKU: status `concept`, `development` or `approved` (K3: "öncesinde yalnızca yeni SKU'lar"). `ordering`, `on_sale`, `paused` and `archived` are existing SKUs.
  - `private.purchase_order_figures(purchase_order_id UUID, tenant_id UUID) RETURNS TABLE (subtotal NUMERIC, total NUMERIC, deposit NUMERIC, balance NUMERIC)` STABLE SECURITY DEFINER, `GRANT EXECUTE … TO authenticated`. It is the only SQL home of the S09 §C formula:
    - `subtotal = round(sum(quantity * unit_price), 2)` (0 without lines);
    - `total = subtotal + pi_extra_amount - pi_discount_amount`;
    - `deposit = round(total * deposit_rate / 100, 2)`;
    - `balance = total - deposit`.
  - Trigger `purchase_order_guard` (BEFORE INSERT OR UPDATE ON purchase_order, SECURITY DEFINER; returns at once when `private.rules_bypassed()`). Rules in order:
    1. `po_status_order`.
       - On INSERT, the status must be `draft`.
       - On UPDATE, a changed status must be one of:
         - the next enum value. From `pi_approved` the next is `deposit_paid` when `deposit_rate > 0`, and `in_production` when `deposit_rate = 0` (`deposit_paid` is then refused);
         - or `cancelled`, from any status but `closed` and `cancelled`.
       - `closed` and `cancelled` are final.
    2. `po_locked`: `OLD.status >= 'pi_approved'`, and one of these changed (`IS DISTINCT FROM`): `currency`, `incoterm`, `incoterm_place`, `deposit_rate`, `pi_document_id`, `pi_number`, `pi_subtotal`, `pi_extra_amount`, `pi_discount_amount`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount`, `pi_check`.
    3. `po_pi_document_invalid`: a non-null `pi_document_id` that is not a `type = 'pi'` document with `entity_type = 'purchase_order'` and `entity_id = NEW.id` in the tenant.
    4. Entering `sent`:
       - no line → `po_lines_required`;
       - a line with `po_line_needs_spec` and no `spec_document_id` → `po_spec_sheet_required`.
    5. Entering `pi_received` with `pi_document_id` or `pi_total` NULL → `po_pi_required`.
    6. Entering `pi_approved`:
       - fewer than 30 `"ok"` values in `pi_check` → `po_pi_checklist_incomplete`;
       - otherwise, `pi_subtotal`, `pi_total`, `pi_deposit_amount` or `pi_balance_amount` differing from its figure (NULL differs), or a line's non-null `pi_line_total` differing from `round(line_total, 2)` → `po_pi_mismatch`;
       - on success, `pi_checked_by := auth.uid()` and `pi_checked_at := now()`.
    7. Entering `deposit_paid` with no `deposit` payment that has a `paid_on` → `po_deposit_unpaid`.
    8. Entering `balance_paid` with no `balance` payment that has a `paid_on` → `po_balance_unpaid`.

    PSI before the balance is a UI warning, not a rule (spec M7: "uyarı, engel değil").
  - Trigger `purchase_order_line_guard` (BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_line, DEFINER, bypass as above). Rules in order:
    - The PO is `pi_approved` or later (`closed`/`cancelled` included) → `po_locked`.
    - A non-null `spec_document_id` that is not a `spec_sheet` of `product_id` (`entity_type 'product'`) with status `signed` or `approved` in the tenant → `po_line_spec_invalid`.
    - All of these hold → `po_spec_sheet_required`:
      - it is an INSERT, or `product_id` or `spec_document_id` changed (a `pi_line_total` save alone is not checked);
      - the PO is `sent` or `pi_received`;
      - `po_line_needs_spec` holds;
      - the line has no spec.
  - Trigger `purchase_order_child_guard` (BEFORE INSERT OR UPDATE OR DELETE ON `purchase_order_payment` and `purchase_order_update`, DEFINER, bypass as above): the PO is `closed` or `cancelled` → `po_closed`.
  - View `public.purchase_order_overview` (`security_invoker`). Every `purchase_order` column, plus:
    - `customer_code`, `supplier_code`, `project_code` (LEFT joins);
    - `line_count INT`, `total_quantity INT`;
    - `product_ids UUID[]`: the lines' products (`'{}'` without lines);
    - `spec_missing_line_ids UUID[]`: lines with no `spec_document_id` for which `private.po_line_needs_spec` holds;
    - `system_subtotal`, `system_total`, `system_deposit`, `system_balance` (`LEFT JOIN LATERAL private.purchase_order_figures(id, tenant_id)`);
    - `deposit_planned_on DATE` (min `planned_on` of unpaid deposits), `deposit_paid_on DATE` (max `paid_on` of deposits), `balance_planned_on DATE` (min `planned_on` of unpaid balances), `balance_paid_on DATE`;
    - `has_approved_psi BOOLEAN`: an `approved` `psi_report` document of the PO.

    `GRANT SELECT … TO authenticated`. The comment names `product_ids` as the list filter (no embedding through the view).

- [ ] **Step 1: Write `030_purchase_order_rules.test.sql`** — `plan(24)`, the preamble, then:

```sql
-- Fixtures, as the coordinator. Every order is THO / TR1 / USD (EXW and 30 % from TR1); f has no deposit.
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name, status, supplier_id)
VALUES ('00000000-0000-4000-8000-000000030001', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'THO-NEW-1', 'New mop', 'development', current_setting('test.tr1')::UUID);
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, deposit_rate)
VALUES ('00000000-0000-4000-8000-000000030011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL),
       ('00000000-0000-4000-8000-000000030013', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030014', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL),
       ('00000000-0000-4000-8000-000000030015', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL), ('00000000-0000-4000-8000-000000030016', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', 0);
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price, spec_document_id)
VALUES ('00000000-0000-4000-8000-000000030021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', current_setting('test.mop')::UUID, 1000, 2, NULL), ('00000000-0000-4000-8000-000000030022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', current_setting('test.tips')::UUID, 10, 1, NULL),
       ('00000000-0000-4000-8000-000000030023', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030013', '00000000-0000-4000-8000-000000030001', 5, 1, NULL), ('00000000-0000-4000-8000-000000030024', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030014', current_setting('test.tips')::UUID, 5, 1, NULL),
       ('00000000-0000-4000-8000-000000030025', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030015', current_setting('test.mop')::UUID, 5, 1, current_setting('test.spec_mop')::UUID), ('00000000-0000-4000-8000-000000030026', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030016', current_setting('test.mop')::UUID, 1, 1, NULL);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000030031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000030011', 'pi', 'https://example.test/pi-a.pdf'),
       ('00000000-0000-4000-8000-000000030032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000030012', 'pi', 'https://example.test/pi-b.pdf');
RESET ROLE;
UPDATE public.setting SET value = to_jsonb((current_date + 1)::TEXT) WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'spec_sheet_required_from';
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_status_order', 'no skipping statuses');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030012' $$,
                 '23514', 'po_lines_required', 'an order needs lines');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'before the date, SKUs on sale go without a spec reference');
SELECT is((SELECT cardinality(spec_missing_line_ids) FROM public.purchase_order_overview WHERE id = '00000000-0000-4000-8000-000000030011'), 0,
          'no missing-spec hint before the date for SKUs on sale');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030013' $$,
                 '23514', 'po_spec_sheet_required', 'a new SKU needs its spec sheet');

RESET ROLE;
UPDATE public.setting SET value = to_jsonb((current_date)::TEXT) WHERE tenant_id = current_setting('test.moesa')::UUID AND key = 'spec_sheet_required_from';
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030014' $$,
                 '23514', 'po_spec_sheet_required', 'from the date on, every SKU');
SELECT throws_ok($$ UPDATE public.purchase_order_line SET spec_document_id = current_setting('test.spec_mop')::UUID WHERE id = '00000000-0000-4000-8000-000000030024' $$,
                 '23514', 'po_line_spec_invalid', 'another product''s spec sheet does not count');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'sent' WHERE id = '00000000-0000-4000-8000-000000030015' $$,
                'a referenced signed spec sheet passes');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_received' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_required', 'PI document and total first');
SELECT throws_ok($$ UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000030032' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_document_invalid', 'only this order''s PI');

UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000030031', pi_total = 2600, status = 'pi_received' WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_checklist_incomplete', 'all 30 S09 items must be OK');

UPDATE public.purchase_order SET pi_check = (SELECT jsonb_object_agg(i::TEXT, 'ok') FROM generate_series(1, 30) AS i) WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order
                    SET pi_subtotal = 2510, pi_extra_amount = 150, pi_discount_amount = 50, pi_total = 2610,
                        pi_deposit_amount = 783, pi_balance_amount = 1827, status = 'pi_approved'
                    WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_pi_mismatch', 'a PI that does not add up is not approved');
SELECT lives_ok($$ UPDATE public.purchase_order
                   SET pi_subtotal = 2010, pi_extra_amount = 150, pi_discount_amount = 50, pi_total = 2110,
                       pi_deposit_amount = 633, pi_balance_amount = 1477, status = 'pi_approved'
                   WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                'exact figures approve the PI');
SELECT is((SELECT pi_checked_by FROM public.purchase_order WHERE id = '00000000-0000-4000-8000-000000030011'), current_setting('test.koordinator')::UUID, 'the checker is recorded');
SELECT is((SELECT system_subtotal || ':' || system_total || ':' || system_deposit || ':' || system_balance
           FROM public.purchase_order_overview WHERE id = '00000000-0000-4000-8000-000000030011'),
          '2010.00:2110.00:633.00:1477.00', 'the overview recalculates the PI');
SELECT throws_ok($$ UPDATE public.purchase_order_line SET quantity = 999 WHERE id = '00000000-0000-4000-8000-000000030021' $$,
                 '23514', 'po_locked', 'lines are fixed after PI approval');
SELECT throws_ok($$ UPDATE public.purchase_order SET currency = 'EUR' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_locked', 'terms are fixed after PI approval');
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_deposit_unpaid', 'a paid deposit first');

INSERT INTO public.purchase_order_payment (id, tenant_id, purchase_order_id, kind, amount, currency, paid_on)
VALUES ('00000000-0000-4000-8000-000000030041', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030011', 'deposit', 633, 'USD', current_date);
UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030011';
UPDATE public.purchase_order SET status = 'in_production' WHERE id = '00000000-0000-4000-8000-000000030011';
UPDATE public.purchase_order SET status = 'ready' WHERE id = '00000000-0000-4000-8000-000000030011';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'balance_paid' WHERE id = '00000000-0000-4000-8000-000000030011' $$,
                 '23514', 'po_balance_unpaid', 'a paid balance first');

RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030016';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'deposit_paid' WHERE id = '00000000-0000-4000-8000-000000030016' $$,
                 '23514', 'po_status_order', 'no deposit step at 0 %');
SELECT lives_ok($$ UPDATE public.purchase_order SET status = 'in_production' WHERE id = '00000000-0000-4000-8000-000000030016' $$,
                'no deposit, straight to production');

UPDATE public.purchase_order SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000030013';

SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'draft' WHERE id = '00000000-0000-4000-8000-000000030013' $$,
                 '23514', 'po_status_order', 'cancelled is final');
SELECT throws_ok($$ INSERT INTO public.purchase_order_update (tenant_id, purchase_order_id, note)
                    VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000030013', 'late note') $$,
                 '23514', 'po_closed', 'a cancelled order takes no more notes');

-- The bypass is not honoured for a user (role authenticated), even with the flag set.
SELECT set_config('moesa.rules_bypass', '1', TRUE);
SELECT throws_ok($$ UPDATE public.purchase_order SET status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000030012' $$,
                 '23514', 'po_status_order', 'an impersonated user cannot use the bypass flag');
SELECT set_config('moesa.rules_bypass', '', TRUE);
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Write `030_purchase_order_rules.sql`**, then add the error keys and sync.
- [ ] **Step 4: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/030_purchase_order_rules.sql supabase/tests/database/030_purchase_order_rules.test.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -F - <<'EOF'
feat(po): status flow, spec sheet rule, S09 PI arithmetic and payment gates in triggers

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 3: Purchase order API (app)

**Files:**
- Create: `app/src/api/purchaseOrder/index.ts`, `app/src/api/purchaseOrder/figures.ts`, `app/tests/api/purchaseOrder.test.ts`
- Modify:
  - `app/src/api/queryKeys.ts`, DERIVED:
    - `purchase_order: ['purchase_order_overview', 'product_evidence', 'product_with_evidence']`;
    - `purchase_order_line: ['purchase_order', 'purchase_order_overview', 'product_evidence', 'product_with_evidence']`;
    - `purchase_order_payment: ['purchase_order', 'purchase_order_overview']`;
    - `purchase_order_update: ['purchase_order']`;
    - `document` and `setting` each gain `'purchase_order_overview'` (`has_approved_psi`; the spec date behind `spec_missing_line_ids`).
  - `app/src/api/saveRow.ts`: a new `updateRow<T extends keyof Tables>(table: T, id: string, patch: Tables[T]['Update']): Promise<Tables[T]['Row']>`, i.e. `supabase.from(table).update(patch).eq('id', id).select().single().throwOnError()`. `repository.save` takes a full `ResourceInput` and cannot carry a partial patch; this helper is used for every status, PI-line and single-field patch in Tasks 3, 5 and 7. Tested in `app/tests/api/saveRow.test.ts`.
  - `app/src/lib/form/postgrestErrors.ts` (a real change with its own test):
    - the NAMED_ERRORS type becomes `{ code; name; field?: string; message }`;
    - `mapPostgrestError` matches only entries whose `field` is in `fields`. A field-less entry documents a toast-level code; `appErrorHandler` shows `errors.<message>`.
    - Rows per the table below.
  - `app/src/constants/form/field.ts`: `purchase_order: { name: 'ops-purchase-order-manage' }`, and `{ name: 'ops-purchase-order-manage', field: 'purchase_order_id' }` for the three child tables.
  - i18n:
    - `fields.purchase_order` (also the module name), `fields.purchase_order_line`, `fields.purchase_order_payment`, `fields.purchase_order_update`;
    - the `ops.purchase_order.*` keys listed below.
  - `app/tests/plugins/i18n/fields.test.ts`: `OPS_TABLES` gains the four tables, and `OPS_MODULES` gains `purchase_order`.
  - `app/tests/api/queryKeys.test.ts`, `app/tests/lib/form/postgrestErrors.test.ts`.

**Interfaces:**
- Consumes:
  - Task 1–2 tables and views;
  - `defineResource`, `invalidateTables(queryClient, tables)`, `queryKeys`, `useTenantKey`, `allValues`;
  - `optional`, `required`, `requiredText`, `dateOnly`, `parseDateOnly` from `@/lib/form/fields`.
- Produces, `api/purchaseOrder/figures.ts`:
  - `toUnits(value: number | string, scale: number): number`: a decimal, as an integer count of `10^-scale`. It parses the decimal string (via `String(value)`), never multiplies a float, and rounds digits beyond `scale` half away from zero.
  - Types:
    - `FigureLine = { quantity: number; unit_price: number | string; pi_line_total?: number | string | null; label?: string }`;
    - `FigureTerms = { deposit_rate: number | string; pi_extra_amount: number | string; pi_discount_amount: number | string }`;
    - `Figures = { subtotal: number; total: number; deposit: number; balance: number }`.
  - `purchaseOrderFigures(lines: FigureLine[], terms: FigureTerms): Figures`: Task 2's formula, in integer units (prices at scale 4, money at scale 2, rate at scale 2), half away from zero. The tests below fix it.
  - `PiEntered = { pi_subtotal: number | null; pi_total: number | null; pi_deposit_amount: number | null; pi_balance_amount: number | null; pi_extra_amount: number; pi_discount_amount: number }`.
  - `PiRow = { key: 'line' | 'subtotal' | 'extra' | 'discount' | 'total' | 'deposit' | 'balance'; label?: string; system: number | null; pi: number | null; diff: number | null }`.
  - `piDifferences(lines: FigureLine[], terms: FigureTerms, entered: PiEntered): { rows: PiRow[]; matches: boolean }`.
    - Rows: one `line` row per line (its rounded total), then the S09 §C rows in order. `extra` and `discount` carry the entered value on both sides.
    - `diff = pi - system`, or null when `pi` is null.
    - `matches` follows rule 6 of `purchase_order_guard`.
- Produces, `api/purchaseOrder/index.ts`:
  - Types:
    - `PurchaseOrderStatus`, `PaymentKind`, `PaymentPayer`;
    - `PurchaseOrderRow`, `PurchaseOrderLineRow`, `PurchaseOrderPaymentRow`, `PurchaseOrderUpdateRow`;
    - `PurchaseOrderOverviewRow = Views['purchase_order_overview']['Row']`;
    - `PurchaseOrderCard`: the row with the embeds below.
  - Constants:
    - `PURCHASE_ORDER_STATUSES`, `PAYMENT_KINDS`, `PAYMENT_PAYERS` (`allValues`, enum order);
    - `INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'] as const`, and `Incoterm = (typeof INCOTERMS)[number]`;
    - `PI_CHECK_KEYS = ['1', …, '30'] as const`, `PI_CHECK_STATUSES = ['ok', 'error', 'missing'] as const`;
    - `PO_LOCKED_FIELDS`: the 13 columns of rule 2.
  - `isPurchaseOrderLocked(status: PurchaseOrderStatus): boolean`: TRUE from `pi_approved` on (`closed` and `cancelled` included).
  - `nextPurchaseOrderStatuses(po: Pick<PurchaseOrderRow, 'status' | 'deposit_rate'>): PurchaseOrderStatus[]`: exactly rule 1, the forward step first, then `cancelled`.
  - `piChecklistComplete(check: Json): boolean`.
  - `psiWarning(po: Pick<PurchaseOrderOverviewRow, 'status' | 'has_approved_psi'>): boolean`: `status === 'ready' && !has_approved_psi`.
  - `supplierDefaults(supplier: Pick<Tables['supplier']['Row'], 'default_incoterm' | 'deposit_rate'>): { incoterm: Incoterm | null; deposit_rate: number | null }`.
  - `purchaseOrderResource = defineResource<'purchase_order', PurchaseOrderCard>('purchase_order', { select })`. The embeds are named by their composite FKs:

```
*, customer!purchase_order_customer_fkey(code, display_name), supplier!purchase_order_supplier_fkey(code, display_name, default_incoterm, deposit_rate),
project!purchase_order_project_fkey(code, display_name),
purchase_order_line!purchase_order_line_po_fkey(*, product!purchase_order_line_product_fkey(id, sku, display_name, status, purchase_price, purchase_currency),
   spec_document:document!purchase_order_line_spec_fkey(id, version, status)),
purchase_order_payment!purchase_order_payment_po_fkey(*)
```

  - `usePurchaseOrderOverview(id: MaybeRefOrGetter<string | null>)`: a `useQuery` over `purchase_order_overview` with `.eq('id', id).maybeSingle()`, keyed `queryKeys.detail(tenantKey, 'purchase_order_overview', id)`, enabled while `id` is set. It is the card's source of `has_approved_psi`, `spec_missing_line_ids` and `system_*`.
  - `useEntityDocumentOptions(params: MaybeRefOrGetter<{ entityType: DocumentEntity; entityId: string | null; type?: DocumentType; statuses?: DocumentStatus[] }>)`:
    - a `useQuery` over `document`: `eq` on entity, then `type`, `in('status', statuses)` when given, and `order('version', { ascending: false })`;
    - keyed `queryKeys.list(tenantKey, 'document', { view: 'options', ...params })` and enabled while `entityId` is set;
    - returns `{ value: id, label: 'v<NN> — <status label>' }[]`.

    It feeds the spec-sheet picker (product, `spec_sheet`, `[signed, approved]`), the PI picker (purchase_order, `pi`) and the packing-instruction picker (purchase_order, any type).
  - `purchaseOrderSchema`:
    - `id: z.string().optional()`;
    - `customer_id`, `supplier_id`: `required(z.uuid())`;
    - `project_id`, `packing_instruction_document_id`, `pi_document_id`: `optional(z.uuid())`;
    - `currency`: `/^[A-Z]{3}$/`;
    - `incoterm`: `z.enum(INCOTERMS)`;
    - `incoterm_place`, `penalty_rule`, `pi_number`, `notes`: optional text;
    - `deposit_rate`: 0–100;
    - `ready_on`: `optional(dateOnly())`;
    - `tolerance_pct`: optional, 0–100;
    - `pi_subtotal`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount`: optional numbers;
    - `pi_extra_amount`: number, default 0; `pi_discount_amount`: ≥ 0, default 0;
    - `pi_check`: `z.partialRecord(z.enum(PI_CHECK_KEYS), z.enum(PI_CHECK_STATUSES))`.
  - `toPurchaseOrderFormValues(po?)`.
  - `toPurchaseOrderPayload(values, status?: PurchaseOrderStatus)`:
    - sends `customer_id` and `supplier_id` only without `id`;
    - never sends `status`, `code` or `pi_checked_*`;
    - leaves out `PO_LOCKED_FIELDS` when `status` is locked.
  - `useSetPurchaseOrderStatus()`: a mutation `({ id, status }) => updateRow('purchase_order', id, { status })`, then `invalidateTables(queryClient, ['purchase_order'])`.
  - Lines:
    - `purchaseOrderLineResource = defineResource('purchase_order_line')`;
    - `purchaseOrderLineSchema`: `id?`, `purchase_order_id`, `product_id` required uuid, `quantity` int ≥ 1, `unit_price` ≥ 0, `pi_line_total` optional, `spec_document_id` optional uuid, `position` int ≥ 0, `notes`;
    - its form-values and payload helpers (the payload never sends `customer_id` or `line_total`).
  - `defaultUnitPrice(product: Pick<ProductRow, 'purchase_price' | 'purchase_currency'>, currency: string): number | null`.
  - Payments:
    - `purchaseOrderPaymentResource`, `purchaseOrderPaymentSchema` (`id?`, `purchase_order_id`, `kind`, `amount` > 0, `currency`, `planned_on`, `paid_on`, `paid_by`, `notes`) and helpers;
    - `suggestPayments(figures: Figures, currency: string, existing: Pick<PurchaseOrderPaymentRow, 'kind'>[])`: the missing `deposit` (when > 0) and `balance` rows as `{ kind, amount, currency, paid_by: 'moesa' }`.
  - Updates: `purchaseOrderUpdateResource`, `purchaseOrderUpdateSchema` (`id?`, `purchase_order_id`, `happened_on` required `dateOnly`, `note` `requiredText`) and helpers.

NAMED_ERRORS additions (`message` is `errors.<name>` unless one is given; "—" means toast-level, no `field`):

| code | name | field |
|---|---|---|
| 23503 | purchase_order_customer_missing | customer_id |
| 23514 | purchase_order_immutable_field | supplier_id |
| 23514 | purchase_order_incoterm_valid | incoterm (`errors.incoterm_invalid`) |
| 23503 | purchase_order_project_fkey | project_id (`errors.po_project_customer`) |
| 23503 | purchase_order_line_product_fkey | product_id (`errors.po_line_product_customer`) |
| 23505 | unique_purchase_order_line_product | product_id (`errors.po_line_product_duplicate`) |
| 23514 | purchase_order_pi_check_valid | pi_check (`errors.pi_check_invalid`) |
| 23514 | po_spec_sheet_required | spec_document_id |
| 23514 | po_line_spec_invalid | spec_document_id |
| 23514 | po_pi_document_invalid | pi_document_id |
| 23514 | po_locked | currency |
| 23514 | po_locked | quantity |
| 23514 | po_status_order, po_lines_required, po_pi_required, po_pi_checklist_incomplete, po_pi_mismatch, po_deposit_unpaid, po_balance_unpaid, po_closed | — (one entry each) |

Error copy (EN / TR):

| key | en | tr |
|---|---|---|
| purchase_order_customer_missing | The order's customer was not found. | Siparişin müşterisi bulunamadı. |
| purchase_order_immutable_field | An order's code, customer and supplier cannot change. | Siparişin kodu, müşterisi ve tedarikçisi değiştirilemez. |
| incoterm_invalid | Choose an Incoterms 2020 term. | Bir Incoterms 2020 terimi seçin. |
| po_project_customer | The project belongs to another customer. | Proje başka bir müşteriye ait. |
| po_line_product_customer | The product belongs to another customer. | Ürün başka bir müşteriye ait. |
| po_line_product_duplicate | The product is already on this order. | Ürün bu siparişte zaten var. |
| pi_check_invalid | The PI checklist has an unknown item or answer. | PI kontrol listesinde bilinmeyen bir madde ya da cevap var. |
| po_status_order | The order cannot move to this status from its current one. | Sipariş bu duruma mevcut durumundan geçemez. |
| po_lines_required | Add at least one line first. | Önce en az bir satır ekleyin. |
| po_spec_sheet_required | Every line needs a signed or approved spec sheet before the order is sent. | Sipariş gönderilmeden önce her satırda imzalı ya da onaylı spec sheet olmalı. |
| po_line_spec_invalid | Choose a signed or approved spec sheet of this product. | Bu ürünün imzalı ya da onaylı bir spec sheet'ini seçin. |
| po_pi_document_invalid | Choose a PI document of this order. | Bu siparişin bir PI belgesini seçin. |
| po_pi_required | Enter the PI document and its total first. | Önce PI belgesini ve toplamını girin. |
| po_pi_checklist_incomplete | Every PI check item must be "OK" before approval. | Onaydan önce PI kontrol listesinin her maddesi "Uygun" olmalı. |
| po_pi_mismatch | The PI figures differ from the recalculated ones; ask for a corrected PI. | PI rakamları yeniden hesaplananlardan farklı; düzeltilmiş PI isteyin. |
| po_deposit_unpaid | Record the paid deposit first. | Önce ödenen depozitoyu kaydedin. |
| po_balance_unpaid | Record the paid balance first. | Önce ödenen bakiyeyi kaydedin. |
| po_locked | The PI is approved; lines and terms no longer change. | PI onaylandı; satırlar ve şartlar artık değişmez. |
| po_closed | The order is closed or cancelled; it no longer changes. | Sipariş kapandı ya da iptal edildi; artık değişmez. |

UI copy, `ops.purchase_order.*` (EN / TR). TR follows spec M7 and S09 unless it is marked **[owner to confirm]**; Tasks 4–5 add the keys they first use.
- `title`: Purchase orders / Satın alma (PO)
- `tabs.{general,lines,pi,payments,production,documents,media}`: General, Lines, PI check, Payments, Production, Documents, Media / Genel, Satırlar, PI kontrol, Ödemeler, Üretim takibi, Belgeler, Ortam
- `fields.*`:
  - code Code / Kod
  - customer Customer / Müşteri
  - supplier Supplier / Tedarikçi
  - project Project / Proje
  - status Status / Durum
  - product Product / Ürün
  - quantity Quantity / Adet
  - unit_price Unit price / Birim fiyat
  - currency Currency / Para birimi
  - spec_document Spec sheet version / Spec sheet sürümü
  - incoterm Incoterm / Incoterm
  - incoterm_place Place / Yer
  - deposit_rate Deposit % / Depozito %
  - ready_on Ready date / Termin (hazır tarih)
  - tolerance_pct Tolerance % / Tolerans %
  - penalty_rule Penalty rule / Ceza kuralı
  - packing_instruction Packaging and label instructions / Ambalaj/etiket talimatı belgesi
  - checked_by Checked by / Kontrol eden
- `pi.*`: subtotal Subtotal / Ara toplam; extra Extra items / Ek kalem; discount Discount / İndirim; total Grand total / Genel toplam; deposit Deposit / Depozito; balance Balance / Bakiye; system Recalculated / Sistem; entered On the PI / PI'daki; diff Difference / Fark
- `pi_check.status.{ok,error,missing}`: OK, Error, Missing / Uygun, Hata, Eksik
- `pi_check.items.1` … `30` take S09 §B "Madde" as their TR text verbatim; the EN text is a translation:

| # | en | tr |
|---|---|---|
| 1 | Seller name and address | Satıcı unvan ve adres |
| 2 | Buyer | Alıcı |
| 3 | PO reference | PO referansı |
| 4 | Spec sheet version | Spec sheet sürümü |
| 5 | Product lines | Ürün satırları |
| 6 | Unit price and currency | Birim fiyat ve para birimi |
| 7 | Line arithmetic | Satır aritmetiği |
| 8 | Subtotal, discount, extra items | Ara toplam, indirim, ek kalemler |
| 9 | Grand total | Genel toplam |
| 10 | Deposit | Depozito |
| 11 | Balance condition | Bakiye koşulu |
| 12 | Incoterm and place | Incoterm ve yer |
| 13 | Ready date | Termin |
| 14 | Tolerance (quantity) | Tolerans (adet) |
| 15 | Tolerance (quality, size, weight, colour) | Tolerans (kalite, ölçü, ağırlık, renk) |
| 16 | Cancellation and refund | İptal ve iade |
| 17 | Penalty — late payment | Ceza — geç ödeme |
| 18 | Penalty — late delivery | Ceza — geç teslim |
| 19 | Damage / shortage notice period | Hasar / eksik bildirim süresi |
| 20 | Storage fee | Depolama ücreti |
| 21 | Packaging and label instructions | Ambalaj ve etiket talimatı |
| 22 | Tooling | Kalıp |
| 23 | Sample / golden sample reference | Numune / altın numune referansı |
| 24 | Origin and HS code | Menşe ve HS kodu |
| 25 | Validity | Geçerlilik süresi |
| 26 | Payment method and bank (confirmed by phone; no account number here) | Ödeme yöntemi ve banka (telefonla teyit; hesap no buraya yazılmaz) |
| 27 | Force majeure, disputes, governing law | Mücbir sebep, uyuşmazlık, uygulanacak hukuk |
| 28 | Consistency within the PI | Belge içi tutarlılık |
| 29 | Consistency across documents | Belgeler arası tutarlılık |
| 30 | File version | Dosya sürümü |

- `status.*`:
  - draft: Draft / Taslak **[owner to confirm]**
  - sent: Sent / Gönderildi (K3)
  - pi_received: PI received / PI alındı **[owner to confirm]**
  - pi_approved: PI approved / PI onaylandı **[owner to confirm]**
  - deposit_paid: Deposit paid / Depozito ödendi **[owner to confirm]**
  - in_production: In production / Üretimde (M6)
  - ready: Ready / Hazır **[owner to confirm]**
  - balance_paid: Balance paid / Bakiye ödendi **[owner to confirm]**
  - closed: Closed / Kapandı **[owner to confirm]**
  - cancelled: Cancelled / İptal edildi **[owner to confirm]**
- `payment.kind.{deposit,balance,other}`: Deposit, Balance, Other / Depozito, Bakiye, Diğer
- `payment.payer.{moesa,customer}`: MOESA, Customer / MOESA, Müşteri
- `payment.fields.*`: amount Amount / Tutar; planned_on Planned date / Planlanan tarih; paid_on Paid on / Ödenen tarih; paid_by Paid by / Ödeyen taraf
- `production.fields.*`: happened_on Date / Tarih; note Status note / Durum notu

The **[owner to confirm]** marker never goes into the JSON. The remaining labels are the implementer's choice.

- [ ] **Step 1: Write the tests.** `saveRow.test.ts` (supabase mocked): `updateRow('purchase_order', 'p1', { status: 'sent' })` calls `update({ status: 'sent' })` then `eq('id', 'p1')` and resolves the returned row. `postgrestErrors.test.ts`: a field-less entry never maps to a field (the `po_pi_mismatch` case below). Then `purchaseOrder.test.ts`:

```ts
const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const SUPPLIER = '00000000-0000-4000-8000-000000000002';
const validValues = toPurchaseOrderFormValues({ customer_id: CUSTOMER, supplier_id: SUPPLIER, currency: 'USD', incoterm: 'FOB', deposit_rate: 30 });
const zero = { deposit_rate: 0, pi_extra_amount: 0, pi_discount_amount: 0 };
expect(toUnits('1.9000', 4)).toBe(19000); expect(toUnits(0.3333, 4)).toBe(3333); expect(toUnits('1.005', 2)).toBe(101); expect(toUnits('-0.005', 2)).toBe(-1);
expect(purchaseOrderFigures([{ quantity: 1000, unit_price: 2 }, { quantity: 10, unit_price: '1.0000' }], { deposit_rate: 30, pi_extra_amount: 150, pi_discount_amount: 50 }))
   .toEqual({ subtotal: 2010, total: 2110, deposit: 633, balance: 1477 });
expect(purchaseOrderFigures([{ quantity: 3, unit_price: '1.9000' }], zero).subtotal).toBe(5.7);
expect(purchaseOrderFigures([{ quantity: 7, unit_price: 0.3333 }], { ...zero, deposit_rate: 33.33 }))
   .toEqual({ subtotal: 2.33, total: 2.33, deposit: 0.78, balance: 1.55 });
const s09 = piDifferences([{ quantity: 1000, unit_price: 2, pi_line_total: 2500 }], { ...zero, deposit_rate: 30 },
   { pi_subtotal: 2500, pi_total: 2500, pi_deposit_amount: 750, pi_balance_amount: 1750, pi_extra_amount: 0, pi_discount_amount: 0 });
expect(s09.rows[0]).toMatchObject({ key: 'line', system: 2000, pi: 2500, diff: 500 }); expect(s09.matches).toBe(false);
expect(piDifferences([{ quantity: 1000, unit_price: 2 }], { ...zero, deposit_rate: 30 },
   { pi_subtotal: 2000, pi_total: 2000, pi_deposit_amount: 600, pi_balance_amount: 1400, pi_extra_amount: 0, pi_discount_amount: 0 }).matches).toBe(true);
expect(piDifferences([{ quantity: 1, unit_price: 1 }], zero,
   { pi_subtotal: 1, pi_total: null, pi_deposit_amount: 0, pi_balance_amount: 1, pi_extra_amount: 0, pi_discount_amount: 0 }).matches).toBe(false);
expect(nextPurchaseOrderStatuses({ status: 'draft', deposit_rate: 30 })).toEqual(['sent', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 30 })).toEqual(['deposit_paid', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 0 })).toEqual(['in_production', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'cancelled', deposit_rate: 30 })).toEqual([]);
const allOk = Object.fromEntries(PI_CHECK_KEYS.map((k) => [k, 'ok']));
expect(piChecklistComplete(allOk)).toBe(true); expect(piChecklistComplete({ ...allOk, '7': 'error' })).toBe(false);
expect(supplierDefaults({ default_incoterm: 'Ex Works', deposit_rate: 30 })).toEqual({ incoterm: null, deposit_rate: 30 });
const update = toPurchaseOrderPayload(purchaseOrderSchema.parse({ ...validValues, id: 'p1' }), 'pi_approved');
expect(update).toMatchObject({ id: 'p1' });
for (const key of ['currency', 'customer_id', 'supplier_id', 'status']) expect(update).not.toHaveProperty(key);
expect(toPurchaseOrderPayload(purchaseOrderSchema.parse(validValues))).toMatchObject({ customer_id: CUSTOMER, supplier_id: SUPPLIER, currency: 'USD' });
expect(defaultUnitPrice({ purchase_price: 1.9, purchase_currency: 'USD' }, 'EUR')).toBeNull();
expect(suggestPayments({ subtotal: 2000, total: 2000, deposit: 600, balance: 1400 }, 'USD', [{ kind: 'deposit' }]))
   .toEqual([{ kind: 'balance', amount: 1400, currency: 'USD', paid_by: 'moesa' }]);
expect(psiWarning({ status: 'ready', has_approved_psi: false })).toBe(true);
// queryKeys.test.ts
expect(affectedTables(['purchase_order_line'])).toEqual(expect.arrayContaining(['purchase_order_overview', 'product_evidence']));
expect(affectedTables(['document'])).toContain('purchase_order_overview');
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23503', message: 'insert … violates foreign key constraint "purchase_order_line_product_fkey"' }, ['product_id']))
   .toEqual({ product_id: i18n.t('errors.po_line_product_customer') });
expect(mapPostgrestError({ code: '23514', message: 'po_pi_mismatch' }, ['pi_total'])).toBeNull();
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/api/purchaseOrder.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the two modules and the queryKeys, NAMED_ERRORS, field.ts and i18n changes; then `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/purchaseOrder app/src/api/saveRow.ts app/src/api/queryKeys.ts app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests
git commit -F - <<'EOF'
feat(po): purchase order API with exact PI arithmetic and status flow helpers

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 4: Purchase order list and card: general, lines, documents, media

**Files:**
- Create:
  - `app/src/components/service-components/purchase-order-table/PurchaseOrderTable.vue`
  - `app/src/views/pages/ops/purchase-order/{Index,Manage,PurchaseOrderCard,LineUpsert}.vue`
  - `app/src/views/pages/ops/purchase-order/usePurchaseOrderForm.ts`
  - `app/src/views/pages/ops/purchase-order/tabs/{General,Lines,Documents,Media}.vue`
  - `app/tests/views/purchaseOrderForm.test.ts`
- Modify:
  - `app/src/api/purchaseOrder/index.ts`: `usePurchaseOrderIds(filter)` (below).
  - `app/src/router/routes/ops.ts`.
  - i18n: `route.label.ops_purchase_order*`, `ops.purchase_order.{spec_missing, locked_hint, no_rows}` (No purchase orders. / Satın alma siparişi yok.).

**Interfaces:**
- Consumes: Task 3, `EntityDocuments`, `EntityMedia`, `SelectCustomer`, `SelectSupplier`, `SelectCurrency`, `SelectEnum`, `SelectResource`, `useCustomerFilter`, `useUpsertForm`.
- Produces:
  - `usePurchaseOrderIds(filter: MaybeRefOrGetter<{ productId?: string }>)`: a `useQuery` over `purchase_order_overview`, `select('id')` and the supabase-js builder `.contains('product_ids', [productId])` (precedent: `.contains` in `app/src/api/media/library.ts`), keyed `queryKeys.list(tenantKey, 'purchase_order_overview', { view: 'ids', ...filter })`; returns `string[]`. No string filter syntax is hand-built.
  - `PurchaseOrderTable.vue` props `{ filters?: { supplierId?: string; projectId?: string; productId?: string } }`.
    - A ResourceTable over `purchase_order_overview` that follows the global customer filter.
    - Columns: code, customer_code, supplier_code, project_code, status (Tag + SelectEnum filter), ready_on, `system_total` with currency, deposit_paid_on, balance_planned_on.
    - `supplierId`/`projectId` map to `supplier_id`/`project_id` with `equalsFilter`. `productId` resolves `usePurchaseOrderIds({ productId })` and filters `id` with `{ operator: FilterOperator.AND, constraints: [{ value: ids, matchMode: FilterMatchMode.IN }] }` (the existing IN match mode). While the ids load, or when there are none, the table is not mounted and `ops.purchase_order.no_rows` is shown, because an empty IN filter would be skipped and match every order.
    - A row opens `ops-purchase-order-manage`.
  - `Index.vue`: a page card titled `ops.purchase_order.title` wrapping `PurchaseOrderTable` without filters. Adding goes through the route's context menu.
  - `usePurchaseOrderForm(id, onSaved?)`: the `useProductForm` pattern.
    - Prefill: `customer_id` from the customer filter; `project_id` and `customer_id` from route query keys of the same names.
    - `PO_CARD_TABS = ['general', 'lines', 'pi', 'payments', 'production', 'documents', 'media'] as const`.
    - `tabForField(field): 'general' | 'pi'` gives `'pi'` for `pi_*` and `'general'` otherwise.
    - The injection key is `PURCHASE_ORDER_FORM`.
  - `PurchaseOrderCard.vue` / `Manage.vue` (ProductCard pattern).
    - The tabs past general open once the PO is saved.
    - In this task, the `pi`, `payments` and `production` tabs render a disabled placeholder; Task 5 replaces it.
    - The header shows `code — supplier code`, a status Tag, and a named slot `actions` (filled in Task 5).
    - It calls `usePurchaseOrderOverview(id)` once and `provide`s the row as `PURCHASE_ORDER_OVERVIEW`.
  - `tabs/General.vue` fields:
    - customer and supplier, both on a new PO only. Picking a supplier fills an empty `incoterm` or `deposit_rate` from `supplierDefaults`.
    - project (`SelectResource` over the customer's projects), currency, incoterm (`SelectEnum` over `INCOTERMS`, no i18n prefix) and place, deposit %, ready date, tolerance %, penalty rule;
    - packing instruction (`useEntityDocumentOptions({ entityType: 'purchase_order', entityId })`), notes.
    - When `isPurchaseOrderLocked`, the `PO_LOCKED_FIELDS` inputs are `disabled` with the tooltip `ops.purchase_order.locked_hint`.
  - `tabs/Lines.vue`: a table of the card's embedded lines.
    - Columns: position, SKU, name, quantity, unit price, line total, spec sheet.
    - The spec sheet cell shows the embedded `spec_document` version Tag (`v<NN>`), or the danger Tag `ops.purchase_order.spec_missing` when the line id is in the overview's `spec_missing_line_ids`. This is a display hint; the DB decides.
    - Add/edit open `ops-purchase-order-line-add` / `-edit`; both are hidden when locked.
    - The footer shows the overview's `system_subtotal` with the currency.
  - `LineUpsert.vue` (route dialog):
    - product: `SelectResource` over the PO customer's products, archived excluded. Picking one sets an empty `unit_price` to `defaultUnitPrice(product, po.currency)`.
    - spec sheet: `useEntityDocumentOptions({ entityType: 'product', entityId: product_id, type: 'spec_sheet', statuses: ['signed', 'approved'] })`, preselecting the first (the highest version);
    - quantity, unit price, notes.
  - `tabs/Documents.vue`: `EntityDocuments entityType="purchase_order" :entityId :code :customerId`. `tabs/Media.vue`: `EntityMedia entityType="purchase_order" :entityId :customerId :tenantId`.
  - Routes (this task registers only routes whose components exist):
    - parent `path: 'purchase-orders'`, name `ops-purchase-order`, `PrimeIcons.SHOPPING_CART`, `requiredPermissions` select `purchase_order`, a context-menu "add" that opens `ops-purchase-order-manage` centered;
    - `ops-purchase-order-list` (`list`);
    - `ops-purchase-order-manage` (`:id?/manage/:tab?`) with children `ops-purchase-order-manage-{general,lines,documents,media}` (`visible: false`);
    - `ops-purchase-order-line-add` (`:purchaseOrderId/line/add`, create `purchase_order_line`);
    - `ops-purchase-order-line-edit` (`line/:id/edit`, modify `purchase_order_line`).
- [ ] **Step 1: Write the tests.**
  - `PurchaseOrderTable` with `filters: { productId: 'p1' }` and `usePurchaseOrderIds` mocked to `[]` renders `ops.purchase_order.no_rows` and no `ResourceTable`; mocked to `['o1']`, the ResourceTable's `filters.id.constraints[0]` is `{ value: ['o1'], matchMode: 'in' }`.
  - `purchaseOrderForm.test.ts`:
    - `tabForField('pi_total') === 'pi'` and `tabForField('incoterm') === 'general'`.
    - `General.vue` with an injected form whose status is `pi_approved` renders the currency input `disabled`.
    - Picking supplier `{ default_incoterm: 'FOB', deposit_rate: 30 }` on an empty new form sets `'FOB'`/`30`. With incoterm `'EXW'` already set, `'EXW'` stays.
    - `Lines.vue` shows the missing-spec Tag only for a line id listed in the provided overview's `spec_missing_line_ids`. A line without a spec but not listed shows no Tag. The add button is hidden when locked.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/views/purchaseOrderForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; run `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then check by hand in `pnpm dev:vue` as `koordinator@moesa-panel.test`:
  - a new PO for THO / TR1 gets EXW and 30 %;
  - it saves as `PO-THO-<year>-001`;
  - it takes a MOP40 line priced 1.90 in USD.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/purchaseOrder app/src/components/service-components/purchase-order-table app/src/views/pages/ops/purchase-order app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests
git commit -F - <<'EOF'
feat(po): purchase order list and card with terms, lines, documents and media

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 5: PI check, payments, production and status actions

**Files:**
- Create:
  - `app/src/components/service-components/pi-arithmetic/PiArithmeticTable.vue`
  - `app/src/components/service-components/status-actions/StatusActions.vue`
  - `app/src/views/pages/ops/purchase-order/tabs/{Pi,Payments,Production}.vue`
  - `app/src/views/pages/ops/purchase-order/{PaymentUpsert,UpdateUpsert}.vue`
  - `app/tests/components/{PiArithmeticTable,StatusActions}.test.ts`
- Modify:
  - `PurchaseOrderCard.vue` (mount the three tabs and `StatusActions`);
  - `app/src/router/routes/ops.ts`: children `ops-purchase-order-manage-{pi,payments,production}` and the payment/update dialog routes;
  - i18n: `ops.purchase_order.pi.{matches,mismatch}`, `ops.purchase_order.{plan_payments,psi_warning,deposit_differs}`, `status_actions.{confirm,done}`.

**Interfaces:**
- Consumes:
  - Task 3: `piDifferences`, `nextPurchaseOrderStatuses`, `psiWarning`, `suggestPayments`, `useSetPurchaseOrderStatus`, `useEntityDocumentOptions`, the resources.
  - Task 4: `PURCHASE_ORDER_FORM`, `PURCHASE_ORDER_OVERVIEW`, the card's `actions` slot.
- Produces:
  - `PiArithmeticTable.vue` props `{ rows: PiRow[]; currency: string }`.
    - Columns: label / system / PI / difference.
    - A row with a non-zero `diff` gets `text-red-500` and `data-test="pi-diff"`.
    - The footer shows `ops.purchase_order.pi.matches` or `…mismatch`.
    - It is display-only.
  - `StatusActions.vue` props:

```ts
{
   current: string;
   next: readonly string[];
   i18nPrefix: string;
   warnings?: Partial<Record<string, string>>;
   onChange: (status: string) => Promise<unknown>;
}
```

    - One button per `next` status; `cancelled` is a danger text button, last.
    - A click opens a `ConfirmDialog` with `status_actions.confirm` (it names the target status) and `warnings[status]` when set.
    - Confirming awaits `onChange`. An error goes to `appErrorHandler` (`errors.<message>`); success shows a toast with `status_actions.done`.
    - Task 8 reuses it, and Task 11 adds `glossary`.
  - `tabs/Pi.vue` (shared form):
    - the PI document (`useEntityDocumentOptions({ entityType: 'purchase_order', entityId, type: 'pi' })`), PI number, the six figures;
    - `PiArithmeticTable` fed by `piDifferences(lines, terms, entered)`, computed live from the form and the embedded lines;
    - the 30-item checklist: a row per `PI_CHECK_KEYS` with label `pi_check.items.<n>` and a `SelectButton` over `PI_CHECK_STATUSES`;
    - per-line PI totals in an inline `InputNumber` column that saves on blur through `updateRow('purchase_order_line', id, { pi_line_total })`, then `invalidateTables(queryClient, ['purchase_order_line'])`.
    - When locked, everything is read-only and "checked by / at" is shown.
  - `tabs/Payments.vue`:
    - a table of the embedded payments, with add/edit through `ops-purchase-order-payment-add` (`:purchaseOrderId/payment/add`) / `-edit` (`payment/:id/edit`);
    - "Plan from PI" (`ops.purchase_order.plan_payments`) saves each row of `suggestPayments(overview figures, currency, payments)` and is shown only when that list is non-empty;
    - a deposit whose amount is not `system_deposit` gets a warn Tag `ops.purchase_order.deposit_differs`;
    - add/edit are hidden when `closed` or `cancelled`.
  - `tabs/Production.vue`: updates newest first (date, note, author), with add/edit through `ops-purchase-order-update-add` (`:purchaseOrderId/update/add`) / `-edit` (`update/:id/edit`), hidden when `closed` or `cancelled`.
  - Card `actions` slot: `StatusActions` with:
    - `current = po.status`;
    - `next = nextPurchaseOrderStatuses(po)`;
    - `i18nPrefix = 'ops.purchase_order.status'`;
    - `warnings = { balance_paid: t('ops.purchase_order.psi_warning') }` when `psiWarning(overview)`;
    - `onChange = (status) => setStatus({ id, status })`;
    - shown only with `$can('update', 'purchase_order')`.
- Copy (EN / TR):
  - `pi.matches`: The PI matches the recalculation. / PI yeniden hesapla tutuyor.
  - `pi.mismatch`: The PI differs from the recalculation. / PI yeniden hesaptan farklı.
  - `plan_payments`: Plan from PI / PI'dan planla
  - `deposit_differs`: Differs from the PI deposit / PI depozitosundan farklı
  - `psi_warning`: No approved PSI report on this order; per G4 the balance is not paid without it. / Bu siparişte onaylı PSI raporu yok; G4'e göre bakiye PSI'sız ödenmez. **[owner to confirm]**
  - `status_actions.confirm`: Move to "{status}"? / "{status}" durumuna geçilsin mi?
  - `status_actions.done`: Status changed. / Durum değişti.
- [ ] **Step 1: Write the component tests.**
  - `PiArithmeticTable`: the S09 rows (line 2000 vs 2500) render exactly one `[data-test="pi-diff"]` row containing `500`. Matching rows render none and show `…pi.matches`.
  - `StatusActions` (with `@/lib/appErrorHandler` mocked):
    - `next: ['sent', 'cancelled']` gives two buttons, cancel last;
    - confirming `sent` calls `onChange('sent')` once;
    - a rejection `{ code: '23514', message: 'po_lines_required' }` calls the mocked `appErrorHandler` with it;
    - `warnings: { balance_paid: 'X' }` shows `X` only in `balance_paid`'s dialog.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/components/PiArithmeticTable.test.ts tests/components/StatusActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, tabs, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then walk the Task 4 PO in the browser:
  1. Send it.
  2. Add a PI document and a total off by 1, then move it to "PI received".
  3. Tick all 30 items. "PI approved" is refused with the mismatch toast, and the row is marked.
  4. Correct the total. Approval passes, and the fields lock.
  5. Plan the payments; once the deposit is paid, "Deposit paid" is offered.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/pi-arithmetic app/src/components/service-components/status-actions app/src/views/pages/ops/purchase-order app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/components
git commit -F - <<'EOF'
feat(po): S09 PI check, payments, production log and status actions

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 6: Shipments (DB)

**Files:**
- Create: `supabase/migrations/031_shipments.sql`, `supabase/tests/database/031_shipments.test.sql`
- Modify:
  - `supabase/seed.sql`: `seed_ops_roles` gains `'shipment'`.
  - `099_seed.test.sql`: plan +1; the Task 1 assertion again with `'public.shipment'` and the description `'the coordinator creates shipments'`.
  - i18n errors from Task 7's table; sync.

**Interfaces:**
- Consumes: Task 1–2 (`purchase_order`, its line and keys, `private.rules_bypassed`, `private.grant_group_to_product_editors`), `next_code` (kind `'shp'`), `private.entity_customer`.
- Produces (SQL):
  - Enums:
    - `public.shipment_mode`: `fcl20`, `fcl40`, `lcl`, `road`, `courier`, `air`;
    - `public.shipment_status`: `planned`, `booked`, `loaded`, `in_transit`, `at_customs`, `delivered`, `accepted`, `disputed`, `cancelled`. `cancelled` is added because records are never deleted (§3).
  - `public.customer_warehouse` gains `customer_warehouse_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
  - Table `public.shipment`, columns:
    - Identity and terms: `id`, `tenant_id`, `customer_id UUID NOT NULL`, `code TEXT`, `status … NOT NULL DEFAULT 'planned'`, `mode public.shipment_mode NOT NULL`, `delivery_warehouse_id UUID NOT NULL`, `forwarder`, `customs_broker`, `carrier` (TEXT), `incoterm_buy`, `incoterm_sell` (TEXT), `is_insured BOOLEAN NOT NULL DEFAULT FALSE`.
    - Dates: `ready_on`, `booking_confirmed_on`, `etd`, `eta`, `customs_cleared_on`, `planned_delivery_on` (DATE), `delivered_at TIMESTAMPTZ`.
    - Transport: `container_no`, `seal_no` (TEXT), `free_days_port`, `free_days_detention` (INT ≥ 0), `demurrage_note TEXT`.
    - Packed quantities: `carton_count`, `pallet_count` (INT ≥ 0), `volume_m3 NUMERIC(10,3)`, `gross_kg NUMERIC(12,2)` (≥ 0).
    - Acceptance: `accepted_by TEXT`, `accepted_on DATE`, `quantity_matches BOOLEAN`, `has_damage BOOLEAN`, `dispute_deadline_at TIMESTAMPTZ`.
    - Also: `notes`, `created_at`, `updated_at`.
  - `shipment` constraints:
    - `unique_shipment_code (tenant_id, code)`;
    - `shipment_id_tenant_id_key`;
    - `shipment_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`;
    - `shipment_customer_fkey`;
    - `shipment_warehouse_fkey (delivery_warehouse_id, customer_id, tenant_id)` → `customer_warehouse (id, customer_id, tenant_id)` RESTRICT;
    - `shipment_incoterm_buy_valid`, `shipment_incoterm_sell_valid`: `CHECK (x IS NULL OR private.incoterm_valid(x))`.
  - `REVOKE DELETE` on `shipment`.
  - Table `public.shipment_purchase_order(shipment_id, purchase_order_id, tenant_id, customer_id UUID NOT NULL, created_at)`:
    - PK `(shipment_id, purchase_order_id)`, `shipment_purchase_order_link_key UNIQUE (shipment_id, purchase_order_id, tenant_id)`;
    - `shipment_purchase_order_shipment_fkey (shipment_id, customer_id, tenant_id)` → shipment, CASCADE;
    - `shipment_purchase_order_po_fkey (purchase_order_id, customer_id, tenant_id)` → purchase_order, RESTRICT;
    - a BEFORE INSERT DEFINER trigger sets `customer_id` from the shipment.
  - Table `public.shipment_line(id, tenant_id, shipment_id UUID NOT NULL, purchase_order_id UUID NOT NULL, purchase_order_line_id UUID NOT NULL, quantity INT NOT NULL CHECK (quantity > 0), carton_count INT, created_at, updated_at)`:
    - `unique_shipment_line (shipment_id, purchase_order_line_id)`;
    - `shipment_line_shipment_fkey (shipment_id, tenant_id)` → `shipment (id, tenant_id) ON DELETE CASCADE` (the direct parent, for embeds and CASCADES);
    - `shipment_line_link_fkey (shipment_id, purchase_order_id, tenant_id)` → `shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)` RESTRICT (the PO must be on the shipment);
    - `shipment_line_po_line_fkey (purchase_order_line_id, purchase_order_id, tenant_id)` → `purchase_order_line (id, purchase_order_id, tenant_id)` RESTRICT.
  - Table `public.shipment_event(id, tenant_id, shipment_id, happened_at TIMESTAMPTZ NOT NULL DEFAULT now(), step SMALLINT CHECK (step BETWEEN 1 AND 20), from_party TEXT, to_party TEXT, channel TEXT, note TEXT, created_by UUID DEFAULT auth.uid(), created_at, updated_at)`:
    - `shipment_event_shipment_fkey (shipment_id, tenant_id)` → shipment, CASCADE;
    - `step` is the S15 §B row; NULL means "other".
  - Trigger `shipment_set_code` (BEFORE INSERT, invoker): `next_code('shp', customer.code)`, status `planned`; a customer the caller cannot see raises `shipment_customer_missing` (23503).
  - Trigger `shipment_guard` (BEFORE UPDATE, DEFINER; returns at once when `private.rules_bypassed()`). Rules in order:
    1. A changed `code` or `customer_id` → `shipment_immutable_field`.
    2. `shipment_status_order`. The allowed transitions:
       - `planned → booked | cancelled`, `booked → loaded | cancelled`, `loaded → in_transit`;
       - `in_transit → at_customs | delivered`, `at_customs → delivered`;
       - `delivered → accepted | disputed`, `disputed → accepted`.
       `accepted` and `cancelled` are final.
    3. Entering `booked`: no linked PO → `shipment_po_required`; `booking_confirmed_on IS NULL` → `shipment_booking_date_required`.
    4. Entering `in_transit` with `etd` or `eta` NULL → `shipment_eta_required`.
    5. Entering `delivered` with `delivered_at IS NULL` → `shipment_delivery_time_required`. On success, an empty `dispute_deadline_at` becomes `delivered_at + min(supplier.damage_notice_hours) * INTERVAL '1 hour'` over the linked POs' suppliers (NULL when none has hours). It stays editable (S16 §F: "sözleşmeye göre").
    6. Entering `accepted`:
       - no `delivery_receipt` document on the shipment with status `signed` or `approved` → `shipment_delivery_receipt_required`;
       - `quantity_matches IS NOT TRUE OR has_damage IS NOT FALSE` → `shipment_acceptance_issue` (S16: a delivery with reservations, or a refusal, is `disputed`);
       - on success, `accepted_on` defaults to `current_date`.
  - Trigger `shipment_purchase_order_guard` (INSERT OR DELETE, DEFINER, bypass as above):
    - the shipment is `loaded` or later, or `cancelled` → `shipment_locked`;
    - on insert, a PO outside `pi_approved`…`balance_paid` → `shipment_po_not_open`;
    - on delete, a link that still has lines → `shipment_po_has_lines`. This BEFORE trigger answers before the RESTRICT FK, so the user sees the named code.
  - Trigger `shipment_line_guard` (INSERT OR UPDATE OR DELETE, DEFINER, bypass as above):
    - the shipment is `loaded` or later, or `cancelled` → `shipment_locked`;
    - on insert or update, the PO line's quantities on shipments that are not cancelled (this row's new value counted, its old one not) exceed `floor(quantity * (1 + coalesce(tolerance_pct, 0) / 100))` → `shipment_quantity_exceeds_po`.
  - `private.entity_customer`: `CREATE OR REPLACE` with Task 1's body unchanged, plus `WHEN 'shipment'`.
  - View `public.shipment_overview` (`security_invoker`): every `shipment` column, plus:
    - `customer_code`, `warehouse_name`;
    - `purchase_order_ids UUID[]`, `purchase_order_codes TEXT[]`;
    - `product_ids UUID[]` (the products of its lines);
    - `psi_missing_po_codes TEXT[]`: the codes of linked POs without an approved PSI report.

    `GRANT SELECT … TO authenticated`.
  - Module `('shipment', TRUE, 180)`. Permissions:
    - `shipment`: select, insert, update;
    - `shipment_purchase_order`: select, insert, delete;
    - `shipment_line`, `shipment_event`: select, insert, update, delete;
    - the owner grant, then `SELECT private.grant_group_to_product_editors('shipment')`.

- [ ] **Step 1: Write `031_shipments.test.sql`** — `plan(20)`, the preamble, then:

```sql
-- Fixtures, as the coordinator.
INSERT INTO public.customer (id, tenant_id, code, display_name, commercial_model)
VALUES ('00000000-0000-4000-8000-000000031001', current_setting('test.moesa')::UUID, 'ZZZ', 'Zed Trading', 'trading_partner');
INSERT INTO public.customer_warehouse (id, tenant_id, customer_id, display_name)
VALUES ('00000000-0000-4000-8000-000000031002', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', 'WZ');
INSERT INTO public.product (id, tenant_id, customer_id, sku, display_name)
VALUES ('00000000-0000-4000-8000-000000031003', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', 'ZZZ-1', 'Zed lamp');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency, incoterm, tolerance_pct)
VALUES ('00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.cn1')::UUID, 'USD', 'FOB', 5), ('00000000-0000-4000-8000-000000031012', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD', NULL, NULL),
       ('00000000-0000-4000-8000-000000031013', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031001', current_setting('test.tr1')::UUID, 'USD', NULL, NULL);
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000031021', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031011', current_setting('test.mop')::UUID, 1000, 2), ('00000000-0000-4000-8000-000000031022', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031012', current_setting('test.cones')::UUID, 10, 1), ('00000000-0000-4000-8000-000000031023', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031013', '00000000-0000-4000-8000-000000031003', 1, 1);
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = 'pi_approved' WHERE id IN ('00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031013');
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'fcl20', current_setting('test.rosbach')::UUID
FROM (VALUES ('00000000-0000-4000-8000-000000031031'::UUID), ('00000000-0000-4000-8000-000000031032'), ('00000000-0000-4000-8000-000000031033'), ('00000000-0000-4000-8000-000000031034')) AS x (id);

SELECT is((SELECT code FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'),
          'SHP-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT throws_ok($$ INSERT INTO public.shipment (tenant_id, customer_id, mode, delivery_warehouse_id)
                    VALUES (current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', '00000000-0000-4000-8000-000000031002') $$,
                 '23503', NULL, 'not another customer''s warehouse');
SELECT throws_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031012', current_setting('test.moesa')::UUID) $$, '23514', 'shipment_po_not_open', 'a draft order is not shipped');
SELECT throws_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031013', current_setting('test.moesa')::UUID) $$, '23503', NULL, 'not another customer''s order');
SELECT lives_ok($$ INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID) $$, 'an approved order is linked');
SELECT throws_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031040', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031012', '00000000-0000-4000-8000-000000031022', 1) $$, '23503', NULL, 'a line needs its order on the shipment');
SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031041', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031031', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 1000) $$, 'the ordered quantity');

INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031032', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', current_setting('test.moesa')::UUID);

SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031042', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031032', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 50) $$, 'within the 5 % tolerance');
SELECT throws_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031043', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 1) $$, '23514', 'shipment_quantity_exceeds_po', 'not beyond the tolerance');

UPDATE public.shipment SET status = 'cancelled' WHERE id = '00000000-0000-4000-8000-000000031032';

SELECT lives_ok($$ INSERT INTO public.shipment_line (id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity) VALUES ('00000000-0000-4000-8000-000000031043', current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000031033', '00000000-0000-4000-8000-000000031011', '00000000-0000-4000-8000-000000031021', 50) $$, 'a cancelled shipment frees its quantity');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_status_order', 'no skipping statuses');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'booked' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_booking_date_required', 'booking needs its confirmation date');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'booked', booking_confirmed_on = current_date WHERE id = '00000000-0000-4000-8000-000000031034' $$,
                 '23514', 'shipment_po_required', 'booking needs an order');

UPDATE public.shipment SET status = 'booked', booking_confirmed_on = current_date WHERE id = '00000000-0000-4000-8000-000000031031';
UPDATE public.shipment SET status = 'loaded' WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment_line SET quantity = 900 WHERE id = '00000000-0000-4000-8000-000000031041' $$,
                 '23514', 'shipment_locked', 'loaded goods do not change');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'in_transit' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_eta_required', 'in transit needs ETD and ETA');

UPDATE public.shipment SET status = 'in_transit', etd = current_date, eta = current_date + 20 WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment SET status = 'delivered' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_delivery_time_required', 'delivered needs the time');

UPDATE public.shipment SET status = 'delivered', delivered_at = '2027-01-10 10:00+00' WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT is((SELECT dispute_deadline_at FROM public.shipment WHERE id = '00000000-0000-4000-8000-000000031031'), '2027-01-12 10:00+00'::TIMESTAMPTZ,
          'the supplier''s 48 hours to report damage');
SELECT throws_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_delivery_receipt_required', 'acceptance needs the delivery receipt (G5)');

INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000031051', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'shipment', '00000000-0000-4000-8000-000000031031', 'delivery_receipt', 'approved', 'https://example.test/receipt.pdf');
UPDATE public.shipment SET quantity_matches = TRUE, has_damage = TRUE WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT throws_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$,
                 '23514', 'shipment_acceptance_issue', 'damage means disputed, not accepted');

UPDATE public.shipment SET status = 'disputed' WHERE id = '00000000-0000-4000-8000-000000031031';
UPDATE public.shipment SET has_damage = FALSE WHERE id = '00000000-0000-4000-8000-000000031031';

SELECT lives_ok($$ UPDATE public.shipment SET status = 'accepted' WHERE id = '00000000-0000-4000-8000-000000031031' $$, 'a settled dispute is accepted');
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Write `031_shipments.sql`**, the seed change and the error keys; sync.
- [ ] **Step 4: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/031_shipments.sql supabase/tests/database/031_shipments.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -F - <<'EOF'
feat(shipment): shipments with linked orders, capped quantities, S15 events and acceptance rules

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 7: Shipment API (app)

**Files:**
- Create: `app/src/api/shipment/index.ts`, `app/tests/api/shipment.test.ts`
- Modify:
  - `queryKeys.ts`:
    - DERIVED: `shipment: ['shipment_overview']`; `shipment_purchase_order: ['shipment', 'shipment_overview']`; `shipment_line: ['shipment', 'shipment_overview']`; `shipment_event: ['shipment']`; `document` gains `'shipment_overview'`.
    - CASCADES: `shipment: ['shipment_purchase_order', 'shipment_line', 'shipment_event']`.
  - `postgrestErrors.ts`, `field.ts` (`shipment: { name: 'ops-shipment-manage' }`, children with `field: 'shipment_id'`).
  - i18n: `fields.shipment` (also the module name), `fields.shipment_purchase_order`, `fields.shipment_line`, `fields.shipment_event`, `ops.shipment.*`.
  - `fields.test.ts`, `queryKeys.test.ts`, `postgrestErrors.test.ts`.

**Interfaces:**
- Consumes: Task 6; `INCOTERMS` (Task 3); `DocumentRow`, `DocumentType`, `DocumentStatus` (`@/api/document`).
- Produces:
  - Types: `ShipmentStatus`, `ShipmentMode`, `ShipmentRow`, `ShipmentOverviewRow = Views['shipment_overview']['Row']`, `ShipmentLineRow`, `ShipmentEventRow`, and `ShipmentCard`, with the embeds:

```
*, customer!shipment_customer_fkey(code, display_name),
customer_warehouse!shipment_warehouse_fkey(display_name, city, dock_hours, appointment_rule),
shipment_purchase_order!shipment_purchase_order_shipment_fkey(purchase_order!shipment_purchase_order_po_fkey(id, code, status, tolerance_pct,
   purchase_order_line!purchase_order_line_po_fkey(id, quantity, product!purchase_order_line_product_fkey(sku, display_name, is_hazmat)))),
shipment_line!shipment_line_shipment_fkey(*)
```

  - Constants: `SHIPMENT_STATUSES` (`allValues`, enum order), `SHIPMENT_MODES`, `S15_STEPS = [1, …, 20] as const`.
  - `nextShipmentStatuses(status: ShipmentStatus): ShipmentStatus[]`: Task 6 rule 2.
  - `defaultWarehouseId(warehouses: Pick<Tables['customer_warehouse']['Row'], 'id' | 'is_default'>[]): string | null`: the default warehouse, else the only one, else null.
  - `remainingQuantity(ordered: number, tolerancePct: number | null, shippedElsewhere: number): number`: `floor(ordered * (1 + tol/100)) - shippedElsewhere`, and never below 0.
  - `SHIPMENT_DOCUMENT_TYPES = ['commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate', 'customs', 'sds'] as const`. Spec M8 names CI, packing list, B/L-CMR, origin or A.TR (filed as `certificate`), the customs instruction (`customs`) and SDS.
  - `documentChecklist(docs: Pick<DocumentRow, 'type' | 'status' | 'version'>[], hazmat: boolean): { type: DocumentType; status: DocumentStatus | null }[]`: per type, the status of the newest non-superseded document. `sds` is listed only when `hazmat`.
  - `acceptanceHints(shipment: Pick<ShipmentRow, 'quantity_matches' | 'has_damage'>, receiptStatus: DocumentStatus | null): ('shipment_delivery_receipt_required' | 'shipment_acceptance_issue')[]`: a display hint only; the DB decides.
  - `etaState(row: Pick<ShipmentRow, 'eta' | 'status'>, today: string): 'late' | 'this_week' | 'later' | null`:
    - `null` once the shipment is `delivered`, `accepted`, `disputed` or `cancelled`, or when it has no ETA;
    - otherwise `late` when `eta < today`, `this_week` when `eta ≤ today + 7`, else `later`.
  - `useShipmentIds(filter: MaybeRefOrGetter<{ purchaseOrderIds?: string[]; productId?: string }>)`: a `useQuery` over `shipment_overview`, `select('id')`, with the supabase-js builders `.overlaps('purchase_order_ids', purchaseOrderIds)` and `.contains('product_ids', [productId])`; it is disabled (and yields `[]`) when `purchaseOrderIds` is an empty array. It returns `string[]`.
  - `useShipmentOverview(id)`: a `useQuery` over `shipment_overview` with `.eq('id', id).maybeSingle()`, keyed `queryKeys.detail(tenantKey, 'shipment_overview', id)`.
  - `shipmentResource`, `shipmentSchema`, `toShipmentFormValues`, `toShipmentPayload`:
    - all of Task 6's columns except `code`, `status` and `accepted_on`;
    - `customer_id` is sent only without `id`;
    - `incoterm_*` are `z.enum(INCOTERMS).nullish()`;
    - `delivered_at` and `dispute_deadline_at` are `optional(z.date())`; the form values use `value ? new Date(value) : null`, and the payload `toISOString()`.
  - Status and links:
    - `useSetShipmentStatus()`: `updateRow('shipment', id, { status })`, then `invalidateTables(queryClient, ['shipment'])`;
    - `useLinkPurchaseOrder()` (`{ shipmentId, purchaseOrderId }`, insert) and `useUnlinkPurchaseOrder()`; both invalidate `['shipment_purchase_order']`.
  - Lines and events:
    - `shipmentLineResource`, `shipmentLineSchema` (`id?`, `shipment_id`, `purchase_order_id`, `purchase_order_line_id`, `quantity` int ≥ 1, `carton_count` optional) and helpers;
    - `shipmentEventResource`, `shipmentEventSchema` (`id?`, `shipment_id`, `happened_at` `required(z.date())`, `step` optional `z.union` of the `S15_STEPS` literals, `from_party`, `to_party`, `channel`, `note`) and helpers.

NAMED_ERRORS additions ("—" means toast-level):

| code | name | field |
|---|---|---|
| 23503 | shipment_customer_missing | customer_id |
| 23514 | shipment_immutable_field | customer_id |
| 23503 | shipment_warehouse_fkey | delivery_warehouse_id (`errors.shipment_warehouse_customer`) |
| 23514 | shipment_incoterm_buy_valid | incoterm_buy (`errors.incoterm_invalid`) |
| 23514 | shipment_incoterm_sell_valid | incoterm_sell (`errors.incoterm_invalid`) |
| 23514 | shipment_po_not_open | purchase_order_id |
| 23503 | shipment_purchase_order_po_fkey | purchase_order_id (`errors.shipment_po_customer`) |
| 23503 | shipment_line_link_fkey | purchase_order_line_id (`errors.shipment_line_po_not_linked`) |
| 23505 | unique_shipment_line | purchase_order_line_id (`errors.shipment_line_duplicate`) |
| 23514 | shipment_quantity_exceeds_po | quantity |
| 23514 | shipment_locked | quantity |
| 23514 | shipment_status_order, shipment_po_required, shipment_booking_date_required, shipment_eta_required, shipment_delivery_time_required, shipment_delivery_receipt_required, shipment_acceptance_issue, shipment_po_has_lines | — (one entry each) |

Error copy (EN / TR):

| key | en | tr |
|---|---|---|
| shipment_customer_missing | The shipment's customer was not found. | Sevkiyatın müşterisi bulunamadı. |
| shipment_immutable_field | A shipment's code and customer cannot change. | Sevkiyatın kodu ve müşterisi değiştirilemez. |
| shipment_warehouse_customer | Choose one of this customer's warehouses. | Bu müşterinin depolarından birini seçin. |
| shipment_status_order | The shipment cannot move to this status from its current one. | Sevkiyat bu duruma mevcut durumundan geçemez. |
| shipment_po_required | Add a purchase order to the shipment first. | Önce sevkiyata bir PO ekleyin. |
| shipment_booking_date_required | Enter the booking confirmation date. | Booking teyit tarihini girin. |
| shipment_eta_required | Enter ETD and ETA. | ETD ve ETA'yı girin. |
| shipment_delivery_time_required | Enter when the goods were delivered. | Teslimin gerçekleştiği zamanı girin. |
| shipment_delivery_receipt_required | Add the signed delivery receipt (G5 evidence) first. | Önce imzalı teslim tutanağını (G5 kanıtı) ekleyin. |
| shipment_acceptance_issue | Quantities differ or goods are damaged: mark the shipment disputed. | Adet farkı ya da hasar var: sevkiyatı itirazlı işaretleyin. |
| shipment_po_not_open | Only orders with an approved PI that are not closed can be shipped. | Yalnızca PI'ı onaylı ve kapanmamış siparişler sevk edilebilir. |
| shipment_po_customer | The order belongs to another customer. | Sipariş başka bir müşteriye ait. |
| shipment_po_has_lines | Remove the order's lines from the shipment first. | Önce siparişin satırlarını sevkiyattan kaldırın. |
| shipment_line_po_not_linked | Add the line's order to the shipment first. | Önce satırın siparişini sevkiyata ekleyin. |
| shipment_line_duplicate | This order line is already on the shipment. | Bu sipariş satırı sevkiyatta zaten var. |
| shipment_quantity_exceeds_po | More than ordered (tolerance included) would be shipped. | Siparişten (tolerans dahil) fazlası sevk edilmiş olur. |
| shipment_locked | The goods are loaded; orders and lines no longer change. | Mal yüklendi; siparişler ve satırlar artık değişmez. |

UI copy, `ops.shipment.*` (EN / TR; spec M8, S15 and S16 field names; **[owner to confirm]** where neither defines it):
- `title`: Shipments / Sevkiyatlar
- `tabs.{general,dates,orders,events,acceptance,documents,media}`: General, Dates, Orders, Events, Acceptance, Documents, Media / Genel, Tarihler, Siparişler, Olaylar, Teslim kabulü, Belgeler, Ortam
- `fields.*`:
  - Parties and terms:
    - delivery_warehouse Delivery warehouse / Teslim deposu
    - mode Mode / Mod
    - forwarder Forwarder / Forwarder
    - customs_broker Customs broker / Gümrük müşaviri
    - carrier Carrier / Taşıyıcı
    - incoterm_buy Incoterm (buy) / Incoterm alış
    - incoterm_sell Incoterm (sell) / Incoterm satış
    - is_insured Insured / Sigorta var mı
  - Dates:
    - ready_on Ready / Hazır
    - booking_confirmed_on Booking confirmed / Booking teyit
    - etd ETD
    - eta ETA
    - customs_cleared_on Customs cleared / Gümrük çıkış
    - planned_delivery_on Planned delivery / Planlanan teslim
    - delivered_at Delivered / Gerçekleşen teslim
  - Transport:
    - container_no Container / vehicle no / Konteyner/araç no
    - seal_no Seal no / Mühür no
    - free_days_port Free days (port) / Serbest gün (liman)
    - free_days_detention Free days (detention) / Serbest gün (detention)
    - demurrage_note Demurrage tariff note / Demuraj tarifesi notu
  - Quantities: carton_count Cartons / Koli; pallet_count Pallets / Palet; volume_m3 m³; gross_kg Gross kg / Brüt kg
  - Acceptance:
    - accepted_by Received by / Kabul eden
    - accepted_on Accepted on / Tarih
    - quantity_matches Quantities match / Adet uyumlu mu
    - has_damage Damage / Hasar var mı
    - dispute_deadline_at Dispute deadline / İtiraz süresi sonu
  - Events: from_party From / Kim; to_party To / Kime; channel Channel / Kanal; note Note / Not; step Event / Olay
- `mode.*`: fcl20 `FCL 20'`, fcl40 `FCL 40'`, lcl `LCL`, road Road / Kara yolu, courier Courier / Kurye (all S15); air Air / Hava yolu **[owner to confirm]**
- `status.*`:
  - planned: Planned / Planlandı **[owner to confirm]**
  - booked: Booked / Booking yapıldı **[owner to confirm]**
  - loaded: Loaded / Yüklendi (S15)
  - in_transit: In transit / Yolda (M6)
  - at_customs: At customs / Gümrükte **[owner to confirm]**
  - delivered: Delivered / Teslim edildi **[owner to confirm]**
  - accepted: Accepted / Kabul edildi **[owner to confirm]**
  - disputed: Disputed / İtirazlı **[owner to confirm]**
  - cancelled: Cancelled / İptal edildi **[owner to confirm]**
- `document_checklist`: Document checklist / Belge kontrol listesi
- `steps.1` … `20` take S15 §B "Olay" as their TR text verbatim; `steps.other`: Other / Diğer:

| # | en | tr |
|---|---|---|
| 1 | Production finished, goods ready | Üretim bitti, mal hazır |
| 2 | PSI result and G4 | PSI sonucu ve G4 |
| 3 | Booking request | Booking talebi |
| 4 | Booking confirmation | Booking teyidi |
| 5 | Document pre-check | Belge ön kontrolü |
| 6 | Customs broker's OK | Müşavir "uygun" |
| 7 | Loaded | Yükleme yapıldı |
| 8 | Loading notice to the customer | Yüklendi bilgisi |
| 9 | ETD/ETA change | ETD/ETA değişikliği |
| 10 | ETA change to the customer | ETA değişikliği müşteriye |
| 11 | Pre-arrival document set | Varış öncesi belge seti |
| 12 | Warehouse appointment request | Depo randevusu talebi |
| 13 | Appointment confirmation | Randevu teyidi |
| 14 | Customs clearance | Gümrük çıkışı |
| 15 | Last-mile vehicle notice (avis) | Son ayak araç bilgisi (avis) |
| 16 | "Delivery tomorrow" | "Yarın teslim" |
| 17 | Delivered | Teslim gerçekleşti |
| 18 | Delivery and G5 | Teslim ve G5 |
| 19 | Incident (any) | Olay (her türlü) |
| 20 | File closed | Dosya kapanışı |

- `psi_warning`: These orders have no approved PSI report (G4): {codes} / Bu siparişlerin onaylı PSI raporu yok (G4): {codes} **[owner to confirm]**

- [ ] **Step 1: Write `shipment.test.ts`**

```ts
const CUSTOMER = '00000000-0000-4000-8000-000000000001';
const W = '00000000-0000-4000-8000-000000000003';
expect(nextShipmentStatuses('planned')).toEqual(['booked', 'cancelled']);
expect(nextShipmentStatuses('in_transit')).toEqual(['at_customs', 'delivered']);
expect(nextShipmentStatuses('delivered')).toEqual(['accepted', 'disputed']);
expect(nextShipmentStatuses('accepted')).toEqual([]);
expect(remainingQuantity(1000, 5, 1000)).toBe(50);
expect(remainingQuantity(1000, null, 1200)).toBe(0);
expect(defaultWarehouseId([{ id: 'a', is_default: false }, { id: 'b', is_default: true }])).toBe('b');
expect(defaultWarehouseId([{ id: 'a', is_default: false }])).toBe('a');
expect(defaultWarehouseId([{ id: 'a', is_default: false }, { id: 'c', is_default: false }])).toBeNull();
expect(documentChecklist([{ type: 'packing_list', status: 'superseded', version: 1 }, { type: 'packing_list', status: 'approved', version: 2 }], false))
   .toEqual(expect.arrayContaining([{ type: 'packing_list', status: 'approved' }, { type: 'bill_of_lading', status: null }]));
expect(documentChecklist([], false).map((r) => r.type)).not.toContain('sds');
expect(documentChecklist([], true).map((r) => r.type)).toContain('sds');
expect(acceptanceHints({ quantity_matches: true, has_damage: false }, null)).toEqual(['shipment_delivery_receipt_required']);
expect(acceptanceHints({ quantity_matches: true, has_damage: true }, 'approved')).toEqual(['shipment_acceptance_issue']);
expect(etaState({ eta: '2027-01-09', status: 'in_transit' }, '2027-01-10')).toBe('late');
expect(etaState({ eta: '2027-01-15', status: 'loaded' }, '2027-01-10')).toBe('this_week');
expect(etaState({ eta: '2027-01-09', status: 'delivered' }, '2027-01-10')).toBeNull();
expect(toShipmentPayload(shipmentSchema.parse({ ...toShipmentFormValues({ customer_id: CUSTOMER, mode: 'fcl20', delivery_warehouse_id: W }), delivered_at: new Date('2027-01-10T10:00:00Z') })))
   .toMatchObject({ customer_id: CUSTOMER, delivered_at: '2027-01-10T10:00:00.000Z' });
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23514', message: 'shipment_quantity_exceeds_po' }, ['quantity'])).toEqual({ quantity: i18n.t('errors.shipment_quantity_exceeds_po') });
// queryKeys.test.ts
expect(affectedTables(['shipment_line'])).toEqual(expect.arrayContaining(['shipment', 'shipment_overview']));
expect(affectedTables(['shipment'])).toEqual(expect.arrayContaining(['shipment_line', 'shipment_overview']));
```

- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/api/shipment.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then sync i18n.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/shipment app/src/api/queryKeys.ts app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests
git commit -F - <<'EOF'
feat(shipment): shipment API with status flow, quantity and document checklist helpers

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 8: Shipment list and card

**Files:**
- Create:
  - `app/src/components/service-components/shipment-table/ShipmentTable.vue`
  - `app/src/views/pages/ops/shipment/{Index,Manage,ShipmentCard,LineUpsert,EventUpsert}.vue`
  - `app/src/views/pages/ops/shipment/useShipmentForm.ts`
  - `app/src/views/pages/ops/shipment/tabs/{General,Dates,Orders,Events,Acceptance,Documents,Media}.vue`
  - `app/tests/views/shipmentForm.test.ts`
- Modify:
  - `app/src/router/routes/ops.ts`;
  - i18n: `route.label.ops_shipment*`, `ops.shipment.{packing_list_hint, remaining, add_order, no_rows}`.

**Interfaces:**
- Consumes: Task 7 (incl. `useShipmentIds`), `StatusActions` (Task 5), `EntityDocuments`, `EntityMedia`, `useEntityDocuments`, `useLookup`.
- Produces:
  - `ShipmentTable.vue` props `{ filters?: { purchaseOrderIds?: string[]; productId?: string } }`.
    - A ResourceTable over `shipment_overview` that follows the global customer filter.
    - Columns: code, customer_code, warehouse_name, mode, status, ETD, ETA (a danger Tag when `etaState` is `late`), `purchase_order_codes`.
    - `purchaseOrderIds` / `productId` resolve `useShipmentIds(filters)` (Task 7) and filter `id` with the existing IN match mode.
    - When a filter is given and the id list is empty (or still loading), it renders `ops.shipment.no_rows` and does not mount the ResourceTable: an empty IN filter would be skipped and match every shipment.
  - `Index.vue`: a page card with `ShipmentTable`.
  - `useShipmentForm(id, onSaved?)`:
    - `SHIPMENT_CARD_TABS = ['general', 'dates', 'orders', 'events', 'acceptance', 'documents', 'media'] as const`;
    - `tabForField(field)`: date fields → `'dates'`; S16 fields → `'acceptance'`; else `'general'`;
    - once a customer is chosen, a new shipment's warehouse is `defaultWarehouseId(warehouses)` (`useLookup('customer_warehouse', { in: { column: 'customer_id', values: [customerId] } })`);
    - the injection key is `SHIPMENT_FORM`.
  - `ShipmentCard.vue` / `Manage.vue`:
    - the ProductCard pattern;
    - the header shows `code`, a status Tag and `StatusActions`;
    - `useShipmentOverview(id)` is called once and provided as `SHIPMENT_OVERVIEW`.
  - `tabs/General.vue`: customer (new only); the warehouse, with the warehouse's S14 dock hours and appointment rule shown read-only under it; mode; parties; incoterms; insured; transport fields; packed quantities (with the hint `packing_list_hint`); notes.
  - `tabs/Dates.vue`: the seven dates, and `etaState` as a Tag beside ETA.
  - `tabs/Orders.vue`:
    - the linked POs with their lines and each line's quantity on this shipment;
    - per line: "Add" (`ops-shipment-line-add`, query `purchaseOrderLineId`), or "Edit"/"Remove";
    - "Add order" (`add_order`) is a plain `Dialog` listing the customer's POs in `pi_approved`…`balance_paid` that are not linked yet (`useLookup('purchase_order_overview', { select: 'id, code, status, customer_id', in: { column: 'status', values: [...] } })`, filtered client-side to the customer);
    - "Remove order" is enabled only for a PO without lines on the shipment;
    - every action is hidden from `loaded` on;
    - a PO in `overview.psi_missing_po_codes` carries a warn Tag.
  - `LineUpsert.vue` (route dialog):
    - the quantity defaults to `remainingQuantity(ordered, tolerance, shippedElsewhere)`, shown as `remaining`;
    - `shippedElsewhere` comes from `useLookup('shipment_line', { select: 'quantity, shipment_id, shipment!shipment_line_shipment_fkey(status)', in: { column: 'purchase_order_line_id', values: [lineId] } })`, without this shipment and cancelled ones;
    - then cartons.
  - `tabs/Events.vue` and `EventUpsert.vue`:
    - a timeline newest first: step label (`ops.shipment.steps.<n>` or `steps.other`), from → to, channel, note;
    - add/edit through `ops-shipment-event-add` / `-edit`;
    - the step is a `Select` over `S15_STEPS`.
  - `tabs/Acceptance.vue`:
    - the S16 fields (in the shared form);
    - `documentChecklist(documents, anyHazmat)` as rows of type label and status Tag, linking to the Documents tab;
    - `acceptanceHints(form, receiptStatus)` as `errors.<code>` texts under the fields;
    - the dispute deadline.
  - Header `StatusActions`:
    - `next = nextShipmentStatuses(status)`, `i18nPrefix 'ops.shipment.status'`;
    - `warnings.loaded = t('ops.shipment.psi_warning', { codes })` when `psi_missing_po_codes` is non-empty (K3: a warning only);
    - `onChange` calls `useSetShipmentStatus`.
  - Routes:
    - `ops-shipment` (`shipments`, `PrimeIcons.SEND`; `TRUCK` is the supplier's);
    - `-list`;
    - `-manage` (`:id?/manage/:tab?`, one child per `SHIPMENT_CARD_TABS` entry, all created here);
    - `ops-shipment-line-add` (`:shipmentId/line/add`) / `-edit` (`line/:id/edit`);
    - `ops-shipment-event-add` (`:shipmentId/event/add`) / `-edit` (`event/:id/edit`).
- [ ] **Step 1: Write `shipmentForm.test.ts`**
  - `tabForField('eta') === 'dates'` and `tabForField('has_damage') === 'acceptance'`.
  - Choosing a customer whose warehouses are `[{ id: 'w1', is_default: true }]` sets `delivery_warehouse_id` to `'w1'`.
  - `Orders.vue` with status `loaded` renders no add/remove buttons.
  - `Acceptance.vue` with a hazmat line lists the `sds` row with a null status.
  - `ShipmentTable` with `filters: { purchaseOrderIds: [] }` renders `ops.shipment.no_rows` and does not mount `ResourceTable`.
- [ ] **Step 2: Run it and see it fail.** Run: `pnpm test tests/views/shipmentForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then walk it in the browser:
  1. Create `SHP-THO-<year>-001` to Rosbach.
  2. Link the Task 5 PO and add its MOP40 line.
  3. Booking without a date shows the toast.
  4. With the dates set, move it on to delivered.
  5. Acceptance without a receipt is refused; with an approved receipt it is accepted.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/shipment-table app/src/views/pages/ops/shipment app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/views/shipmentForm.test.ts
git commit -F - <<'EOF'
feat(shipment): shipment list and card with orders, S15 events, S16 acceptance and documents

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 9: Gate evidence from orders and shipments, G3 PI rule, history tabs

**Files:**
- Create:
  - `supabase/migrations/032_gate_links.sql`, `supabase/tests/database/032_gate_links.test.sql`
  - `app/tests/components/GatePanel.test.ts`
  - `app/src/views/pages/ops/project/tabs/{PurchaseOrders,Shipments}.vue`
  - `app/src/views/pages/ops/supplier/tabs/PurchaseOrders.vue`
  - `app/src/views/pages/ops/product/tabs/Orders.vue`
- Modify:
  - `supabase/tests/database/021_projects.test.sql`: the G3 pass at line 334 must now meet the new rule. Insert before it
    (the test runs as `ayse@` in Atlas; ids `…021901`–`…021904`), and give that `pass_gate` call the evidence array
    `ARRAY['00000000-0000-4000-8000-000000021904']::UUID[]`:

```sql
INSERT INTO public.supplier (id, tenant_id, code, display_name, country, status)
VALUES ('00000000-0000-4000-8000-000000021901', current_setting('test.tenant_id')::UUID, 'AT1', 'Atlas Hose Works', 'Türkiye', 'approved');
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, project_id, currency, incoterm)
VALUES ('00000000-0000-4000-8000-000000021902', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000021901', '00000000-0000-4000-8000-000000000214', 'USD', 'FOB');
INSERT INTO public.purchase_order_line (id, tenant_id, purchase_order_id, product_id, quantity, unit_price)
VALUES ('00000000-0000-4000-8000-000000021903', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000021902', '00000000-0000-4000-8000-000000000213', 10, 1);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000021904', current_setting('test.tenant_id')::UUID, '00000000-0000-4000-8000-000000000212', 'purchase_order', '00000000-0000-4000-8000-000000021902', 'pi', 'https://example.test/pi.pdf');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000021904', status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000021902';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate((SELECT u.id FROM public.user u WHERE u.email = 'ayse@moesa-panel.test'), current_setting('test.tenant_id')::UUID);
```
  - `app/src/api/project/index.ts`: `gateEvidenceEntityIds`, `useProjectOperations`.
  - `GatePanel.vue`: the evidence and approval lookup.
  - `project/Manage.vue` (tabs `purchase_orders`, `shipments`), `supplier/Manage.vue` (tab `purchase_orders`).
  - `product/useProductForm.ts`: `PRODUCT_CARD_TABS` gains `'orders'` before `documents`; `ProductCard.vue` mounts it.
  - `app/src/lib/form/postgrestErrors.ts`: a toast-level `gate_pi_required` entry.
  - `ops.ts`, i18n (`errors.gate_pi_required`, tab labels, `ops.project.new_purchase_order`).

**Interfaces:**
- Consumes: `PurchaseOrderTable` (Task 4), `ShipmentTable` (Task 8), `purchase_order.pi_document_id`/`status` (Tasks 1–2), 021's `private.project_gate_guard` and `public.pass_gate`.
- Produces (SQL), each with `CREATE OR REPLACE` and the 021 body otherwise unchanged:
  - **Changed evidence predicate**, in `project_gate_guard` and `pass_gate`. Today it accepts a document of the gate or of its project. It now also accepts a document `d` that belongs to:
    - (a) `d.entity_type = 'purchase_order'`, with `d.entity_id` a purchase order of the gate's project (`project_id`) in the tenant; or
    - (b) `d.entity_type = 'shipment'`, with `d.entity_id` a shipment linked (`shipment_purchase_order`) to such a purchase order.

    `pass_gate` stays SECURITY INVOKER with the predicate inline (no private call).
  - **New rule in `project_gate_guard`**, after the `gate_evidence_invalid` check. It applies when `NEW.code = 'G3'` and holds unconditionally, like G2's spec rule (spec M5: only G2 and G3 block). Unless one of the evidence documents is the `pi_document_id` of a non-cancelled purchase order of the project at `pi_approved` or later, it raises `gate_pi_required`.
  - The header comment states the K3/M5 link: G3's evidence is the PO's PI (hard), G4's is the PSI report (warning), and G5's is the shipment's delivery receipt (warning). Shipments are not tied to a gate's pass.
- Produces (app):
  - `gateEvidenceEntityIds({ gateId, projectId, purchaseOrderIds, shipmentIds }): string[]` returns `[gate, project, ...purchaseOrderIds, ...shipmentIds]`.
  - `useProjectOperations(projectId)` returns `{ purchaseOrderIds, shipmentIds }`. Two `useLookup`s:
    - `purchase_order` with `in: { column: 'project_id', values: [projectId] }`;
    - `shipment_purchase_order` (select `shipment_id`) with `in: { column: 'purchase_order_id', values: purchaseOrderIds }`, enabled only while `purchaseOrderIds.length > 0`, since an empty `in` is skipped.
  - Tabs:
    - project `PurchaseOrders.vue`: `PurchaseOrderTable :filters="{ projectId }"`, and a `new_purchase_order` button that opens `ops-purchase-order-manage` with query `project_id`/`customer_id` (`$can('create','purchase_order')`);
    - project `Shipments.vue`: `ShipmentTable :filters="{ purchaseOrderIds }"`;
    - supplier `PurchaseOrders.vue`: `PurchaseOrderTable :filters="{ supplierId }"` (M2 "PO geçmişi");
    - product `Orders.vue`: `PurchaseOrderTable` and `ShipmentTable` with `{ productId }` (M3);
    - routes `ops-project-manage-purchase_orders`, `-shipments`, `ops-supplier-manage-purchase_orders`, `ops-product-manage-orders`, each tab shown with `$can('read', 'purchase_order' | 'shipment')`.
- Copy (EN / TR):
  - `errors.gate_pi_required`: G3 needs an approved PI: cite the PI of one of the project's orders whose PI is approved. / G3 için onaylı PI gerekir: projenin PI'ı onaylanmış bir siparişinin PI belgesini kanıt olarak ekleyin.
  - `ops.project.tabs.{purchase_orders,shipments}`: Purchase orders, Shipments / Satın alma, Sevkiyatlar
  - `ops.supplier.tabs.purchase_orders`: Purchase orders / PO geçmişi
  - `ops.product.tabs.orders`: Orders and shipments / PO/sevkiyat geçmişi
  - `ops.project.new_purchase_order`: New purchase order / Yeni PO
- [ ] **Step 1: Write `032_gate_links.test.sql`** — `plan(5)`, the preamble, then:

```sql
-- Gate approvals (G1, G2, G3, G5), and G1 and G2 passed the real way.
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'project_gate', (SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = x.code::public.gate_code),
       'gate_approval', 'approved', 'https://example.test/' || x.code || '.pdf'
FROM (VALUES ('00000000-0000-4000-8000-000000032011'::UUID, 'G1'), ('00000000-0000-4000-8000-000000032012', 'G2'), ('00000000-0000-4000-8000-000000032013', 'G3'), ('00000000-0000-4000-8000-000000032015', 'G5')) AS x (id, code);
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G1'), 'brief ok', current_date, '00000000-0000-4000-8000-000000032011');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G2'), 'spec ok', current_date, '00000000-0000-4000-8000-000000032012');

-- Orders: P (the pilot's, PI approved), P2 (the pilot's, only sent), Q (no project); a shipment of P.
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, project_id, currency)
VALUES ('00000000-0000-4000-8000-000000032021', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, current_setting('test.pilot')::UUID, 'USD'), ('00000000-0000-4000-8000-000000032022', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, current_setting('test.pilot')::UUID, 'USD'),
       ('00000000-0000-4000-8000-000000032023', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, NULL, 'USD');
INSERT INTO public.purchase_order_line (tenant_id, purchase_order_id, product_id, quantity, unit_price)
SELECT current_setting('test.moesa')::UUID, x.id, current_setting('test.mop')::UUID, 10, 1 FROM (VALUES ('00000000-0000-4000-8000-000000032021'::UUID), ('00000000-0000-4000-8000-000000032022'), ('00000000-0000-4000-8000-000000032023')) AS x (id);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, url)
VALUES ('00000000-0000-4000-8000-000000032031', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032021', 'pi', 'https://example.test/pi-p.pdf'),
       ('00000000-0000-4000-8000-000000032032', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032022', 'pi', 'https://example.test/pi-p2.pdf'),
       ('00000000-0000-4000-8000-000000032033', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'purchase_order', '00000000-0000-4000-8000-000000032023', 'pi', 'https://example.test/pi-q.pdf');
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000032031', status = 'pi_approved' WHERE id = '00000000-0000-4000-8000-000000032021';
UPDATE public.purchase_order SET pi_document_id = '00000000-0000-4000-8000-000000032032', status = 'sent' WHERE id = '00000000-0000-4000-8000-000000032022';
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
VALUES ('00000000-0000-4000-8000-000000032041', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', current_setting('test.rosbach')::UUID);
INSERT INTO public.shipment_purchase_order (shipment_id, purchase_order_id, tenant_id) VALUES ('00000000-0000-4000-8000-000000032041', '00000000-0000-4000-8000-000000032021', current_setting('test.moesa')::UUID);
INSERT INTO public.document (id, tenant_id, customer_id, entity_type, entity_id, type, status, url)
VALUES ('00000000-0000-4000-8000-000000032042', current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'shipment', '00000000-0000-4000-8000-000000032041', 'delivery_receipt', 'approved', 'https://example.test/receipt.pdf');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;

SELECT throws_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032033']::UUID[]) $$,
                 '23514', 'gate_evidence_invalid', 'another project''s PI is not evidence');
SELECT throws_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032032']::UUID[]) $$,
                 '23514', 'gate_pi_required', 'G3 needs an approved PI');
SELECT lives_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G3'), 'PI ok', current_date, '00000000-0000-4000-8000-000000032013', ARRAY['00000000-0000-4000-8000-000000032031']::UUID[]) $$,
                'the project''s approved PO PI passes G3');

UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;
SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G4'), 'PSI ok');
UPDATE public.project_task SET status = 'done' WHERE project_id = current_setting('test.pilot')::UUID;

SELECT lives_ok($$ SELECT public.pass_gate((SELECT id FROM public.project_gate WHERE project_id = current_setting('test.pilot')::UUID AND code = 'G5'), 'delivered', current_date, '00000000-0000-4000-8000-000000032015', ARRAY['00000000-0000-4000-8000-000000032042']::UUID[]) $$,
                'the shipment''s delivery receipt is G5 evidence');
SELECT is((SELECT current_phase FROM public.project WHERE id = current_setting('test.pilot')::UUID), 'L1'::public.project_phase,
          'the project still advances as before');
```

- [ ] **Step 2: Write `GatePanel.test.ts`**
  - `gateEvidenceEntityIds({ gateId: 'g', projectId: 'p', purchaseOrderIds: ['o'], shipmentIds: ['s'] })` equals `['g', 'p', 'o', 's']`.
  - Mounting `GatePanel` with `useProjectOperations` mocked to `(['o'], ['s'])` passes those ids to the document lookup (assert the mocked `useLookup`'s `in.values`).
- [ ] **Step 3: Run them and see them fail.** Run: `pnpm test:db && pnpm test tests/components/GatePanel.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the migration, the 021 test fixture, the helpers, tabs, routes, NAMED_ERRORS and i18n.
- [ ] **Step 5: Sync i18n.** Run: `pnpm i18n-sync`. Expected: the other locales gain the new keys.
- [ ] **Step 6: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS (021 included). In the browser, check that:
  - the pilot shows its PO and shipment tabs;
  - G3's pass dialog offers the PO's PI document;
  - passing G3 without it shows the `gate_pi_required` toast.
- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/032_gate_links.sql supabase/tests/database/032_gate_links.test.sql supabase/tests/database/021_projects.test.sql supabase/functions/_shared/database.types.ts app/src/api/project/index.ts app/src/lib/form/postgrestErrors.ts app/src/components/service-components/gate-panel app/src/views/pages/ops/project app/src/views/pages/ops/supplier app/src/views/pages/ops/product app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/components/GatePanel.test.ts
git commit -F - <<'EOF'
feat(project): G3 needs an approved PO PI; gates cite PO and shipment evidence; history tabs

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 10: Dashboard boxes for orders and shipments

**Files:**
- Create: `supabase/migrations/033_dashboard_operations.sql`, `supabase/tests/database/033_dashboard_operations.test.sql`
- Modify: `app/src/api/dashboard/index.ts`, `app/src/views/pages/dashboard/Index.vue`, `app/src/api/queryKeys.ts`, `app/tests/api/{dashboard,queryKeys}.test.ts`, i18n `dashboard.ops.*`.

**Interfaces:**
- Consumes: `purchase_order_overview` (Task 2), `shipment_overview` (Task 6), `CountListCard`, `useDashboardView`.
- Produces (SQL). Both views are `security_invoker`, with `GRANT SELECT … TO authenticated` and a `COMMENT`, as in 022:
  - `public.dashboard_purchase_order`: over `purchase_order_overview` (whose `deposit_planned_on` and `balance_planned_on` it passes through), the POs that are not `draft`, `closed` or `cancelled`. Columns:
    - `purchase_order_id`, `code`, `customer_id`, `customer_code`, `supplier_code`, `tenant_id`, `status`;
    - `ready_on`, `days_to_ready INT`;
    - `deposit_planned_on`, `balance_planned_on` (from the overview);
    - `system_total`, `currency`.
  - `public.dashboard_shipment`: over `shipment_overview`, the shipments that are not `accepted` or `cancelled`. Columns:
    - `shipment_id`, `code`, `customer_id`, `customer_code`, `tenant_id`, `status`, `mode`;
    - `etd`, `eta`, `days_to_eta INT`;
    - `overdue BOOLEAN` (`eta < current_date AND status IN ('planned','booked','loaded','in_transit','at_customs')`);
    - `warehouse_name`, `dispute_deadline_at`.
- Produces (app):
  - `useDashboardPurchaseOrders()` (order `ready_on` ascending) and `useDashboardShipments()` (order `eta` ascending). The `DashboardView` union gains both views.
  - `groupPurchaseOrders(rows)` returns `{ action, production }`:
    - `action`: `sent`, `pi_received`, `pi_approved`;
    - `production`: `deposit_paid`, `in_production`, `ready`, `balance_paid`;
    - rows keep their order.
  - `groupShipments(rows)` returns `{ inTransit, late }`:
    - `inTransit`: `loaded`, `in_transit`, `at_customs`;
    - `late`: `overdue`.
  - `Index.vue` adds four `CountListCard`s, each item linking to its card. Meta strings go through i18n with dates formatted `DD.MM` by dayjs:
    - action POs: `PrimeIcons.SHOPPING_CART`, warn, meta = the status label;
    - production POs: `PrimeIcons.COG`, info, meta = `meta.ready` and `meta.balance` when set;
    - shipments in transit: `PrimeIcons.SEND`, info, meta = `meta.eta`;
    - late shipments: `PrimeIcons.EXCLAMATION_TRIANGLE`, danger, meta = `meta.late`.

    The PO boxes need `$can('read','purchase_order')` and the shipment boxes `$can('read','shipment')`.
  - queryKeys DERIVED:
    - `purchase_order`, `purchase_order_line` and `purchase_order_payment` gain `'dashboard_purchase_order'` (lines change `system_total`);
    - `shipment` and `shipment_purchase_order` gain `'dashboard_shipment'`.
- Copy (`dashboard.ops.*`, EN / TR):
  - `po_action`: Purchase orders waiting for action / Aksiyon bekleyen PO'lar **[owner to confirm]**
  - `po_production`: Purchase orders in production / Üretimdeki PO'lar (M6)
  - `shipments_in_transit`: Shipments on the way / Yoldaki sevkiyatlar (M6)
  - `shipments_late`: Late shipments / Geciken sevkiyatlar **[owner to confirm]**
  - `meta.ready`: Ready {date} / Hazır {date}
  - `meta.balance`: Balance {date} / Bakiye {date}
  - `meta.eta`: ETA {date} / ETA {date}
  - `meta.late`: {n} days late / {n} gün gecikti
- [ ] **Step 1: Write `033_dashboard_operations.test.sql`** — `plan(6)`, the preamble, then:

```sql
INSERT INTO public.purchase_order (id, tenant_id, customer_id, supplier_id, currency)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, current_setting('test.tr1')::UUID, 'USD'
FROM (VALUES ('00000000-0000-4000-8000-000000033011'::UUID), ('00000000-0000-4000-8000-000000033012'), ('00000000-0000-4000-8000-000000033013'), ('00000000-0000-4000-8000-000000033014')) AS x (id);
INSERT INTO public.purchase_order_payment (tenant_id, purchase_order_id, kind, amount, currency, planned_on)
VALUES (current_setting('test.moesa')::UUID, '00000000-0000-4000-8000-000000033012', 'balance', 100, 'USD', '2027-02-01');
INSERT INTO public.shipment (id, tenant_id, customer_id, mode, delivery_warehouse_id)
SELECT x.id, current_setting('test.moesa')::UUID, current_setting('test.tho')::UUID, 'road', current_setting('test.rosbach')::UUID FROM (VALUES ('00000000-0000-4000-8000-000000033041'::UUID), ('00000000-0000-4000-8000-000000033042'), ('00000000-0000-4000-8000-000000033043')) AS x (id);
RESET ROLE;
SELECT set_config('moesa.rules_bypass', '1', TRUE);
UPDATE public.purchase_order SET status = x.status::public.purchase_order_status
FROM (VALUES ('00000000-0000-4000-8000-000000033011'::UUID, 'sent'), ('00000000-0000-4000-8000-000000033012', 'in_production'), ('00000000-0000-4000-8000-000000033014', 'cancelled')) AS x (id, status)
WHERE purchase_order.id = x.id;
UPDATE public.shipment SET status = x.status::public.shipment_status, eta = x.eta
FROM (VALUES ('00000000-0000-4000-8000-000000033041'::UUID, 'in_transit', current_date - 2), ('00000000-0000-4000-8000-000000033042', 'loaded', current_date + 3),
             ('00000000-0000-4000-8000-000000033043', 'accepted', current_date)) AS x (id, status, eta)
WHERE shipment.id = x.id;
SELECT set_config('moesa.rules_bypass', '', TRUE);
SELECT private.impersonate(current_setting('test.koordinator')::UUID, current_setting('test.moesa')::UUID);

SELECT is((SELECT string_agg(status::TEXT, ',' ORDER BY status) FROM public.dashboard_purchase_order
           WHERE purchase_order_id IN ('00000000-0000-4000-8000-000000033011', '00000000-0000-4000-8000-000000033012', '00000000-0000-4000-8000-000000033013', '00000000-0000-4000-8000-000000033014')),
          'sent,in_production', 'open orders only');
SELECT is((SELECT balance_planned_on FROM public.dashboard_purchase_order WHERE purchase_order_id = '00000000-0000-4000-8000-000000033012'),
          '2027-02-01'::DATE, 'the balance date');
SELECT is((SELECT overdue FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033041'), TRUE, 'a passed ETA is late');
SELECT is((SELECT days_to_eta FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033042'), 3, 'days to ETA');
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment WHERE shipment_id = '00000000-0000-4000-8000-000000033043'), 0,
          'accepted shipments leave the dashboard');

SELECT private.impersonate((SELECT id FROM public.user WHERE email = 'ayse@moesa-panel.test'),
                           (SELECT id FROM public.tenant WHERE display_name = 'Atlas Danışmanlık'));
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment), 0, 'another tenant sees none');
```

- [ ] **Step 2: Extend the app tests.**
  - `groupPurchaseOrders` over the statuses `sent`, `ready`, `pi_approved` gives `action` = `[sent, pi_approved]` and `production` = `[ready]`.
  - `groupShipments` over `{ status: 'in_transit', overdue: true }` and `{ status: 'booked', overdue: true }` gives one `inTransit` row and two `late` rows.
  - `affectedTables(['purchase_order_line'])` contains `'dashboard_purchase_order'`.
  - `affectedTables(['shipment'])` contains `'dashboard_shipment'`.
- [ ] **Step 3: Run them and see them fail.** Run: `pnpm test:db && pnpm test tests/api/dashboard.test.ts tests/api/queryKeys.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the migration, hooks, boxes and i18n; sync.
- [ ] **Step 5: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/033_dashboard_operations.sql supabase/tests/database/033_dashboard_operations.test.sql supabase/functions/_shared/database.types.ts app/src/api/dashboard app/src/api/queryKeys.ts app/src/views/pages/dashboard/Index.vue app/src/plugins/i18n/locales app/tests/api
git commit -F - <<'EOF'
feat(dashboard): orders waiting for action, orders in production, shipments on the way and late

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 11: Glossary for the new enums

**Files:**
- Modify:
  - `app/src/api/glossary.ts`, `app/tests/plugins/i18n/glossary.test.ts`, `app/tests/components/StatusActions.test.ts`, i18n `glossary.*`;
  - `app/src/components/service-components/status-actions/StatusActions.vue`: the `glossary` prop;
  - `app/src/views/pages/ops/purchase-order/PurchaseOrderCard.vue` and `app/src/views/pages/ops/shipment/ShipmentCard.vue`: they pass `glossary`;
  - `PurchaseOrderTable.vue`, `ShipmentTable.vue`, `shipment/tabs/General.vue` and `purchase-order/PaymentUpsert.vue`: `SelectEnum` gains `glossary="…"`.

**Interfaces:**
- Consumes: `PURCHASE_ORDER_STATUSES`, `PAYMENT_KINDS` (Task 3); `SHIPMENT_STATUSES`, `SHIPMENT_MODES` (Task 7); `glossaryKey`, `GlossaryEnum`.
- Produces:
  - `GLOSSARY_ENUMS` gains `purchase_order_status`, `payment_kind`, `shipment_status` and `shipment_mode`.
  - `StatusActions` gains the optional prop `glossary?: GlossaryEnum`: each button gets `v-tooltip` = `t(glossaryKey(glossary, status))` when `te` finds it.

The copy is exact. Rows marked **[owner to confirm]** are the developer's reading where neither the spec nor S09, S15 or S16 defines the meaning; the marker is not copied into the JSON.

| key | en | tr |
|---|---|---|
| purchase_order_status.draft | Being prepared; not sent to the supplier. | Hazırlanıyor; tedarikçiye gönderilmedi. |
| purchase_order_status.sent | Sent to the supplier; every required line cites a signed or approved spec sheet (K3). | Tedarikçiye gönderildi; gereken her satırda imzalı ya da onaylı spec sheet var (K3). |
| purchase_order_status.pi_received | The supplier's PI is in and is being checked (S09). | Tedarikçinin PI'ı geldi, kontrol ediliyor (S09). |
| purchase_order_status.pi_approved | All 30 S09 items OK and the figures add up; lines and terms are fixed. | S09'un 30 maddesi uygun ve rakamlar tutuyor; satırlar ve şartlar sabitlendi. |
| purchase_order_status.deposit_paid | The deposit is paid; production can start. **[owner to confirm]** | Depozito ödendi; üretim başlayabilir. |
| purchase_order_status.in_production | The supplier is producing the order. | Tedarikçi siparişi üretiyor. |
| purchase_order_status.ready | Production finished; goods ready for PSI and loading. **[owner to confirm]** | Üretim bitti; mal PSI ve yüklemeye hazır. |
| purchase_order_status.balance_paid | The balance is paid; per G4, only after an approved PSI. | Bakiye ödendi; G4'e göre yalnızca onaylı PSI'dan sonra. |
| purchase_order_status.closed | Delivered and settled; nothing left to do. **[owner to confirm]** | Teslim edildi ve kapandı; yapılacak iş kalmadı. |
| purchase_order_status.cancelled | Cancelled; kept for the record. | İptal edildi; kayıt için saklanır. |
| payment_kind.deposit | Advance paid before production (deposit %). | Üretimden önce ödenen avans (depozito %). |
| payment_kind.balance | The rest of the total, after the PSI. | Toplamın kalanı, PSI'dan sonra. |
| payment_kind.other | Any other payment, e.g. tooling or samples. **[owner to confirm]** | Diğer ödemeler, ör. kalıp ya da numune. |
| shipment_status.planned | Planned; no booking yet. **[owner to confirm]** | Planlandı; henüz booking yok. |
| shipment_status.booked | The forwarder confirmed the booking (S15 step 4). | Forwarder booking'i teyit etti (S15 adım 4). |
| shipment_status.loaded | Loaded; the orders and quantities are fixed (S15 step 7). | Yüklendi; siparişler ve adetler sabitlendi (S15 adım 7). |
| shipment_status.in_transit | On the way; ETD and ETA are known. | Yolda; ETD ve ETA belli. |
| shipment_status.at_customs | Waiting for customs clearance. **[owner to confirm]** | Gümrük çıkışını bekliyor. |
| shipment_status.delivered | Delivered to the warehouse; the dispute period runs. | Depoya teslim edildi; itiraz süresi işliyor. |
| shipment_status.accepted | Fully accepted with a signed delivery receipt (G5 evidence). | İmzalı teslim tutanağıyla tam kabul edildi (G5 kanıtı). |
| shipment_status.disputed | Delivered with reservations or refused: shortage, surplus or damage (S16). | Rezervli teslim ya da red: eksik, fazla ya da hasar (S16). |
| shipment_status.cancelled | Cancelled before loading; kept for the record. **[owner to confirm]** | Yüklemeden önce iptal edildi; kayıt için saklanır. |
| shipment_mode.fcl20 | Full 20-foot container. | Tam 20 ft konteyner. |
| shipment_mode.fcl40 | Full 40-foot container. | Tam 40 ft konteyner. |
| shipment_mode.lcl | Less than container load, shared container. | Parsiyel, paylaşılan konteyner. |
| shipment_mode.road | By truck. | Kara yolu, kamyon. |
| shipment_mode.courier | Courier or parcel service. | Kurye ya da kargo. |
| shipment_mode.air | Air freight. **[owner to confirm]** | Hava kargo. |

- [ ] **Step 1: Update the tests.**
  - `glossary.test.ts`: the expected sorted key list adds `payment_kind`, `purchase_order_status`, `shipment_mode` and `shipment_status`.
  - `StatusActions.test.ts`: with `glossary: 'shipment_status'`, the `accepted` button's tooltip value equals `i18n.t('glossary.shipment_status.accepted')`.
- [ ] **Step 2: Run them and see them fail.** Run: `pnpm test tests/plugins/i18n/glossary.test.ts tests/components/StatusActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the registry, prop, call sites and JSON; run `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/glossary.ts app/src/components/service-components app/src/views/pages/ops app/src/plugins/i18n/locales app/tests
git commit -F - <<'EOF'
feat(i18n): glossary of order and shipment statuses, payment kinds and modes

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

### Task 12: Full verification and the Phase 2 acceptance walk

**Files:**
- None, unless a defect is found; it is fixed in the owning task's files.

- [ ] **Step 1: Run the whole suite.** Run (`app/`): `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: every step PASSes, and `git status` shows no regenerated-type drift.
- [ ] **Step 2: Walk the acceptance scenario** (`pnpm dev:vue`, `koordinator@moesa-panel.test`; spec §9, Phase 2 criteria 1–2):
  1. On the pilot's "Purchase orders" tab, open a new PO for THO / CN1 in USD. It shows FOB and 30 % from the supplier.
  2. Add a TIPS line (1000 × 0.85).
  3. As `akif@`, set `spec_sheet_required_from` to today. Lines shows the missing-spec hint, and "Send" is refused with `po_spec_sheet_required`.
  4. Add a signed TIPS spec sheet on the product (the seed has none) and reference it. Sending passes. Reset the setting.
  5. Add a PI document and enter totals 850 / 900, with one figure wrong. "PI received" passes. "PI approved" is refused, and the row is marked red.
  6. Fix the figures and tick the 30 items. Approval passes, and the fields lock.
  7. Plan payments from the PI, pay the deposit, then move to in production and ready.
  8. "Balance paid" shows the PSI warning. Add an approved PSI report and pay the balance.
  9. Create a shipment to Rosbach, link the PO and ship 1000. Sixty more on a second shipment are refused (`shipment_quantity_exceeds_po`; the tolerance is 0).
  10. Take the first shipment through booked (with its date), loaded, in transit (ETD/ETA), delivered, and accepted with an approved delivery receipt. Log S15 steps 4, 7 and 17 on the way.
  11. On the dashboard, the PO moves from "waiting for action" to "in production" and leaves it at balance paid. The shipment shows "on the way" with its ETA, and moves to "late" after its ETA is set to yesterday.
  12. On the pilot, G3's pass needs the PO's PI. G5 offers the shipment's delivery receipt as evidence.
- [ ] **Step 3: Walk the Review Focus**
  - A PO line with another customer's product shows a field message, not FK text.
  - After PI approval, a direct `PATCH /purchase_order?id=eq.<id>` with `{"currency":"EUR"}` from the browser console returns `po_locked`.
  - A new product with no shipments shows an empty "Orders and shipments" tab, not all shipments.
- [ ] **Step 4: Push and check CI.** Expected: `app`, `functions` and `database` are green. Commit only if Steps 2–3 needed fixes:

```bash
git commit -F - <<'EOF'
fix(po): <what the acceptance walk found>

<the Co-Authored-By trailer the implementer's session provides>
EOF
```

---

## Self-review notes

- **Spec coverage**
  - **M7**
    - The record, lines, terms and code (K5) are in T1, with the spec's status list. The PI check (S09 arithmetic and checklist) spans T2, T3 and T5; payments and production are in T5.
    - "sent needs spec sheet" (K3 rule 2, §11 decision 5, date as a setting) is in T2. The PSI-before-balance warning is in T3/T5.
    - The G3 link via the project is in T9, as a hard stop (M5: "yalnızca G2 ve G3'te engel"). Documents and media are in T4.
  - **M8**
    - The record and multiple POs are in T6/T8; the warehouse comes from `customer_warehouse` (FK, never typed).
    - Parties, incoterms, dates, transport, the packing-list quantities, the statuses, S15 events and S16 acceptance are in T6/T8.
    - "accepted needs the delivery receipt" is in T6. The document checklist is in T7/T8.
  - **M6 Phase 2**: shipments on the way (ETA order), and POs in production with balance dates (T10).
  - **M5, M2, M3**: the PO/shipment tabs (T9) and `last_po_code` (T1).
  - **§7**: seed and grant migrations (T1/T6). **§9 acceptance**: T12.
- **Rulings (spec gaps)**
  - **Purchase orders**
    - Lines use the PO's currency.
    - Before the spec date, a new SKU is `concept`/`development`/`approved`.
    - A valid spec reference is the same product's `spec_sheet`, `signed` or `approved`.
    - A PI mismatch blocks approval, and all 30 S09 items must be "Uygun".
    - Statuses move one step at a time; a 0 % deposit goes straight from `pi_approved` to `in_production`; `cancelled` is reachable from any status but the two final ones.
    - Lines and terms lock from `pi_approved`; payments and notes lock once `closed` or `cancelled`.
    - The deposit default is the supplier's, then the company setting, then 30.
    - Payments need no receipt document type, and production photos go to Media.
  - **Shipments**
    - A shipment gains `cancelled`, has a data requirement per status, and is `disputed` on damage or a quantity difference.
    - Shipped quantity is capped at the line × (1 + tolerance).
    - There are no ATD/ATA columns (S15 events record the actuals).
    - The dispute deadline is the delivery plus the shortest supplier damage-notice time, and stays editable.
  - **Warnings, gates and tests**
    - PSI before loading or balance is a warning.
    - Gate evidence may cite the project's PO and shipment documents.
    - Test fixtures use a transaction-local, postgres-only bypass flag.
- **Not in this plan**
  - Management approval of payments above a threshold (§7; no setting or finance role yet).
  - S15 triple matching of document quantities.
  - Default parties per S15 step.
  - The M11 PO draft.
  - `customer_viewer` column hiding.
  - M9, M10 and the M20 page guide.
- **Type consistency**
  - `PurchaseOrderStatus` / `nextPurchaseOrderStatuses` (T3) are used in T4/T5/T11, and `ShipmentStatus` / `nextShipmentStatuses` (T7) in T8/T11.
  - `StatusActions` props (T5) are reused in T8, and `glossary` is added in T11.
  - `PurchaseOrderTable.filters` (T4) and `ShipmentTable.filters` (T8) are used in T9.
  - Columns used across tasks:
    - `purchase_order_overview` (T2): `product_ids`, `spec_missing_line_ids`, `system_*`, `has_approved_psi`, `deposit_paid_on`, `balance_planned_on`; read through `usePurchaseOrderOverview` (T3) in T4/T5 and by T10.
    - `shipment_overview` (T6): `purchase_order_ids`, `purchase_order_codes`, `product_ids`, `psi_missing_po_codes`; read by T8 (`useShipmentOverview`, T7) and T10.
  - FK names (T1/T6) match the `NAMED_ERRORS` and embed hints: `purchase_order_line_product_fkey`, `purchase_order_payment_po_fkey`, `shipment_warehouse_fkey`, `shipment_purchase_order_po_fkey`, `shipment_purchase_order_shipment_fkey`, `shipment_line_shipment_fkey`, `shipment_line_link_fkey`.
  - `INCOTERMS` (T3) is used in T7. `usePurchaseOrderIds` (T3/T4) and `useShipmentIds` (T7) feed the tables' IN filters (T4/T8/T9).
- **pgTAP**: every block is runnable SQL on the shared preamble; plan counts T1 14, T2 24, T6 20, T9 5, T10 6 match the listed assertions. Fixture statuses use the documented bypass, proven unusable by an impersonated user in T2.
- **Proportion**: the plan carries no function bodies. T9 names only the changed predicate and the new rule over the 021 bodies, and `entity_customer`/`product_evidence` refer to their 025/019 definitions. `purchaseOrderFigures` is fixed by its tests.
