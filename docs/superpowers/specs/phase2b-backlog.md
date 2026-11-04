# Faz 2b (M7 satın alma + M8 sevkiyat): ertelenen bulgular ve kararlar

Dal: `feat/phase2b-po-shipments` (taban `2a70703`, hesap refactor'u üzerine). 12 görev; final dal incelemesi "düzeltmelerle hazır" dedi; üç önemli bulgu (kirli formun itiraz süresini silmesi, itirazdan kabule geçişte veri falsifikasyonu, satırsız yükleme) ve iki küçük düzeltme dalgasında kapandı (`3207bef`, `7b90962`, `a432243`), yeniden inceleme temiz. Faz 2 kabul ölçütlerinin ikisi de karşılandı (Görev 12 turu, ekran görüntüleriyle).

## Sahip kararı / dikkat gerektirenler

- `balance_paid` siparişler dashboard'da "üretimde" kutusunda kalıyor (Görev 10 ve 12 brief'leri çelişiyordu); karar senin.
- İtiraz edilen (`disputed`) sevkiyat, kabul edilirken artık hasar/adet kontrolünden geçmiyor (itiraz izi olaylarda); istersen zorunlu bir çözüm notu eklenir.
- `loaded` durumuna geçmek için en az bir satır zorunlu kılındı.
- Sözlük, durum etiketleri, PSI uyarı metinleri ve dashboard kutu adlarındaki TR metinler geliştirici okumasıyla girildi; gözden geçirmen gerekir.
- DatePicker'a elle yazılan 10 ve üzeri günler yanlış kaydediliyor (Faz 1 genelinde, muhtemelen yerel ayar ayrıştırması); gerçek veri girişinden önce düzeltilmeli.
- Kapatılmış/iptal edilmiş sipariş ve sevkiyatların kilitli olmayan alanları düzenlenebilir kalıyor; politika kararı.
- Üretim: `supabase db push` ile 029–033 uygulanır; rol izinleri migrasyon içindeki `grant_group_to_product_editors` ile verilir, elle adım yok.

## Ertelenen küçük bulgular

- Task 1: TR1 deposit 30 equals the default (test cannot fail on supplier-copy path); purchase_order_customer_missing and customer_id immutability untested; existing-roles grant untested in pgTAP (feasible as a postgres block); out-of-range deposit setting blocks inserts via CHECK; index naming inconsistent.
- Task 2: po_line_needs_spec exception block per line (subtransaction cost); private helpers granted to authenticated without tenant check (safe: private not exposed — add comment); total_quantity ::INT overflow; closed/cancelled orders' non-locked fields editable (note for Tasks 3/5).
- Task 2: possible deadlock when two transactions each write a line then change status (PG aborts one; UI separates requests); pgrowlocks ctid join in test slightly fragile.
- Task 3: toast-level NAMED_ERRORS guard untested (needs a would-map case); figures/toUnits throw on null/''/fractional quantity (Task 5 must filter incomplete lines); payload builders cast away column types; suggestPayments may suggest a ≤ 0 balance; useEntityDocumentOptions with [] sends in.(); index.ts 541 lines mixes concerns.
- Task 4: unit price kept after product change; usePurchaseOrderIds error silent (table shows no_rows); id filter swapped not mutated; lock tooltip and tab disabling untested; unit price column unformatted; duplicated lookup-select pickers (ProjectSelect/ProductSelect); no line removal (brief did not ask — owner note).
- Task 4: mockMain must stay the first import (setupFiles would be sturdier); "newest spec" sort relies on the stub order.
- Task 5: status actions ignore a dirty form (disable while isDirty or warn); no card-level test for StatusActions wiring; lineTotals watch resets untyped-but-unblurred values on refetch; inconsistent tab props; Pi.vue 268 lines.
- Task 6: same-transaction deadlock surface (line insert + status move; PostgREST single statements safe); order status checked only at link time (later cancelled/closed orders can still get lines); psi_missing_po_codes follows document visibility (note for Tasks 7/10); accepted/cancelled shipment own fields editable (owner decision); loaded-shipment cascade untested; shipment_event.created_by client-settable (default only).
- Task 7: SHIPMENT_STATUS_SEVERITY typed string; useShipmentIds disabled with no filter (documented); index.ts 575 lines; payload casts hide type errors.
- Task 8: tab child route alone with showDialog throws (cross-card); order picker flashes "no other open orders" while loading; Acceptance hints use unsaved values; Manage.vue ~95% duplicate of PO Manage (useCardManage later); eta-late / eta-state Tags untested; new-card dialog keeps the "new" URL after save (same as PO); `ops.shipment.fields.forwarder` is English in tr (Task 7) — fix in Task 11/12.
- Task 9: product Manage fromRoute uses the unfiltered tab list (hidden tab selectable via prop); GatePanel document lookup runs up to three times as ids arrive; card tab permission filtering untested; pass dialog does not name the PO/shipment a document belongs to (owner UX note).
- Task 10: customer/supplier edges to dashboard views missing (stale codes after rename); cross-tenant pgTAP only for dashboard_shipment; no rendered Index.vue test for the boxes; dashboard_purchase_order computes figures per row (watch performance); "1 days late" not pluralised; open statuses outside both sets appear in no box (owner note).
- Task 11: tooltip test reads PrimeVue internal $_ptooltipValue.
- Task 12: balance_paid stays in the "in production" dashboard box (Task 10 brief vs Task 12 brief contradiction — owner decides); DatePicker typed date with day ≥ 10 saves the wrong day (Phase 1-wide, locale parsing — backlog, Important for the owner); automated-browser uploads duplicated (409; environment); G1/G2/G4 passed via SQL as setup.
- Fix-wave minors (deferred): stale restored draft (another user moved the shipment to delivered) could write a NULL deadline (stale banner shown); INVOKER figures depend on line RLS (intended); dirty hint lives in the actions slot; session_user bypass condition untested on its own; project → purchase_order DERIVED edge not added.

## Koordinatör kararları

- Ruling: StatusActions is disabled while the card form is dirty (both cards) and `toShipmentPayload` sends `dispute_deadline_at` only when it differs from the row — data loss — cost: none.
- Ruling: the acceptance-issue check applies only when OLD.status = 'delivered'; `disputed → accepted` is allowed without it (the dispute trail lives in events) — owner may later require a resolution note — cost: a settled dispute closes without a mandatory note.
- Ruling: entering `loaded` requires at least one line (`shipment_lines_required`, EN "Add at least one line before loading." / TR "Yüklemeden önce en az bir satır ekleyin."), with a status hint and pgTAP — cost: none.
- Ruling: `purchase_order_figures` and `po_line_needs_spec` become SECURITY INVOKER (minor hardening, cheap, same wave); bypass check also requires session_user IN ('postgres','supabase_admin').
- Ruling: add DERIVED edges document→purchase_order, product→purchase_order, project→purchase_order_overview, supplier/customer→purchase_order, purchase_order_overview, dashboard views (minor, same wave, with tests).
