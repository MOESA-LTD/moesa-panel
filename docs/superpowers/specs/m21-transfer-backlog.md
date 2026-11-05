# M21 (cross-tenant customer transfer): rulings, deferred findings and owner follow-ups

Branch: `feat/m21-transfer` (base `683839d`, plan `docs/superpowers/plans/2026-11-05-m21-transfer.md`). 12 tasks: DB layer 040-045 (Tasks 1-8), app layer (Tasks 9-11), full verification and walk (Task 12). Every task went implementer -> task review; Tasks 2, 3, 4, 5, 6, 7, 9 and 10 needed fix rounds (Task 5 three). Ledger: `.superpowers/sdd/2026-11-05-m21-transfer/progress.md`.

## Status

Branch `feat/m21-transfer` at af2a50b. All 12 tasks complete; Task 12 full suite green (pgTAP 616 in 33 files, vitest 951 in 111 files, typecheck, lint 0 errors, build). The walk (EN then TR) exercised copy, move, product-only refusal and file retry end to end. The final whole-branch review found no security hole and nothing critical; its three Important findings (rehearsal timeout on large customers, lost concurrent writes during a move, re-transfer while files pending) and the walk's display bugs were fixed in one fix wave of 13 commits (cd03c98..af2a50b). Deferred items are listed below.

## Rulings made while the owner was away

- **Deferrable composite FKs instead of `ON UPDATE CASCADE`** (migration 041; spec amended). The 49 customer/product-rooted composite FKs became `DEFERRABLE INITIALLY IMMEDIATE`; 33 are `ON DELETE RESTRICT`, which stays immediate, so moves delete children before parents. Why: a cascade would rewrite frozen rows through every trigger; deferral lets the cheap path update parent and child in any order.
- **Customer and supplier `new_code` is a free, user-entered code**; dependent codes (projects, POs, shipments) keep the old prefix. Why: the target counter cannot know the customer's new prefix, and the owner picks the code.
- **Transfer right is owner + management (the `transfer` module permission), not coordinator.** Across two companies both root owners are required (`private.owns_company`). Why: the action moves a whole customer between legal entities.
- **The cheap path writes one "transferred out" audit entry in the source for the customer root.** Why: without it the source audit log shows nothing for a record that left by `UPDATE tenant_id`.
- **Wider move refusal plus extra params.** A move is refused when a package row is still referenced from behind (project, PO line, market cell, CR line); `transfer_customer` also takes `report_hash` and `product_ids`. Why: nothing may be silently dropped, and a stale rehearsal must not be runnable.
- **`audit_transfer_locked` lives in `public`.** `revert_audit_transaction` is SECURITY INVOKER and `authenticated` has no USAGE on `private`; later tasks call `public.audit_transfer_locked`.
- **Branch manager also gets the transfer permission.** The seed gives that role every permission; accepted since the same-tree rule still applies.
- **Seed tenant ids are random; pgTAP looks them up by name.**
- **Two-step exit from the rules: the GUC, then `transferring()`.** `shipment_line_guard` is unchanged. A spoofed `moesa.transfer_id` gains nothing (probed): DEFINER triggers keep their rules, INVOKER triggers fail closed.
- **`next_code_in` raises `tenant_required` on a NULL tenant.** Why: a counter row for no tenant must never be created.
- **`media_check_file` keeps the type allowlist and the target tenant's `media_max_bytes` under the transfer flag** (Task 2 fix round). Why: only the Storage lookups and the immutability check are legitimately skipped.
- **Product-only transfers collect the customer contract document as `copy_only`, with its media** (Task 3 fix). Why: the product's link must not be silently dropped. Customer documents and links are otherwise not collected; package media is `copy_only`; an empty `product_ids` is refused.
- **Decisions are validated before "required"; `sku` beats `gtin` when both clash on one product.** A real run raised `feature_not_supported` until the writer landed (Task 5).
- **After the insert pass the target `code_sequence` is raised to `greatest(last_no, max copied)`; `new_code` is computed afterwards** (Task 5 I3). Why: copied codes must not collide with the next generated one.
- **New conflict kinds `platform_account`, `market_cell`, `media_link`, plus children kinds for a mapped customer (contacts, warehouses, brands) that offer `map` only** (Task 5 rounds 1-3). Why: unflagged unique keys otherwise end in a raw `23505`, and children of a mapped customer would be duplicated.
- **Skippable conflicts carry `skip_drops`, computed by one shared omission-closure helper (042); rehearsal `files` uses the same run filter** (Task 5 round 3). Why: a warehouse skip silently dropped shipments.
- **Cheap path: keyless tables are deleted and reinserted in a second loop after the `shipment_line` delete; `left_behind` matches by key columns** (Task 7 fix). Why: `shipment_line_link_fkey` is RESTRICT and customers with shipment lines could not be moved on either path. Supplier documents are copied; every reference goes through the map.
- **`transfer_options` refusals are copy-only by design** (045 passes mode copy); the wizard derives the move refusal from `source_writable`. No change.
- **`transfer_check_files` keeps its own audit transaction current when none was open** (Task 8). Why: pgTAP case 6 depends on it; under PostgREST each RPC is its own transaction. The 045 header documents it.
- **App API (Task 9):** the report is parsed with zod (unknown conflict kinds become `unknown`, unknown actions are dropped); a failed file copy after commit does not fail the mutation (the run row is returned and the notice offers retry); a 409 on upload counts as copied; invalidation matches every tenant key containing source or target; `useTransfer(id, targetTenant)` reads through `forTenant(target)`.
- **`usePendingTransfers` reads under the active tenant selection**, the same as the customer card (`customerResource.useOne`). Consistent, no change.
- **The "Opus 5.5" commit trailer on the Task 10 commits was accepted.**
- **GTIN term added to the customer guide task** (Task 11) so the marker renders in the transfer steps.

