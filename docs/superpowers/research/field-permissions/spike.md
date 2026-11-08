# Field-level permissions spike: `product` (Moesa Panel)

Date: 2026-11-08. Local DB: `supabase_db_moesa-panel`, PostgreSQL 15.8. Every run was wrapped in
`BEGIN … ROLLBACK` (`run.sh`). Afterwards there was no `api_spike` schema, no `spike_*` roles or functions, no
`SPIKE%` products, and the git tree was clean. Nothing was committed, and the git tree was never changed.

## 1. Setup and scripts

Every script is in `C:/Users/GHOST-V3/AppData/Local/Temp/claude/a--job-e-commerce-moesa-web-panel/4a743ab9-83bd-422f-b53c-eb9d2c009612/scratchpad/field-perms-spike/`.

| File | What it does |
|---|---|
| `run.sh` | Concatenates the given files between `BEGIN;` and `ROLLBACK;` and pipes them to `docker exec -i supabase_db_moesa-panel psql -U postgres -d postgres -v ON_ERROR_STOP=1` |
| `00_setup.sql` | Adds two secret products: `SPIKE-SECRET` in MOESA LTD (pp=12.5, notes='secret note', …) and `SPIKE-EU` in MOESA Europe. Adds the catalog `private.spike_protected_field` and `private.spike_role_field(role_id, resource, field, can_read, can_write)`, plus `private.spike_field_tenants()`, `private.spike_has_field()` (STABLE, SECURITY DEFINER, roles resolved like `tenants_granting`, owners and super admins see all fields), the base-table write guard trigger, the `spike_try`/`spike_try_dml` helpers, the "leaky" attacker function and `spike_as()` (wraps `private.impersonate` and sets `x-tenant-id`/`x-tenant-ids`) |
| `05_suite.sql` | `spike_suite(relation, tag)`: the attack list, T0–T11 |
| `10_protoA_objects.sql` | Prototype A: `api_spike` schema, masking views built from `pg_attribute` (modes `plain`, `sub`, `mt`, plus a `security_barrier` copy) and the INSTEAD OF write path, in a correct version and a naive version |
| `20_protoA_attacks.sql` | A-inv (`security_invoker` view): attacks through the view and directly against `public.product`, the plans, multi-tenant scope, the internal user, and the base-table state afterwards |
| `25_protoA_definer.sql` | A-def: the base is revoked from authenticated/anon, and the view is owned by `spike_api_owner` (NOBYPASSRLS, member of `authenticated`). Also shows the pitfall of a view owned by postgres |
| `40_protoB.sql` | Prototype B: column GRANTs, `spike_customer`/`spike_internal`, and the same attacks |
| `50_perf_objects.sql`, `55_perf_run.sql`, `56_perf_adef_plan.sql` | 100 000 products in MOESA LTD plus 100 000 in Nova, ANALYZE, then `EXPLAIN (ANALYZE, BUFFERS)` 5 times after a warm-up (median), and a call counter for the field function |
| `out_protoA.txt`, `out_protoB.txt`, `out_perf.txt`, `out_perf_adef.txt` | Raw output (the evidence for the tables below) |

**Actors.**
- **Restricted:** `koordinator@` has the `coordinator` role in MOESA LTD: product select/insert/update, no cost fields.
- **Internal:** `akif@` has the `management` role in MOESA LTD (all cost fields read and write) and in MOESA Europe (no field grants).

**Sensitive columns.** `purchase_price`, `purchase_currency`, `purchase_incoterm`, `landed_cost_eur`, `landed_cost_on`, `company_price_eur` (renamed from `moesa_price_eur` in 039, confirmed), `supplier_id`, `supplier_product_code`, `notes`.

**Core masking expression.** Generated per protected column:
```sql
CASE WHEN (SELECT private.spike_has_field('product','purchase_price')) THEN p.purchase_price END AS purchase_price      -- 'sub'
CASE WHEN private.spike_has_field('product','purchase_price') THEN p.purchase_price END AS purchase_price               -- 'plain'
CASE WHEN p.tenant_id = ANY ((SELECT private.spike_field_tenants('product','purchase_price'))::uuid[]) THEN p.purchase_price END  -- 'mt'
```

