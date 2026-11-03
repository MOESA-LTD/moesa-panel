# Phase 2b — Purchase Orders and Shipments: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add M7 purchase orders and M8 shipments end to end. That covers the database rules, the API, list pages and cards with documents and media, links to the project gates, and the Phase 2 dashboard boxes. The spec's Phase 2 criteria must be met: "ilk yeni PO panelde açıldı ve PI aritmetik kontrolü yapıldı; ilk sevkiyat ETD'den teslime panelden izlendi".

**Architecture:** A purchase order (`purchase_order`) belongs to one customer and one supplier and may belong to a project. It has lines, payments and production updates. A shipment (`shipment`) belongs to one customer and one of that customer's warehouses. It carries purchase orders (`shipment_purchase_order`) and quantities of their lines (`shipment_line`), plus the S15 event chain (`shipment_event`). Codes come from `public.next_code` (`PO-THO-2026-001`, `SHP-THO-2026-001`). Composite foreign keys that include `customer_id` keep every reference inside one customer. Status flows, the spec-sheet rule (K3 rule 2), the S09 PI arithmetic and the acceptance rule all live in `SECURITY DEFINER` triggers, as the gate rules do (021). The client mirrors them in pure, tested functions so it can warn before the database refuses. The dashboard reads two `security_invoker` views (022 pattern).

**Tech Stack:** Vue 3.5 + Vite 5 + PrimeVue 4 + Tailwind, TanStack Query 5, zod 4, CASL, vue-i18n. Supabase: Postgres 15, PostgREST, generated RLS. Tests: pgTAP (`pnpm test:db`) and vitest 3.