## Deferred minors

### DB layer

- `supabase/tests/database/040_transfer_core.test.sql:177` - case 15 never resolves a branch to its root; add `owns_company(baris, europe)`. Test gap only.
- `040_transfer_core.test.sql:98` - nothing asserts `zz_rules_bypassed()` is FALSE for an authenticated user once the flag is cleared. Test gap only.
- `040_transfer_core.test.sql:102` - the `invalid_text_representation` branch of `transferring()` is never run. Test gap only.
- `supabase/migrations/040_transfer_core.sql:327` - `owns_company` leaves the super-admin pass to callers (the plan said it passes). Callers are consistent; the plan wording is the stale part.
- `040_transfer_core.sql:24` - header still says the code and immutability triggers ignore the flag; 041's header has the true description. Committed migration, comment only.
- `041_transfer_triggers.sql` - a spoofed flag in an INVOKER trigger fails with `permission denied for schema private`: safe but opaque. Nothing to fix.
- `042_transfer_rehearsal.sql:117` - `LIMIT 1` without ORDER BY relies on `transfer_registry.entity` being unique; no UNIQUE constraint was added in 040. The registry is closed today.
- `042_transfer_rehearsal.sql:791` - the move-mode `skip` branch can never fire (validation rejects it earlier). Defence in depth.
- `042_transfer_rehearsal.sql:628-700` - `left_behind` scans the source once per registry FK on every rehearsal. Fine at pilot sizes.
- `042_transfer_rehearsal.sql:726` - `private.entitlements` is read three times for two tenants. Cosmetic.
- `042_transfer_rehearsal.sql:741` - the report hash covers counts, labels and conflicts, not row contents, so an edit that changes none of them does not make a report stale. The spec asks only for a hash of the conflict set; confirm the 042 header says so.
- `042_transfer_rehearsal.sql` (`skip_drops`) - no media count in what a skip drops.
- `042_transfer_rehearsal.sql` - duplicate natural keys in the target offer only the first target row as a `map` choice.
- `042_transfer_rehearsal.sql` (`refers_to`) - names only the first key column of a keyless table. Cosmetic.
- `supabase/tests/database/043_transfer_copy.test.sql` (ZPM fixture comment) - says cases "64-70", should be 64-69.
- `043_transfer_copy.test.sql` case 69 - `throws_like` rolls back its subtransaction, so the case cannot fail; redundant with the others.
- `supabase/migrations/043_transfer_copy.sql:458` - products are deleted level by level, but collection takes one level of variants in product-only mode; a selected grandchild pulls its parent but not the grandparent. The move is refused by `left_behind`, so no data is at risk.
- `supabase/migrations/044_transfer_cheap.sql:139` - `transfer_media_paths` is called twice per media row; use one `LATERAL`.
- `supabase/tests/database/044_transfer_cheap.test.sql` case 10 - only checks `document`, `media_link` and `project_product`; should assert no non-`copy_only` id-map key remains in the source for every registry table with an id.
- `supabase/migrations/045_transfer_files.sql:129` - when no audit transaction was open, the check's locked transaction stays current; a later write in the same DB transaction would be logged into a non-revertable transaction. Safe as its own RPC (the app calls it so).
- `supabase/tests/database/045_transfer_files.test.sql:102` - case 7 would pass without the `audit_transaction_ids` append; add a check to case 6.
- `045_transfer_files.sql:88` - `FOR UPDATE` is taken before the access check; a caller without access briefly locks the row before the 404.
- `045_transfer_files.sql` (`transfer_options`) - `transfer_refusal` is evaluated per candidate target, each calling `tenants_granting` per registry table. Revisit if a user has dozens of memberships.

