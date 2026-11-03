# Faz 2a (M19 ortam + M20 sözlük) — ertelenen bulgular ve kararlar

Dal: `feat/phase2a-media-glossary` (taban `7535002`). Final inceleme (dal geneli, Opus) "düzeltmelerle hazır" dedi; dört önemli bulgu düzeltme dalgasında kapandı (`b879c62`, `c8acbf0`), kapsamlı yeniden inceleme "tüm bulgular giderildi". Aşağıdakiler final incelemenin "bekleyebilir" dediği küçük bulgular ve koordinatörün planı yorumlarken verdiği kararlar.

## Ertelenen küçük bulgular (görev bazında)

- ci.yml CLI pin has no "keep in sync with local" comment; no Docker image caching for supabase start.
- delete storage policy tested only negatively (plan-mandated 15 tests); media_select cross-tenant read untested; media_check_file BEFORE trigger runs before RLS WITH CHECK (error-order probe, negligible); NULL metadata.size → 23502 not media_file_missing; public.media_max_bytes() returns 25 MiB with no active tenant; comment above storage helper grants misleading; stray files in an existing media folder undeletable until the row is gone (note for Task 5).
- concurrent primary inserts can still hit media_link_one_primary 23505 (Task 5 maps it; advisory lock optional); 025 test seeds 'image/png' for c.pdf (relies on 024 mime rewrite); media_library uses m.* (frozen column list; recreate when media gains columns); link_count counts readable links only; demotion via plain UPDATE untested.
- 026 ADD/DROP COLUMN not idempotent; mismatch check uses document.customer_id (not entity_customer) — a product document with NULL customer_id cannot cite that customer's file (Task 8: the document form must set customer_id from the entity); untested paths: media_id UPDATE, shared-media positive case, document_count = 0, file-only document content.
- storage.remove / thumbnail upload / useSignedUrl failures swallowed silently (add console.warn); cleanup after a failed insert can hide the original error; links always use the active tenant (Task 6 passes the record's tenant); Insert cast lets tenant_id be missing (should throw); untested hooks: useLinkMedia position, useDeleteMedia order, useEntityMedia primary-first sort, useMediaLibrary paging, openMediaFile; MEDIA_ROLES lacks a completeness check; signed-URL cache never evicts; openMediaFile pop-up timing.
- blank tab after open (ruled: inline open + separate download, Task 7); canEdit gate narrower than the actions offered (media create, media_link update/delete) — gate per action; picker query runs while the dialog is closed (v-if/enabled); picker "empty" shown next to "Load more" when a page is fully excluded; onPicked treats missing kind as image; per-file upload errors lack the file name; PrimeVue default English type-rejection message untranslated; untested bulk set-role path and tenant-aware canIn.
- "Load more" button instead of scroll-triggered loading; filters not synced to URL; non-null assertions on media_library rows; useMediaUsage has no error state (DB lock is the guard); no tests for load-more or invalidation after edit.
- uploaded media row persists if the document dialog is cancelled (normal library file; say so in UI); restored draft keeps media_id across a customer change (DB refuses with media_customer_mismatch — drop media_id on customer change); file-required error shown only under the Drive link; orphan object after a 409 on the original upload; no end-to-end Upsert payload test; "File" label not associated with an input.
- GATE_CODES/DOCUMENT_* exhaustiveness via Record keys, not allValues (inconsistent mechanism); PACKAGES not wrapped in allValues; stale-key test reads only en; glossary.ts import order.
- single-mode emit typed string|string[] (unsound cast at Tasks.vue, guard in EntityMedia) — split the model type by `multiple`; glossary lookup duplicated in SelectEnum/GatePanel/PhaseStrip (shared describe helper); info icon inside the combobox label span (a11y: aria-label likely not announced, tooltip not keyboard-reachable); optionOf called 4× per render; no test for gate-glossary-info nor for disabled/placeholder pass-through with the #value slot.
- fix tests assert the thrown error shape, not the rendered toast (drive appErrorHandler); Math.floor(maxBytes/1048576) understates non-integer limits (0 MB under 1 MB) — align with upload_hint; refusedUpload mutates its argument.

## Final incelemenin ek küçük notları

- Ürün/proje müşterisi sonradan değişince mevcut ortam bağlantıları yeniden denetlenmiyor (bağlantı yazılırken denetleniyor); koruyucu tetikleyici ya da belgelenmiş kabul.
- Taze UUID klasörüne yüklemede 409 gelirse nesne yetim kalıyor (yalnız ağ tekrarında); isteğe bağlı temizlik.
- İmzalı URL önbelleği çıkışta temizlenmiyor.
- 027 yalnız migrasyon anında var olan rollere `media` izni verir; sonradan açılan roller rol ekranından alır. Ürün güncelleme yetkisi olan her rol ortam yükleme/bağlama/okuma alır; dar yetkili ürün editörü rolleri olan şirketler bunu bilmeli.
- Faz 1 "şube silinemiyor" şüphesi geri çekildi: hata yalnız aynı işlemde yazıp silen test düzeninde çıkıyor; canlıda istek sınırı işlemi ayırdığı için oluşmuyor (027 pgTAP kaydı).

## Koordinatör kararları (plan metnini aşan)

- Ruling: T5 defines `MEDIA_ROLES` as a literal `as const` tuple; T9 may switch it to `allValues` — T9's helper does not exist yet — cost: a few duplicated literals.
- Ruling: the client reads the upload limit via a public DEFINER RPC `media_max_bytes()` (T2 exposes it to authenticated, resolving the company value like management_gates) instead of `useSetting` — branches have no own setting row — cost: one RPC per upload dialog.
- Ruling: thumbnail path is `<tenant_id>/<media_id>/thumb/thumb.webp`; the original stays at `<tenant_id>/<media_id>/<safeName>` (safeFileName strips path separators) — a user file named thumb.webp must not collide — cost: none.
- Ruling: inserting a `primary_image` link demotes the existing primary to `gallery` (BEFORE INSERT trigger, same semantics as set_primary_media); the client marks only the first upload of a batch primary when none existed at batch start — two drops must never raise `media_link_one_primary` — cost: last primary wins silently.
- Ruling: `MediaLibraryFilters.kind` is `MediaKind[]`; the picker's `kinds[]` passes through — cost: none.
- Ruling: T7's linked-record filter is a plain PrimeVue Select with its own options (`ops.document.entity.*` labels plus `ops.media.filter.unlinked` for none), not SelectEnum — cost: none.
- Ruling: `media.customer_id` is locked once any link or document references the media (trigger raises `media_customer_locked`, errors key + NAMED_ERRORS) — otherwise mismatches appear silently — cost: user unlinks before reassigning.
- Ruling: T8 also updates `document/Index.vue`'s select to embed `media:media_id(id,file_name)` and renders "file or link" in the link column — cost: none.
- Ruling: `document_check_media` raises `media_missing` with ERRCODE foreign_key_violation (23503) when no media row matches (id, tenant_id); T4's Atlas fixture media has customer_id NULL — makes test 6's expected 23503 deterministic — cost: none.
- Ruling: T2 applies the Global Constraints for every new table (enable_tenant_level_security, audit_enable, permission rows, module `media` is_core TRUE position 160, owner grant); T3 names the delete guard `private.media_guard_delete`, which T4 replaces — cost: none.
- Ruling: the errors.* EN/TR copy for T2 and T3 is taken from T5's table and appended to their briefs — cost: none.
- Ruling: T5's queryKeys test also covers the `document → media_library` CASCADES edge (added in T4's queryKeys change or T5, whichever lands the key) — cost: none.
- Ruling: T6 ability tests use `cannot('update', …)` consistently (modify = update+delete) — cost: none.
- Ruling: every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` even where the plan's commit block omits it — cost: none.
- Ruling: signed URLs are 3600 s everywhere (openMediaFile included) per Global Constraints — cost: none.
- Ruling: the picker receives `customerId: null` when the document's entity has no customer (supplier, tenant-level records) and then shows shared media only — cost: none.
- Ruling: subagent commits may carry the Co-Authored-By trailer of the model that wrote them (Opus 5.5) instead of Fable 5.1 — truthful attribution — cost: mixed trailers in history.
- Ruling: signed URLs used for "open" are inline (no `download` option) so images, PDFs and MP4 render in the new tab; a separate "download" action signs with `download: file_name` — a blank tab after a forced download is a UX defect — cost: one helper option and a small change in Task 5's signedUrls (done in Task 7).
- Ruling: production roles get media rights by migration 027 — grant the `media` permission group to every role that already holds `public.product` update in its tenant, and `public.media` delete only to roles that hold `public.tenant` update (management) — hand-built role edits are error-prone — cost: a role that should not have media rights but has product update gets them.
- Ruling: the branch-delete cascade pgTAP case is written as a pgTAP `todo` block because `delete_branch` already fails on any branch holding audited rows (pre-existing Phase 1 bug, audit_log_transaction_id_fkey; backlog for the owner); the migration comment documents that Storage objects under a deleted branch need a service-role cleanup — cost: orphan objects until that bug is fixed.
- Ruling: DocumentFileField upload/pick controls are gated on `$can('create','media')` / `$can('read','media')` and EntityMedia gates each action separately (dropzone: media create; set role/unlink: media_link update/delete) — cost: none.

## Ortam notları

- PDF yüklemede bu geliştirme makinesinde Chrome ile Kong arasında bir şey PDF gövdeli POST'ları tekrar gönderiyor (200 sonra 409 Duplicate); PNG'de olmuyor, Python ile tek POST. Uygulama kodunda sebep yok; antivirüs/web koruması şüphesi. Başka makinede doğrulanmalı.
- `_redirects` SPA kuralı Cloudflare Pages tarafından reddedildiği için kaldırıldı; Pages bilinmeyen yolları kendiliğinden index.html'e düşürüyor.
