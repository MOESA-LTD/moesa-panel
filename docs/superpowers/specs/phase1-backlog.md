# Faz 1 — ertelenen küçük bulgular (backlog)

Kaynak: görev incelemeleri ve tüm dal incelemesi, 03.11.2026. Her satır bir inceleme bulgusu; "Task N" hangi görevin kodunda olduğunu söyler. Önce düzeltilmesi gerekenler son dal incelemesinde kapatıldı (023_phase1_fixes.sql ve ilgili commitler); burada kalanlar Faz 2 başında ele alınır.

## Son inceleme triyajı

- **Yakında, ucuz:** kapı defteri temizliği (doğrudan PATCH ile yeniden geçişte eski passed_at / rolled_back_reason; rolled_back→pending kabul; un-pass yolu project_not_active bakmıyor); veri modeli gevşeklikleri (project_product müşteriye bağlı değil; parent_id kendine/çapraz müşteriye işaret edebilir, döngü mümkün → CHECK + bileşik FK).
- **Drive veri taşımasından önce:** CSV okuma yalnızca UTF-8 (Windows-1254 Excel dosyaları bozulur → U+FFFD tespiti ya da TextDecoder fallback).
- **Zaman dilimi:** next_code yılı ve dashboard current_date UTC; rollback sonrası waiting_days şişiyor.
- **UI cilası, test boşlukları, kozmetik:** aşağıdaki satırlar.
- **Sahibe açık sorular:** listing kapıları G5 sonrası sıralı (spec "paralel" diyor); paket E projeleri CHECK tarafından kabul ediliyor; EAN çakışma kararlarının kim/ne zaman kaydı; gerçek Drive verisinin taşınması (kabul ölçütleri 1 ve 4).

## Görev bazında satırlar