- Fix-wave re-review: the real-run lock (I2) is not airtight — documents and media links reference rows by `entity_type`/`entity_id` without a foreign key, so a link inserted after the second collection can still land under a moved or deleted row; concurrent deletes in the three id-less tables are not blocked. Small window.
- Fix-wave re-review: the in-place media cap guard (F8, 041 ~1463) also runs the file-type allowlist on a tenant change, so a legacy media row with a type outside the list blocks a cheap move with `media_type_not_allowed`. Decide whether legacy types should pass on a move.
- Fix-wave re-review: shared suppliers and shared media are locked `FOR UPDATE` during a real run, so unrelated edits to them wait until commit; a writer holding a child lock that then updates the customer can deadlock (Postgres aborts one side).
- Fix-wave re-review: no pgTAP test compares the old per-conflict skip closure with the new set-based pass (I1) on a fixture with nested omissions; the implementer's manual comparison showed 0 mismatches on a 26-row fixture.

### App layer

- `app/src/lib/form/postgrestErrors.ts:459` - `transfer_not_found` is a separate entry instead of joining the `transfer_*` list. Identical result.
- `app/src/api/transfer/index.ts:194` - media files are copied one at a time; a customer with hundreds of files makes the run slow. Needs bounded concurrency, not a one-liner (retry covers failures).
- `app/src/api/transfer/index.ts:88` - `settings_gaps[].rule` is `z.string()` on purpose (forward compatible, like the conflict kinds).
- `app/src/views/pages/ops/transfer/ConflictDecision.vue` - `code_taken` only sees rows the target lookup returns (paged); the server stays authoritative.
- `app/src/views/pages/ops/product/Index.vue:181` - the product selection persists across pages and filters and is not cleared after a move; fixed in the final fix wave (ecab803): the button shows the count and the selection clears on push and on filter change.
- K8 (fix wave note): the `customer_contact` conflict label is the contact's e-mail and is stored in `transfer.report`. Use the contact's name (or a masked e-mail) as the label.
- Fix wave B4: source-side transfer transactions are not detected client-side for the revert tooltip; the server still refuses the revert.
- Final review F5: a move left `partial` for good (a source file already missing) never removes its other source files and keeps its warning; the rehearsal does not detect missing source files (`app/src/api/transfer/index.ts` ~213-226).
- Final review F6: if the tab closes after the file check says `done` but before the source files are removed, those source files are orphaned.
- Final review F10b: `product/Index.vue` ~186 puts every selected product id in the URL (ids are not sensitive; long selections make long URLs).
- Walk B5: audit labels are ambiguous — the transfer row and the file check both read "Transfer / Updated"; the cross-company source delete reads "Document / Deleted". Owner wording plus a per-action label.
- Walk B7 (design gap): target files are never checked again once `files_status` is `done`; a file deleted later is not detected and there is no Retry. Needs an owner decision (a "Check files" action on the transfer, or a periodic check).
- `app/src/views/pages/ops/customer/Manage.vue:61` - the new Transfer link and the pending-transfer notices are untested (the brief asked for no test).
- `TransferFilesNotice.vue:24` - a `pending` row after a thrown copy reads "Files are being copied." while nothing is copying. Owner wording, see follow-ups.
- Process: Tasks 9 and 10 wrote code before tests; the Task 10 tests other than the lookup one were never seen failing.