**Write path (A).**
- An `INSTEAD OF INSERT OR UPDATE` trigger sends only the columns the caller actually changed to the base table (NEW is compared with the masked OLD), so a masked NULL is never written back.
- The returned row is read again *through the masking view*.
- A `BEFORE INSERT OR UPDATE` guard on `public.product` raises `42501` when a protected field changes and the row's tenant is not in `spike_field_tenants(…, write => true)`.

## 2. Attack results

Legend: **PASS** means no information leaked. **LEAK** means the hidden value, or a fact derived from it, reached the restricted user.

- A-inv view = `api_spike.product` (`security_invoker`, InitPlan form).
- A-inv base = the same user hitting `public.product` directly, which is possible as long as the base table stays readable by `authenticated` (and, over HTTP, as long as `public` stays exposed).
- A-def = definer view owned by `spike_api_owner`, with the base revoked from `authenticated`.
- B = column GRANTs, run as `spike_customer`.

| # | Test | A-inv view | A-inv base (direct) | A-def view | B column grants |
|---|---|---|---|---|---|
| T0 | Positive control: row visible | visible | visible | visible | visible |
| T1 | Read the 9 protected cols | PASS, all NULL | **LEAK** `12.5, USD, FOB, 14.25, …, 'secret note'` | PASS, NULL | PASS, `42501 permission denied` |
| T1b | Whole row `to_jsonb(x)` | PASS, NULL | **LEAK** | PASS | PASS, 42501 |
| T1c | `select *` | PASS (masked) | **LEAK** | PASS (masked) | 42501: `select=*` breaks (see §4) |
| T2a | `WHERE purchase_price > 10` | PASS, 0 rows | **LEAK** (1 row) | PASS, 0 | PASS, 42501 |
| T2b | `WHERE purchase_price = 12.5` | PASS, 0 | **LEAK** | PASS, 0 | PASS, 42501 |
| T2c | `ORDER BY purchase_price` (non-null values present?) | PASS, none | **LEAK** (ranking of 2 products) | PASS | PASS, 42501 |
| T2d | Non-leakproof attacker function in WHERE: values it received | PASS, only `NULL` (also without `security_barrier`) | **LEAK** `12.5000, secret note, 1.9000` | PASS, only NULL (with and without `security_barrier`) | PASS, 42501 |
| T3 | `count(*) FILTER (WHERE pp IS NOT NULL)`, `sum`, `max` | PASS `(0, NULL, NULL)` | **LEAK** `(2, 14.4, 14.25)` | PASS | PASS, 42501 |
| T4 | UPDATE a masked column | PASS, `42501 …write the purchase_price field` | PASS (guard) | PASS (guard) | PASS, 42501 |
| T4b | UPDATE a masked column to NULL (wipe) | PASS, no-op: value kept (NEW = masked OLD) | PASS (guard refuses) | PASS, no-op | PASS, 42501 |
| T4c | UPDATE an allowed column only: secret kept? | PASS, base value unchanged | PASS | PASS | PASS |
| T5 | INSERT with a masked column | PASS, 42501 (guard) | PASS, 42501 (guard) | PASS, 42501 | PASS, 42501 |
| T5b/c | INSERT without masked columns | works | works | works | works (RETURNING must list allowed columns only) |
| T6a | Division-by-zero oracle `1/(pp-12.5)` | PASS, NULL | **LEAK** `22012 division by zero`, which confirms pp = 12.5 | PASS | PASS, 42501 |
| T6b | Cast error echoes the value `('x'\|\|notes)::int` | PASS | **LEAK** `invalid input syntax …: "xsecret note"` | PASS | PASS, 42501 |
| T6c | Oracle in an UPDATE SET expression | PASS | **LEAK** (22012) | PASS | PASS, 42501 |
| T6d | Allowed column set from a masked one (`pack_qty = notes::int`) | PASS (NULL) | **LEAK** `"secret note"` in the error | PASS | PASS, 42501 |
| T7 | RETURNING masked columns on an allowed UPDATE | PASS `(NULL, NULL, NULL)` | **LEAK** | PASS | PASS, 42501 |
| T7b | RETURNING the whole row | PASS | **LEAK** | PASS | PASS, 42501 |
| T7-naive | INSTEAD OF trigger that returns the *base* row | **LEAK** `(12.5000, "secret note")`, an implementation pitfall | n/a | n/a (re-reads the view) | n/a |
| T8a | Join product to customer through the relation | PASS (masked) | **LEAK** | PASS | PASS, 42501 (allowed columns join fine) |
| T8b | Existing `public.product_with_evidence` (`security_invoker`, `p.*`) | **LEAK** `(12.5000, "secret note")` | **LEAK** | PASS, fails closed: `42501 permission denied for table product` | PASS, fails closed: 42501 |
| T9 | Multi-tenant scope `x-tenant-ids = L,E`, cost fields granted in L only, active tenant L | **LEAK** with `spike_has_field` (active-tenant check): E row shows `77.7, "eu secret note"`. PASS with the `mt` (per-row tenant) view: E row NULL, write refused | same | Same as A-inv (`sub` form): LEAK unless the `mt` form is used | **LEAK**: one DB role per request, so `spike_internal` sees E's cost fields (`SPIKE-EU 77.7`) |
| T10 | `public.audit_log` for the product (coordinator has `audit_log` select) | **LEAK** `new_data->>'purchase_price' = 12.5000` | **LEAK** | **LEAK** | **LEAK** |
| T11 | Cross-tenant rows | PASS (RLS) | PASS | PASS (RLS still applies through the owner role; an insert into tenant E is refused by the existing policy) | PASS |
| T11-pitfall | Same definer view but owned by `postgres` (BYPASSRLS) | n/a | n/a | **LEAK**: other tenants' rows visible (23 vs 20 rows, `SPIKE-EU` visible to the MOESA LTD coordinator) | n/a |
| T12 | `set_config('role','spike_internal')` from inside the request | n/a | n/a | n/a | Succeeds, because SET ROLE is checked against the *session* user (under PostgREST that is `authenticator`). The role switch is only as safe as the absence of any SQL path for the caller; the risk is the same as today's `authenticator → service_role` |