- Task 1: minor (deferred): no negative-path pgTAP for next_code 403/400, code_sequence direct access, branch tenants get no defaults, setting.key non-updatable
- Task 1: minor (deferred): next_code counts per tenant incl. branches (company-unique codes would need root-tenant scope) — Ruling: acceptable in Phase 1 (single MOESA tenant); revisit if branches are ever used — cost if wrong: duplicate project codes across branches
- Task 1: minor (deferred): next_code year uses UTC; Europe/Sofia would differ 00:00-02:00 on Jan 1
- Task 1: minor (deferred): sync-locales CLI guard is a strict path compare; null leaf kept; trigger fn EXECUTE not revoked; pgtap extension persists in local DB
- Task 2: minor (deferred): settings page watch(rows) replaces all drafts on refetch (unsaved text edit lost); empty text saved as "" (report overstated revert); DatePicker may get Invalid Date when draft missing; setting.test.ts mounts in every test; no page component test
- Task 3: minor (deferred): signed-rule tests cover only issued_on; no tests for document_has_file/UNIQUE/version>=1/set_updated_at; revert_audit_transaction on a document insert fails with 42501 (header should say so / UI hide revert); lower-version-after-higher and UPDATE paths not re-applying supersede; report lacks raw TAP output.
- Task 3: minor (deferred): test 11 does not assert the Nova insert succeeded (vacuous pass risk); header paragraph reflow
- Task 4: minor (deferred): entity_id not validated as uuid in form; url optional in schema though DB requires it in this UI; rowActions label not reactive to locale; useEntityDocuments reads props once; issued_on shown raw in list; today-date test midnight flake; no DB CHECK on url scheme; SelectEnum locale-switch untested
- Task 4: minor (deferred): restored draft still displays stale record context in the form fields (payload corrected only); stale customer_id kept when the route has none
- Task 5: minor (deferred): pgTAP negative read checks lack positive control; REVOKE DELETE untested; child tab routes declare components that never render; :tab? param vs child path ambiguity; contact form supplier_id error invisible; no status filter on supplier list
- Task 6: minor (deferred): PlatformUpsert countries not pruned when platform changes; contract document not tied to the customer in DB (UI only); Nova-side positive control missing in pgTAP; no lives_ok for non-code update / own-customer document; no edit-path round-trip vitest
- Task 7: minor (deferred): no read-isolation test for product/product_evidence (guards security_invoker); no CHECK >= 0 on numeric fields; parent_id may self-link or cross customer; supplier/parent FK 23503 untested; SKU per-customer positive control missing; approved/draft-only evidence cases untested
- Task 8: minor (deferred): parent_id not cleared when customer changes (and A→B→A cycles possible); first fetch may use stale stored customer_id; compliance_complete selected but unused; origin_country ad-hoc schema; no tests for filter sync / evidence mapping / tab drafts
- Task 8: minor (deferred): submit jumps to the first error tab even when the current tab has an error; per-tab Reset resets the whole shared form; SelectCustomer @change emission unverified; submit assumes DB errors resolve into errors (not rethrown); brief blank during card remount
- Task 9: minor (deferred): cross-tenant GTIN clash surfaces as a generic DB error; non-digit GTIN from direct callers may raise instead of gtin_invalid; parent chains/cycles unconstrained; negatives and thousands separators rejected; row index drifts after blank lines; duplicate header columns silent; export query lives in the view without forTenant; no CSV formula-injection guard; unchanged rows rewritten; pgTAP gaps (supplier_unknown, parent_unknown, gtin_duplicate, stored values); mid-field quote handling; export delimiter comma; UTF-8-only file reading (Windows-1254 Excel exports)
- Task 9: minor (deferred): readHazmat accepts any value starting with "var"; older synonyms (konsept, onaylı, satışta, durduruldu, kısmi, tamam) deliberately dropped per ruling
- Task 10: minor (deferred): decided_by_role never set; next_code counts against the active tenant (⚠️ branch inserts); project_product not tied to the project's customer; packages {E} accepted; gate-set/pgTAP coverage gaps for b/variant/reorder/A0/B/D sets, rollback of non-first gate, blocking=false, direct-update rejection
- Task 10: minor (deferred): stale passed_at on direct re-pass; rollback_gate missing project_not_active; rolled_back_reason not cleared on re-pass; pass_gate needs caller UPDATE on project for the lock
- Task 10: minor (deferred): stale rolled_back_reason satisfies gate_reason_required on a re-passed gate; set_config marker clearable with raw SQL (not via PostgREST); lock order differs between RPCs and direct updates (deadlock → 40P01, safe); un-pass path ignores project_not_active; rolled_back→pending direct update accepted
- Task 11: minor (deferred): passed gate's documents still editable (dangling evidence ids); tasks of passed phases editable; Pass button shown on non-active projects and without client-side approval field check; errors.project_customer_missing string missing; task form offers all phases; thin path-b tests; unlink without confirmation
- Task 12: minor (deferred): waiting_days inflated after rollback (no rolled_back_at); current_date is UTC; no order tie-breaker; no "more" indicator past 8 rows; blank label when customer unreadable; owner_role not displayed; waiting_days=0 test trivial
- Task 12: minor (deferred): management_gates() DEFINER answers for any tenant id (low sensitivity); no wiring test for Index.vue click→filter
- Task 13: minor (deferred): management settings lives_ok cannot fail on a missing key; membership test infers owner from missing role; no test for coordinator role/user write ban; non-en/tr locales carry English (translation follow-up); screenshots git-ignored; customer list lacks its own screenshot

## Faz 2 başında ayrıca

- `pnpm test:db` CI'a eklenecek (Supabase CLI servisi); kapı ve kiracı garantileri yalnızca pgTAP ile kaplı.
- Tek bir `document_transition` tetikleyicisi zaten var (023); "geçilmiş kapının belgeleri düzenlenemesin" kuralı ona eklenebilir.
- Dolu bir şubenin silinmesi RESTRICT FK'lar yüzünden büyük olasılıkla başarısız olur; şube kullanımı başlamadan karar verilmeli.
- Şube içinde kayıt sonrası URL'nin kayıt id'sine dönmesi için dialog guard değişikliği (aynı rota, yalnız params değişince dialog açmamalı).
