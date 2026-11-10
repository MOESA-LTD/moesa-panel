# Field-level permissions — R&D summary (2026-11-08)

Owner request: research making the role system field-based, with security first. Two parallel strands:

- [research.md](research.md) — threat model (19 paths), approaches A–E, comparison, migration path, attack-test checklist, owner questions.
- [spike.md](spike.md) and [spike-scripts/](spike-scripts/) — two prototypes on `public.product`, run inside rolled-back transactions on the local DB (nothing persisted): 10+ attack tests per prototype and timings on 100 000 products per tenant.

## What we learned

1. **Today's gap is real.** Row rules (`resource_condition`) cannot hide columns. Anyone who may `select` a table reads every column of every visible row: cost, supplier, contract terms, internal notes. The spec's claim that the portal (M15) needs only a row condition is wrong for columns. No external user exists yet, so nothing leaks today; it would on the day a portal user is created.
2. **Every design leaks through the same side doors unless they are closed separately:** `audit_log` full-row snapshots (and `revert_audit_transaction` writing them back), SECURITY DEFINER functions returning derived figures (e.g. `purchase_order_figures`), views that select `p.*` (`product_with_evidence`), Edge Functions using the service role, a new column added to a "safe" table, and multi-tenant reads (`x-tenant-ids`) where rights are checked against the active tenant instead of each row's tenant.
3. **Prototype results (spike):**

| Design | Leaked | Overhead vs. baseline |
|---|---|---|
| A-inv: `security_invoker` masking view, base table still granted | base table directly (everything), `p.*` view, `audit_log`, other tenant's rows via `x-tenant-ids`, naive INSTEAD OF RETURNING | −1% … +9% with `(SELECT has_field())`; +55% … +250× when the function is called per row |
| A-def: masking view owned by a non-BYPASSRLS role, base table revoked, rights per row tenant | only `audit_log` | +6% … +15% (+36% worst with per-row tenant) |
| B: Postgres role per app role + column GRANTs | `audit_log`; other tenant's costs (one DB role per request cannot express per-tenant rights); `select=*` breaks | ~0% |

   Pitfalls measured: a definer view owned by `postgres` (BYPASSRLS) showed other tenants' rows; `security_barrier` cost +85…160% and added no protection here; filter/ORDER BY/`count FILTER`/error-message/RETURNING oracles were all closed in A-def.
4. **Side finding (fix independently):** `anon` and `authenticated` hold `TRUNCATE` on `public.product` (and likely other tables); TRUNCATE ignores RLS. PostgREST cannot issue it, but the grant should be revoked everywhere.

## Recommendation

**Phase 1 — satellite tables (research approach C), before M15.** Move each sensitive group to its own 1:1 table (`product_cost`, `customer_contract`, PO finance, supplier references, internal notes); each becomes a resource in the existing permission catalog, so the role editor and RLS work unchanged and filters/embeds on hidden values return nothing. Plus the cross-cutting fixes every design needs: mask or split `audit_log`, audit every SECURITY DEFINER function and Edge Function path, replace `p.*` views, a schema-classification test that fails on any unclassified new column, and the attack-test suite. Estimate ≈ 14 tasks.

**Phase 2 — only if per-field toggles in the role editor are wanted:** masking views in the A-def form (definer-owner non-BYPASSRLS role, base tables revoked, `(SELECT has_field())`, rights checked against each row's tenant, INSTEAD OF triggers re-reading through the view). Phase 1's split groups stay valid underneath. Estimate 30+ tasks.

Rejected: B (cannot express per-tenant rights, runtime role DDL), client-only CASL fields (not a boundary).

## Decisions needed from the owner

The full list is in research.md §4. The ones that change the plan:

1. Per-group access enough, or individual field toggles per role? (Phase 1 only vs. Phase 1 + 2.)
2. The complete list of sensitive fields and who may see each (e.g. `company_price_eur`, `target_price_eur`, `supplier_product_code`, PO line prices).
3. Portal and suppliers: anonymous "Supplier 1", nothing at all, or only the country of origin?
4. Audit history: may a user without cost rights see that a cost changed (event without values), or must those rows be hidden? Is rewriting old snapshots acceptable?
5. Timing: field rules before M15 (the portal), or is the trusted internal team fine without them until then?