**Internal user** (`akif@` in MOESA LTD): in A-inv, A-def and B (`spike_internal`) the user read every field, filtered on them, updated them and inserted with them (`13.0`, `14.0`, `15.0` written). RLS still applied (the E row was not visible with scope = L).

**Planner evidence for T2.** Filtering through the view keeps the predicate on the masking expression. It does not move it onto the raw column:
`Filter: (… AND (CASE WHEN $0 THEN p.purchase_price ELSE NULL::numeric END > '10'::numeric))` with `InitPlan 1 → private.spike_has_field(…)`.
Flattening the view substitutes the whole CASE, so masking holds before the filter even without `security_barrier`. RLS quals are always applied first as barrier quals. The `security_barrier` copy returned identical results, so it adds no protection here (masking happens in the target list, not in a view WHERE). It does cost performance (§3).

## 3. Performance

200 013 products in total: 100 013 in MOESA LTD (the restricted user's tenant) and 100 000 in Nova. Medians of 5 runs after a warm-up. Numbers are execution ms; planning was 0.08–0.29 ms everywhere. Plan buffers were about 4.6–4.8k shared hits, except for the plain function call (Q4: 1.7M hits).

Queries:
- Q1: `SELECT * … ORDER BY created_at DESC LIMIT 50`
- Q2: `sku LIKE 'L-00012%'`
- Q3: `count(*)`
- Q4: join to customer, `GROUP BY` code, `sum(purchase_price)`

| Variant | User | Q1 | Q2 | Q3 | Q4 | Field fn calls / exec | Where the fn sits |
|---|---|---|---|---|---|---|---|
| Baseline `public.product` | restricted | 101.8 | 30.6 | 34.5 | 72.0 | 0 | n/a |
| Baseline, B's column list | restricted | 54.9 | 32.6 | 33.8 | 70.9 | 0 | n/a |
| A `(SELECT spike_has_field())` | restricted | 110.0 (+8%) | 32.0 (+5%) | 33.8 (0%) | 71.3 (−1%) | 9 (1 per column) / 1 | **InitPlan** |
| A plain `spike_has_field()` | restricted | 179.0 (+76%) | 47.5 (+55%) | 33.7 (0%) | **17 838 (+24 700%)** | 450 (Q1), 100 013 (Q4) | **per row**, in Output/Filter |
| A `mt` (per-row tenant array, InitPlan) | restricted | 131.8 (+30%) | 33.4 (+9%) | 33.9 (−2%) | 75.5 (+5%) | 9 / 1 | InitPlan |
| A-def, `security_barrier` | restricted | 111.0 (+9%) | 79.7 (+161%) | 84.4 (+145%) | 134.3 (+86%) | 9 / 1 | InitPlan |
| A-def, no `security_barrier` (`56_…`) | restricted | 110.5 (+9%) | 35.3 (+15%) | 36.5 (+6%) | 69.6 (−3%) | 9 / 1 | InitPlan |
| B column grants (allowed columns) | restricted | 55.9 (+2% vs column-list baseline) | 31.5 (−3%) | 35.1 (+4%) | 70.2 (−1%) | 0 | n/a |
| Baseline `public.product` | internal | 109.2 | 31.5 | 33.9 | 71.9 | 0 | n/a |
| A `(SELECT …)` | internal | 118.8 (+9%) | 34.1 (+8%) | 33.5 (−1%) | 72.5 (+1%) | 9 / 1 | InitPlan |
| A plain | internal | 178.4 (+63%) | 48.8 (+55%) | 34.8 (+3%) | 18 357 (+25 400%) | 450 / 100 013 | per row |
| A `mt` | internal | 148.0 (+36%) | 33.2 (+6%) | 35.4 (+4%) | 77.9 (+8%) | 9 / 1 | InitPlan |
| A-def, `security_barrier` | internal | 120.1 (+10%) | 81.0 (+157%) | 85.1 (+151%) | 133.0 (+85%) | 9 / 1 | InitPlan |
| B `spike_internal` | internal | 103.3 (−5%) | 31.3 (−1%) | 34.3 (+1%) | 69.3 (−4%) | 0 | n/a |

Notes on the numbers:
- Run-to-run noise is about ±5%.
- The plain call is evaluated per row and per column. A STABLE plpgsql SECURITY DEFINER function is never hoisted, which makes it catastrophic on aggregates. Wrapping it as `(SELECT …)` turns it into one InitPlan per column per statement.
- `security_barrier` on the definer view stops the planner from discarding unused target-list columns, so every row pays for building the masked tuple. That costs +85–160%. The attacks show it buys no protection here, so it should not be used.
- `count(*)` never evaluates the masking at all.
- Side observation: Q1 costs about 100 ms in every variant because there is no `(tenant_id, created_at)` index: a 100k-row sort.

## 4. PostgREST and role mapping notes (B)

**`select=*`.**
- PostgREST renders `select=*` as `"public"."product".*`. With partial column grants that is `42501 permission denied for table product`, which reaches the client as an error, not as the allowed subset. The same happens for whole-row references and for `RETURNING *` with `Prefer: return=representation`.
- So every client query must list exactly the columns *its role* may see. The UI then needs per-role select lists, taken for example from `my_access`.
- Embeds, `product_with_evidence` (`p.*`) and every existing `security_invoker` view over `product` fail closed until they are rewritten.
- The upsert shape (`ON CONFLICT DO UPDATE`) works when only allowed columns are sent.

**The `TO authenticated` policies.**
- `spike_customer` and `spike_internal` are made members of `authenticated`. Policy role matching uses membership, so no policy change is needed.
- A role outside `authenticated` (`spike_outsider`) saw **0 rows**: default deny, because no policy applies to it.
- The workable layout:
  - `authenticated` keeps only `GRANT SELECT/INSERT/UPDATE (non-sensitive columns)`.
  - The privileged roles add `GRANT … ON product` (all columns).
  - Inheritance keeps the other privileges.

**Choosing the role per request.** PostgREST takes the DB role from the JWT `role` claim (`SET LOCAL ROLE`, with `GRANT <role> TO authenticator`). Our tokens deliberately carry only identity, and the tenant comes per request from `x-tenant-id`/`x-tenant-ids`. B would therefore need one of:
- (a) A `db-pre-request` function that resolves the user's app roles in the active tenant and calls `set_config('role', …)`. This works because SET ROLE is checked against `authenticator` (T12), but it makes pre-request a privilege-escalation choke point.
- (b) A token re-issued on every tenant switch.

Either way there is **one DB role per request**, so a multi-tenant scope with different field rights per tenant cannot be expressed (T9 leaks). You would have to collapse the scope to the intersection of rights or forbid multi-tenant reads.

**Per-tenant custom roles.** Tenants create arbitrary roles with arbitrary field sets. In B each distinct field set needs a cluster-global DB role (`CREATE ROLE` and `GRANT (cols)` at runtime, which needs a CREATEROLE-capable definer function), or a fixed set of "field profiles" (2^k combinations). That means role sprawl, DDL inside requests, and no per-tenant isolation of role names. Prototype A keeps all of this as data (`role_field` rows), like the current permission catalog.

## 5. Conclusions

**Safety ranking.**
1. **A-def (non-BYPASSRLS owner role + base revoked from `authenticated`), using the `mt` per-row-tenant form.** No leaks other than the `audit_log` side channel, which is shared by every design. It fails closed: any forgotten view, embed or direct access gets `42501`. Masked values are NULL rather than errors, so `select=*` keeps working. Field rights stay as catalog data (per-tenant custom roles, multi-tenant scope). Overhead is about 0–15% when used **without** `security_barrier` and with the `(SELECT …)` InitPlan form.
2. **B (column grants).** Postgres enforces it natively, every oracle is closed (errors, not NULLs), and overhead is about 0%. But it fails to express per-tenant and multi-tenant rights (T9 leak). It needs a role-switching pre-request hook or tenant-scoped tokens, plus runtime `CREATE ROLE`, and it breaks `select=*` and every `p.*` view or embed.
3. **A-inv (`security_invoker` view, base still granted).** The view itself is sound, but the base table is still fully readable at the DB level. Anything that reaches `public.product` leaks every oracle (T1–T8, T6 error messages): `product_with_evidence`, other `security_invoker` views and embeds, or the base table being exposed by mistake. Hiding the base in an unexposed schema only protects at the PostgREST config layer, not in Postgres. Not acceptable as the security boundary.

**Must-haves whichever design is chosen.**
- Use `(SELECT fn())`, never a bare function call (per-row evaluation, 250x slower on aggregates).
- Check rights per row tenant (`tenant_id = ANY(field_tenants)`), not against the active tenant only.
- INSTEAD OF triggers must re-read through the masking view; returning the base row leaks through RETURNING.
- Never own a definer view with `postgres` or any other BYPASSRLS role (cross-tenant leak).
- Mask or restrict `audit_log` `old_data`/`new_data` for protected fields.
- Audit every SECURITY DEFINER function that returns product data (`022`/`033` dashboards, `037` change requests, `043` transfer copy, `046` amazon): they bypass both designs.
- Side finding: `anon` and `authenticated` hold `TRUNCATE` (and `REFERENCES`/`TRIGGER`) on `public.product`. TRUNCATE ignores RLS. PostgREST cannot issue it, but it is worth revoking for defense in depth.