**Spec:** `docs/superpowers/specs/2026-11-03-moesa-panel-modules-design.md`:
- §6 M7, M8, the Phase 2 additions of M6, and M5 (G3, G4 and G5 evidence; the project card's PO and shipment tabs).
- M2 (supplier terms, PO history), M3 (product PO/shipment history, `product_evidence.last_po_code`) and M4 (document types).
- K3 rule 2, K5, K8, §7, §8, §9 (Phase 2 acceptance) and §11 decision 5.

Field-level sources:
- `ABOUT MOESA/03_SABLONLAR/S09_PI_kontrol_listesi.md`: the 30 PI check items, the arithmetic, and "toplam yaklaşık kabul edilmez".
- `S15_sevkiyat_bildirim_zinciri.md`: the 20 event steps.
- `S16_teslim_kabul_formu.md`: the acceptance decision.

## Global Constraints

- Keep the existing patterns: `defineResource` / `useUpsertForm` / `ResourceTable` / route-dialog / `queryKeys` / `appErrorHandler`.
  - There is no `router.replace` inside a route dialog. A picker inside a route dialog is a plain PrimeVue `Dialog`.
  - When several tabs of a card edit the same record, they share one form, as the ProductCard does (`provide`/`inject`). Child rows (lines, payments, events) use their own route dialogs.
- Migrations are `029_…` to `033_…`. Migration 028 is the account refactor and is in flight; do not touch it.
  - Each migration has a pgTAP file with the same number (`supabase/tests/database/0NN_*.test.sql`) and opens with a design comment (021/024 style).
  - Each rule list in the comment names its codes, as 021's header does.
- Every child→parent FK between tenant tables is composite and includes `tenant_id`. A reference that must stay inside one customer also includes `customer_id`. Non-ownership references are `ON DELETE RESTRICT`.
- Every new table gets:
  - `tenant_id UUID NOT NULL REFERENCES public.tenant (id) ON DELETE CASCADE`;
  - `private.enable_tenant_level_security('<t>')` and `private.audit_enable('public.<t>'::REGCLASS)`;
  - `permission` rows: `select` is `read` with `throws_error` FALSE; `insert` is `create`; `update` and `delete` are `modify` with `throws_error` TRUE; `bypass` is FALSE;
  - the owner role grant (the 021 block);
  - `set_updated_at` where the table has `updated_at`.
- Purchase orders and shipments are never deleted (`REVOKE DELETE … FROM anon, authenticated`, no delete permission); they are `cancelled`. Their child rows may be deleted while the parent's rules allow it.
- Modules:
  - `purchase_order` (`is_core` TRUE, position 170) owns `purchase_order`, `purchase_order_line`, `purchase_order_payment` and `purchase_order_update`.
  - `shipment` (`is_core` TRUE, position 180) owns `shipment`, `shipment_purchase_order`, `shipment_line` and `shipment_event`.
  - `private.seed_ops_roles` gives both modules to management and coordinator.
  - Migrations grant them to existing roles that hold `public.product` update, following the 027 pattern.
- `authenticated` has no USAGE on schema `private`.
  - Trigger functions that read settings or rows the caller may not see are `SECURITY DEFINER` and filter on `NEW.tenant_id` themselves.
  - `SECURITY INVOKER` triggers and RPCs never call `private.*`.
  - pgTAP keeps ids in `set_config('test.…')` and never calls private functions while impersonating.
- Settings are per company (root tenant) and read through `private.company_setting` (Task 1), which walks `parent_id` as `private.management_gates` does. The existing keys used here are `spec_sheet_required_from` (`"2026-12-31"`) and `deposit_rate_default` (`30`). No new setting is added.
- Each rule violation is `RAISE EXCEPTION '<code>' USING ERRCODE = 'check_violation'` (`foreign_key_violation` for a missing parent). Every code gets:
  - `errors.<code>` in `en` and `tr`;
  - a `NAMED_ERRORS` entry with the form field it belongs to.
  Error copy is in Task 3's table (PO) and Task 7's table (shipment). The DB tasks add the keys they raise from those tables.
- Money: `NUMERIC(12,4)` unit prices and `NUMERIC(14,2)` amounts. The database computes figures with `round(x, 2)` (half away from zero); the client computes them in integer units (Task 3 `purchaseOrderFigures`), never in float.
- Incoterms are the eleven Incoterms 2020 codes `EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP` (S09 item 12), checked by `private.incoterm_valid`.
- K8 applies: there is no bank, tax or account field. The S09 item "Ödeme yöntemi ve banka" is a check mark only.
- `current_date` and `next_code`'s year are UTC (known Phase 1 backlog item; not changed here).
- i18n: `en` is the source and `tr` is hand-written; the other locales come from `pnpm i18n-sync`. Process codes (G3, PL-G4, S09) stay the same in every language. Glossary copy is plain text.
- Generated types are refreshed with `pnpm dev:supabase-reset` and committed with every DB task (`supabase/functions/_shared/database.types.ts`).
- Commits use conventional commits and end with the `Co-Authored-By:` trailer of the model that wrote them.

## Review Focus

1. **A PI whose totals are off by a cent or by an S09-style slip** (a line `1000 × 2,00 = 2.500`). The recalculation must be exact (no float drift: `3 × 1.90 = 5.70`). Any difference blocks approval with `po_pi_mismatch`, and the PI tab shows which row differs. (Task 2 pgTAP S09 case; Task 3 `purchaseOrderFigures` / `piDifferences`.)
2. **The spec-sheet date boundary.** On the day `spec_sheet_required_from` is reached, every line needs a spec sheet. The day before, only new SKUs (status `concept`, `development` or `approved`) need one, so an `on_sale` reorder can still be sent. A spec sheet of another product never counts. (Task 2 pgTAP with the setting moved to today and tomorrow.)
3. **Shipping more than was ordered**, across two shipments. The total per PO line is capped at quantity × (1 + tolerance %). A cancelled shipment frees its quantity. (Task 6 pgTAP; Task 8 shows the remaining quantity.)
4. **One customer's record reaching another's.** These are refused by composite FKs, and the user sees a field message, not a raw FK text:
   - a PO line with another customer's product;
   - a PO on another customer's project;
   - a shipment to another customer's warehouse;
   - a shipment carrying another customer's PO.
   (Task 1 and Task 6 pgTAP; Tasks 3 and 7 `NAMED_ERRORS` tests.)
5. **Changing a PO after its PI is approved**, whether a line's price or quantity, the currency, or the deposit. The database refuses with `po_locked`, even through a direct PATCH. The card shows the fields read-only and no line actions. Status skips through PATCH (`draft → pi_approved`) are refused with `po_status_order`. (Task 2 pgTAP; Task 4 vitest for the locked payload; Task 5 status actions.)

---

## File map

```
supabase/migrations/
  029_purchase_orders.sql      enums, company_setting, incoterm_valid, purchase_order(+line, payment, update), code and
                               defaults triggers, product/project customer keys, entity_customer, product_evidence.last_po_code,
                               module, permissions, grant_group_to_product_editors
  030_purchase_order_rules.sql status flow guard, spec-sheet rule, PI document/checklist/arithmetic, payment gates, locks,
                               purchase_order_overview view
  031_shipments.sql            enums, shipment(+purchase_order link, line, event), warehouse customer key, code trigger,
                               status guard, quantity cap, dispute deadline, entity_customer, module, permissions
  032_gate_links.sql           gate evidence may cite the project's PO and shipment documents (guard + pass_gate)
  033_dashboard_operations.sql dashboard_purchase_order, dashboard_shipment
supabase/tests/database/       029…033 test files; 099_seed.test.sql (+2)
supabase/seed.sql              seed_ops_roles gains purchase_order and shipment
app/src/api/purchaseOrder/{index,figures}.ts
app/src/api/shipment/index.ts
app/src/api/dashboard/index.ts, app/src/api/glossary.ts, app/src/api/queryKeys.ts, app/src/api/project/index.ts
app/src/lib/form/postgrestErrors.ts, app/src/constants/form/field.ts, app/src/router/routes/ops.ts
app/src/components/service-components/
  purchase-order-table/PurchaseOrderTable.vue   shipment-table/ShipmentTable.vue
  pi-arithmetic/PiArithmeticTable.vue           status-actions/StatusActions.vue
  gate-panel/GatePanel.vue (evidence lookup)
app/src/views/pages/ops/purchase-order/  Index, Manage, PurchaseOrderCard, usePurchaseOrderForm.ts, LineUpsert,
                                         PaymentUpsert, UpdateUpsert, tabs/{General,Lines,Pi,Payments,Production,Documents,Media}
app/src/views/pages/ops/shipment/        Index, Manage, ShipmentCard, useShipmentForm.ts, LineUpsert, EventUpsert,
                                         tabs/{General,Dates,Orders,Events,Acceptance,Documents,Media}
app/src/views/pages/ops/{project,supplier,product}/tabs/…  history tabs
app/src/views/pages/dashboard/Index.vue
app/tests/api/{purchaseOrder,shipment,dashboard,queryKeys}.test.ts, app/tests/lib/form/postgrestErrors.test.ts,
app/tests/views/{purchaseOrderForm,shipmentForm}.test.ts,
app/tests/components/{PiArithmeticTable,StatusActions,GatePanel}.test.ts, app/tests/plugins/i18n/{glossary,fields}.test.ts
```

---

### Task 1: Purchase order tables, codes and defaults (DB)

**Files:**
- Create: `supabase/migrations/029_purchase_orders.sql`, `supabase/tests/database/029_purchase_orders.test.sql`
- Modify:
  - `supabase/seed.sql`: the `seed_ops_roles` group list and header comment gain `purchase_order`.
  - `supabase/tests/database/099_seed.test.sql`: plan +1.
  - i18n `errors.purchase_order_customer_missing`, `errors.purchase_order_immutable_field`, `errors.incoterm_invalid`, `errors.po_line_product_customer`, `errors.po_project_customer`, `errors.po_line_product_duplicate`, `errors.pi_check_invalid` (copy in Task 3), then `pnpm i18n-sync`.

**Interfaces:**
- Consumes: `public.next_code(kind, scope)` (015, `kind 'po'` → `PO-<SCOPE>-<YYYY>-<NNN>`), `private.default_settings` keys, and `private.entity_customer` (025).
- Produces (SQL):
  - Enums, in this order:
    - `public.purchase_order_status`: `draft`, `sent`, `pi_received`, `pi_approved`, `deposit_paid`, `in_production`, `ready`, `balance_paid`, `closed`, `cancelled`. The order is the flow; Task 2 compares by it.
    - `public.payment_kind`: `deposit`, `balance`, `other`.
    - `public.payment_payer`: `moesa`, `customer`.
  - `private.company_setting(tenant_id UUID, key TEXT) RETURNS JSONB` STABLE SECURITY DEFINER. It returns the root tenant's value, or NULL when the row is missing or JSON `null`. It is not granted to `authenticated`.
  - `private.incoterm_valid(code TEXT) RETURNS BOOLEAN` IMMUTABLE STRICT: whether `code` is one of the eleven codes. `GRANT EXECUTE … TO authenticated` (used in CHECKs, like `gtin_valid`).
  - `private.pi_check_valid(check JSONB) RETURNS BOOLEAN` IMMUTABLE STRICT. It is true when `check` is an object, every key is `'1'`…`'30'`, and every value is `"ok"`, `"error"` or `"missing"`. `GRANT EXECUTE … TO authenticated`.
  - Keys added to existing tables:
    - `public.project`: `project_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
    - `public.product`: `product_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
  - Table `public.purchase_order`:
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
      - `pi_subtotal`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount`, each `NUMERIC(14,2)` and nullable;
      - `pi_extra_amount NUMERIC(14,2) NOT NULL DEFAULT 0`;
      - `pi_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (pi_discount_amount >= 0)`;
      - `pi_check JSONB NOT NULL DEFAULT '{}'`;
      - `pi_checked_by UUID REFERENCES public.user (id) ON DELETE SET NULL`, `pi_checked_at TIMESTAMPTZ`.
    - Other: `notes TEXT`, `created_at`, `updated_at`.
    - Constraints:
      - `unique_purchase_order_code UNIQUE (tenant_id, code)`;
      - `purchase_order_id_tenant_id_key UNIQUE (id, tenant_id)`;
      - `purchase_order_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`;
      - `purchase_order_customer_fkey (customer_id, tenant_id)` → customer;
      - `purchase_order_supplier_fkey (supplier_id, tenant_id)` → supplier;
      - `purchase_order_project_fkey (project_id, customer_id, tenant_id)` → `project (id, customer_id, tenant_id)`. MATCH SIMPLE, so a NULL project passes.
      - `purchase_order_pi_document_fkey (pi_document_id, tenant_id)` and `purchase_order_packing_document_fkey (packing_instruction_document_id, tenant_id)` → document;
      - `purchase_order_incoterm_valid CHECK (private.incoterm_valid(incoterm))`;
      - `purchase_order_pi_check_valid CHECK (private.pi_check_valid(pi_check))`.
      All references are RESTRICT.
    - Indexes: `(tenant_id, customer_id)`, `(tenant_id, supplier_id)`, `(tenant_id, project_id)` and `(tenant_id, status)`.
  - Trigger `purchase_order_defaults`: BEFORE INSERT, SECURITY DEFINER. It reads the supplier in `NEW.tenant_id`.
    - When `NEW.incoterm IS NULL`, it sets `NEW.incoterm := supplier.default_incoterm`, but only when `private.incoterm_valid` accepts it.
    - When `NEW.deposit_rate IS NULL`, it sets `NEW.deposit_rate := coalesce(supplier.deposit_rate, (company_setting(tenant,'deposit_rate_default') #>> '{}')::NUMERIC, 30)`. A non-numeric setting counts as missing.
  - Trigger `purchase_order_set_code`: BEFORE INSERT, invoker, the `project_set_code` pattern. Triggers fire in name order, so this one runs after `purchase_order_defaults`.
    - It reads the customer through RLS; a customer the caller cannot see raises `purchase_order_customer_missing` (23503).
    - It sets `NEW.code := public.next_code('po', customer.code)` and `NEW.status := 'draft'`.
  - Trigger `purchase_order_immutable`: BEFORE UPDATE, invoker. A changed `code`, `customer_id` or `supplier_id` raises `purchase_order_immutable_field`.
  - Table `public.purchase_order_line`:
    - Columns:
      - `id`, `tenant_id`, `purchase_order_id UUID NOT NULL`, `customer_id UUID NOT NULL`, `position INT NOT NULL DEFAULT 0`;
      - `product_id UUID NOT NULL`, `quantity INT NOT NULL CHECK (quantity > 0)`, `unit_price NUMERIC(12,4) NOT NULL CHECK (unit_price >= 0)`;
      - `line_total NUMERIC(16,4) GENERATED ALWAYS AS (quantity * unit_price) STORED`;
      - `pi_line_total NUMERIC(14,2)`, `spec_document_id UUID`, `notes TEXT`, `created_at`, `updated_at`.
    - Constraints:
      - `purchase_order_line_id_po_tenant_key UNIQUE (id, purchase_order_id, tenant_id)`;
      - `unique_purchase_order_line_product UNIQUE (purchase_order_id, product_id)`;
      - `purchase_order_line_po_fkey (purchase_order_id, customer_id, tenant_id)` → `purchase_order (id, customer_id, tenant_id) ON DELETE CASCADE`;
      - `purchase_order_line_product_fkey (product_id, customer_id, tenant_id)` → `product (id, customer_id, tenant_id)`;
      - `purchase_order_line_spec_fkey (spec_document_id, tenant_id)` → document.
  - Trigger `purchase_order_line_customer`: BEFORE INSERT OR UPDATE, DEFINER. It sets `NEW.customer_id` to the PO's customer (same tenant), whatever the client sent. When the PO is missing, the FK reports it.
  - Table `public.purchase_order_payment(id, tenant_id, purchase_order_id UUID NOT NULL, kind public.payment_kind NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK (amount > 0), currency valid_currency_code NOT NULL, planned_on DATE, paid_on DATE, paid_by public.payment_payer NOT NULL DEFAULT 'moesa', notes TEXT, created_at, updated_at)`. FK `(purchase_order_id, tenant_id)` → purchase_order `ON DELETE CASCADE`.
  - Table `public.purchase_order_update(id, tenant_id, purchase_order_id UUID NOT NULL, happened_on DATE NOT NULL DEFAULT current_date, note TEXT NOT NULL, created_by UUID DEFAULT auth.uid(), created_at, updated_at)`. Same FK. Production photos go to the PO's Media tab (`evidence_photo`), not to a column.
  - `private.entity_customer` is redefined with every 025 branch plus `WHEN 'purchase_order' THEN` the PO's `customer_id`. This keeps the media and document customer checks working on POs.
  - `public.product_evidence` is redefined: same columns, and `last_po_code` becomes the `code` of the newest (`created_at`) non-cancelled purchase order with a line for the product. Update the view comment too. `product_with_evidence` keeps working, since the columns are unchanged.
  - Module `('purchase_order', TRUE, 170)`. Permissions:
    - `purchase_order`: select, insert, update;
    - `purchase_order_line`, `purchase_order_payment`, `purchase_order_update`: select, insert, update, delete.
    Plus the owner grant.
  - `private.grant_group_to_product_editors(group_name TEXT) RETURNS VOID`: the 027 grant made generic, without the media-delete exception. The migration ends with `SELECT private.grant_group_to_product_editors('purchase_order')`. REVOKE from `PUBLIC, anon, authenticated`.
- Produces (seed): `seed_ops_roles` adds `'purchase_order'` to `p.group_name IN (…)`.

- [ ] **Step 1: Write `029_purchase_orders.test.sql`**: `plan(15)`, MOESA, impersonating `koordinator@`.
  - Store ids with `set_config` first: MOESA, the THO customer, suppliers `TR1` (deposit 30, EXW) and `CN1`, products `THO-MOP40-2P` and `THO-TIPS-6-50`, and the pilot project.
  - As `postgres` before impersonating, insert:
    - customer `ZZZ` with product `ZZZ-1`;
    - project `ZZZ` (`npi`, `a_sourcing`, `{A1}`);
    - supplier `TR9` with `deposit_rate` NULL and `default_incoterm` `'Ex Works'`.
  - Fixed PO ids `'00000000-0000-4000-8000-000000000291'` … `…299`.

```sql
SELECT has_table('public', 'purchase_order', 'purchase_order table');
-- insert PO 291: THO, TR1, currency USD, no incoterm, no deposit_rate, code 'X'
SELECT is((SELECT code FROM public.purchase_order WHERE id = <291>), 'PO-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT is((SELECT incoterm || ':' || deposit_rate FROM public.purchase_order WHERE id = <291>), 'EXW:30.00', 'incoterm and deposit come from the supplier');
-- as postgres: UPDATE setting deposit_rate_default = 25 for MOESA; re-impersonate; insert PO 292 with TR9 and incoterm 'FOB'
SELECT is((SELECT deposit_rate FROM public.purchase_order WHERE id = <292>), 25.00::NUMERIC, 'without a supplier deposit, the company setting');
SELECT throws_ok(<insert PO 293 with TR9 and no incoterm>, '23502', NULL, 'an invalid supplier incoterm is not copied; incoterm stays required');
SELECT throws_ok(<insert PO 294 incoterm 'XYZ'>, '23514', NULL, 'only Incoterms 2020 codes');   -- message contains purchase_order_incoterm_valid
SELECT throws_ok($$ UPDATE public.purchase_order SET code = 'PO-X' WHERE id = <291> $$, '23514', 'purchase_order_immutable_field', 'the code is fixed');
SELECT throws_ok($$ UPDATE public.purchase_order SET supplier_id = <CN1> WHERE id = <291> $$, '23514', 'purchase_order_immutable_field', 'the supplier is fixed');
-- line on 291: MOP40, quantity 3, unit_price 1.9, customer_id sent as <ZZZ>
SELECT is((SELECT line_total::TEXT || ':' || (customer_id = <THO>) FROM public.purchase_order_line WHERE purchase_order_id = <291>), '5.7000:true', 'line total is computed; the line takes the PO''s customer');
SELECT throws_ok(<line on 291 with product ZZZ-1>, '23503', NULL, 'not another customer''s product');
SELECT throws_ok(<second line on 291 with MOP40>, '23505', NULL, 'a product once per order');
SELECT throws_ok(<update 291 set project_id = ZZZ project>, '23503', NULL, 'not another customer''s project');
SELECT throws_ok(<update 291 set pi_check = '{"31":"ok"}'>, '23514', NULL, 'only the 30 S09 items');
SELECT throws_ok($$ DELETE FROM public.purchase_order WHERE id = <291> $$, '42501', NULL, 'purchase orders are not deleted');
SELECT is((SELECT last_po_code FROM public.product_evidence WHERE product_id = <MOP40>), <291 code>, 'the product shows its last PO');
```

- [ ] **Step 2: Add to `099_seed.test.sql`** (as `postgres`):

```sql
ok(cardinality(private.tenants_permitting(koordinator, ARRAY[moesa], 'public.purchase_order', 'insert')) = 1, 'the coordinator creates purchase orders')
```

- [ ] **Step 3: Run and see the tests fail.** Run: `cd app && pnpm test:db`. Expected: FAIL (`purchase_order table`).
- [ ] **Step 4: Write `029_purchase_orders.sql`** following the Interfaces. Revoke all on every new private function from `PUBLIC, anon, authenticated`, then grant the two CHECK helpers back. Update `seed_ops_roles` and add the `errors.*` keys, then sync.
- [ ] **Step 5: Reset and run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/029_purchase_orders.sql supabase/tests/database/029_purchase_orders.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(po): purchase orders with lines, payments and updates, coded per customer"
```

---

### Task 2: Purchase order rules and overview (DB)

**Files:**
- Create: `supabase/migrations/030_purchase_order_rules.sql`, `supabase/tests/database/030_purchase_order_rules.test.sql`
- Modify: i18n `errors.po_status_order`, `po_lines_required`, `po_spec_sheet_required`, `po_line_spec_invalid`, `po_pi_document_invalid`, `po_pi_required`, `po_pi_checklist_incomplete`, `po_pi_mismatch`, `po_deposit_unpaid`, `po_balance_unpaid` and `po_locked` (copy in Task 3); sync.

**Interfaces:**
- Consumes: Task 1 tables and `private.company_setting`, plus `public.document`.
- Produces (SQL):
  - `private.po_line_needs_spec(product_id UUID, tenant_id UUID) RETURNS BOOLEAN` STABLE SECURITY DEFINER. It returns TRUE when either holds:
    - `current_date >= (company_setting(tenant,'spec_sheet_required_from') #>> '{}')::DATE` (a missing or unparsable setting counts as reached);
    - the product's status is `concept`, `development` or `approved`, i.e. a new SKU (K3 rule 2: "öncesinde yalnızca yeni SKU'lar").
  - `private.purchase_order_figures(purchase_order_id UUID, tenant_id UUID) RETURNS TABLE (subtotal NUMERIC, total NUMERIC, deposit NUMERIC, balance NUMERIC)` STABLE SECURITY DEFINER. The S09 §C recalculation; Task 3 mirrors it exactly:
    - `subtotal = round(sum(quantity * unit_price), 2)`, 0 when there are no lines;
    - `total = subtotal + pi_extra_amount - pi_discount_amount`;
    - `deposit = round(total * deposit_rate / 100, 2)`;
    - `balance = total - deposit`.
  - Trigger `purchase_order_guard`: BEFORE INSERT OR UPDATE ON purchase_order, SECURITY DEFINER. Rules in order, each a `check_violation` named by its code:
    1. `po_status_order`. On INSERT, status must be `draft`. On UPDATE, a changed status must be one of:
       - the next value in enum order (excluding `cancelled`);
       - `pi_approved → in_production` when `deposit_rate = 0`;
       - `cancelled` from any status but `closed` and `cancelled`.
       `closed` and `cancelled` are final.
    2. `po_locked`. When `OLD.status >= 'pi_approved'`, these columns cannot change (`IS DISTINCT FROM`): `currency`, `incoterm`, `incoterm_place`, `deposit_rate`, `pi_document_id`, `pi_number`, `pi_subtotal`, `pi_extra_amount`, `pi_discount_amount`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount` and `pi_check`.
    3. `po_pi_document_invalid`. A non-null `pi_document_id` must be a `type = 'pi'` document with `entity_type = 'purchase_order'` and `entity_id = NEW.id` in the tenant.
    4. Entering `sent`:
       - the PO has no line: `po_lines_required`;
       - a line with `po_line_needs_spec` has `spec_document_id IS NULL`: `po_spec_sheet_required`.
    5. Entering `pi_received`: `pi_document_id` or `pi_total` is NULL: `po_pi_required`.
    6. Entering `pi_approved`:
       - `pi_check` has fewer than 30 keys whose value is `"ok"`: `po_pi_checklist_incomplete`;
       - otherwise, any of these differs: `pi_subtotal`, `pi_total`, `pi_deposit_amount` or `pi_balance_amount` from its figure (NULL counts as different), or a line's non-null `pi_line_total` from `round(line_total, 2)`. That raises `po_pi_mismatch`.
       - On success it sets `pi_checked_by := auth.uid()` and `pi_checked_at := now()`.
    7. Entering `deposit_paid` with no `deposit` payment with `paid_on`: `po_deposit_unpaid`.
    8. Entering `balance_paid` with no `balance` payment with `paid_on`: `po_balance_unpaid`.

    The PSI rule (M7: no balance without an approved PSI) is a warning in the UI, not a rule here (spec: "uyarı, engel değil").
  - Trigger `purchase_order_line_guard`: BEFORE INSERT OR UPDATE OR DELETE ON purchase_order_line, SECURITY DEFINER, on `NEW` or `OLD`. Rules in order:
    - the PO's status is `pi_approved` or later (including `closed` and `cancelled`): `po_locked`;
    - a non-null `spec_document_id` that is not a `spec_sheet` of `product_id` (`entity_type 'product'`) with status `signed` or `approved` in the tenant: `po_line_spec_invalid`;
    - the PO is `sent` or `pi_received`, the line needs a spec (`po_line_needs_spec`), and it has none: `po_spec_sheet_required`.
  - View `public.purchase_order_overview` (`security_invoker`). It has every `purchase_order` column plus:
    - `customer_code`, `supplier_code`, `project_code` (LEFT joins);
    - `line_count INT`, `total_quantity INT`;
    - `system_subtotal`, `system_total`, `system_deposit`, `system_balance`: the same formulas, inline (not through the private function);
    - `deposit_paid_on DATE` (max `paid_on` of deposits), `balance_planned_on DATE` (min `planned_on` of unpaid balances), `balance_paid_on DATE`;
    - `has_approved_psi BOOLEAN`: a `psi_report` document of the PO with status `approved`.
    `GRANT SELECT … TO authenticated`.

- [ ] **Step 1: Write `030_purchase_order_rules.test.sql`**: `plan(20)`, MOESA, `koordinator@`.
  - Setup as `postgres`:
    - product `THO-NEW-1` (THO, status `development`, supplier TR1);
    - a `pi` document `d_pi` on PO `a` and a `pi` document `d_pi_other` on PO `b` (created below);
    - the signed spec of MOP40 (seed) as `spec_mop`.
  - Fixed ids `…0301` onward.
  - Every PO is THO/TR1, USD, deposit 30.

```sql
-- PO a: lines MOP40 1000 × 2.00 (no spec ref), TIPS 10 × 1.00 (no spec ref). Setting spec_sheet_required_from = current_date + 1 (as postgres).
SELECT throws_ok(<UPDATE a SET status='pi_approved'>, '23514', 'po_status_order', 'no skipping statuses');
SELECT throws_ok(<UPDATE empty PO b SET status='sent'>, '23514', 'po_lines_required', 'an order needs lines');
SELECT lives_ok(<UPDATE a SET status='sent'>, 'before the date, SKUs on sale go without a spec reference');
SELECT throws_ok(<PO c with THO-NEW-1 line; UPDATE c SET status='sent'>, '23514', 'po_spec_sheet_required', 'a new SKU needs its spec sheet');
-- setting = current_date (as postgres)
SELECT throws_ok(<PO d with TIPS line; UPDATE d SET status='sent'>, '23514', 'po_spec_sheet_required', 'from the date on, every SKU');
SELECT throws_ok(<UPDATE d's TIPS line SET spec_document_id = spec_mop>, '23514', 'po_line_spec_invalid', 'another product''s spec sheet does not count');
SELECT lives_ok(<PO e with MOP40 line spec_document_id = spec_mop; UPDATE e SET status='sent'>, 'a referenced signed spec sheet passes');
SELECT throws_ok(<UPDATE a SET status='pi_received'>, '23514', 'po_pi_required', 'PI document and total first');
SELECT throws_ok(<UPDATE a SET pi_document_id = d_pi_other>, '23514', 'po_pi_document_invalid', 'only this order''s PI');
-- UPDATE a SET pi_document_id = d_pi, pi_total = 2600, status = 'pi_received'
SELECT throws_ok(<UPDATE a SET status='pi_approved'> /* pi_check empty */, '23514', 'po_pi_checklist_incomplete', 'all 30 S09 items must be ok');
-- pi_check := every key '1'..'30' → "ok"; S09 example: pi_subtotal 2510 (system 2010.00)
SELECT throws_ok(<UPDATE a SET pi_subtotal=2510, pi_extra_amount=150, pi_discount_amount=50, pi_total=2610, pi_deposit_amount=783, pi_balance_amount=1827, status='pi_approved'>,
                 '23514', 'po_pi_mismatch', 'a PI that does not add up is not approved');
SELECT lives_ok(<same with 2010, 150, 50, 2110, 633, 1477>, 'exact figures approve the PI');
SELECT is((SELECT pi_checked_by FROM public.purchase_order WHERE id = a), <koordinator>, 'the checker is recorded');
SELECT is((SELECT system_subtotal||':'||system_total||':'||system_deposit||':'||system_balance FROM public.purchase_order_overview WHERE id = a),
          '2010.00:2110.00:633.00:1477.00', 'the overview recalculates the PI');
SELECT throws_ok(<UPDATE a's MOP40 line SET quantity = 999>, '23514', 'po_locked', 'lines are fixed after PI approval');
SELECT throws_ok(<UPDATE a SET currency = 'EUR'>, '23514', 'po_locked', 'terms are fixed after PI approval');
SELECT throws_ok(<UPDATE a SET status='deposit_paid'>, '23514', 'po_deposit_unpaid', 'a paid deposit first');
-- deposit payment 633 paid_on today; deposit_paid → in_production → ready
SELECT throws_ok(<UPDATE a SET status='balance_paid'>, '23514', 'po_balance_unpaid', 'a paid balance first');
SELECT lives_ok(<PO f deposit_rate 0, inserted as postgres under session_replication_role = replica at pi_approved; then status='in_production'>, 'no deposit, no deposit step');
-- UPDATE c SET status = 'cancelled'
SELECT throws_ok(<UPDATE c SET status='draft'>, '23514', 'po_status_order', 'cancelled is final');
```

- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Write `030_purchase_order_rules.sql`**; add the error keys and sync.
- [ ] **Step 4: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/030_purchase_order_rules.sql supabase/tests/database/030_purchase_order_rules.test.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(po): status flow, spec sheet rule, S09 PI arithmetic and payment gates in triggers"
```

---

### Task 3: Purchase order API (app)

**Files:**
- Create: `app/src/api/purchaseOrder/index.ts`, `app/src/api/purchaseOrder/figures.ts`, `app/tests/api/purchaseOrder.test.ts`
- Modify:
  - `app/src/api/queryKeys.ts`, with DERIVED:
    - `purchase_order: ['purchase_order_overview', 'product_evidence', 'product_with_evidence']`;
    - `purchase_order_line: ['purchase_order', 'purchase_order_overview', 'product_evidence', 'product_with_evidence']`;
    - `purchase_order_payment: ['purchase_order', 'purchase_order_overview']`;
    - `purchase_order_update: ['purchase_order']`.
  - `app/src/lib/form/postgrestErrors.ts`: `NAMED_ERRORS` per the table below.
  - `app/src/constants/form/field.ts`: `purchase_order: { name: 'ops-purchase-order-manage' }`, and `{ name: 'ops-purchase-order-manage', field: 'purchase_order_id' }` for the three child tables.
  - i18n:
    - `fields.purchase_order`, `fields.purchase_order_line`, `fields.purchase_order_payment`, `fields.purchase_order_update` (the table names, which also name the `purchase_order` module: the fields test reads modules from `fields`);
    - `ops.purchase_order.*` (copy below).
  - `app/tests/plugins/i18n/fields.test.ts`: `OPS_TABLES` gains the four tables; `OPS_MODULES` gains `purchase_order`.
  - `app/tests/api/queryKeys.test.ts` and `app/tests/lib/form/postgrestErrors.test.ts`: one case each.

**Interfaces:**
- Consumes: Task 1–2 tables and views; `defineResource`, `useLookup`, `invalidateTables`, `allValues`, and `optional`/`required`/`requiredText`/`dateOnly`/`parseDateOnly` from `@/lib/form/fields`.
- Produces, `api/purchaseOrder/figures.ts`:
  - Types:
    - `FigureLine = { quantity: number; unit_price: number | string; pi_line_total?: number | string | null; id?: string; label?: string }`;
    - `FigureTerms = { deposit_rate: number | string; pi_extra_amount: number | string; pi_discount_amount: number | string }`;
    - `Figures = { subtotal: number; total: number; deposit: number; balance: number }`.
  - `purchaseOrderFigures(lines: FigureLine[], terms: FigureTerms): Figures`. Integer arithmetic, so the result equals the SQL in Task 2:

```ts
// unit price in 1/10000, money in cents, rate in 1/100 %; half away from zero like Postgres round()
const half = (n: number) => Math.sign(n) * Math.round(Math.abs(n));
const sub4 = lines.reduce((s, l) => s + l.quantity * half(Number(l.unit_price) * 10000), 0);
const subtotal = half(sub4 / 100);
const total = subtotal + half(Number(terms.pi_extra_amount) * 100) - half(Number(terms.pi_discount_amount) * 100);
const deposit = half((total * half(Number(terms.deposit_rate) * 100)) / 10000);
return { subtotal: subtotal / 100, total: total / 100, deposit: deposit / 100, balance: (total - deposit) / 100 };
```

  - `PiEntered = { pi_subtotal: number | null; pi_total: number | null; pi_deposit_amount: number | null; pi_balance_amount: number | null; pi_extra_amount: number; pi_discount_amount: number }`.
  - `piDifferences(lines: FigureLine[], terms: FigureTerms, entered: PiEntered)` returns `{ rows: PiRow[]; matches: boolean }`.
    - `PiRow = { key: 'line' | 'subtotal' | 'extra' | 'discount' | 'total' | 'deposit' | 'balance'; label?: string; system: number | null; pi: number | null; diff: number | null }`, where `diff = pi - system` in cents / 100, or null when `pi` is null.
    - There is one `line` row per line (system = its rounded total), then the S09 §C rows in order. `extra` and `discount` carry the entered value as both system and pi.
    - `matches` is true when all four header figures are entered and their `diff` is 0, and no entered line differs. This is the rule `purchase_order_guard` applies.
- Produces, `api/purchaseOrder/index.ts`:
  - Types:
    - `PurchaseOrderStatus`, `PaymentKind`, `PaymentPayer` (enums);
    - `PurchaseOrderRow`, `PurchaseOrderLineRow`, `PurchaseOrderPaymentRow`, `PurchaseOrderUpdateRow`;
    - `PurchaseOrderOverviewRow = Views['purchase_order_overview']['Row']`;
    - `PurchaseOrderCard = PurchaseOrderRow & { customer, supplier, project, purchase_order_line: (PurchaseOrderLineRow & { product })[], purchase_order_payment: PurchaseOrderPaymentRow[] }`.
  - Constants:
    - `PURCHASE_ORDER_STATUSES = allValues<PurchaseOrderStatus>()([...flow order])`;
    - `PAYMENT_KINDS`, `PAYMENT_PAYERS` (`allValues`);
    - `INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'] as const` and `Incoterm = (typeof INCOTERMS)[number]`;
    - `PI_CHECK_KEYS = ['1', …, '30'] as const`, `PI_CHECK_STATUSES = ['ok', 'error', 'missing'] as const`;
    - `PO_LOCKED_FIELDS`: the 13 columns of rule 2 in Task 2.
  - `isPurchaseOrderLocked(status: PurchaseOrderStatus): boolean`: TRUE from `pi_approved` on, `closed` and `cancelled` included.
  - `nextPurchaseOrderStatuses(po: Pick<PurchaseOrderRow, 'status' | 'deposit_rate'>): PurchaseOrderStatus[]`: the transitions rule 1 allows, forward ones first, then `cancelled`.
  - `piChecklistComplete(check: Json): boolean`.
  - `psiWarning(po: Pick<PurchaseOrderOverviewRow, 'status' | 'has_approved_psi'>): boolean`: true when `ready` is the status and `has_approved_psi` is false (the next step is `balance_paid`).
  - `supplierDefaults(supplier: Pick<Tables['supplier']['Row'], 'default_incoterm' | 'deposit_rate'>): { incoterm: Incoterm | null; deposit_rate: number | null }`. An incoterm outside `INCOTERMS` becomes null.
  - `purchaseOrderResource = defineResource<'purchase_order', PurchaseOrderCard>('purchase_order', { select })`. Embeds are named by FK, since the keys are composite:

```
*, customer!purchase_order_customer_fkey(code, display_name), supplier!purchase_order_supplier_fkey(code, display_name, default_incoterm, deposit_rate),
project!purchase_order_project_fkey(code, display_name),
purchase_order_line!purchase_order_line_po_fkey(*, product!purchase_order_line_product_fkey(id, sku, display_name, status, purchase_price, purchase_currency)),
purchase_order_payment(*)
```

  - `purchaseOrderSchema` (zod):
    - Header: `customer_id` and `supplier_id` required uuids; `project_id` optional uuid; `currency` matching `/^[A-Z]{3}$/` (required); `incoterm` `z.enum(INCOTERMS)`; `incoterm_place` text; `deposit_rate` number 0–100; `ready_on` `dateOnly`; `tolerance_pct` 0–100; `penalty_rule` text; `packing_instruction_document_id` optional uuid; `notes`.
    - PI: `pi_document_id`, `pi_number`; `pi_subtotal`, `pi_total`, `pi_deposit_amount`, `pi_balance_amount` optional numbers; `pi_extra_amount` number (default 0); `pi_discount_amount` number ≥ 0 (default 0); `pi_check` `z.partialRecord(z.enum(PI_CHECK_KEYS), z.enum(PI_CHECK_STATUSES))`.
    - `status` (read-only in the form).
  - `toPurchaseOrderFormValues(po?)` and `toPurchaseOrderPayload(values, status?)`. The payload:
    - sends `customer_id` and `supplier_id` only for a new PO;
    - leaves out `status` (status changes go through `useSetPurchaseOrderStatus`);
    - leaves out `PO_LOCKED_FIELDS` when `isPurchaseOrderLocked(status)`.
  - `useSetPurchaseOrderStatus()`: a mutation that takes `{ id, status }`, runs `update({ status })`, then `invalidateTables(['purchase_order'])`.
  - Lines: `purchaseOrderLineResource = defineResource('purchase_order_line')`; `purchaseOrderLineSchema` (`purchase_order_id`, `product_id` required, `quantity` int ≥ 1, `unit_price` ≥ 0, `pi_line_total` optional, `spec_document_id` optional uuid, `position` int ≥ 0, `notes`), `toPurchaseOrderLineFormValues`, `toPurchaseOrderLinePayload` (never sends `customer_id` or `line_total`).
  - `defaultUnitPrice(product: Pick<ProductRow, 'purchase_price' | 'purchase_currency'>, currency: string): number | null`: the product's price when its currency is the PO's, else null.
  - `useSpecSheetOptions(productId: MaybeRefOrGetter<string | null>)`: `useLookup('document')` over `entity_type 'product'`, `entity_id`, `type 'spec_sheet'`, `status in (signed, approved)`, version descending. The label is `v<NN> — <status>`.
  - Payments: `purchaseOrderPaymentResource`, `purchaseOrderPaymentSchema` (`kind`, `amount` > 0, `currency`, `planned_on`, `paid_on`, `paid_by`, `notes`), its form-values and payload helpers, and `suggestPayments(figures: Figures, currency: string, existing: Pick<PurchaseOrderPaymentRow, 'kind'>[])`. The last returns the missing `deposit` (when > 0) and `balance` rows as payment inputs with no dates.
  - Updates: `purchaseOrderUpdateResource`, `purchaseOrderUpdateSchema` (`happened_on` required date, `note` `requiredText`), and helpers.

NAMED_ERRORS additions. Each `message` is `errors.<name>` unless a key is given:

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
| 23514 | po_pi_required | pi_document_id |
| 23514 | po_pi_checklist_incomplete | pi_check |
| 23514 | po_pi_mismatch | pi_total |
| 23514 | po_locked | currency |

`po_status_order`, `po_lines_required`, `po_deposit_unpaid` and `po_balance_unpaid` have no field. The status action shows them through `appErrorHandler` (`errors.<message>`).

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

UI copy as `ops.purchase_order.*` (EN / TR). The TR column comes from spec M7 and S09 unless marked **[owner to confirm]**:
- `title`: Purchase orders / Satın alma (PO)
- `tabs.{general,lines,pi,payments,production,documents,media}`: General, Lines, PI check, Payments, Production, Documents, Media / Genel, Satırlar, PI kontrol, Ödemeler, Üretim takibi, Belgeler, Ortam
- `fields.*`: code Code / Kod; customer Customer / Müşteri; supplier Supplier / Tedarikçi; project Project / Proje; status Status / Durum; product Product / Ürün; quantity Quantity / Adet; unit_price Unit price / Birim fiyat; currency Currency / Para birimi; spec_document Spec sheet version / Spec sheet sürümü; incoterm Incoterm / Incoterm; incoterm_place Place / Yer; deposit_rate Deposit % / Depozito %; ready_on Ready date / Termin (hazır tarih); tolerance_pct Tolerance % / Tolerans %; penalty_rule Penalty rule / Ceza kuralı; packing_instruction Packaging and label instructions / Ambalaj/etiket talimatı belgesi; checked_by Checked by / Kontrol eden
- `pi.*`: subtotal Subtotal / Ara toplam; extra Extra items / Ek kalem; discount Discount / İndirim; total Grand total / Genel toplam; deposit Deposit / Depozito; balance Balance / Bakiye; system Recalculated / Sistem; entered On the PI / PI'daki; diff Difference / Fark
- `pi_check.status.{ok,error,missing}`: OK, Error, Missing / Uygun, Hata, Eksik
- `pi_check.items.1` … `30`: from S09 §B "Madde". The TR column is verbatim; EN is a translation:

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

- `status.*` (badges and buttons):
  - draft: Draft / Taslak **[owner to confirm]**
  - sent: Sent / Gönderildi (the TR comes from K3)
  - pi_received: PI received / PI alındı **[owner to confirm]**
  - pi_approved: PI approved / PI onaylandı **[owner to confirm]**
  - deposit_paid: Deposit paid / Depozito ödendi **[owner to confirm]**
  - in_production: In production / Üretimde (from M6 "üretimdeki PO'lar")
  - ready: Ready / Hazır **[owner to confirm]**
  - balance_paid: Balance paid / Bakiye ödendi **[owner to confirm]**
  - closed: Closed / Kapandı **[owner to confirm]**
  - cancelled: Cancelled / İptal edildi **[owner to confirm]**
- `payment.kind.{deposit,balance,other}`: Deposit, Balance, Other / Depozito, Bakiye, Diğer
- `payment.payer.{moesa,customer}`: MOESA, Customer / MOESA, Müşteri
- `payment.fields`: amount Amount / Tutar; planned_on Planned date / Planlanan tarih; paid_on Paid on / Ödenen tarih; paid_by Paid by / Ödeyen taraf
- `production.fields`: happened_on Date / Tarih; note Status note / Durum notu
- `psi_warning`: No approved PSI report on this order; per G4 the balance should not be paid without it. / Bu siparişte onaylı PSI raporu yok; G4'e göre bakiye PSI'sız ödenmemeli. **[owner to confirm]**

The **[owner to confirm]** marker is not copied into the JSON. The remaining `ops.purchase_order.*` labels are the implementer's choice.

- [ ] **Step 1: Write `purchaseOrder.test.ts`**

```ts
const terms = { deposit_rate: 30, pi_extra_amount: 150, pi_discount_amount: 50 };
expect(purchaseOrderFigures([{ quantity: 1000, unit_price: 2 }, { quantity: 10, unit_price: '1.0000' }], terms))
   .toEqual({ subtotal: 2010, total: 2110, deposit: 633, balance: 1477 });
expect(purchaseOrderFigures([{ quantity: 3, unit_price: '1.9000' }], { deposit_rate: 30, pi_extra_amount: 0, pi_discount_amount: 0 }).subtotal).toBe(5.7);
expect(purchaseOrderFigures([{ quantity: 7, unit_price: 0.3333 }], { deposit_rate: 33.33, pi_extra_amount: 0, pi_discount_amount: 0 }))
   .toEqual({ subtotal: 2.33, total: 2.33, deposit: 0.78, balance: 1.55 });
const lines = [{ quantity: 1000, unit_price: 2, pi_line_total: 2500 }];   // S09: 1.000 × 2,00 = 2.500
const d = piDifferences(lines, { deposit_rate: 30, pi_extra_amount: 0, pi_discount_amount: 0 },
   { pi_subtotal: 2500, pi_total: 2500, pi_deposit_amount: 750, pi_balance_amount: 1750, pi_extra_amount: 0, pi_discount_amount: 0 });
expect(d.rows[0]).toMatchObject({ key: 'line', system: 2000, pi: 2500, diff: 500 });
expect(d.matches).toBe(false);
expect(piDifferences([{ quantity: 1000, unit_price: 2 }], { deposit_rate: 30, pi_extra_amount: 0, pi_discount_amount: 0 },
   { pi_subtotal: 2000, pi_total: 2000, pi_deposit_amount: 600, pi_balance_amount: 1400, pi_extra_amount: 0, pi_discount_amount: 0 }).matches).toBe(true);
expect(piDifferences([{ quantity: 1, unit_price: 1 }], { deposit_rate: 0, pi_extra_amount: 0, pi_discount_amount: 0 },
   { pi_subtotal: 1, pi_total: null, pi_deposit_amount: 0, pi_balance_amount: 1, pi_extra_amount: 0, pi_discount_amount: 0 }).matches).toBe(false);
expect(nextPurchaseOrderStatuses({ status: 'draft', deposit_rate: 30 })).toEqual(['sent', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 30 })).toEqual(['deposit_paid', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'pi_approved', deposit_rate: 0 })).toEqual(['in_production', 'cancelled']);
expect(nextPurchaseOrderStatuses({ status: 'cancelled', deposit_rate: 30 })).toEqual([]);
expect(piChecklistComplete(Object.fromEntries(PI_CHECK_KEYS.map((k) => [k, 'ok'])))).toBe(true);
expect(piChecklistComplete({ ...Object.fromEntries(PI_CHECK_KEYS.map((k) => [k, 'ok'])), '7': 'error' })).toBe(false);
expect(supplierDefaults({ default_incoterm: 'Ex Works', deposit_rate: 30 })).toEqual({ incoterm: null, deposit_rate: 30 });
const payload = toPurchaseOrderPayload(purchaseOrderSchema.parse({ ...validValues, id: 'p1' }), 'pi_approved');
expect(payload).not.toHaveProperty('currency'); expect(payload).not.toHaveProperty('customer_id'); expect(payload).not.toHaveProperty('status');
expect(defaultUnitPrice({ purchase_price: 1.9, purchase_currency: 'USD' }, 'EUR')).toBeNull();
expect(suggestPayments({ subtotal: 2000, total: 2000, deposit: 600, balance: 1400 }, 'USD', [{ kind: 'deposit' }]))
   .toEqual([{ kind: 'balance', amount: 1400, currency: 'USD', paid_by: 'moesa' }]);
expect(psiWarning({ status: 'ready', has_approved_psi: false })).toBe(true);
// queryKeys.test.ts
expect(affectedTables(['purchase_order_line'])).toEqual(expect.arrayContaining(['purchase_order_overview', 'product_evidence']));
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23503', message: 'insert … violates foreign key constraint "purchase_order_line_product_fkey"' }, ['product_id']))
   .toEqual({ product_id: i18n.t('errors.po_line_product_customer') });
```

- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/api/purchaseOrder.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the two modules plus the queryKeys, NAMED_ERRORS, field.ts and i18n changes; run `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/purchaseOrder app/src/api/queryKeys.ts app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests
git commit -m "feat(po): purchase order API with exact PI arithmetic and status flow helpers"
```

---

### Task 4: Purchase order list and card: general and lines

**Files:**
- Create:
  - `app/src/components/service-components/purchase-order-table/PurchaseOrderTable.vue`
  - `app/src/views/pages/ops/purchase-order/{Index,Manage,PurchaseOrderCard,LineUpsert}.vue`
  - `app/src/views/pages/ops/purchase-order/usePurchaseOrderForm.ts`
  - `app/src/views/pages/ops/purchase-order/tabs/{General,Lines,Documents,Media}.vue`
  - `app/tests/views/purchaseOrderForm.test.ts`
- Modify: `app/src/router/routes/ops.ts`, i18n (`route.label.ops_purchase_order*`).

**Interfaces:**
- Consumes: Task 3, plus `EntityDocuments`, `EntityMedia`, `SelectCustomer`, `SelectSupplier`, `SelectCurrency`, `SelectEnum`, `useCustomerFilter` and `useUpsertForm`.
- Produces:
  - `PurchaseOrderTable.vue` props `{ filters?: { supplierId?: string; projectId?: string; productId?: string } }`.
    - It is a ResourceTable over `purchase_order_overview` that follows the global customer filter.
    - Columns: code, customer_code, supplier_code, project_code, status (Tag), ready_on, `system_total` with currency, deposit_paid_on, balance_planned_on. Status is a SelectEnum filter.
    - A row opens `ops-purchase-order-manage`. `productId` filters with `purchase_order_line!inner(product_id)`. Tasks 9 and 10 reuse the component.
  - `usePurchaseOrderForm(id, onSaved?)`: the `useProductForm` pattern.
    - It prefills `customer_id` from the customer filter, and `project_id` and `customer_id` from route query `project_id`/`customer_id` (the project card's "new PO").
    - `PO_CARD_TABS = ['general', 'lines', 'pi', 'payments', 'production', 'documents', 'media'] as const`.
    - `PO_FORM_TABS = ['general', 'pi'] as const`: the two tabs that share the form.
    - `tabForField(field): 'general' | 'pi'` returns `'pi'` for `pi_*`, else `'general'`.
    - `PURCHASE_ORDER_FORM` is the injection key.
  - `PurchaseOrderCard.vue` and `Manage.vue` follow `ProductCard`/`product/Manage.vue`. The tabs other than general open once the PO is saved. The header shows `code — supplier code`, a status Tag, and the slot where Task 5 mounts `StatusActions`.
  - `tabs/General.vue`:
    - Fields: customer (new only), supplier (new only; picking one fills `incoterm` and `deposit_rate` from `supplierDefaults` while they are empty), project (`SelectResource` over the customer's projects), currency, incoterm (`SelectEnum` `INCOTERMS`, no i18n prefix) and place, deposit %, ready date, tolerance %, penalty rule, packing instruction document (a lookup of this PO's documents), notes.
    - The `PO_LOCKED_FIELDS` inputs are `disabled` with tooltip `errors.po_locked` when `isPurchaseOrderLocked`.
  - `tabs/Lines.vue`: a ResourceTable over the card's embedded lines.
    - Columns: position, SKU, name, quantity, unit price, line total, spec sheet (version Tag, or a red "missing" Tag when the line has none).
    - Add and edit open `ops-purchase-order-line-add` / `-edit`. These actions are hidden when locked.
    - A footer shows the `purchaseOrderFigures` subtotal and currency.
  - `LineUpsert.vue` (route dialog):
    - Product: `SelectResource` over the PO customer's products, archived excluded.
    - Choosing a product sets `unit_price := defaultUnitPrice(product, po.currency)` while the field is empty.
    - Spec sheet: `useSpecSheetOptions(product_id)`, preselecting the highest version.
    - Then quantity, unit price, notes.
  - `tabs/Documents.vue`: `EntityDocuments entityType="purchase_order" :entityId :code :customerId`. `tabs/Media.vue`: `EntityMedia entityType="purchase_order" … :tenantId`.
  - Routes, under `path: 'purchase-orders'`, `name: 'ops-purchase-order'`, `icon: PrimeIcons.SHOPPING_CART`, `requiredPermissions select purchase_order`, with a context menu "add" opening `ops-purchase-order-manage` as a center dialog:
    - `ops-purchase-order-list` at `list`;
    - `ops-purchase-order-manage` at `:id?/manage/:tab?`, with one child `ops-purchase-order-manage-<tab>` per `PO_CARD_TABS` entry (`visible: false`);
    - `ops-purchase-order-line-add` at `:purchaseOrderId/line/add` (create `purchase_order_line`);
    - `ops-purchase-order-line-edit` at `line/:id/edit` (modify `purchase_order_line`).
- [ ] **Step 1: Write `purchaseOrderForm.test.ts`**
  - `tabForField('pi_total') === 'pi'` and `tabForField('incoterm') === 'general'`.
  - Mounting `General.vue` with an injected form whose status is `pi_approved` renders the currency input `disabled`.
  - Picking supplier `{ default_incoterm: 'FOB', deposit_rate: 30 }` on an empty new form sets `incoterm` to `'FOB'` and `deposit_rate` to `30`. On a form whose incoterm is `'EXW'`, it leaves `'EXW'`.
  - `Lines.vue` with a line whose `spec_document_id` is null shows the missing-spec Tag, and hides the add button when locked.
- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/views/purchaseOrderForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; run `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then `pnpm dev:vue` as `koordinator@moesa-panel.test`: a new PO for THO / TR1 gets EXW and 30 %, saves as `PO-THO-<year>-001`, and takes a MOP40 line priced 1.90 when the PO is in USD.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/purchase-order-table app/src/views/pages/ops/purchase-order app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/views/purchaseOrderForm.test.ts
git commit -m "feat(po): purchase order list and card with terms, lines, documents and media"
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
- Modify: `PurchaseOrderCard.vue` (mount the tabs and StatusActions), `app/src/router/routes/ops.ts`, i18n.

**Interfaces:**
- Consumes: Task 3 (`piDifferences`, `nextPurchaseOrderStatuses`, `psiWarning`, `suggestPayments`, `useSetPurchaseOrderStatus`, resources) and Task 4 (form injection, card).
- Produces:
  - `PiArithmeticTable.vue` props `{ rows: PiRow[]; currency: string }`. It is a DataTable of label / system / PI / difference. A row with a non-zero `diff` gets class `text-red-500` and `data-test="pi-diff"`. The footer shows `ops.purchase_order.pi.matches` or `…mismatch`. It is a pure display component, so Task 12 can reuse it in a print view.
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

    - It renders one button per `next` value; `cancelled` is a text/danger button placed last.
    - A click opens a `ConfirmDialog` that names the target status, plus the warning text when `warnings[status]` is set.
    - On confirm it awaits `onChange`, sends errors to `appErrorHandler`, and on success shows a toast.
    - Task 8 reuses it for shipments.
  - `tabs/Pi.vue` uses the shared form.
    - Fields: the PI document (lookup of this PO's documents with `type = 'pi'`, newest version first), PI number, and the six figures.
    - Then `PiArithmeticTable` with `piDifferences(lines, terms, entered)` computed live from the form, and the 30-item checklist: one row per `PI_CHECK_KEYS` with label `pi_check.items.<n>` and a `SelectButton` of `PI_CHECK_STATUSES`.
    - Read-only when locked, showing "checked by / at" from `pi_checked_by`/`pi_checked_at`.
    - Per-line PI totals are edited in an inline `InputNumber` column that saves each line (`purchaseOrderLineResource.useSave`) on blur.
  - `tabs/Payments.vue`: a table of payments (kind, amount, currency, planned, paid, payer) with add/edit (`ops-purchase-order-payment-add` / `-edit` route dialogs).
    - A "Plan from PI" button inserts `suggestPayments(figures, currency, payments)`; it is shown only when that list is non-empty.
    - A deposit amount different from the system deposit shows a warn Tag.
  - `tabs/Production.vue`: a list of updates, newest first (date, note, author), with add/edit (`ops-purchase-order-update-add` / `-edit`).
  - Card header: `StatusActions` with:
    - `next = nextPurchaseOrderStatuses(po)` and `i18nPrefix 'ops.purchase_order.status'`;
    - `warnings = { balance_paid: t('ops.purchase_order.psi_warning') }` when `psiWarning(overviewRow)`;
    - `onChange = (status) => setStatus({ id, status })`.
    It is visible only with `$can('update', 'purchase_order')`.
- [ ] **Step 1: Write the component tests**
  - `PiArithmeticTable`: S09 rows (line 2000 vs 2500) render exactly one `[data-test="pi-diff"]` row, with text containing `500`. Matching rows render none and show `…pi.matches`.
  - `StatusActions`:
    - `next: ['sent', 'cancelled']` renders two buttons, with cancel last.
    - Confirming `sent` calls `onChange('sent')` once.
    - A rejected `onChange({ message: 'po_lines_required' })` calls `appErrorHandler`, which is mocked and asserted.
    - `warnings: { balance_paid: 'X' }` shows `X` in the confirm dialog for `balance_paid` only.
- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/components/PiArithmeticTable.test.ts tests/components/StatusActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, tabs, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In the browser, on the Task 4 PO:
  - Send it.
  - Add a PI document, enter a total off by 1, and move to "PI received".
  - Tick all 30 items. "PI approved" fails with the mismatch toast, and the table marks the row.
  - Correct the total. Approval passes, and lines and terms become read-only.
  - Plan payments from the PI. Paying the deposit unlocks "Deposit paid".
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/pi-arithmetic app/src/components/service-components/status-actions app/src/views/pages/ops/purchase-order app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/components
git commit -m "feat(po): S09 PI check, payments, production log and status actions"
```

---

### Task 6: Shipments (DB)

**Files:**
- Create: `supabase/migrations/031_shipments.sql`, `supabase/tests/database/031_shipments.test.sql`
- Modify:
  - `supabase/seed.sql`: `seed_ops_roles` gains `'shipment'`.
  - `099_seed.test.sql`: plan +1, `ok(… koordinator … 'public.shipment', 'insert') = 1 …)`.
  - i18n errors from Task 7's table; sync.

**Interfaces:**
- Consumes: `public.purchase_order` and its line (Task 1), `purchase_order_line_id_po_tenant_key`, `private.grant_group_to_product_editors`, `next_code` (`kind 'shp'`), `private.entity_customer`.
- Produces (SQL):
  - Enums:
    - `public.shipment_mode`: `fcl20`, `fcl40`, `lcl`, `road`, `courier`, `air`.
    - `public.shipment_status`: `planned`, `booked`, `loaded`, `in_transit`, `at_customs`, `delivered`, `accepted`, `disputed`, `cancelled`. `cancelled` is an addition to the spec list, since records are never deleted (§3).
  - `public.customer_warehouse` gains `customer_warehouse_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`.
  - Table `public.shipment`:
    - Identity and parties:
      - `id`, `tenant_id`, `customer_id UUID NOT NULL`, `code TEXT`, `status … NOT NULL DEFAULT 'planned'`, `mode public.shipment_mode NOT NULL`, `delivery_warehouse_id UUID NOT NULL`;
      - `forwarder TEXT`, `customs_broker TEXT`, `carrier TEXT`;
      - `incoterm_buy TEXT`, `incoterm_sell TEXT`, `is_insured BOOLEAN NOT NULL DEFAULT FALSE`.
    - Dates: `ready_on`, `booking_confirmed_on`, `etd`, `eta`, `customs_cleared_on`, `planned_delivery_on` (all DATE), and `delivered_at TIMESTAMPTZ`.
    - Transport and quantities:
      - `container_no TEXT`, `seal_no TEXT`;
      - `free_days_port INT CHECK (>= 0)`, `free_days_detention INT CHECK (>= 0)`, `demurrage_note TEXT`;
      - `carton_count INT`, `pallet_count INT`, `volume_m3 NUMERIC(10,3)`, `gross_kg NUMERIC(12,2)` (all ≥ 0).
    - Acceptance (S16):
      - `accepted_by TEXT`, `accepted_on DATE`;
      - `quantity_matches BOOLEAN`, `has_damage BOOLEAN`;
      - `dispute_deadline_at TIMESTAMPTZ`.
    - Other: `notes`, `created_at`, `updated_at`.
    - Constraints:
      - `unique_shipment_code (tenant_id, code)`;
      - `shipment_id_tenant_id_key`, `shipment_id_customer_tenant_key UNIQUE (id, customer_id, tenant_id)`;
      - `shipment_customer_fkey`;
      - `shipment_warehouse_fkey (delivery_warehouse_id, customer_id, tenant_id)` → `customer_warehouse (id, customer_id, tenant_id)` RESTRICT;
      - `shipment_incoterm_buy_valid` and `shipment_incoterm_sell_valid`: `CHECK (x IS NULL OR private.incoterm_valid(x))`.
    - `REVOKE DELETE`.
  - Table `public.shipment_purchase_order(shipment_id, purchase_order_id, tenant_id, customer_id UUID NOT NULL, created_at)`:
    - PK `(shipment_id, purchase_order_id)`;
    - `shipment_purchase_order_link_key UNIQUE (shipment_id, purchase_order_id, tenant_id)`;
    - `shipment_purchase_order_shipment_fkey (shipment_id, customer_id, tenant_id)` → shipment, CASCADE;
    - `shipment_purchase_order_po_fkey (purchase_order_id, customer_id, tenant_id)` → purchase_order, RESTRICT.
    - A BEFORE INSERT DEFINER trigger sets `customer_id` from the shipment.
  - Table `public.shipment_line(id, tenant_id, shipment_id, purchase_order_id, purchase_order_line_id, quantity INT NOT NULL CHECK (> 0), carton_count INT, created_at, updated_at)`:
    - `unique_shipment_line (shipment_id, purchase_order_line_id)`;
    - `shipment_line_link_fkey (shipment_id, purchase_order_id, tenant_id)` → `shipment_purchase_order (shipment_id, purchase_order_id, tenant_id)` RESTRICT. A line needs its PO on the shipment.
    - `shipment_line_po_line_fkey (purchase_order_line_id, purchase_order_id, tenant_id)` → `purchase_order_line (id, purchase_order_id, tenant_id)` RESTRICT.
  - Table `public.shipment_event(id, tenant_id, shipment_id, happened_at TIMESTAMPTZ NOT NULL DEFAULT now(), step SMALLINT CHECK (step BETWEEN 1 AND 20), from_party TEXT, to_party TEXT, channel TEXT, note TEXT, created_by UUID DEFAULT auth.uid(), created_at, updated_at)`. FK `(shipment_id, tenant_id)` → shipment, CASCADE. `step` is the S15 §B row; NULL is "other".
  - Triggers on shipment:
    - `shipment_set_code`: BEFORE INSERT, invoker. It sets the code with `next_code('shp', customer.code)` and the status to `planned`. A customer the caller cannot see raises `shipment_customer_missing` (23503).
    - `shipment_guard`: BEFORE UPDATE, SECURITY DEFINER. Rules in order:
      1. A changed `code` or `customer_id`: `shipment_immutable_field`.
      2. `shipment_status_order`. The allowed status changes are:
         - `planned → booked | cancelled`, `booked → loaded | cancelled`, `loaded → in_transit`;
         - `in_transit → at_customs | delivered`, `at_customs → delivered`;
         - `delivered → accepted | disputed`, `disputed → accepted`.
         `accepted` and `cancelled` are final.
      3. Entering `booked`:
         - no linked PO: `shipment_po_required`;
         - `booking_confirmed_on IS NULL`: `shipment_booking_date_required`.
      4. Entering `in_transit` with `etd` or `eta` NULL: `shipment_eta_required`.
      5. Entering `delivered` with `delivered_at IS NULL`: `shipment_delivery_time_required`. On success, when `dispute_deadline_at IS NULL`, it sets it to `delivered_at + min(supplier.damage_notice_hours) * INTERVAL '1 hour'` over the suppliers of the linked POs (NULL when none has hours). The field stays editable, since the contract may say otherwise (S16 §F).
      6. Entering `accepted`:
         - no `delivery_receipt` document with status `signed` or `approved` on the shipment: `shipment_delivery_receipt_required`;
         - `quantity_matches IS NOT TRUE OR has_damage IS NOT FALSE`: `shipment_acceptance_issue`. Such a delivery is `disputed` (S16 "rezervli teslim / red").
         - On success, `accepted_on` defaults to `current_date`.
  - Triggers on links and lines (DEFINER):
    - `shipment_purchase_order_guard` (INSERT OR DELETE):
      - the shipment is `loaded` or later (or `cancelled`): `shipment_locked`;
      - on insert, the PO's status is not between `pi_approved` and `balance_paid`: `shipment_po_not_open`;
      - on delete, the link still has lines: `shipment_po_has_lines`.
    - `shipment_line_guard` (INSERT OR UPDATE OR DELETE):
      - the shipment is `loaded` or later (or `cancelled`): `shipment_locked`;
      - on insert/update, the sum of this PO line's quantities over shipments not `cancelled` (this row's new value included, its old value excluded) exceeds `floor(quantity * (1 + coalesce(tolerance_pct, 0) / 100))`: `shipment_quantity_exceeds_po`.
  - `private.entity_customer` is redefined with the 025 branches, the Task 1 `purchase_order` branch, and `WHEN 'shipment'`.
  - Module `('shipment', TRUE, 180)`. Permissions:
    - `shipment`: select, insert, update;
    - `shipment_purchase_order`: select, insert, delete;
    - `shipment_line`, `shipment_event`: select, insert, update, delete.
    Plus the owner grant and `SELECT private.grant_group_to_product_editors('shipment')`.

- [ ] **Step 1: Write `031_shipments.test.sql`**: `plan(21)`, MOESA, `koordinator@`.
  - Fixtures as `postgres` under `SET LOCAL session_replication_role = replica`, then `origin`; no triggers fire, so give codes and line `customer_id` explicitly:
    - PO `A` (THO, CN1 with `damage_notice_hours` 48, status `pi_approved`, `tolerance_pct` 5), with line `LA` (MOP40, quantity 1000);
    - PO `B` (THO, `draft`);
    - PO `Z` (customer `ZZZ`, `pi_approved`) and its warehouse `WZ`;
    - an `approved` `delivery_receipt` document is inserted later, after the shipment exists.
  - Ids are `…0311` onward.

```sql
SELECT has_table('public', 'shipment', 'shipment table');
-- insert S1: THO, mode fcl20, warehouse Rosbach
SELECT is((SELECT code FROM public.shipment WHERE id = <S1>), 'SHP-THO-' || extract(year FROM now())::INT || '-001', 'the code comes from next_code');
SELECT throws_ok(<insert S9 THO with warehouse WZ>, '23503', NULL, 'not another customer''s warehouse');
SELECT throws_ok(<link S1 ↔ B>, '23514', 'shipment_po_not_open', 'a draft order is not shipped');
SELECT throws_ok(<link S1 ↔ Z>, '23503', NULL, 'not another customer''s order');
SELECT lives_ok(<link S1 ↔ A>, 'an approved order is linked');
SELECT throws_ok(<shipment_line S1, PO B, line of B>, '23503', NULL, 'a line needs its order on the shipment');
SELECT lives_ok(<shipment_line S1 LA quantity 1000>, 'the ordered quantity');
-- S2 linked to A; line LA 50 (1050 = 1000 × 1.05)
SELECT lives_ok(<shipment_line S2 LA 50>, 'within the 5 % tolerance');
SELECT throws_ok(<shipment_line S3 LA 1>, '23514', 'shipment_quantity_exceeds_po', 'not beyond the tolerance');
-- UPDATE S2 SET status='cancelled'
SELECT lives_ok(<shipment_line S3 LA 50>, 'a cancelled shipment frees its quantity');
SELECT throws_ok(<UPDATE S1 SET status='loaded'>, '23514', 'shipment_status_order', 'no skipping statuses');
SELECT throws_ok(<UPDATE S1 SET status='booked'>, '23514', 'shipment_booking_date_required', 'booking needs its confirmation date');
SELECT throws_ok(<UPDATE empty S4 SET status='booked', booking_confirmed_on = current_date>, '23514', 'shipment_po_required', 'booking needs an order');
-- S1 booked (with date) → loaded
SELECT throws_ok(<UPDATE S1's line SET quantity = 900>, '23514', 'shipment_locked', 'loaded goods do not change');
SELECT throws_ok(<UPDATE S1 SET status='in_transit'>, '23514', 'shipment_eta_required', 'in transit needs ETD and ETA');
-- etd, eta set → in_transit
SELECT throws_ok(<UPDATE S1 SET status='delivered'>, '23514', 'shipment_delivery_time_required', 'delivered needs the time');
-- delivered_at '2027-01-10 10:00+00' → delivered
SELECT is((SELECT dispute_deadline_at FROM public.shipment WHERE id = <S1>), '2027-01-12 10:00+00'::TIMESTAMPTZ, 'the supplier''s 48 hours to report damage');
SELECT throws_ok(<UPDATE S1 SET status='accepted'>, '23514', 'shipment_delivery_receipt_required', 'acceptance needs the delivery receipt (G5)');
-- receipt document approved; has_damage TRUE, quantity_matches TRUE
SELECT throws_ok(<UPDATE S1 SET status='accepted'>, '23514', 'shipment_acceptance_issue', 'damage means disputed, not accepted');
SELECT lives_ok(<UPDATE S1 SET status='disputed'; then has_damage=FALSE, status='accepted'>, 'a settled dispute is accepted');
```

- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test:db`. Expected: FAIL.
- [ ] **Step 3: Write `031_shipments.sql`**, the seed change and the error keys; sync.
- [ ] **Step 4: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test tests/plugins/i18n`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/031_shipments.sql supabase/tests/database/031_shipments.test.sql supabase/tests/database/099_seed.test.sql supabase/seed.sql supabase/functions/_shared/database.types.ts app/src/plugins/i18n/locales
git commit -m "feat(shipment): shipments with linked orders, capped quantities, S15 events and acceptance rules"
```

---

### Task 7: Shipment API (app)

**Files:**
- Create: `app/src/api/shipment/index.ts`, `app/tests/api/shipment.test.ts`
- Modify:
  - `queryKeys.ts`:
    - DERIVED: `shipment_purchase_order: ['shipment']`, `shipment_line: ['shipment']`, `shipment_event: ['shipment']`;
    - CASCADES: `shipment: ['shipment_purchase_order', 'shipment_line', 'shipment_event']`.
  - `postgrestErrors.ts`, `field.ts` (`shipment: { name: 'ops-shipment-manage' }`, and children with `field: 'shipment_id'`), i18n (`fields.shipment`, `fields.shipment_purchase_order`, `fields.shipment_line`, `fields.shipment_event`, `ops.shipment.*`), `fields.test.ts` (four tables, one module), `queryKeys.test.ts`, `postgrestErrors.test.ts`.

**Interfaces:**
- Consumes: Task 6 tables; `INCOTERMS` (Task 3).
- Produces:
  - Types: `ShipmentStatus`, `ShipmentMode`, `ShipmentRow`, `ShipmentLineRow`, `ShipmentEventRow`, and `ShipmentCard`, which embeds:
    - `customer!shipment_customer_fkey(code, display_name)`;
    - `customer_warehouse!shipment_warehouse_fkey(display_name, city, dock_hours, appointment_rule)`;
    - `shipment_purchase_order(purchase_order!shipment_purchase_order_po_fkey(id, code, status, supplier_id, tolerance_pct, purchase_order_line!purchase_order_line_po_fkey(id, quantity, product!purchase_order_line_product_fkey(sku, display_name, is_hazmat))))`;
    - `shipment_line(*)`.
  - Constants: `SHIPMENT_STATUSES` (`allValues`, flow order), `SHIPMENT_MODES`, `S15_STEPS = [1, …, 20] as const`.
  - `nextShipmentStatuses(status: ShipmentStatus): ShipmentStatus[]`: the transitions of Task 6 rule 2.
  - `defaultWarehouseId(warehouses: Pick<Tables['customer_warehouse']['Row'], 'id' | 'is_default'>[]): string | null`: the default one, else the only one, else null.
  - `remainingQuantity(ordered: number, tolerancePct: number | null, shippedElsewhere: number): number`: `floor(ordered * (1 + tol/100)) - shippedElsewhere`, never below 0.
  - `SHIPMENT_DOCUMENT_TYPES = ['commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate', 'customs', 'sds'] as const`. This is spec M8's list: CI, packing list, B/L-CMR, origin/A.TR as `certificate`, customs instruction as `customs`, and SDS.
  - `documentChecklist(docs: Pick<DocumentRow, 'type' | 'status' | 'version'>[], hazmat: boolean): { type: DocumentType; status: DocumentStatus | null }[]`.
    - There is one row per type: the newest non-superseded document's status, or null when there is none.
    - `sds` is listed only when `hazmat`.
  - `etaState(row: Pick<ShipmentRow, 'eta' | 'status'>, today: string): 'late' | 'this_week' | 'later' | null`.
    - `null` once the shipment is `delivered`, `accepted`, `disputed` or `cancelled`, or when there is no ETA.
    - `late` when `eta < today`; `this_week` when `eta ≤ today + 7`.
  - `shipmentResource`, `shipmentSchema`, and `toShipmentFormValues` / `toShipmentPayload`:
    - every Task 6 column but `code`, `status` and `dispute_deadline_at`-on-insert;
    - `customer_id` is sent for a new shipment only;
    - `incoterm_*` use `z.enum(INCOTERMS).nullish()`;
    - `delivered_at` is a datetime.
  - `useSetShipmentStatus()`.
  - `useLinkPurchaseOrder()` takes `{ shipmentId, purchaseOrderId, tenantId }`; `useUnlinkPurchaseOrder()`.
  - `shipmentLineSchema` (`quantity` int ≥ 1, `carton_count` optional) and helpers; `shipmentEventSchema` (`happened_at` required, `step` optional `z.enum` over `S15_STEPS`, parties, channel, note) and helpers.

NAMED_ERRORS additions:

| code | name | field |
|---|---|---|
| 23503 | shipment_customer_missing | customer_id |
| 23514 | shipment_immutable_field | customer_id |
| 23503 | shipment_warehouse_fkey | delivery_warehouse_id (`errors.shipment_warehouse_customer`) |
| 23514 | shipment_incoterm_buy_valid | incoterm_buy (`errors.incoterm_invalid`) |
| 23514 | shipment_incoterm_sell_valid | incoterm_sell (`errors.incoterm_invalid`) |
| 23514 | shipment_booking_date_required | booking_confirmed_on |
| 23514 | shipment_eta_required | eta |
| 23514 | shipment_delivery_time_required | delivered_at |
| 23514 | shipment_acceptance_issue | has_damage |
| 23514 | shipment_po_not_open | purchase_order_id |
| 23503 | shipment_purchase_order_po_fkey | purchase_order_id (`errors.shipment_po_customer`) |
| 23503 | shipment_line_link_fkey | purchase_order_line_id (`errors.shipment_line_po_not_linked`) |
| 23505 | unique_shipment_line | purchase_order_line_id (`errors.shipment_line_duplicate`) |
| 23514 | shipment_quantity_exceeds_po | quantity |
| 23514 | shipment_locked | quantity |

`shipment_status_order`, `shipment_po_required`, `shipment_delivery_receipt_required` and `shipment_po_has_lines` are toasts.

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

UI copy as `ops.shipment.*` (EN / TR). Field names follow spec M8 and S16; items marked **[owner to confirm]** are not in the spec:
- `title`: Shipments / Sevkiyatlar
- `tabs.{general,dates,orders,events,acceptance,documents,media}`: General, Dates, Orders, Events, Acceptance, Documents, Media / Genel, Tarihler, Siparişler, Olaylar, Teslim kabulü, Belgeler, Ortam
- `fields`:
  - Parties and terms: delivery_warehouse Delivery warehouse / Teslim deposu; mode Mode / Mod; forwarder Forwarder / Forwarder; customs_broker Customs broker / Gümrük müşaviri; carrier Carrier / Taşıyıcı; incoterm_buy Incoterm (buy) / Incoterm alış; incoterm_sell Incoterm (sell) / Incoterm satış; is_insured Insured / Sigorta var mı.
  - Dates: ready_on Ready / Hazır; booking_confirmed_on Booking confirmed / Booking teyit; etd ETD; eta ETA; customs_cleared_on Customs cleared / Gümrük çıkış; planned_delivery_on Planned delivery / Planlanan teslim; delivered_at Delivered / Gerçekleşen teslim.
  - Transport: container_no Container / vehicle no / Konteyner/araç no; seal_no Seal no / Mühür no; free_days_port Free days (port) / Serbest gün (liman); free_days_detention Free days (detention) / Serbest gün (detention); demurrage_note Demurrage tariff note / Demuraj tarifesi notu.
  - Quantities: carton_count Cartons / Koli; pallet_count Pallets / Palet; volume_m3 m³; gross_kg Gross kg / Brüt kg.
  - Acceptance: accepted_by Received by / Kabul eden; accepted_on Accepted on / Tarih; quantity_matches Quantities match / Adet uyumlu mu; has_damage Damage / Hasar var mı; dispute_deadline_at Dispute deadline / İtiraz süresi sonu.
  - Events: from_party From / Kim; to_party To / Kime; channel Channel / Kanal; note Note / Not; step Event / Olay.
- `mode.*`: fcl20 `FCL 20'`, fcl40 `FCL 40'`, lcl `LCL`, road Road / Kara yolu, courier Courier / Kurye (all from S15), air Air / Hava yolu **[owner to confirm]**
- `status.*`:
  - planned: Planned / Planlandı **[owner to confirm]**
  - booked: Booked / Booking yapıldı **[owner to confirm]**
  - loaded: Loaded / Yüklendi (S15 step 7)
  - in_transit: In transit / Yolda (M6 "yoldaki")
  - at_customs: At customs / Gümrükte **[owner to confirm]**
  - delivered: Delivered / Teslim edildi **[owner to confirm]**
  - accepted: Accepted / Kabul edildi **[owner to confirm]**
  - disputed: Disputed / İtirazlı **[owner to confirm]**
  - cancelled: Cancelled / İptal edildi **[owner to confirm]**
- `document_checklist`: Document checklist / Belge kontrol listesi
- `steps.1` … `20`: from S15 §B "Olay". TR is verbatim:

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

- `psi_warning`: An order on this shipment has no approved PSI report (G4). / Bu sevkiyattaki bir siparişin onaylı PSI raporu yok (G4). **[owner to confirm]**

- [ ] **Step 1: Write `shipment.test.ts`**

```ts
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
expect(etaState({ eta: '2027-01-09', status: 'in_transit' }, '2027-01-10')).toBe('late');
expect(etaState({ eta: '2027-01-15', status: 'loaded' }, '2027-01-10')).toBe('this_week');
expect(etaState({ eta: '2027-01-09', status: 'delivered' }, '2027-01-10')).toBeNull();
// postgrestErrors.test.ts
expect(mapPostgrestError({ code: '23514', message: 'shipment_quantity_exceeds_po' }, ['quantity'])).toEqual({ quantity: i18n.t('errors.shipment_quantity_exceeds_po') });
// queryKeys.test.ts
expect(affectedTables(['shipment_line'])).toContain('shipment');
```

- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/api/shipment.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then sync i18n.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/shipment app/src/api/queryKeys.ts app/src/lib/form/postgrestErrors.ts app/src/constants/form/field.ts app/src/plugins/i18n/locales app/tests
git commit -m "feat(shipment): shipment API with status flow, quantity and document checklist helpers"
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
- Modify: `app/src/router/routes/ops.ts`, i18n.

**Interfaces:**
- Consumes: Task 7, `StatusActions` (Task 5), `EntityDocuments`, `EntityMedia`, `useEntityDocuments`, `useLookup`.
- Produces:
  - `ShipmentTable.vue` props `{ filters?: { purchaseOrderIds?: string[]; productId?: string } }`.
    - It is a ResourceTable over `shipment` with the `ShipmentCard` customer/warehouse embeds and `shipment_purchase_order(purchase_order!shipment_purchase_order_po_fkey(code))`. It follows the global customer filter.
    - Columns: code, customer, warehouse, mode, status, ETD, ETA (a red Tag when `etaState === 'late'`), PO codes.
    - `purchaseOrderIds` filters with `shipment_purchase_order!inner(purchase_order_id)`. `productId` filters with `shipment_line!inner(purchase_order_line!inner(product_id))`.
  - `useShipmentForm(id, onSaved?)`, with:
    - `SHIPMENT_CARD_TABS = ['general', 'dates', 'orders', 'events', 'acceptance', 'documents', 'media'] as const`;
    - `SHIPMENT_FORM_TABS = ['general', 'dates', 'acceptance']`;
    - `tabForField(field)`: date fields → `dates`, S16 fields → `acceptance`, else `general`.
    - A new shipment's warehouse is `defaultWarehouseId(customer's warehouses)` once a customer is chosen.
  - `tabs/General.vue`:
    - Fields: customer (new only), warehouse (a select of the customer's `customer_warehouse` rows, showing the S14 dock hours and appointment rule under it, read-only), mode, parties, incoterms, insured, transport and quantity fields, notes.
    - Packing list figures (cartons, pallets, m³, gross kg) carry the hint "from the packing list".
  - `tabs/Dates.vue`: the seven dates, plus `etaState` as a Tag next to ETA.
  - `tabs/Orders.vue`:
    - Linked POs, each with its lines and their shipped quantity. A line not yet on the shipment shows "Add" (`ops-shipment-line-add` with `purchaseOrderLineId`); one on it shows "Edit"/"Remove".
    - "Add order" is a plain `Dialog` listing the customer's POs in `pi_approved` to `balance_paid` that are not linked yet.
    - "Remove order" is enabled only when the PO has no lines on the shipment.
    - Every action is hidden from `loaded` on.
    - A PO without `has_approved_psi` shows the `psi_warning` Tag (read from `purchase_order_overview`).
  - `LineUpsert.vue` (route dialog): quantity defaults to `remainingQuantity(ordered, tolerance, shippedElsewhere)`; `shippedElsewhere` is read from `shipment_line` of shipments that are not cancelled. Then the carton count.
  - `tabs/Events.vue`: a timeline (`happened_at` descending) of step label (`ops.shipment.steps.<n>` or "Other"), from → to, channel and note, with add/edit (`ops-shipment-event-add` / `-edit`). `EventUpsert.vue` takes the step from a `Select` over `S15_STEPS`.
  - `tabs/Acceptance.vue`:
    - The S16 fields, plus `documentChecklist(documents, anyHazmat)` as rows of type label and status Tag, each opening the Documents tab.
    - The delivery receipt state is shown first, and the dispute deadline with a countdown.
  - Card header: `StatusActions` with `next = nextShipmentStatuses(status)`, `i18nPrefix 'ops.shipment.status'`, and `warnings.loaded = psi_warning` when a linked PO lacks an approved PSI (K3: warning only).
  - Routes:
    - `ops-shipment` at `shipments`, icon `PrimeIcons.TRUCK`, with `-list` and `-manage` (`:id?/manage/:tab?`, one child per tab);
    - `ops-shipment-line-add` at `:shipmentId/line/add` and `ops-shipment-line-edit` at `line/:id/edit`;
    - `ops-shipment-event-add` and `-edit`.
- [ ] **Step 1: Write `shipmentForm.test.ts`**
  - `tabForField('eta') === 'dates'` and `tabForField('has_damage') === 'acceptance'`.
  - Choosing customer THO whose warehouses are `[{ id: 'w1', is_default: true }]` sets `delivery_warehouse_id` to `'w1'`.
  - `Orders.vue` with status `loaded` renders no add/remove buttons.
  - `Acceptance.vue` with a hazmat line lists the `sds` row with a null status.
- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/views/shipmentForm.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, routes and i18n; sync.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In the browser:
  - Create `SHP-THO-<year>-001` to Rosbach.
  - Link the Task 5 PO and add its MOP40 line.
  - Booking without a date shows the date error.
  - With the dates set, the shipment moves on to delivered.
  - Accepting without a receipt is refused. With an approved receipt it is accepted.
- [ ] **Step 5: Commit**

```bash
git add app/src/components/service-components/shipment-table app/src/views/pages/ops/shipment app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/views/shipmentForm.test.ts
git commit -m "feat(shipment): shipment list and card with orders, S15 events, S16 acceptance and documents"
```

---

### Task 9: Gate evidence from orders and shipments; history tabs

**Files:**
- Create: `supabase/migrations/032_gate_links.sql`, `supabase/tests/database/032_gate_links.test.sql`, `app/tests/components/GatePanel.test.ts`, `app/src/views/pages/ops/project/tabs/{PurchaseOrders,Shipments}.vue`, `app/src/views/pages/ops/supplier/tabs/PurchaseOrders.vue`, `app/src/views/pages/ops/product/tabs/Orders.vue`
- Modify:
  - `app/src/api/project/index.ts`: `gateEvidenceEntityIds` and `useProjectOperations`.
  - `GatePanel.vue`: evidence and approval lookup.
  - `project/Manage.vue`: tabs `purchase_orders` and `shipments`.
  - `supplier/Manage.vue`: tab `purchase_orders`.
  - `product/useProductForm.ts`: `PRODUCT_CARD_TABS` gains `'orders'` before `documents`. `ProductCard.vue` mounts it.
  - `ops.ts`: the new child routes.
  - i18n.

**Interfaces:**
- Consumes: `PurchaseOrderTable` (Task 4), `ShipmentTable` (Task 8), and 021's `project_gate_guard` / `pass_gate`.
- Produces (SQL):
  - `private.project_gate_guard` is redefined. Its body is 021's verbatim, except that the `gate_evidence_invalid` EXISTS also accepts a document `d` when:
    - `d.entity_type = 'purchase_order'` and `d.entity_id` is a purchase order with `project_id = NEW.project_id` in the tenant; or
    - `d.entity_type = 'shipment'` and `d.entity_id` is a shipment linked (`shipment_purchase_order`) to such a purchase order.
  - `public.pass_gate` is redefined with the same widened EXISTS (still SECURITY INVOKER, inline, no private call).
  - The header comment states the K3 link: G3's evidence is the PO's PI, G4's is the PO's PSI report, and G5's is the shipment's delivery receipt.
  - No new hard rule: G3 and G4 do not demand these documents (K3 lists three hard rules).
- Produces (app):
  - `gateEvidenceEntityIds({ gateId, projectId, purchaseOrderIds, shipmentIds }): string[]`: the gate first, then the project, then the purchase orders and shipments. It is what GatePanel's document lookup filters `entity_id` on.
  - `useProjectOperations(projectId: MaybeRefOrGetter<string>)` returns `{ purchaseOrderIds: ComputedRef<string[]>; shipmentIds: ComputedRef<string[]> }`. These are two `useLookup`s: `purchase_order` by `project_id`, and `shipment_purchase_order` by those POs.
  - The new tabs:
    - Project `PurchaseOrders.vue`: `PurchaseOrderTable :filters="{ projectId }"`, plus a "New PO" button opening `ops-purchase-order-manage` with query `project_id`, `customer_id` (only with `$can('create','purchase_order')`).
    - Project `Shipments.vue`: `ShipmentTable :filters="{ purchaseOrderIds }"`.
    - Supplier `PurchaseOrders.vue`: `PurchaseOrderTable :filters="{ supplierId }"` (M2 "PO geçmişi").
    - Product `Orders.vue`: `PurchaseOrderTable :filters="{ productId }"` and `ShipmentTable :filters="{ productId }"` (M3 "PO/sevkiyat geçmişi").
    - Routes: `ops-project-manage-purchase_orders`, `-shipments`, `ops-supplier-manage-purchase_orders`, `ops-product-manage-orders`. Each tab is shown only with `$can('read', 'purchase_order' | 'shipment')`.
- [ ] **Step 1: Write `032_gate_links.test.sql`**: `plan(4)`, MOESA, `koordinator@`.
  - Fixtures as `postgres` in replica mode:
    - the pilot's G1 and G2 `passed`;
    - PO `P` (`project_id` = pilot, `pi_approved`) with a `pi` document `d_pi`;
    - PO `Q` without a project, with a `pi` document `d_q`;
    - shipment `S` linked to `P`, with a `delivery_receipt` document `d_rcv`;
    - a `gate_approval` document on G3 (`d_g3`) and on G5 (`d_g5`);
    - every pilot `project_task` set to `done`, so `gate_blocked_by_task` does not fire.

```sql
SELECT throws_ok($$ SELECT public.pass_gate(<G3>, 'PI ok', current_date, <d_g3>, ARRAY[<d_q>]) $$, '23514', 'gate_evidence_invalid', 'another project''s PI is not evidence');
SELECT lives_ok($$ SELECT public.pass_gate(<G3>, 'PI ok', current_date, <d_g3>, ARRAY[<d_pi>]) $$, 'the project''s PO PI is G3 evidence');
-- G4 passed in replica mode
SELECT lives_ok($$ SELECT public.pass_gate(<G5>, 'delivered', current_date, <d_g5>, ARRAY[<d_rcv>]) $$, 'the shipment''s delivery receipt is G5 evidence');
SELECT is((SELECT current_phase FROM public.project WHERE id = <pilot>), 'L1'::public.project_phase, 'the project still advances as before');
```

- [ ] **Step 2: Write `GatePanel.test.ts`**
  - `gateEvidenceEntityIds({ gateId: 'g', projectId: 'p', purchaseOrderIds: ['o'], shipmentIds: ['s'] })` equals `['g', 'p', 'o', 's']`.
  - Mounting `GatePanel` with `useProjectOperations` mocked (`['o']`, `['s']`) passes those ids to the document lookup (assert on the mocked `useLookup` call's `in.values`).
- [ ] **Step 3: Run and see the tests fail.** Run: `pnpm test:db && pnpm test tests/components/GatePanel.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the migration, helpers, tabs, routes and i18n.
- [ ] **Step 5: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In the browser, the pilot project shows its PO and shipment tabs, and G3's pass dialog offers the PO's PI document.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/032_gate_links.sql supabase/tests/database/032_gate_links.test.sql supabase/functions/_shared/database.types.ts app/src/api/project/index.ts app/src/components/service-components/gate-panel app/src/views/pages/ops/project app/src/views/pages/ops/supplier app/src/views/pages/ops/product app/src/router/routes/ops.ts app/src/plugins/i18n/locales app/tests/components/GatePanel.test.ts
git commit -m "feat(project): gates cite PO and shipment evidence; PO and shipment history on project, supplier and product cards"
```

---

### Task 10: Dashboard boxes for orders and shipments

**Files:**
- Create: `supabase/migrations/033_dashboard_operations.sql`, `supabase/tests/database/033_dashboard_operations.test.sql`
- Modify: `app/src/api/dashboard/index.ts`, `app/src/views/pages/dashboard/Index.vue`, `app/src/api/queryKeys.ts`, `app/tests/api/dashboard.test.ts`, i18n `dashboard.ops.*`.

**Interfaces:**
- Consumes: `purchase_order_overview` (Task 2), `shipment` and its links (Task 6), and `CountListCard`.
- Produces (SQL). Both views are `security_invoker` with `GRANT SELECT … TO authenticated` and a `COMMENT`, as in 022:
  - `public.dashboard_purchase_order`: one row per PO whose status is not `draft`, `closed` or `cancelled`.
    - Columns: `purchase_order_id`, `code`, `customer_id`, `customer_code`, `supplier_code`, `tenant_id`, `status`, `ready_on`, `days_to_ready INT` (`ready_on - current_date`), `deposit_planned_on` (min `planned_on` of unpaid deposits), `balance_planned_on`, `system_total`, `currency`.
  - `public.dashboard_shipment`: one row per shipment whose status is not `accepted` or `cancelled`.
    - Columns: `shipment_id`, `code`, `customer_id`, `customer_code`, `tenant_id`, `status`, `mode`, `etd`, `eta`, `days_to_eta INT`.
    - `overdue BOOLEAN`: `eta < current_date AND status IN ('planned','booked','loaded','in_transit','at_customs')`.
    - `warehouse_name`, `dispute_deadline_at`.
- Produces (app):
  - `useDashboardPurchaseOrders()` (order `ready_on` asc) and `useDashboardShipments()` (order `eta` asc, nulls last) through `useDashboardView`, whose `DashboardView` union gains both views.
  - `groupPurchaseOrders(rows)` returns `{ action, production }`:
    - `action`: `sent`, `pi_received`, `pi_approved`, in the rows' order;
    - `production`: `deposit_paid`, `in_production`, `ready`, `balance_paid`.
  - `groupShipments(rows)` returns `{ inTransit, late }`:
    - `inTransit`: `loaded`, `in_transit`, `at_customs`;
    - `late`: `overdue`.
  - `Index.vue` adds four `CountListCard`s, each item linking to its card:
    - action POs: `pi.pi-shopping-cart`, warn, meta = status label;
    - production POs: `pi.pi-cog`, info, meta = `Hazır <dd.MM>` and `Bakiye <dd.MM>` when set;
    - shipments in transit: `pi.pi-truck`, info, meta = `ETA <dd.MM>`;
    - late shipments: `pi.pi-exclamation-triangle`, danger, meta = `+<n> gün`.
    The PO boxes show with `$can('read','purchase_order')` and the shipment boxes with `$can('read','shipment')`.
  - queryKeys DERIVED:
    - `purchase_order`, `purchase_order_payment` gain `'dashboard_purchase_order'`;
    - `shipment`, `shipment_purchase_order` gain `'dashboard_shipment'`.
- Copy (`dashboard.ops.*`, EN / TR):
  - `po_action`: Purchase orders waiting for action / Aksiyon bekleyen PO'lar **[owner to confirm]**
  - `po_production`: Purchase orders in production / Üretimdeki PO'lar (spec M6)
  - `shipments_in_transit`: Shipments on the way / Yoldaki sevkiyatlar (spec M6)
  - `shipments_late`: Late shipments / Geciken sevkiyatlar **[owner to confirm]**
- [ ] **Step 1: Write `033_dashboard_operations.test.sql`**: `plan(6)`. Fixtures are in MOESA, replica mode:
  - POs `sent`, `in_production` (with a balance planned `2027-02-01`), `draft` and `cancelled`;
  - shipments `in_transit` (ETA = `current_date - 2`), `loaded` (ETA = `current_date + 3`), and `accepted`.

```sql
-- impersonate koordinator in MOESA
SELECT is((SELECT string_agg(status::TEXT, ',' ORDER BY status) FROM public.dashboard_purchase_order WHERE code LIKE 'PO-TST-%'), 'sent,in_production', 'open orders only');
SELECT is((SELECT balance_planned_on FROM public.dashboard_purchase_order WHERE status = 'in_production' AND code LIKE 'PO-TST-%'), '2027-02-01'::DATE, 'the balance date');
SELECT is((SELECT overdue FROM public.dashboard_shipment WHERE status = 'in_transit' AND code LIKE 'SHP-TST-%'), TRUE, 'a passed ETA is late');
SELECT is((SELECT days_to_eta FROM public.dashboard_shipment WHERE status = 'loaded' AND code LIKE 'SHP-TST-%'), 3, 'days to ETA');
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment WHERE status = 'accepted'), 0, 'accepted shipments leave the dashboard');
-- impersonate ayse in Atlas
SELECT is((SELECT count(*)::INT FROM public.dashboard_shipment), 0, 'another tenant sees none');
```

- [ ] **Step 2: Extend `dashboard.test.ts`**
  - `groupPurchaseOrders` over the statuses `sent`, `ready`, `pi_approved` gives `action` = `[sent, pi_approved]` and `production` = `[ready]`.
  - `groupShipments` over `{ status: 'in_transit', overdue: true }` and `{ status: 'booked', overdue: true }` gives `inTransit` of length 1 and `late` of length 2.
  - `affectedTables(['shipment'])` contains `'dashboard_shipment'`.
- [ ] **Step 3: Run and see the tests fail.** Run: `pnpm test:db && pnpm test tests/api/dashboard.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the migration, hooks, boxes and i18n; sync.
- [ ] **Step 5: Run.** Run: `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/033_dashboard_operations.sql supabase/tests/database/033_dashboard_operations.test.sql supabase/functions/_shared/database.types.ts app/src/api/dashboard app/src/api/queryKeys.ts app/src/views/pages/dashboard/Index.vue app/src/plugins/i18n/locales app/tests/api
git commit -m "feat(dashboard): orders waiting for action, orders in production, shipments on the way and late"
```

---

### Task 11: Glossary for the new enums

**Files:**
- Modify:
  - `app/src/api/glossary.ts`, `app/tests/plugins/i18n/glossary.test.ts` (the "covers the enums" list), i18n `glossary.*`.
  - The `SelectEnum` uses over these enums gain `glossary="…"`: the PO status filter in `PurchaseOrderTable`, the shipment status filter and mode in `ShipmentTable` / `shipment/tabs/General.vue`, and payment kind in `PaymentUpsert.vue`.

**Interfaces:**
- Consumes: `PURCHASE_ORDER_STATUSES`, `PAYMENT_KINDS` (Task 3), `SHIPMENT_STATUSES`, `SHIPMENT_MODES` (Task 7).
- Produces: `GLOSSARY_ENUMS` gains `purchase_order_status`, `payment_kind`, `shipment_status` and `shipment_mode`. `StatusActions` buttons get `v-tooltip` = `glossary.<enum>.<status>` when `te` finds one, through a new optional prop `glossary?: GlossaryEnum`.

The copy below is exact. Rows marked **[owner to confirm]** are the developer's reading where the spec, S09, S15 and S16 do not define the meaning. The marker is not copied into the JSON.

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

- [ ] **Step 1: Update `glossary.test.ts`.** The expected sorted key list adds `payment_kind`, `purchase_order_status`, `shipment_mode` and `shipment_status`. Add to `StatusActions.test.ts`: with `glossary: 'shipment_status'`, the `accepted` button's tooltip value equals `i18n.t('glossary.shipment_status.accepted')`.
- [ ] **Step 2: Run and see the tests fail.** Run: `pnpm test tests/plugins/i18n/glossary.test.ts tests/components/StatusActions.test.ts`. Expected: FAIL (missing enums and entries).
- [ ] **Step 3: Implement** the registry, JSON and call sites; run `pnpm i18n-sync`.
- [ ] **Step 4: Run.** Run: `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/src/api/glossary.ts app/src/components/service-components app/src/views/pages/ops app/src/plugins/i18n/locales app/tests
git commit -m "feat(i18n): glossary of order and shipment statuses, payment kinds and modes"
```

---

### Task 12: Full verification and the Phase 2 acceptance walk

**Files:**
- None, unless a defect is found; in that case fix it in the owning task's files.

- [ ] **Step 1: Run the whole suite.** Run (`app/`): `pnpm dev:supabase-reset && pnpm test:db && pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: every step PASSes, and `git status` shows no regenerated-type drift.
- [ ] **Step 2: Walk the acceptance scenario** (`pnpm dev:vue`, `koordinator@moesa-panel.test`). This covers spec §9 Phase 2 criteria 1–2:
  1. On the pilot project's "Purchase orders" tab, open a new PO: THO / CN1, USD. It shows FOB and 30 % from the supplier.
  2. Add a TIPS line (1000 × 0.85). With `spec_sheet_required_from` set to today in the settings (as `akif@`), "Send" is refused with `po_spec_sheet_required`. Add and reference a signed TIPS spec sheet; sending passes. Reset the setting.
  3. Add a PI document. Enter the S09-style totals 850 / 900 (one wrong). "PI received" passes, and "PI approved" is refused with the line marked red. Fix the figures and tick the 30 items: approval passes, and the fields lock.
  4. Plan payments from the PI. Pay the deposit, then move to in production and ready. "Balance paid" shows the PSI warning; add an approved PSI report and pay the balance.
  5. Create a shipment to Rosbach, link the PO, and ship 1000. Try 60 more on a second shipment: refused (`shipment_quantity_exceeds_po`; the tolerance is 0). Book it with a date, then set loaded, in transit with ETD/ETA, delivered, and accepted with an approved delivery receipt. Log S15 steps 4, 7 and 17 on the way.
  6. On the dashboard, the PO moves from "waiting for action" to "in production" and leaves at balance paid. The shipment shows under "on the way" with its ETA, and under "late" after setting the ETA to yesterday.
  7. On the pilot's G5, the pass dialog offers the shipment's delivery receipt as evidence.
- [ ] **Step 3: Walk the Review Focus**
  - A PO line with another customer's product shows a field message, not FK text.
  - After PI approval, a direct `PATCH /purchase_order?id=eq.<id>` with `{"currency":"EUR"}` from the browser console returns `po_locked`.
- [ ] **Step 4: Push and check CI.** Expected: `app`, `functions` and `database` are green. Commit only if Steps 2–3 required fixes:

```bash
git commit -m "fix(po): <what the acceptance walk found>"
```

---

## Self-review notes

- **Spec coverage:**
  - **M7.** The record, lines, terms and code (K5) are in T1, and the status list is exactly the spec's (T1).
  - The PI check (S09 arithmetic and checklist), payments and production updates are in T2/T3/T5. The "sent needs spec sheet" rule (K3 rule 2, §11 decision 5, date as a setting) is in T2. The PSI-before-balance warning is in T3/T5.
  - The G3 link (via project) is in T9. Documents and media are in T4.
  - **M8.** The record, multiple POs, warehouse from `customer_warehouse` (not typed), parties, incoterms, dates, transport, packing-list quantities, status list, `shipment_event` (S15) and acceptance (S16) are in T6/T8.
  - "accepted needs the delivery receipt" is in T6. The document checklist is in T7/T8.
  - **M6 Phase 2.** Shipments on the way (ETA order) and POs in production with balance dates are in T10.
  - **M5.** The project card's PO and shipment tabs are in T9. **M2** gets the PO history (T9). **M3** gets the PO/shipment history and `last_po_code` (T1, T9).
  - **§7.** The two Phase 1 roles get the modules (T1/T6 seed). Existing roles are granted by migration (027 pattern).
  - **§9 acceptance:** T12 step 2.
- **Rulings I made (spec gaps):**
  - A line has no own currency; the PO's currency applies (a PI is in one currency).
  - Before `spec_sheet_required_from`, "new SKU" means product status `concept`, `development` or `approved`.
  - A valid spec reference is a `spec_sheet` of the same product, `signed` or `approved` (what G2 accepts).
  - A PI mismatch blocks `pi_approved` (S09: "toplam yaklaşık kabul edilmez"). Approval also needs all 30 S09 items "Uygun".
  - Statuses move one step at a time. The deposit step is skipped only at a 0 % deposit, and cancelling is allowed from any non-final status.
  - Lines and commercial terms lock from `pi_approved` on, and the deposit default chain is supplier → company setting → 30.
  - No receipt document type for payments: payments are rows. Production photos go to the Media tab.
  - Shipments gain `cancelled`. Each status has a data requirement (booking date, ETD/ETA, delivery time), and damage or a quantity difference means `disputed`.
  - Shipment lines per PO line are capped at quantity × (1 + tolerance %). There are no ATD/ATA columns: S15 events record the actuals.
  - The dispute deadline is the delivery time plus the shortest supplier damage-notice hours, and stays editable.
  - PSI before loading or balance is a warning, not a block (K3 has three hard rules). Gate evidence may cite the project's PO and shipment documents, with no new hard gate rule.
- **Not in this plan:**
  - The management approval of payments above a threshold (§7). There is no setting for it yet, and it needs the finance role.
  - S15 triple matching of packing-list quantities across CI and B/L; the documents carry no quantities.
  - Default parties per S15 step.
  - A reorder-point PO draft (M11, Phase 3).
  - `customer_viewer` column hiding (Phase 3).
  - M9, M10 and the M20 page guide are later Phase 2 plans. Rollbacks tied to incidents (M10) are not changed here.
- **Type consistency:**
  - `PurchaseOrderStatus` and `nextPurchaseOrderStatuses` (T3) are used in T4/T5/T11. `ShipmentStatus` and `nextShipmentStatuses` (T7) are used in T8/T11.
  - `StatusActions` props (T5) are reused in T8 and gain `glossary` in T11.
  - `PurchaseOrderTable.filters` (T4) and `ShipmentTable.filters` (T8) are used in T9.
  - `purchase_order_overview` columns `system_*`, `has_approved_psi`, `deposit_paid_on` and `balance_planned_on` (T2) are read in T4, T5, T8 and T10.
  - `INCOTERMS` (T3) is used in T7.
  - The FK names `purchase_order_line_product_fkey`, `shipment_warehouse_fkey`, `shipment_purchase_order_po_fkey` and `shipment_line_link_fkey` (T1/T6) match the `NAMED_ERRORS` and the PostgREST embed hints in T3/T7/T8.