## Deliberately out of scope

- Settings, roles, code counters, audit history and dashboard read states do not travel (spec). Code counters stay advanced, and the target counter is raised past copied codes.
- Source change history is not carried; the target record starts with a "transferred in" audit entry.
- Suppliers never leave the source: always copied or mapped to the target's supplier.
- Customer documents and links are not collected in product-only mode (only the contract document, `copy_only`); package media is `copy_only` there; an empty `product_ids` is refused.
- Client-side check of a typed code equal to another package row's own code, and any client check for `code` kinds (the server generates those codes).
- Bounded concurrency for the file copy (sequential; retry exists).
- Variants of variants are collected one level deep in product-only mode (such a move is refused rather than half done).
- Tables of M7-M16: the registry covers Phase 1 and 2; each later module adds its tables, and the pgTAP completeness test fails until it does.
- The report hash does not snapshot row contents.

## Turkish copy for owner review

104 new keys with EN and TR text; the owner reviews the TR column. Source: `app/src/plugins/i18n/locales/{en,tr}/index.json`.

| key | EN | TR |
|---|---|---|
| `fields.transfer` | Transfer | Aktarım |
| `errors.audit_transfer_not_revertable` | A transfer cannot be undone from the log. Transfer the records back instead. | Aktarım kayıttan geri alınamaz. Kayıtları geri aktarın. |
| `errors.transfer_invalid_mode` | Choose Copy or Move. | Kopyala ya da Taşı'yı seçin. |
| `errors.transfer_same_tenant` | The target must differ from the source. | Hedef, kaynaktan farklı olmalı. |
| `errors.transfer_owner_required` | Between two separate companies only an owner of both can transfer. | İki ayrı şirket arasında yalnız ikisinin de sahibi aktarabilir. |
| `errors.transfer_target_read_only` | The target is read-only (its subscription has ended); nothing can be transferred into it. | Hedef salt okunur (aboneliği sona ermiş); içine aktarım yapılamaz. |
| `errors.transfer_target_plan` | The target's plan does not include the business modules. | Hedefin planı iş modüllerini içermiyor. |
| `errors.transfer_forbidden` | You need the right to transfer in both places: to read the records in the source and to create them in the target. | Her iki yerde de aktarma yetkisi gerekir: kaynakta kayıtları okuma, hedefte oluşturma. |
| `errors.transfer_source_read_only` | The source is read-only: its records can be copied, not moved. | Kaynak salt okunur: kayıtları kopyalanabilir, taşınamaz. |
| `errors.transfer_customer_missing` | This customer is not in the source. | Bu müşteri kaynakta yok. |
| `errors.transfer_products_invalid` | Pick products of one customer of the source. | Kaynaktaki tek bir müşterinin ürünlerini seçin. |
| `errors.transfer_gate_invalid` | A project's gates are out of order (a gate is passed before an earlier one, or the gate set does not match the project). Fix the project first. | Bir projenin kapıları sırasız (bir kapı öncekinden önce geçilmiş ya da kapı seti projeye uymuyor). Önce projeyi düzeltin. |
| `errors.transfer_report_required` | Rehearse the transfer first. | Önce aktarımın provasını yapın. |
| `errors.transfer_report_stale` | The records changed since the rehearsal. Rehearse again and check the report. | Provadan bu yana kayıtlar değişti. Provayı yineleyip raporu kontrol edin. |
| `errors.transfer_decision_required` | Every conflict needs a decision. | Her çakışma için bir karar gerekir. |
| `errors.transfer_decision_invalid` | A decision does not fit its conflict: check the action and the record it links to. | Bir karar çakışmasına uymuyor: işlemi ve bağlandığı kaydı kontrol edin. |
| `errors.transfer_code_invalid` | The new code has the wrong format or is taken in the target. | Yeni kodun biçimi hatalı ya da hedefte kullanılıyor. |
| `errors.transfer_product_in_use` | Records that stay behind use these products (a project, order, market cell or change request). Copy them, or transfer the whole customer. | Geride kalan kayıtlar bu ürünleri kullanıyor (proje, sipariş, pazar hücresi ya da değişiklik talebi). Kopyalayın ya da müşterinin tamamını aktarın. |
| `errors.transfer_not_found` | Transfer not found. | Aktarım bulunamadı. |
| `route.label.ops_transfer` | Transfer | Aktarım |
| `ops.transfer.title_customer` | Transfer {code} | {code} müşterisini aktar |
| `ops.transfer.title_products` | Transfer {count} products of {code} | {code} müşterisinin {count} ürününü aktar |
| `ops.transfer.steps.target` | Target | Hedef |
| `ops.transfer.steps.report` | Rehearsal | Prova |
| `ops.transfer.steps.result` | Result | Sonuç |
| `ops.transfer.target.label` | Target company or branch | Hedef şirket ya da şube |
| `ops.transfer.target.same_company` | Same company | Aynı şirket |
| `ops.transfer.target.other_company` | Another company | Başka şirket |
| `ops.transfer.mode.label` | Mode | Mod |
| `ops.transfer.mode.copy_label` | Copy | Kopyala |
| `ops.transfer.mode.move_label` | Move | Taşı |
| `ops.transfer.mode.copy` | Copy: the source stays as it is. | Kopyala: kaynak olduğu gibi kalır. |
| `ops.transfer.mode.move` | Move: written to the target, then deleted from the source. Suppliers stay in the source. | Taşı: hedefe yazılır, sonra kaynaktan silinir. Tedarikçiler kaynakta kalır. |
| `ops.transfer.mode.move_read_only` | The source is read-only, so only Copy is possible. | Kaynak salt okunur; yalnız Kopyala mümkün. |
| `ops.transfer.rehearse` | Rehearse | Prova yap |
| `ops.transfer.rehearse_again` | Rehearse again | Provayı yinele |
| `ops.transfer.report.path_cheap` | Moved in place: the records keep their IDs. | Yerinde taşınır: kayıtlar kimliklerini korur. |
| `ops.transfer.report.path_copy` | Written as new records with new IDs. | Yeni kimliklerle yeni kayıt olarak yazılır. |
| `ops.transfer.report.counts` | Records per table | Tablo başına kayıt |
| `ops.transfer.report.conflicts` | Conflicts | Çakışmalar |
| `ops.transfer.report.no_conflicts` | No conflicts. | Çakışma yok. |
| `ops.transfer.report.users` | Users who are not members of the target | Hedefte üye olmayan kullanıcılar |
| `ops.transfer.report.users_hint` | Their records are credited to you and their assignments are cleared. | Kayıtları size yazılır, atamaları boşaltılır. |
| `ops.transfer.report.left_behind` | Links that stay in the source | Kaynakta kalan bağlantılar |
| `ops.transfer.report.left_behind_item` | {table} {label}: its {column} refers to a {refers_to} outside the transfer | {table} {label}: {column} alanı aktarım dışındaki bir {refers_to} kaydına bağlı |
| `ops.transfer.report.settings_gaps` | Missing under the target's settings | Hedefin ayarlarına göre eksik kalacaklar |
| `ops.transfer.report.spec_sheet_required` | {label}: the target requires a spec sheet | {label}: hedef spec sheet istiyor |
| `ops.transfer.report.files` | Files to copy: {count} | Kopyalanacak dosya: {count} |
| `ops.transfer.conflict_kind.customer_code` | Customer code | Müşteri kodu |
| `ops.transfer.conflict_kind.supplier_code` | Supplier code | Tedarikçi kodu |
| `ops.transfer.conflict_kind.code` | Code | Kod |
| `ops.transfer.conflict_kind.sku` | SKU | SKU |
| `ops.transfer.conflict_kind.gtin` | GTIN | GTIN |
| `ops.transfer.conflict_kind.customer_contact` | Customer contact | Müşteri kişisi |
| `ops.transfer.conflict_kind.customer_warehouse` | Customer warehouse | Müşteri deposu |
| `ops.transfer.conflict_kind.customer_brand` | Customer brand | Müşteri markası |
| `ops.transfer.conflict_kind.platform_account` | Platform account | Platform hesabı |
| `ops.transfer.conflict_kind.market_cell` | Market cell | Pazar hücresi |
| `ops.transfer.conflict_kind.document_version` | Document version | Belge sürümü |
| `ops.transfer.conflict_kind.media_link` | Primary image | Ana görsel |
| `ops.transfer.conflict_kind.unknown` | Other conflict | Diğer çakışma |
| `ops.transfer.conflict.customer_code` | Customer code {code} exists in the target | {code} müşteri kodu hedefte var |
| `ops.transfer.conflict.supplier_code` | Supplier code {code} exists in the target | {code} tedarikçi kodu hedefte var |
| `ops.transfer.conflict.code` | Code {code} exists in the target | {code} kodu hedefte var |
| `ops.transfer.conflict.sku` | SKU {code} exists for this customer in the target | {code} SKU'su hedefte bu müşteride var |
| `ops.transfer.conflict.gtin` | GTIN {code} is active | {code} GTIN'i aktif |
| `ops.transfer.conflict.document_version` | Version {code} of this document exists in the target | Bu belgenin {code} sürümü hedefte var |
| `ops.transfer.conflict.customer_contact` | The customer in the target already has the contact {code} | Hedefteki müşteride {code} kişisi zaten var |
| `ops.transfer.conflict.customer_warehouse` | The customer in the target already has the warehouse {code} | Hedefteki müşteride {code} deposu zaten var |
| `ops.transfer.conflict.customer_brand` | The customer in the target already has the brand {code} | Hedefteki müşteride {code} markası zaten var |
| `ops.transfer.conflict.platform_account` | The customer in the target already has an account on {code} | Hedefteki müşterinin {code} üzerinde zaten hesabı var |
| `ops.transfer.conflict.market_cell` | The product in the target already has the market cell {code} | Hedefteki üründe {code} pazar hücresi zaten var |
| `ops.transfer.conflict.media_link` | {code} already has a primary image in the target | {code} hedefte zaten bir ana görsele sahip |
| `ops.transfer.conflict.unknown` | {code} conflicts with a record in the target | {code} hedefteki bir kayıtla çakışıyor |
| `ops.transfer.conflict.duplicate_code` | Another conflict of this table is given the same code. | Bu tablodaki başka bir çakışmaya da aynı kod verildi. |
| `ops.transfer.conflict.code_taken` | This code is taken in the target. | Bu kod hedefte kullanılıyor. |
| `ops.transfer.conflict.code_format` | The code has the wrong format. | Kodun biçimi hatalı. |
| `ops.transfer.action.map` | Link to the target's record | Hedefteki kayda bağla |
| `ops.transfer.action.new_code` | Give a new code | Yeni kod ver |
| `ops.transfer.action.clear_gtin` | Leave the GTIN empty | GTIN'i boş bırak |
| `ops.transfer.action.skip` | Skip | Atla |
| `ops.transfer.action.demote` | Keep as gallery image | Galeri görseli olarak tut |
| `ops.transfer.skip_drops` | Also drops: {list} | Bununla birlikte atlananlar: {list} |
| `ops.transfer.skip_drops_item` | {table} ({count}) | {table} ({count}) |
| `ops.transfer.decision.target` | Record in the target | Hedefteki kayıt |
| `ops.transfer.decision.code` | New code | Yeni kod |
| `ops.transfer.unresolved` | {count} conflicts need a decision. | {count} çakışma karar bekliyor. |
| `ops.transfer.move_blocked` | A move cannot leave links in the source. Transfer these records too, or copy instead. | Taşıma kaynakta bağlantı bırakamaz. Bu kayıtları da aktarın ya da kopyalayın. |
| `ops.transfer.confirm.copy` | Copy {count} records to {target}? | {count} kayıt {target} hedefine kopyalansın mı? |
| `ops.transfer.confirm.move` | Move {count} records to {target}? They are deleted from the source. | {count} kayıt {target} hedefine taşınsın mı? Kaynaktan silinirler. |
| `ops.transfer.run` | Transfer | Aktar |
| `ops.transfer.open` | Transfer… | Aktar… |
| `ops.transfer.open_disabled_mixed` | Pick products of one customer to transfer them. | Aktarmak için tek müşterinin ürünlerini seçin. |
| `ops.transfer.result.done` | Transferred: {count} records. | Aktarıldı: {count} kayıt. |
| `ops.transfer.result.id_map` | Download the ID map (CSV) | Kimlik eşlemesini indir (CSV) |
| `ops.transfer.files.pending` | Files are being copied. | Dosyalar kopyalanıyor. |
| `ops.transfer.files.done` | All files copied. | Tüm dosyalar kopyalandı. |
| `ops.transfer.files.partial` | {count} file could not be copied. | {count} files could not be copied. | {count} dosya kopyalanamadı. |
| `ops.transfer.files.retry` | Retry file copy | Dosyaları yeniden kopyala |
| `ops.transfer.files.notice` | Files of a transfer into this customer are missing. | Bu müşteriye yapılan bir aktarımın dosyaları eksik. |
| `guide.pages.customer.tasks.transfer_customer.title` | Transfer a customer to another company or branch | Müşteriyi başka bir şirkete ya da şubeye aktar |
| `guide.pages.customer.tasks.transfer_customer.steps.1` | Open the customer and use Transfer…; pick the target and Copy or Move. | Müşteriyi açıp Aktar…'ı kullanın; hedefi ve Kopyala ya da Taşı'yı seçin. |
| `guide.pages.customer.tasks.transfer_customer.steps.2` | Rehearse, then decide each conflict: link, new code, empty [[GTIN]] or skip. | Prova yapın, sonra her çakışmaya karar verin: bağla, yeni kod, boş [[GTIN]] ya da atla. |
| `guide.pages.customer.tasks.transfer_customer.steps.3` | Confirm; download the ID map, and retry the file copy if files are missing. | Onaylayın; kimlik eşlemesini indirin, eksik dosya varsa kopyayı yineleyin. |
| `errors.transfer_files_pending` | The files of an earlier transfer into this customer are not all copied yet. Finish that transfer first: "Retry file copy" on the customer's page. | Bu müşteriye yapılan önceki bir aktarımın dosyaları henüz tamamen kopyalanmadı. Önce o aktarımı tamamlayın: müşteri sayfasında "Dosyaları yeniden kopyala". |
| `ops.transfer.confirm.move_copy` (replaces `confirm.move`) | Move {count} records to {target}? They are copied there and deleted from the source. | {count} kayıt {target} hedefine taşınsın mı? Oraya kopyalanır ve kaynaktan silinirler. |
| `ops.transfer.confirm.move_in_place` | Move {count} records to {target}? They keep their IDs and leave the source. | {count} kayıt {target} hedefine taşınsın mı? Kimliklerini korurlar ve kaynaktan çıkarlar. |
| `ops.transfer.report.left_behind_item` (changed) | {table} {label}: its {column} refers to {refers_to} {ref}, outside the transfer | {table} {label}: {column} alanı aktarım dışındaki {refers_to} {ref} kaydına bağlı |
| `ops.transfer.open_count` | Transfer {count}… | {count} ürünü aktar… |
| `ops.transfer.open_disabled_empty` | Select products first. | Önce ürün seçin. |
| `audit_log.revert_transfer_locked` | Transfer entries cannot be reverted. Transfer the records back instead. | Aktarım kayıtları geri alınamaz. Bunun yerine kayıtları geri aktarın. |

## Follow-ups for the owner

- **Deployment order and locks (final review F9):** migration 039 (PR #101) is numbered below 040-045; if M21 lands first, `supabase db push` needs `--include-all`. The 49 `ALTER CONSTRAINT ... DEFERRABLE` changes are catalog-only (no revalidation) but take strong locks on about 25 tables: push in a quiet window with `lock_timeout` set.
- **Production database:** run `supabase db push` for migrations 028-045 (M21 is 040-045 on top of the earlier pending ones), then `supabase functions deploy`.
- **Guide task for transfer exists:** `guide.pages.customer.tasks.transfer_customer` (title plus 3 steps, in the table above) is a developer draft in both languages and needs the owner's wording review. The only term marker used is `[[GTIN]]` (already defined in M20), so no new glossary term was added and no `terms.*` entry needs wording. If more terms should be marked (for example a "transfer" or "ID map" entry), that wording has to come from the owner.
- **Wording to decide:** the files notice for a `pending` row after a thrown copy ("Files are being copied.") is misleading when nothing is copying; supply a different sentence (EN and TR).
- **Cross-company transfers need both root owners** (ruling above); coordinators cannot transfer. Say so if a coordinator right is wanted later.
- **Walk ruling to confirm:** the walk's "no THO code counter in Europe" check is now expected to fail by design — the target counter is raised past copied codes (Task 5 ruling I3); the plan line is stale.
- **Walk data:** the Task 12 walk leaves THO copies and moved customers in the local DB only.
